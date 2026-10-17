import { createHash } from 'node:crypto'
import type { DB }    from './db'
import { tx }         from './db'
import { estimateTokens } from './clean'
import type { Address }   from './ingest/store'

type Row = {
  id: string; subject: string; norm_subject: string; from_addr: string; from_name: string
  to_addrs: string; cc_addrs: string; date: string | null; in_reply_to: string | null; refs: string
  body_clean: string; signature: string | null; is_noise: number
}

const SUBJECT_LINK_GAP_DAYS = 14
const MAX_THREAD_CHARS = 40_000

/**
 * Exchange-internal senders often appear as an X.500 DN (/o=…/cn=…) in some
 * messages and as SMTP in others. Merge them by display name so one person
 * is one actor in the RACI.
 */
export function unifyExchangeAddresses(db: DB): number {
  const people = db.prepare('SELECT addr, name FROM people').all() as { addr: string; name: string }[]
  const smtpByName = new Map<string, string>()
  for (const p of people) if (p.addr.includes('@') && p.name) smtpByName.set(p.name.toLowerCase(), p.addr)
  const alias = new Map<string, string>()
  for (const p of people) {
    if (p.addr.includes('@')) continue
    const smtp = smtpByName.get((p.name || '').toLowerCase())
    if (smtp) alias.set(p.addr, smtp)
  }
  if (alias.size === 0) return 0

  const fix = (list: string) => JSON.stringify((JSON.parse(list) as Address[]).map(a => ({ ...a, addr: alias.get(a.addr) ?? a.addr })))
  const rows = db.prepare('SELECT id, from_addr, to_addrs, cc_addrs FROM messages').all() as Pick<Row, 'id' | 'from_addr' | 'to_addrs' | 'cc_addrs'>[]
  const upd = db.prepare('UPDATE messages SET from_addr = ?, to_addrs = ?, cc_addrs = ? WHERE id = ?')
  tx(db, () => {
    for (const r of rows) upd.run(alias.get(r.from_addr) ?? r.from_addr, fix(r.to_addrs), fix(r.cc_addrs), r.id)
    const del = db.prepare('DELETE FROM people WHERE addr = ?')
    for (const k of alias.keys()) del.run(k)
  })
  return alias.size
}

function participantsOf(r: Row): string[] {
  return [r.from_addr, ...(JSON.parse(r.to_addrs) as Address[]).map(a => a.addr), ...(JSON.parse(r.cc_addrs) as Address[]).map(a => a.addr)]
}

/** Group messages into threads (reply headers first, then same subject + shared participant + close in time). */
export function buildThreads(db: DB): { threads: number; pending: number; skipped: number } {
  const rows = db.prepare('SELECT id, subject, norm_subject, from_addr, from_name, to_addrs, cc_addrs, date, in_reply_to, refs, body_clean, signature, is_noise FROM messages ORDER BY date').all() as Row[]
  const parent = new Map<string, string>(rows.map(r => [r.id, r.id]))
  const find = (x: string): string => {
    let p = parent.get(x)!
    while (p !== parent.get(p)) p = parent.get(p)!
    parent.set(x, p)
    return p
  }
  const union = (a: string, b: string) => {
    if (!parent.has(a) || !parent.has(b)) return
    const ra = find(a), rb = find(b)
    if (ra !== rb) parent.set(rb, ra)
  }

  for (const r of rows) {
    if (r.in_reply_to) union(r.id, r.in_reply_to)
    for (const ref of JSON.parse(r.refs) as string[]) union(r.id, ref)
  }

  const bySubject = new Map<string, Row[]>()
  for (const r of rows) {
    if (r.norm_subject.length < 4) continue
    const list = bySubject.get(r.norm_subject) ?? []
    list.push(r)
    bySubject.set(r.norm_subject, list)
  }
  for (const list of bySubject.values()) {
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1], b = list[i]
      if (!a.date || !b.date) continue
      const gap = (Date.parse(b.date) - Date.parse(a.date)) / 86_400_000
      const pa = new Set(participantsOf(a))
      if (gap <= SUBJECT_LINK_GAP_DAYS && participantsOf(b).some(p => pa.has(p))) union(a.id, b.id)
    }
  }

  const groups = new Map<string, Row[]>()
  for (const r of rows) {
    const root = find(r.id)
    const list = groups.get(root) ?? []
    list.push(r)
    groups.set(root, list)
  }

  const names = new Map((db.prepare('SELECT addr, name, team FROM people').all() as { addr: string; name: string; team: string | null }[])
    .map(p => [p.addr, p]))
  const label = (addr: string, sig: string | undefined) => {
    const p = names.get(addr)
    return `${p?.name ? p.name + ' ' : ''}<${addr}>${p?.team ? ` [team: ${p.team}]` : ''}${sig ? ` — signature: ${sig}` : ''}`
  }

  const setThread = db.prepare('UPDATE messages SET thread_id = ? WHERE id = ?')
  const getThread = db.prepare('SELECT text, status FROM threads WHERE id = ?')
  const upsert = db.prepare(`
    INSERT INTO threads(id, subject, participants, first_date, last_date, message_count, text, token_estimate, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET subject = excluded.subject, participants = excluded.participants,
      first_date = excluded.first_date, last_date = excluded.last_date, message_count = excluded.message_count,
      text = excluded.text, token_estimate = excluded.token_estimate, status = excluded.status
  `)

  let pending = 0, skipped = 0
  tx(db, () => {
    for (const list of groups.values()) {
      list.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
      const id = 't_' + createHash('sha1').update(list[0].id).digest('hex').slice(0, 12)
      for (const r of list) setThread.run(id, r.id)

      const useful = list.filter(r => !r.is_noise && r.body_clean.trim().length > 0)
      const participants = [...new Set(useful.flatMap(participantsOf))]
      // Latest signature per sender: the main clue for each person's department.
      const sigs = new Map<string, string>()
      for (const r of list) if (r.signature) sigs.set(r.from_addr, r.signature)
      const blocks = useful.map((r, i) => {
        const to = (JSON.parse(r.to_addrs) as Address[]).map(a => a.addr).join(', ')
        const cc = (JSON.parse(r.cc_addrs) as Address[]).map(a => a.addr).join(', ')
        return `[${i + 1}] ${r.date?.slice(0, 16).replace('T', ' ') ?? '?'} | From: ${r.from_addr} | To: ${to}${cc ? ` | Cc: ${cc}` : ''}\n${r.body_clean}`
      })
      let body = blocks.join('\n\n')
      if (body.length > MAX_THREAD_CHARS) {
        const half = MAX_THREAD_CHARS / 2
        body = body.slice(0, half) + `\n\n[… ${body.length - MAX_THREAD_CHARS} characters from the middle of this thread not included …]\n\n` + body.slice(-half)
      }
      const text = `Subject: ${list[0].subject}\nParticipants:\n${participants.map(p => '- ' + label(p, sigs.get(p))).join('\n')}\n\n${body}`

      const prev = getThread.get(id) as { text: string; status: string } | undefined
      let status = useful.length === 0 || body.trim().length < 80 ? 'skipped' : 'pending'
      if (prev && prev.text === text) status = prev.status
      else if (prev && prev.status === 'folded') status = 'folded' // live updates are handled by the sync step
      if (status === 'pending') pending++
      if (status === 'skipped') skipped++

      upsert.run(id, list[0].subject, JSON.stringify(participants), list[0].date, list[list.length - 1].date,
        list.length, text, estimateTokens(text), status)
    }
  })
  return { threads: groups.size, pending, skipped }
}

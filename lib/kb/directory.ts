import type { DB } from './db'

/**
 * "Who to email" is computed, not written by the model: a recency-weighted vote
 * over the contacts seen in each thread, so it follows people changing roles.
 */
const HALF_LIFE_DAYS = Number(process.env.KB_HALF_LIFE_DAYS ?? 180)

export type Person = { addr: string; name: string; department: string | null; score: number; count: number; last: string | null }
export type Note   = { text: string; count: number }

export type Entry = {
  id: string; title: string; domain: string; subdomain: string
  email_to: Person[]            // who to send the request to, best first
  approval: Person[]            // whose approval is usually needed
  cc: Person[]
  previously: Person[]          // used to handle it, not seen for a year while others are
  channel: string | null
  include: Note[]
  tips: Note[]
  example_subject: string | null
  threads: { id: string; subject: string; date: string | null }[]   // most recent source emails, for citations
  thread_count: number; first_seen: string | null; last_seen: string | null
  confidence: 'low' | 'medium' | 'high'
}

type ContactRow = { actor: string; role: string; date: string | null }

const SHARED_MAILBOX = /(^|[._-])(team|support|ops|admin|infra|network|reseau|secu|security|soc|noc|dsi|it|helpdesk|service|equipe|cab|exploitation|prod|run|achats?)([._-]|@)/i

export function isSharedMailbox(addr: string, name: string): boolean {
  return SHARED_MAILBOX.test(addr) || (!!name && !/\s/.test(name.trim()) && !addr.split('@')[0].includes('.'))
}

function peopleIndex(db: DB) {
  const rows = db.prepare('SELECT addr, name, team FROM people').all() as { addr: string; name: string; team: string | null }[]
  const votes = db.prepare('SELECT addr, department, count FROM departments ORDER BY count DESC').all() as { addr: string; department: string; count: number }[]
  const dept = new Map<string, string>()
  for (const v of votes) if (!dept.has(v.addr)) dept.set(v.addr, v.department)
  return new Map(rows.map(r => [r.addr, { name: r.name, department: r.team ?? dept.get(r.addr) ?? null }]))
}

function rank(rows: ContactRow[], asOf: number, people: ReturnType<typeof peopleIndex>): Person[] {
  const by = new Map<string, Person>()
  for (const r of rows) {
    const p = people.get(r.actor)
    const cur = by.get(r.actor) ?? { addr: r.actor, name: p?.name ?? '', department: p?.department ?? null, score: 0, count: 0, last: null }
    const age = r.date ? Math.max(0, (asOf - Date.parse(r.date)) / 86_400_000) : HALF_LIFE_DAYS
    cur.score += Math.pow(0.5, age / HALF_LIFE_DAYS)
    cur.count++
    if (r.date && (!cur.last || r.date > cur.last)) cur.last = r.date
    by.set(r.actor, cur)
  }
  return [...by.values()].sort((a, b) => b.score - a.score).map(p => ({ ...p, score: Math.round(p.score * 100) / 100 }))
}

export function buildEntries(db: DB): Entry[] {
  const people = peopleIndex(db)
  // Recency is measured against the end of the mailbox, not today, so an old dump still ranks correctly.
  const latest = (db.prepare('SELECT MAX(date) d FROM messages').get() as { d: string | null }).d
  const asOf = latest ? Date.parse(latest) : Date.now()
  const entries = db.prepare(`SELECT id, title, domain, subdomain, thread_count, first_seen, last_seen
    FROM entries WHERE merged_into IS NULL ORDER BY domain, subdomain, thread_count DESC`).all() as
    { id: string; title: string; domain: string; subdomain: string; thread_count: number; first_seen: string | null; last_seen: string | null }[]
  const contactsQ = db.prepare('SELECT actor, role, date FROM contacts WHERE entry_id = ?')
  const factsQ = db.prepare('SELECT text, count FROM facts WHERE entry_id = ? AND kind = ? ORDER BY count DESC, last_seen DESC LIMIT ?')
  const latestQ = db.prepare('SELECT text FROM facts WHERE entry_id = ? AND kind = ? ORDER BY last_seen DESC LIMIT 1')
  const threadsQ = db.prepare(`SELECT t.id, t.subject, et.date FROM entry_threads et JOIN threads t ON t.id = et.thread_id
    WHERE et.entry_id = ? ORDER BY et.date DESC LIMIT 6`)

  return entries.map(e => {
    const rows = contactsQ.all(e.id) as ContactRow[]
    const handlers = rank(rows.filter(r => r.role === 'handles' || r.role === 'dispatches'), asOf, people)
    const approvers = rank(rows.filter(r => r.role === 'approves'), asOf, people)
    const handlerSet = new Set(handlers.map(h => h.addr))
    const cc = rank(rows.filter(r => r.role === 'cc'), asOf, people)
      .filter(p => !handlerSet.has(p.addr) && (p.count >= 2 || e.thread_count === 1)).slice(0, 3)

    // Current vs former: someone not seen for a year while others handled it since.
    const newest = handlers.reduce<string | null>((m, h) => (h.last && (!m || h.last > m) ? h.last : m), null)
    const stale = (p: Person) => !!(p.last && newest && Date.parse(newest) - Date.parse(p.last) > 365 * 86_400_000)
    const current = handlers.filter(h => !stale(h))

    // A shared mailbox that is used for this request goes first: it survives people moving on.
    const top = current[0]?.score ?? 0
    const mailbox = current.find(h => isSharedMailbox(h.addr, h.name) && h.score >= top * 0.4)
    const emailTo = mailbox ? [mailbox, ...current.filter(h => h !== mailbox)] : current

    return {
      id: e.id, title: e.title, domain: e.domain, subdomain: e.subdomain,
      email_to: emailTo.slice(0, 3),
      approval: approvers.filter(a => !stale(a)).slice(0, 2),
      cc,
      previously: handlers.filter(stale).slice(0, 2),
      channel: (factsQ.all(e.id, 'channel', 1) as Note[])[0]?.text ?? null,
      include: factsQ.all(e.id, 'include', 5) as Note[],
      tips: factsQ.all(e.id, 'tip', 2) as Note[],
      example_subject: (latestQ.get(e.id, 'subject') as { text: string } | undefined)?.text ?? null,
      threads: threadsQ.all(e.id) as Entry['threads'],
      thread_count: e.thread_count, first_seen: e.first_seen, last_seen: e.last_seen,
      confidence: e.thread_count >= 5 ? 'high' : e.thread_count >= 2 ? 'medium' : 'low',
    }
  })
}

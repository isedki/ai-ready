import type { DB }       from './db'
import { tx }            from './db'
import { FOLD_SYSTEM, MERGE_SYSTEM } from './prompts'
import { FoldResult, MergeCheck, type RequestItem, type ThreadExtraction } from './schemas'
import { MODELS, type Job, type Runner } from './llm'
import { TfIdf, normalizeFact } from './match'

type Item = { id: string; thread_id: string; date: string | null; subject: string; participants: Set<string>; req: RequestItem }
type EntryRow = { id: string; title: string; domain: string; subdomain: string }

const MAX_ITEMS_PER_CALL   = 15
const MAX_ENTRIES_PER_CALL = 300
const MERGE_CANDIDATE      = 0.5

export function windowKey(date: string | null, size: 'month' | 'quarter'): string {
  if (!date) return '9999-99'
  const [y, m] = date.slice(0, 7).split('-')
  return size === 'month' ? `${y}-${m}` : `${y}-Q${Math.ceil(Number(m) / 3)}`
}

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'request'
}

function liveEntry(db: DB, id: string | null): string | null {
  let cur = id
  for (let i = 0; cur && i < 10; i++) {
    const row = db.prepare('SELECT merged_into FROM entries WHERE id = ?').get(cur) as { merged_into: string | null } | undefined
    if (!row) return null
    if (!row.merged_into) return cur
    cur = row.merged_into
  }
  return null
}

function addFact(db: DB, entryId: string, kind: string, text: string | null, date: string | null, count = 1) {
  if (!text || !text.trim()) return
  const norm = kind === 'subject' ? text.trim().toLowerCase() : normalizeFact(text)
  if (!norm) return
  db.prepare(`
    INSERT INTO facts(entry_id, kind, text, norm, count, last_seen) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(entry_id, kind, norm) DO UPDATE SET count = facts.count + excluded.count,
      last_seen = MAX(COALESCE(facts.last_seen, ''), COALESCE(excluded.last_seen, ''))
  `).run(entryId, kind, text.trim(), norm, count, date)
}

/* ── applying decisions (code only) ──────────────────────────────────────── */

function attachItem(db: DB, entryId: string, it: Item) {
  const known = (a: string | null) => {
    const addr = a?.trim().toLowerCase() ?? null
    return addr && it.participants.has(addr) ? addr : null   // never trust an address the thread doesn't contain
  }
  const requester = known(it.req.requester)
  const add = db.prepare('INSERT INTO contacts(entry_id, thread_id, actor, role, date) VALUES (?, ?, ?, ?, ?)')
  const vote = db.prepare(`INSERT INTO departments(addr, department, count) VALUES (?, ?, 1)
    ON CONFLICT(addr, department) DO UPDATE SET count = departments.count + 1`)
  for (const c of it.req.contacts) {
    const addr = known(c.email)
    if (!addr || addr === requester) continue
    add.run(entryId, it.thread_id, addr, c.role, it.date)
    if (c.department?.trim()) vote.run(addr, c.department.trim())
  }
  for (const cc of it.req.cc) {
    const addr = known(cc)
    if (addr && addr !== requester) add.run(entryId, it.thread_id, addr, 'cc', it.date)
  }
  for (const x of it.req.include.slice(0, 5)) addFact(db, entryId, 'include', x, it.date)
  addFact(db, entryId, 'tip', it.req.tip, it.date)
  addFact(db, entryId, 'channel', it.req.channel === 'email' && !it.req.channel_detail
    ? 'email' : `${it.req.channel}${it.req.channel_detail ? `: ${it.req.channel_detail}` : ''}`, it.date)
  addFact(db, entryId, 'subject', it.subject, it.date)

  db.prepare('INSERT OR IGNORE INTO entry_threads(entry_id, thread_id, date) VALUES (?, ?, ?)').run(entryId, it.thread_id, it.date)
  db.prepare(`UPDATE entries SET
      first_seen   = (SELECT MIN(date) FROM entry_threads WHERE entry_id = ?),
      last_seen    = (SELECT MAX(date) FROM entry_threads WHERE entry_id = ?),
      thread_count = (SELECT COUNT(*) FROM entry_threads WHERE entry_id = ?)
    WHERE id = ?`).run(entryId, entryId, entryId, entryId)
}

function createEntry(db: DB, title: string, domain: string, subdomain: string): string {
  const base = slugify(title)
  let id = base, n = 2
  while (db.prepare('SELECT 1 FROM entries WHERE id = ?').get(id)) id = `${base}-${n++}`
  db.prepare('INSERT INTO entries(id, title, domain, subdomain, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, title, domain, subdomain, new Date().toISOString())
  return id
}

export function mergeEntries(db: DB, keepId: string, dropId: string, title?: string) {
  tx(db, () => {
    db.prepare('UPDATE contacts SET entry_id = ? WHERE entry_id = ?').run(keepId, dropId)
    db.prepare('UPDATE OR IGNORE entry_threads SET entry_id = ? WHERE entry_id = ?').run(keepId, dropId)
    db.prepare('DELETE FROM entry_threads WHERE entry_id = ?').run(dropId)
    const facts = db.prepare('SELECT kind, text, count, last_seen FROM facts WHERE entry_id = ?').all(dropId) as { kind: string; text: string; count: number; last_seen: string | null }[]
    for (const f of facts) addFact(db, keepId, f.kind, f.text, f.last_seen, f.count)
    db.prepare('DELETE FROM facts WHERE entry_id = ?').run(dropId)
    db.prepare('UPDATE entries SET merged_into = ? WHERE id = ?').run(keepId, dropId)
    db.prepare(`UPDATE entries SET title = COALESCE(?, title),
        first_seen   = (SELECT MIN(date) FROM entry_threads WHERE entry_id = ?),
        last_seen    = (SELECT MAX(date) FROM entry_threads WHERE entry_id = ?),
        thread_count = (SELECT COUNT(*) FROM entry_threads WHERE entry_id = ?)
      WHERE id = ?`).run(title || null, keepId, keepId, keepId, keepId)
  })
}

/* ── one time window ─────────────────────────────────────────────────────── */

export async function foldWindow(db: DB, runner: Runner, key: string, items: Item[], log: (s: string) => void) {
  // One call per domain (chunked): the model sees every existing entry of that domain, so it can match reliably.
  const byDomain = new Map<string, Item[]>()
  for (const it of items) byDomain.set(it.req.domain, [...(byDomain.get(it.req.domain) ?? []), it])

  const safeKey = key.replace(/[^A-Za-z0-9_-]/g, '_')
  const jobs: Job<FoldResult>[] = []
  const jobItems = new Map<string, { domain: string; items: Item[] }>()
  for (const [domain, list] of byDomain) {
    const entries = db.prepare(`SELECT id, title, subdomain FROM entries WHERE domain = ? AND merged_into IS NULL
      ORDER BY thread_count DESC LIMIT ?`).all(domain, MAX_ENTRIES_PER_CALL) as Omit<EntryRow, 'domain'>[]
    for (let i = 0; i < list.length; i += MAX_ITEMS_PER_CALL) {
      const chunk = list.slice(i, i + MAX_ITEMS_PER_CALL)
      const id = `f_${safeKey}_${jobs.length}`
      jobs.push({
        id, system: FOLD_SYSTEM, schema: FoldResult, model: MODELS.fold, effort: 'low', maxTokens: 8000,
        user: JSON.stringify({
          domain,
          existing_entries: entries,
          items: chunk.map(it => ({ item_id: it.id, title: it.req.title, subdomain: it.req.subdomain,
            handled_by: it.req.contacts.map(c => c.department ?? c.email), include: it.req.include })),
        }, null, 1),
      })
      jobItems.set(id, { domain, items: chunk })
    }
  }

  log(`window ${key}: ${items.length} items in ${byDomain.size} domains, ${jobs.length} fold calls`)
  const results = await runner.run('fold', `fold:${key}`, jobs)

  const created: string[] = []
  const failedThreads = new Set<string>()
  const doneThreads = new Set<string>()
  tx(db, () => {
    for (const job of jobs) {
      const r = results.get(job.id)
      const { domain, items: its } = jobItems.get(job.id)!
      if (!r || !r.ok) {
        log(`  ${job.id} failed: ${r ? r.error : 'missing'}`)
        its.forEach(i => failedThreads.add(i.thread_id))
        continue
      }
      const decisions = new Map(r.value.decisions.map(d => [d.item_id, d]))
      const groups = new Map<string, string>()
      for (const it of its) {
        const d = decisions.get(it.id)
        if (d?.decision === 'not_a_request') { doneThreads.add(it.thread_id); continue }
        let entryId = d?.decision === 'same' ? liveEntry(db, d.entry_id) : null
        if (!entryId) {
          const g = d?.new_group ?? it.id
          entryId = groups.get(g) ?? null
          if (!entryId) {
            entryId = createEntry(db, d?.title || it.req.title, domain, d?.subdomain || it.req.subdomain)
            groups.set(g, entryId)
            created.push(entryId)
          }
        }
        attachItem(db, entryId, it)
        doneThreads.add(it.thread_id)
      }
    }
    const mark = db.prepare("UPDATE threads SET status = 'folded' WHERE id = ?")
    for (const t of doneThreads) if (!failedThreads.has(t)) mark.run(t)
  })

  await mergeNearDuplicates(db, runner, key, created, log)
  return { created: created.length, failed: failedThreads.size }
}

/** New entries can duplicate one created in another chunk or domain; check the close pairs. */
async function mergeNearDuplicates(db: DB, runner: Runner, key: string, created: string[], log: (s: string) => void) {
  if (created.length === 0) return
  const all = db.prepare('SELECT id, title, domain, subdomain FROM entries WHERE merged_into IS NULL').all() as EntryRow[]
  const text = (e: EntryRow) => `${e.title} ${e.title} ${e.subdomain}`
  const index = new TfIdf(all.map(e => ({ id: e.id, text: text(e) })))
  const pairs: [EntryRow, EntryRow][] = []
  const seen = new Set<string>()
  for (const id of created) {
    const e = all.find(x => x.id === id)
    if (!e) continue
    for (const c of index.query(text(e), 3, MERGE_CANDIDATE)) {
      const k = [id, c.id].sort().join('|')
      if (c.id === id || seen.has(k)) continue
      seen.add(k)
      pairs.push([all.find(x => x.id === c.id)!, e])
    }
  }
  if (pairs.length === 0) return

  const safeKey = key.replace(/[^A-Za-z0-9_-]/g, '_')
  const summary = (e: EntryRow) => {
    const who = db.prepare(`SELECT actor, COUNT(*) n FROM contacts WHERE entry_id = ? AND role != 'cc' GROUP BY actor ORDER BY n DESC LIMIT 3`).all(e.id)
    return { ...e, handled_by: who }
  }
  const jobs: Job<typeof MergeCheck._output>[] = pairs.map(([a, b], i) => ({
    id: `m_${safeKey}_${i}`, system: MERGE_SYSTEM, user: JSON.stringify({ a: summary(a), b: summary(b) }, null, 1),
    schema: MergeCheck, model: MODELS.fold, effort: 'low', maxTokens: 4000,
  }))
  const results = await runner.run('merge', `merge:${key}`, jobs)
  pairs.forEach(([keep, drop], i) => {
    const r = results.get(jobs[i].id)
    if (r?.ok && r.value.same_request && liveEntry(db, keep.id) === keep.id && liveEntry(db, drop.id) === drop.id) {
      log(`  merged "${drop.title}" into "${keep.title}"`)
      mergeEntries(db, keep.id, drop.id, r.value.keep_title)
    }
  })
}

/* ── the whole replay ────────────────────────────────────────────────────── */

export function loadItems(db: DB): Item[] {
  const rows = db.prepare(`
    SELECT t.id, t.first_date, t.subject, t.participants, e.json FROM threads t JOIN extractions e ON e.thread_id = t.id
    WHERE t.status = 'extracted' ORDER BY t.first_date
  `).all() as { id: string; first_date: string | null; subject: string; participants: string; json: string }[]
  return rows.flatMap(r => {
    const ex = JSON.parse(r.json) as ThreadExtraction
    const participants = new Set((JSON.parse(r.participants) as string[]).map(p => p.toLowerCase()))
    return ex.items.map((req, i) => ({ id: `${r.id}_${i}`, thread_id: r.id, date: r.first_date, subject: r.subject, participants, req }))
  })
}

/** Pass 2: replay extracted items in date order so entries (and their contacts) evolve as the mailbox did. */
export async function foldAll(db: DB, runner: Runner, opts: { window: 'month' | 'quarter'; log: (s: string) => void }) {
  const windows = new Map<string, Item[]>()
  for (const it of loadItems(db)) {
    const k = windowKey(it.date, opts.window)
    windows.set(k, [...(windows.get(k) ?? []), it])
  }
  const totals = { windows: windows.size, created: 0, failed: 0 }
  for (const k of [...windows.keys()].sort()) {
    // Months are replayed in order: after a usage limit, stop and resume from this month next time.
    if (runner.stopped) break
    const r = await foldWindow(db, runner, k, windows.get(k)!, opts.log)
    totals.created += r.created
    totals.failed += r.failed
  }
  return totals
}

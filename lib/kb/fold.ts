import type { DB }       from './db'
import { tx }            from './db'
import { FOLD_SYSTEM, MERGE_SYSTEM } from './prompts'
import { FoldResult, MergeCheck, type ExtractedProcess, type FoldDecision, type ThreadExtraction } from './schemas'
import { MODELS, type Job, type Runner } from './llm'
import { TfIdf, labelSimilarity, normalizeFact } from './match'
import { buildCard, diffCards, type Card } from './raci'

type Item = { id: string; thread_id: string; date: string | null; participants: Set<string>; proc: ExtractedProcess }
type ProcRow = { id: string; title: string; action: string; object: string; system: string | null; environment: string | null }
type StepRow = { id: string; label: string; ord: number }

const MAX_ITEMS_PER_CALL = 8
const MAX_NEW_PER_CALL   = 15
const CANDIDATE_MIN      = 0.12
const MERGE_CANDIDATE    = 0.45

export function windowKey(date: string | null, size: 'month' | 'quarter'): string {
  if (!date) return '9999-99'
  const [y, m] = date.slice(0, 7).split('-')
  return size === 'month' ? `${y}-${m}` : `${y}-Q${Math.ceil(Number(m) / 3)}`
}

function windowEnd(key: string): string {
  if (key.startsWith('9999')) return new Date().toISOString()
  const [y, rest] = key.split('-')
  const month = rest.startsWith('Q') ? Number(rest.slice(1)) * 3 : Number(rest)
  return new Date(Date.UTC(Number(y), month, 0, 23, 59, 59)).toISOString()
}

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'procedure'
}

function uniqueId(db: DB, table: 'procedures' | 'steps', base: string): string {
  let id = base, n = 2
  while (db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id)) id = `${base}-${n++}`
  return id
}

function liveProcedure(db: DB, id: string | null): string | null {
  let cur = id
  for (let i = 0; cur && i < 10; i++) {
    const row = db.prepare('SELECT merged_into FROM procedures WHERE id = ?').get(cur) as { merged_into: string | null } | undefined
    if (!row) return null
    if (!row.merged_into) return cur
    cur = row.merged_into
  }
  return null
}

function procText(db: DB, p: ProcRow): string {
  const steps = db.prepare('SELECT label FROM steps WHERE procedure_id = ?').all(p.id) as { label: string }[]
  return [p.title, p.title, p.action, p.object, p.system, p.environment, ...steps.map(s => s.label)].filter(Boolean).join(' ')
}

function itemText(i: Item): string {
  const p = i.proc
  return [p.title, p.title, p.action, p.object, p.system, p.environment, ...p.steps.map(s => s.what)].filter(Boolean).join(' ')
}

function procedureCard(db: DB, id: string) {
  const p = db.prepare('SELECT id, title, system, environment FROM procedures WHERE id = ?').get(id) as ProcRow
  const steps = db.prepare('SELECT id, label FROM steps WHERE procedure_id = ? ORDER BY ord').all(id) as StepRow[]
  const variants = db.prepare("SELECT text FROM facts WHERE procedure_id = ? AND kind = 'variant' LIMIT 5").all(id) as { text: string }[]
  return { id: p.id, title: p.title, system: p.system, environment: p.environment, steps, variants: variants.map(v => v.text) }
}

function itemForPrompt(i: Item) {
  const p = i.proc
  return {
    item_id: i.id, date: i.date?.slice(0, 10), title: p.title, action: p.action, object: p.object,
    system: p.system, environment: p.environment, summary: p.summary,
    steps: p.steps.map((s, idx) => ({ index: idx, what: s.what, raci: s.raci })),
  }
}

function foldJob(id: string, cards: ReturnType<typeof procedureCard>[], items: Item[]): Job<FoldResult> {
  return {
    id,
    system:    FOLD_SYSTEM,
    user:      JSON.stringify({ existing_procedures: cards, items: items.map(itemForPrompt) }, null, 1),
    schema:    FoldResult,
    model:     MODELS.fold,
    effort:    'medium',
    maxTokens: 12000,
  }
}

/* ── applying decisions (pure code, no LLM) ──────────────────────────────── */

function addFact(db: DB, procedureId: string, kind: string, text: string | null, date: string | null) {
  if (!text || !text.trim()) return
  const norm = normalizeFact(text)
  if (!norm) return
  db.prepare(`
    INSERT INTO facts(procedure_id, kind, text, norm, count, last_seen) VALUES (?, ?, ?, ?, 1, ?)
    ON CONFLICT(procedure_id, kind, norm) DO UPDATE SET count = facts.count + 1, last_seen = MAX(COALESCE(facts.last_seen, ''), COALESCE(excluded.last_seen, ''))
  `).run(procedureId, kind, text.trim(), norm, date)
}

function createProcedure(db: DB, title: string, proc: ExtractedProcess, date: string | null): string {
  const id = uniqueId(db, 'procedures', slugify(title))
  db.prepare(`INSERT INTO procedures(id, title, action, object, system, environment, first_seen, last_seen, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, title, proc.action, proc.object, proc.system, proc.environment, date, date, new Date().toISOString())
  return id
}

function createStep(db: DB, procedureId: string, label: string, afterStep: string | null): string {
  const steps = db.prepare('SELECT id, label, ord FROM steps WHERE procedure_id = ? ORDER BY ord').all(procedureId) as StepRow[]
  let ord: number
  const after = afterStep ? steps.findIndex(s => s.id === afterStep) : -2
  if (steps.length === 0) ord = 1
  else if (after === -2) ord = steps[steps.length - 1].ord + 1       // unknown position: append
  else if (after === -1) ord = steps[steps.length - 1].ord + 1
  else ord = after + 1 < steps.length ? (steps[after].ord + steps[after + 1].ord) / 2 : steps[after].ord + 1
  const id = uniqueId(db, 'steps', `${procedureId}:${slugify(label).slice(0, 32)}`)
  db.prepare('INSERT INTO steps(id, procedure_id, ord, label) VALUES (?, ?, ?, ?)').run(id, procedureId, ord, label)
  return id
}

function closestStep(db: DB, procedureId: string, label: string): string | null {
  const steps = db.prepare('SELECT id, label FROM steps WHERE procedure_id = ?').all(procedureId) as StepRow[]
  let best: string | null = null, bestScore = 0.6
  for (const s of steps) {
    const sc = labelSimilarity(s.label, label)
    if (sc >= bestScore) { best = s.id; bestScore = sc }
  }
  return best
}

function attachItem(db: DB, procedureId: string, item: Item, relation: string, d: FoldDecision | null) {
  const validSteps = new Set((db.prepare('SELECT id FROM steps WHERE procedure_id = ?').all(procedureId) as { id: string }[]).map(s => s.id))
  const mapped = new Map<number, string>()
  for (const m of d?.step_map ?? []) {
    if (m.item_step < 0 || m.item_step >= item.proc.steps.length || mapped.has(m.item_step)) continue
    if (m.step_id && validSteps.has(m.step_id)) {
      mapped.set(m.item_step, m.step_id)
    } else {
      const label = m.new_label || item.proc.steps[m.item_step].what
      const id = closestStep(db, procedureId, label) ?? createStep(db, procedureId, label, m.after_step && validSteps.has(m.after_step) ? m.after_step : null)
      validSteps.add(id)
      mapped.set(m.item_step, id)
    }
  }
  // Steps the model did not map: match by label, else append.
  item.proc.steps.forEach((s, idx) => {
    if (mapped.has(idx)) return
    const id = closestStep(db, procedureId, s.what) ?? createStep(db, procedureId, s.what, null)
    mapped.set(idx, id)
  })

  const ev = db.prepare('INSERT INTO evidence(procedure_id, step_id, thread_id, actor, raci, date, quote) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const actorOf = (a: string | null) => {
    const addr = a?.trim().toLowerCase() ?? null
    return addr && item.participants.has(addr) ? addr : null   // never trust an address the thread doesn't contain
  }
  const seenSteps = new Set<string>()
  item.proc.steps.forEach((s, idx) => {
    const stepId = mapped.get(idx)!
    ev.run(procedureId, stepId, item.thread_id, actorOf(s.actor), s.raci, s.date ?? item.date, s.quote.slice(0, 300))
    seenSteps.add(stepId)
  })
  for (const id of seenSteps) db.prepare('UPDATE steps SET seen_count = seen_count + 1 WHERE id = ?').run(id)
  if (item.proc.requester) ev.run(procedureId, null, item.thread_id, actorOf(item.proc.requester), 'REQ', item.date, '')

  for (const a of item.proc.artifacts) addFact(db, procedureId, 'artifact', a, item.date)
  for (const a of item.proc.prerequisites) addFact(db, procedureId, 'prerequisite', a, item.date)
  for (const a of item.proc.gotchas) addFact(db, procedureId, 'gotcha', a, item.date)
  addFact(db, procedureId, 'system', item.proc.system, item.date)
  addFact(db, procedureId, 'environment', item.proc.environment, item.date)
  if (relation === 'variant') addFact(db, procedureId, 'variant', d?.variant_note ?? null, item.date)

  db.prepare(`INSERT OR IGNORE INTO procedure_threads(procedure_id, thread_id, relation, date, lead_time, outcome) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(procedureId, item.thread_id, relation, item.date, item.proc.lead_time_days, item.proc.outcome)
  db.prepare(`UPDATE procedures SET
      first_seen = CASE WHEN first_seen IS NULL OR ? < first_seen THEN ? ELSE first_seen END,
      last_seen  = CASE WHEN last_seen  IS NULL OR ? > last_seen  THEN ? ELSE last_seen  END,
      thread_count = (SELECT COUNT(*) FROM procedure_threads WHERE procedure_id = ?),
      needs_summary = 1
    WHERE id = ?`).run(item.date, item.date, item.date, item.date, procedureId, procedureId)
}

export function mergeProcedures(db: DB, keepId: string, dropId: string, title?: string) {
  tx(db, () => {
    const dropSteps = db.prepare('SELECT id, label FROM steps WHERE procedure_id = ? ORDER BY ord').all(dropId) as StepRow[]
    for (const s of dropSteps) {
      const target = closestStep(db, keepId, s.label) ?? createStep(db, keepId, s.label, null)
      db.prepare('UPDATE evidence SET step_id = ? WHERE step_id = ?').run(target, s.id)
      db.prepare('UPDATE steps SET seen_count = seen_count + (SELECT seen_count FROM steps WHERE id = ?) WHERE id = ?').run(s.id, target)
      db.prepare('DELETE FROM steps WHERE id = ?').run(s.id)
    }
    db.prepare('UPDATE evidence SET procedure_id = ? WHERE procedure_id = ?').run(keepId, dropId)
    db.prepare('UPDATE OR IGNORE procedure_threads SET procedure_id = ? WHERE procedure_id = ?').run(keepId, dropId)
    db.prepare('DELETE FROM procedure_threads WHERE procedure_id = ?').run(dropId)
    const facts = db.prepare('SELECT kind, text, count, last_seen FROM facts WHERE procedure_id = ?').all(dropId) as { kind: string; text: string; count: number; last_seen: string | null }[]
    for (const f of facts) {
      addFact(db, keepId, f.kind, f.text, f.last_seen)
      db.prepare('UPDATE facts SET count = count + ? WHERE procedure_id = ? AND kind = ? AND norm = ?').run(f.count - 1, keepId, f.kind, normalizeFact(f.text))
    }
    db.prepare('DELETE FROM facts WHERE procedure_id = ?').run(dropId)
    db.prepare(`UPDATE procedures SET merged_into = ? WHERE id = ?`).run(keepId, dropId)
    db.prepare(`UPDATE procedures SET
        title = COALESCE(?, title),
        first_seen = (SELECT MIN(date) FROM procedure_threads WHERE procedure_id = ?),
        last_seen  = (SELECT MAX(date) FROM procedure_threads WHERE procedure_id = ?),
        thread_count = (SELECT COUNT(*) FROM procedure_threads WHERE procedure_id = ?),
        needs_summary = 1
      WHERE id = ?`).run(title ?? null, keepId, keepId, keepId, keepId)
    db.prepare(`INSERT INTO changes(procedure_id, as_of, kind, detail) VALUES (?, ?, 'merged', ?)`)
      .run(keepId, new Date().toISOString(), `Merged "${dropId}" into this procedure`)
  })
}

/* ── one time window ─────────────────────────────────────────────────────── */

export async function foldWindow(db: DB, runner: Runner, key: string, items: Item[], log: (s: string) => void) {
  const procs = db.prepare('SELECT id, title, action, object, system, environment FROM procedures WHERE merged_into IS NULL').all() as ProcRow[]
  const index = new TfIdf(procs.map(p => ({ id: p.id, text: procText(db, p) })))

  // Group items by their best candidate so one call handles all of a procedure's new threads.
  const byTop = new Map<string, { items: Item[]; cands: Set<string> }>()
  const fresh: { items: Item[]; cands: Set<string> } = { items: [], cands: new Set() }
  for (const it of items) {
    const cands = index.query(itemText(it), 5, CANDIDATE_MIN)
    if (cands.length === 0) { fresh.items.push(it); continue }
    const g = byTop.get(cands[0].id) ?? { items: [], cands: new Set() }
    g.items.push(it)
    cands.forEach(c => g.cands.add(c.id))
    byTop.set(cands[0].id, g)
  }

  const jobs: Job<FoldResult>[] = []
  const jobItems = new Map<string, Item[]>()
  const safeKey = key.replace(/[^A-Za-z0-9_-]/g, '_')
  const push = (items: Item[], cands: string[]) => {
    const id = `f_${safeKey}_${jobs.length}`
    jobs.push(foldJob(id, cands.slice(0, 8).map(c => procedureCard(db, c)), items))
    jobItems.set(id, items)
  }
  for (const g of byTop.values()) {
    for (let i = 0; i < g.items.length; i += MAX_ITEMS_PER_CALL) push(g.items.slice(i, i + MAX_ITEMS_PER_CALL), [...g.cands])
  }
  for (let i = 0; i < fresh.items.length; i += MAX_NEW_PER_CALL) push(fresh.items.slice(i, i + MAX_NEW_PER_CALL), [])

  log(`window ${key}: ${items.length} items, ${procs.length} known procedures, ${jobs.length} fold calls`)
  const results = await runner.run('fold', `fold:${key}`, jobs)

  const created: string[] = []
  const touched = new Set<string>()
  const doneThreads = new Set<string>()
  const failedThreads = new Set<string>()

  tx(db, () => {
    for (const job of jobs) {
      const r = results.get(job.id)
      const its = jobItems.get(job.id)!
      if (!r || !r.ok) {
        log(`  ${job.id} failed: ${r ? r.error : 'missing'}`)
        its.forEach(i => failedThreads.add(i.thread_id))
        continue
      }
      const decisions = new Map(r.value.decisions.map(d => [d.item_id, d]))
      const newGroups = new Map<string, string>()
      for (const it of [...its].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))) {
        const d = decisions.get(it.id) ?? null
        if (d?.decision === 'not_a_process') { doneThreads.add(it.thread_id); continue }
        let procId = d && (d.decision === 'same' || d.decision === 'variant') ? liveProcedure(db, d.procedure_id) : null
        let relation = procId ? d!.decision : 'new'
        if (!procId) {
          const groupKey = d?.new_group ?? it.id
          procId = newGroups.get(groupKey) ?? null
          if (procId) relation = 'same'
          else {
            procId = createProcedure(db, d?.new_title || it.proc.title, it.proc, it.date)
            newGroups.set(groupKey, procId)
            created.push(procId)
          }
        }
        // Step ids that don't exist (e.g. for a procedure created in this call) fall back to new_label / label matching.
        attachItem(db, procId, it, relation, d)
        touched.add(procId)
        doneThreads.add(it.thread_id)
      }
    }
    const mark = db.prepare("UPDATE threads SET status = 'folded' WHERE id = ?")
    for (const t of doneThreads) if (!failedThreads.has(t)) mark.run(t)
  })

  await mergeNearDuplicates(db, runner, key, created, log)

  // Snapshot every touched procedure as of the window end, and record what changed.
  const asOf = windowEnd(key)
  tx(db, () => {
    for (const id of touched) {
      const live = liveProcedure(db, id)
      if (!live) continue
      const card = buildCard(db, live, asOf)
      const prev = db.prepare('SELECT card FROM snapshots WHERE procedure_id = ? AND as_of < ? ORDER BY as_of DESC LIMIT 1').get(live, asOf) as { card: string } | undefined
      if (prev) {
        for (const c of diffCards(JSON.parse(prev.card) as Card, card)) {
          db.prepare('INSERT INTO changes(procedure_id, as_of, kind, detail) VALUES (?, ?, ?, ?)').run(live, asOf, c.kind, c.detail)
        }
      }
      db.prepare('INSERT OR REPLACE INTO snapshots(procedure_id, as_of, card) VALUES (?, ?, ?)').run(live, asOf, JSON.stringify(card))
    }
  })
  return { created: created.length, touched: touched.size, failed: failedThreads.size }
}

async function mergeNearDuplicates(db: DB, runner: Runner, key: string, created: string[], log: (s: string) => void) {
  if (created.length === 0) return
  const procs = db.prepare('SELECT id, title, action, object, system, environment FROM procedures WHERE merged_into IS NULL').all() as ProcRow[]
  const index = new TfIdf(procs.map(p => ({ id: p.id, text: procText(db, p) })))
  const pairs: [string, string][] = []
  const seen = new Set<string>()
  for (const id of created) {
    const p = procs.find(x => x.id === id)
    if (!p) continue
    for (const c of index.query(procText(db, p), 3, MERGE_CANDIDATE)) {
      if (c.id === id) continue
      const k = [id, c.id].sort().join('|')
      if (!seen.has(k)) { seen.add(k); pairs.push([c.id, id]) }
    }
  }
  if (pairs.length === 0) return

  const safeKey = key.replace(/[^A-Za-z0-9_-]/g, '_')
  const jobs: Job<typeof MergeCheck._output>[] = pairs.map(([a, b], i) => ({
    id: `m_${safeKey}_${i}`, system: MERGE_SYSTEM,
    user: JSON.stringify({ a: procedureCard(db, a), b: procedureCard(db, b) }, null, 1),
    schema: MergeCheck, model: MODELS.fold, effort: 'low', maxTokens: 4000,
  }))
  const results = await runner.run('merge', `merge:${key}`, jobs)
  pairs.forEach(([keep, drop], i) => {
    const r = results.get(jobs[i].id)
    if (r?.ok && r.value.same_procedure && liveProcedure(db, keep) === keep && liveProcedure(db, drop) === drop) {
      log(`  merged ${drop} → ${keep} (${r.value.reason})`)
      mergeProcedures(db, keep, drop, r.value.keep_title)
    }
  })
}

/* ── the whole replay ────────────────────────────────────────────────────── */

export function loadItems(db: DB): Item[] {
  const rows = db.prepare(`
    SELECT t.id, t.first_date, t.participants, e.json FROM threads t JOIN extractions e ON e.thread_id = t.id
    WHERE t.status = 'extracted' ORDER BY t.first_date
  `).all() as { id: string; first_date: string | null; participants: string; json: string }[]
  return rows.flatMap(r => {
    const ex = JSON.parse(r.json) as ThreadExtraction
    const participants = new Set((JSON.parse(r.participants) as string[]).map(p => p.toLowerCase()))
    return ex.processes.map((proc, i) => ({ id: `${r.id}_${i}`, thread_id: r.id, date: r.first_date, participants, proc }))
  })
}

export async function foldAll(db: DB, runner: Runner, opts: { window: 'month' | 'quarter'; log: (s: string) => void }) {
  const items = loadItems(db)
  const windows = new Map<string, Item[]>()
  for (const it of items) {
    const k = windowKey(it.date, opts.window)
    windows.set(k, [...(windows.get(k) ?? []), it])
  }
  const totals = { windows: windows.size, created: 0, failed: 0 }
  for (const k of [...windows.keys()].sort()) {
    const r = await foldWindow(db, runner, k, windows.get(k)!, opts.log)
    totals.created += r.created
    totals.failed += r.failed
  }
  return totals
}

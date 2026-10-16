import type { DB } from './db'

/**
 * The RACI is computed, not written by the model: every step's R/A/C/I is a
 * recency-weighted vote over the evidence rows extracted from threads.
 */
const HALF_LIFE_DAYS = Number(process.env.KB_HALF_LIFE_DAYS ?? 180)

export type ActorScore = { actor: string; name: string; team: string | null; score: number; count: number; last: string | null }
export type CardStep   = { id: string; label: string; seen: number; occasional: boolean; raci: Record<'R' | 'A' | 'C' | 'I', ActorScore[]> }
export type Fact       = { text: string; count: number; last_seen: string | null }

export type Card = {
  id: string; title: string; summary: string | null
  as_of: string; first_seen: string | null; last_seen: string | null
  thread_count: number; confidence: 'low' | 'medium' | 'high'; stale: boolean
  systems: Fact[]; environments: Fact[]
  requesters: ActorScore[]
  steps: CardStep[]
  artifacts: Fact[]; prerequisites: Fact[]; gotchas: Fact[]; variants: Fact[]
  lead_time_days_median: number | null
  outcomes: Record<string, number>
  sources: { thread_id: string; subject: string; date: string | null; relation: string }[]
}

type Ev = { step_id: string | null; actor: string | null; raci: string; date: string | null }

function weight(date: string | null, asOf: number): number {
  if (!date) return 0.5
  const age = Math.max(0, (asOf - Date.parse(date)) / 86_400_000)
  return Math.pow(0.5, age / HALF_LIFE_DAYS)
}

function rank(evs: Ev[], asOf: number, people: Map<string, { name: string; team: string | null }>): ActorScore[] {
  const by = new Map<string, ActorScore>()
  for (const e of evs) {
    if (!e.actor) continue
    const p = people.get(e.actor)
    const cur = by.get(e.actor) ?? { actor: e.actor, name: p?.name ?? '', team: p?.team ?? null, score: 0, count: 0, last: null }
    cur.score += weight(e.date, asOf)
    cur.count++
    if (e.date && (!cur.last || e.date > cur.last)) cur.last = e.date
    by.set(e.actor, cur)
  }
  return [...by.values()].sort((a, b) => b.score - a.score).map(a => ({ ...a, score: Math.round(a.score * 100) / 100 }))
}

export function buildCard(db: DB, procedureId: string, asOfIso: string): Card {
  const asOf = Date.parse(asOfIso)
  const p = db.prepare('SELECT * FROM procedures WHERE id = ?').get(procedureId) as {
    id: string; title: string; summary: string | null; first_seen: string | null; last_seen: string | null; thread_count: number
  }
  const people = new Map((db.prepare('SELECT addr, name, team FROM people').all() as { addr: string; name: string; team: string | null }[])
    .map(r => [r.addr, { name: r.name, team: r.team }]))
  const evidence = db.prepare('SELECT step_id, actor, raci, date FROM evidence WHERE procedure_id = ? AND (date IS NULL OR date <= ?)')
    .all(procedureId, asOfIso) as Ev[]
  const steps = db.prepare('SELECT id, label, seen_count FROM steps WHERE procedure_id = ? ORDER BY ord').all(procedureId) as
    { id: string; label: string; seen_count: number }[]
  const facts = (kind: string): Fact[] => db.prepare(
    'SELECT text, count, last_seen FROM facts WHERE procedure_id = ? AND kind = ? ORDER BY count DESC, last_seen DESC LIMIT 12',
  ).all(procedureId, kind) as Fact[]
  const links = db.prepare(`
    SELECT pt.thread_id, t.subject, pt.date, pt.relation, pt.lead_time, pt.outcome
    FROM procedure_threads pt JOIN threads t ON t.id = pt.thread_id
    WHERE pt.procedure_id = ? AND (pt.date IS NULL OR pt.date <= ?) ORDER BY pt.date DESC
  `).all(procedureId, asOfIso) as { thread_id: string; subject: string; date: string | null; relation: string; lead_time: number | null; outcome: string }[]

  // "Stale" is relative to the end of the mailbox, so an old dump is not entirely flagged.
  const latest = db.prepare('SELECT MAX(date) d FROM messages').get() as { d: string | null }
  const horizon = Math.min(asOf, latest.d ? Date.parse(latest.d) : asOf)

  const leads = links.map(l => l.lead_time).filter((x): x is number => x != null).sort((a, b) => a - b)
  const outcomes: Record<string, number> = {}
  for (const l of links) outcomes[l.outcome] = (outcomes[l.outcome] ?? 0) + 1
  const n = links.length

  return {
    id: p.id, title: p.title, summary: p.summary, as_of: asOfIso,
    first_seen: p.first_seen, last_seen: links[0]?.date ?? p.last_seen,
    thread_count: n,
    confidence: n >= 5 ? 'high' : n >= 2 ? 'medium' : 'low',
    stale: links[0]?.date ? (horizon - Date.parse(links[0].date)) / 86_400_000 > 365 : false,
    systems: facts('system'), environments: facts('environment'),
    requesters: rank(evidence.filter(e => e.raci === 'REQ'), asOf, people),
    steps: steps.map(s => {
      const evs = evidence.filter(e => e.step_id === s.id)
      return {
        id: s.id, label: s.label, seen: s.seen_count,
        occasional: n >= 5 && s.seen_count / n < 0.2,
        raci: {
          R: rank(evs.filter(e => e.raci === 'R'), asOf, people),
          A: rank(evs.filter(e => e.raci === 'A'), asOf, people),
          C: rank(evs.filter(e => e.raci === 'C'), asOf, people),
          I: rank(evs.filter(e => e.raci === 'I'), asOf, people),
        },
      }
    }),
    artifacts: facts('artifact'), prerequisites: facts('prerequisite'), gotchas: facts('gotcha'), variants: facts('variant'),
    lead_time_days_median: leads.length ? leads[Math.floor(leads.length / 2)] : null,
    outcomes,
    sources: links.slice(0, 25).map(l => ({ thread_id: l.thread_id, subject: l.subject, date: l.date, relation: l.relation })),
  }
}

/** A step whose doers are all requesters is "someone asks"; it is shown on the card but not as an owner. */
export function isRequestStep(step: CardStep, card: Card): boolean {
  const req = new Set(card.requesters.map(r => r.actor))
  return step.raci.R.length > 0 && step.raci.R.every(a => req.has(a.actor))
}

/** Compare two snapshots of the same procedure and describe what changed. */
export function diffCards(prev: Card, next: Card): { kind: string; detail: string }[] {
  const changes: { kind: string; detail: string }[] = []
  const prevSteps = new Map(prev.steps.map(s => [s.id, s]))
  const requesters = new Set(next.requesters.map(r => r.actor))
  const share = (list: ActorScore[]) => list.length ? list[0].score / list.reduce((s, a) => s + a.score, 0) : 0
  for (const s of next.steps) {
    const before = prevSteps.get(s.id)
    if (!before) {
      changes.push({ kind: 'new_step', detail: `New step "${s.label}"` })
      continue
    }
    for (const role of ['R', 'A'] as const) {
      const a = before.raci[role][0], b = s.raci[role][0]
      if (!a || !b || a.actor === b.actor) continue
      // The "submit the request" step is done by whoever needs the thing; that is not an owner change.
      if (role === 'R' && requesters.has(a.actor) && requesters.has(b.actor)) continue
      // Only report a clear new owner, not a step shared among many people.
      if (share(s.raci[role]) < 0.5) continue
      changes.push({ kind: 'owner_changed', detail: `${role} for "${s.label}" moved from ${a.name || a.actor} to ${b.name || b.actor}${b.count < 2 ? ' (seen once so far)' : ''}` })
    }
  }
  return changes
}

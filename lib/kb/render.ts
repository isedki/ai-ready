import { mkdirSync, writeFileSync } from 'node:fs'
import { join }                    from 'node:path'
import type { DB }                 from './db'
import { buildCard, isRequestStep, type ActorScore, type Card } from './raci'

const who = (a: ActorScore | undefined) => a ? `${a.name || a.actor}${a.team ? ` (${a.team})` : ''}` : '—'
const whoList = (list: ActorScore[], n = 2) => list.length ? list.slice(0, n).map(a => `${who(a)} ×${a.count}`).join(', ') : '—'
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')

function cardMarkdown(c: Card, changes: { as_of: string; detail: string }[]): string {
  const lines: string[] = []
  const conf = { low: 'Low', medium: 'Medium', high: 'High' }[c.confidence]
  lines.push(`# ${c.title}`, '')
  lines.push(`**Confidence:** ${conf} (${c.thread_count} thread${c.thread_count === 1 ? '' : 's'}) · **First seen:** ${c.first_seen?.slice(0, 10) ?? '?'} · **Last seen:** ${c.last_seen?.slice(0, 10) ?? '?'}${c.stale ? ' · ⚠ not seen for over a year, may be outdated' : ''}`)
  if (c.systems.length || c.environments.length) {
    lines.push('', `**Systems:** ${c.systems.map(f => f.text).join(', ') || '—'} · **Environments:** ${c.environments.map(f => f.text).join(', ') || '—'}`)
  }
  if (c.lead_time_days_median != null) lines.push('', `**Typical lead time:** ~${c.lead_time_days_median} days (median of observed threads)`)
  if (c.summary) lines.push('', '## How to', '', c.summary)
  lines.push('', '## Who asks', '', whoList(c.requesters, 5))
  lines.push('', '## Steps and RACI', '', '*×N = number of threads where this person played this role; ordering favours recent threads.*', '', '| # | Step | R | A | C | I |', '|---|---|---|---|---|---|')
  c.steps.forEach((s, i) => {
    lines.push(`| ${i + 1} | ${cell(s.label)}${s.occasional ? ' *(sometimes)*' : ''} | ${cell(whoList(s.raci.R))} | ${cell(whoList(s.raci.A))} | ${cell(whoList(s.raci.C))} | ${cell(whoList(s.raci.I, 3))} |`)
  })
  const section = (title: string, facts: Card['artifacts']) => {
    if (!facts.length) return
    lines.push('', `## ${title}`, '', ...facts.map(f => `- ${f.text}${f.count > 1 ? ` *(×${f.count})*` : ''}`))
  }
  section('Required inputs / prerequisites', c.prerequisites)
  section('Forms, tools, ticket categories', c.artifacts)
  section('Gotchas', c.gotchas)
  section('Variants', c.variants)
  if (changes.length) lines.push('', '## History', '', ...changes.map(ch => `- ${ch.as_of.slice(0, 10)}: ${ch.detail}`))
  lines.push('', '## Sources', '', ...c.sources.map(s => `- ${s.date?.slice(0, 10) ?? '?'} · ${s.subject} \`${s.thread_id}\`${s.relation === 'variant' ? ' *(variant)*' : ''}`))
  return lines.join('\n') + '\n'
}

/** Write the knowledge base as Markdown (one card per procedure, RACI grid, directory) plus kb.json for the UI. */
export function renderAll(db: DB, outDir: string) {
  const now = new Date().toISOString()
  const ids = (db.prepare('SELECT id FROM procedures WHERE merged_into IS NULL ORDER BY thread_count DESC, title').all() as { id: string }[]).map(r => r.id)
  const cards = ids.map(id => buildCard(db, id, now))
  mkdirSync(join(outDir, 'procedures'), { recursive: true })

  for (const c of cards) {
    const changes = db.prepare('SELECT as_of, detail FROM changes WHERE procedure_id = ? ORDER BY as_of').all(c.id) as { as_of: string; detail: string }[]
    writeFileSync(join(outDir, 'procedures', `${c.id}.md`), cardMarkdown(c, changes))
  }

  // Index
  const index = ['# Procedures', '', '| Procedure | Confidence | Threads | Last seen | Responsible (main step) | Accountable |', '|---|---|---|---|---|---|']
  for (const c of cards) {
    const r = c.steps.filter(s => !isRequestStep(s, c)).flatMap(s => s.raci.R).sort((a, b) => b.score - a.score)[0]
    const a = c.steps.flatMap(s => s.raci.A).sort((x, y) => y.score - x.score)[0]
    index.push(`| [${cell(c.title)}](procedures/${c.id}.md) | ${c.confidence}${c.stale ? ' ⚠' : ''} | ${c.thread_count} | ${c.last_seen?.slice(0, 10) ?? '?'} | ${cell(who(r))} | ${cell(who(a))} |`)
  }
  writeFileSync(join(outDir, 'README.md'), index.join('\n') + '\n')

  // RACI grid: procedures × actors (team if known), strongest letter per cell.
  const colScore = new Map<string, number>()
  const grid = new Map<string, Map<string, string>>()
  const ORDER = ['A', 'R', 'C', 'I']
  for (const c of cards) {
    const row = new Map<string, string>()
    for (const s of c.steps) for (const L of ORDER) for (const a of s.raci[L as 'R']) {
      if (L === 'R' && isRequestStep(s, c)) continue
      const col = a.team ?? (a.name || a.actor)
      colScore.set(col, (colScore.get(col) ?? 0) + a.score)
      const cur = row.get(col) ?? ''
      if (!cur.includes(L)) row.set(col, [...cur, L].sort((x, y) => ORDER.indexOf(x) - ORDER.indexOf(y)).join(''))
    }
    grid.set(c.id, row)
  }
  const cols = [...colScore.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([c]) => c)
  const raci = ['# RACI matrix', '', `| Procedure | ${cols.map(cell).join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`]
  for (const c of cards) raci.push(`| ${cell(c.title)} | ${cols.map(col => grid.get(c.id)!.get(col) ?? '').join(' | ')} |`)
  writeFileSync(join(outDir, 'RACI.md'), raci.join('\n') + '\n')

  // Directory: who does what.
  const people = new Map<string, { label: string; roles: string[] }>()
  for (const c of cards) for (const s of c.steps) for (const L of ['R', 'A'] as const) for (const a of s.raci[L].slice(0, 2)) {
    if (L === 'R' && isRequestStep(s, c)) continue
    const p = people.get(a.actor) ?? { label: who(a), roles: [] }
    p.roles.push(`${L} · ${c.title} → ${s.label}`)
    people.set(a.actor, p)
  }
  const dir = ['# Who does what', '']
  for (const [addr, p] of [...people.entries()].sort((a, b) => b[1].roles.length - a[1].roles.length)) {
    dir.push(`## ${p.label} <${addr}>`, '', ...p.roles.map(r => `- ${r}`), '')
  }
  writeFileSync(join(outDir, 'directory.md'), dir.join('\n'))

  const changes = db.prepare('SELECT procedure_id, as_of, kind, detail FROM changes WHERE reviewed = 0 ORDER BY as_of DESC').all()
  writeFileSync(join(outDir, 'kb.json'), JSON.stringify({ generated_at: now, procedures: cards, changes }, null, 2))
  return { procedures: cards.length }
}

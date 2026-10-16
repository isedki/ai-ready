import type { DB }       from './db'
import { tx }            from './db'
import { SUMMARY_SYSTEM } from './prompts'
import { ProcedureSummary } from './schemas'
import { MODELS, type Job, type Runner } from './llm'
import { buildCard, type Card } from './raci'

/** Regenerate the "how to" text only for procedures whose evidence changed since the last summary. */
export async function summarizeChanged(db: DB, runner: Runner, log: (s: string) => void) {
  const ids = (db.prepare('SELECT id FROM procedures WHERE merged_into IS NULL AND needs_summary = 1').all() as { id: string }[]).map(r => r.id)
  const now = new Date().toISOString()
  const jobs: Job<{ summary: string }>[] = ids.map((id, i) => {
    // The old summary and source list add tokens without helping the rewrite.
    const card: Partial<Card> = buildCard(db, id, now)
    delete card.summary
    delete card.sources
    return {
      id: `s_${i}`, system: SUMMARY_SYSTEM, user: JSON.stringify(card, null, 1),
      schema: ProcedureSummary, model: MODELS.summary, effort: 'low', maxTokens: 4000,
    }
  })
  log(`summarizing ${jobs.length} procedures`)
  const results = await runner.run('summary', `summary:${now.slice(0, 10)}`, jobs)
  let ok = 0
  tx(db, () => {
    ids.forEach((id, i) => {
      const r = results.get(jobs[i].id)
      if (r?.ok) {
        db.prepare('UPDATE procedures SET summary = ?, needs_summary = 0 WHERE id = ?').run(r.value.summary, id)
        ok++
      }
    })
  })
  return { summarized: ok, failed: ids.length - ok }
}

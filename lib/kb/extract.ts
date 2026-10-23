import type { DB }                 from './db'
import { tx }                      from './db'
import { extractSystem }           from './prompts'
import { threadExtractionSchema, type ThreadExtraction } from './schemas'
import { MODELS, type Job, type Runner } from './llm'
import type { Taxonomy }           from './taxonomy'

type ThreadRow = { id: string; text: string; token_estimate: number }

export function selectPending(db: DB, opts: { limit?: number; sample?: number } = {}): ThreadRow[] {
  if (opts.sample) {
    return db.prepare("SELECT id, text, token_estimate FROM threads WHERE status = 'pending' ORDER BY random() LIMIT ?").all(opts.sample) as ThreadRow[]
  }
  return db.prepare("SELECT id, text, token_estimate FROM threads WHERE status = 'pending' ORDER BY first_date LIMIT ?")
    .all(opts.limit ?? -1) as ThreadRow[]
}

/** Pass 1: read each pending thread once and store which requests it shows and who handled them. */
export async function extractThreads(db: DB, runner: Runner, threads: ThreadRow[], taxonomy: Taxonomy, model = MODELS.extract) {
  const system = extractSystem(taxonomy)
  const schema = threadExtractionSchema(Object.keys(taxonomy.domains))
  const jobs: Job<ThreadExtraction>[] = threads.map(t => ({
    id:        t.id,
    system,
    user:      `<thread id="${t.id}">\n${t.text}\n</thread>`,
    schema,
    model,
    effort:    'low',
    maxTokens: 8000,
  }))
  const results = await runner.run('extract', 'extract', jobs)
  const save   = db.prepare('INSERT OR REPLACE INTO extractions(thread_id, json, model, created_at) VALUES (?, ?, ?, ?)')
  const status = db.prepare('UPDATE threads SET status = ? WHERE id = ?')
  const counts = { relevant: 0, irrelevant: 0, failed: 0, items: 0, notRun: 0 }
  const errors: string[] = []

  tx(db, () => {
    for (const t of threads) {
      const r = results.get(t.id)
      // Not run (the runner stopped at a usage limit): stays pending for the next run.
      if (!r) { counts.notRun++; continue }
      if (!r.ok) {
        counts.failed++
        errors.push(`${t.id}: ${r.error}`)
        status.run('failed', t.id)
        continue
      }
      const relevant = r.value.relevant && r.value.items.length > 0
      save.run(t.id, JSON.stringify(r.value), model, new Date().toISOString())
      status.run(relevant ? 'extracted' : 'irrelevant', t.id)
      if (relevant) { counts.relevant++; counts.items += r.value.items.length } else counts.irrelevant++
    }
  })
  return { ...counts, errors }
}

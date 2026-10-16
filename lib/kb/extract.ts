import type { DB }                 from './db'
import { tx }                      from './db'
import { EXTRACT_SYSTEM }          from './prompts'
import { ThreadExtraction }        from './schemas'
import { MODELS, type Job, type Runner } from './llm'

type ThreadRow = { id: string; text: string; token_estimate: number }

export function selectPending(db: DB, opts: { limit?: number; sample?: number } = {}): ThreadRow[] {
  if (opts.sample) {
    return db.prepare("SELECT id, text, token_estimate FROM threads WHERE status = 'pending' ORDER BY random() LIMIT ?").all(opts.sample) as ThreadRow[]
  }
  return db.prepare("SELECT id, text, token_estimate FROM threads WHERE status = 'pending' ORDER BY first_date LIMIT ?")
    .all(opts.limit ?? -1) as ThreadRow[]
}

export function extractionJob(t: ThreadRow, model = MODELS.extract): Job<ThreadExtraction> {
  return {
    id:        t.id,
    system:    EXTRACT_SYSTEM,
    user:      `<thread id="${t.id}">\n${t.text}\n</thread>`,
    schema:    ThreadExtraction,
    model,
    effort:    'low',
    maxTokens: 8000,
  }
}

/** Pass 1: read each pending thread once and store what it shows. */
export async function extractThreads(db: DB, runner: Runner, threads: ThreadRow[], model = MODELS.extract) {
  const results = await runner.run('extract', 'extract', threads.map(t => extractionJob(t, model)))
  const save   = db.prepare('INSERT OR REPLACE INTO extractions(thread_id, json, model, created_at) VALUES (?, ?, ?, ?)')
  const status = db.prepare('UPDATE threads SET status = ? WHERE id = ?')
  const counts = { relevant: 0, irrelevant: 0, failed: 0, processes: 0 }
  const errors: string[] = []

  tx(db, () => {
    for (const t of threads) {
      const r = results.get(t.id)
      if (!r || !r.ok) {
        counts.failed++
        errors.push(`${t.id}: ${r ? r.error : 'missing result'}`)
        status.run('failed', t.id)
        continue
      }
      const relevant = r.value.relevant && r.value.processes.length > 0
      save.run(t.id, JSON.stringify(r.value), model, new Date().toISOString())
      status.run(relevant ? 'extracted' : 'irrelevant', t.id)
      if (relevant) { counts.relevant++; counts.processes += r.value.processes.length } else counts.irrelevant++
    }
  })
  return { ...counts, errors }
}

import type { Store } from './store'

/**
 * Optional dense retrieval. Off by default: BM25 plus the agent's own query rewriting already
 * finds sigles, IPs, A-0xx and names well. Turn it on for paraphrased questions
 * ("qui s'occupe des droits d'accès ?" vs "habilitations AD"):
 *
 *   npm install @huggingface/transformers
 *   COPILOTE_EMBEDDINGS=local npm run copilote -- embed
 *
 * The model runs on the server itself (no text leaves the machine). It is downloaded once
 * from Hugging Face into COPILOTE_MODELS_DIR, or baked into the Docker image.
 */
export const EMBED_MODEL = process.env.COPILOTE_EMBED_MODEL ?? 'Xenova/multilingual-e5-small'

export function embeddingsEnabled(): boolean {
  return process.env.COPILOTE_EMBEDDINGS === 'local'
}

type Extractor = (texts: string[], opts: { pooling: 'mean'; normalize: boolean }) => Promise<{ data: Float32Array; dims: number[] }>
let extractor: Promise<Extractor> | null = null

async function getExtractor(): Promise<Extractor> {
  if (!extractor) {
    extractor = (async () => {
      // A variable specifier keeps the bundler from requiring the package when embeddings are off.
      const pkg = '@huggingface/transformers'
      const tf = await import(/* webpackIgnore: true */ pkg) as {
        env: { cacheDir: string; allowRemoteModels: boolean }
        pipeline: (task: string, model: string, opts?: object) => Promise<Extractor>
      }
      if (process.env.COPILOTE_MODELS_DIR) tf.env.cacheDir = process.env.COPILOTE_MODELS_DIR
      if (process.env.COPILOTE_OFFLINE === '1') tf.env.allowRemoteModels = false
      return tf.pipeline('feature-extraction', EMBED_MODEL, { dtype: 'q8' })
    })()
  }
  return extractor
}

/** e5 models expect "query: " / "passage: " prefixes. */
export async function embed(texts: string[], as: 'query' | 'passage'): Promise<Float32Array[]> {
  const ex = await getExtractor()
  const out = await ex(texts.map(t => `${as}: ${t.slice(0, 2000)}`), { pooling: 'mean', normalize: true })
  const dim = out.dims.at(-1)!
  return texts.map((_, i) => out.data.slice(i * dim, (i + 1) * dim))
}

/** Embed every passage that has no vector for the current model yet. */
export async function embedMissing(db: Store, log?: (s: string) => void): Promise<number> {
  const rows = db.prepare(`
    SELECT c.id, s.title, c.heading, c.text FROM chunks c JOIN sources s ON s.id = c.source_id
    WHERE NOT EXISTS (SELECT 1 FROM embeddings e WHERE e.chunk_id = c.id AND e.model = ?)
  `).all(EMBED_MODEL) as { id: number; title: string; heading: string | null; text: string }[]
  const ins = db.prepare('INSERT OR REPLACE INTO embeddings (chunk_id, model, vec) VALUES (?, ?, ?)')
  const BATCH = 32
  for (let i = 0; i < rows.length; i += BATCH) {
    const part = rows.slice(i, i + BATCH)
    const vecs = await embed(part.map(r => `${r.title}${r.heading ? ` › ${r.heading}` : ''}\n${r.text}`), 'passage')
    db.exec('BEGIN')
    part.forEach((r, j) => ins.run(r.id, EMBED_MODEL, new Uint8Array(vecs[j].buffer)))
    db.exec('COMMIT')
    log?.(`${Math.min(i + BATCH, rows.length)}/${rows.length}`)
  }
  return rows.length
}

/** In-memory matrix of all vectors, reloaded when the count changes. Brute force is fine below ~200k passages. */
let matrix: { model: string; count: number; ids: number[]; vecs: Float32Array[] } | null = null

export async function vectorSearch(db: Store, query: string, k: number): Promise<{ id: number; score: number }[]> {
  const count = Number((db.prepare('SELECT COUNT(*) n FROM embeddings WHERE model = ?').get(EMBED_MODEL) as { n: number }).n)
  if (!count) return []
  if (!matrix || matrix.model !== EMBED_MODEL || matrix.count !== count) {
    const rows = db.prepare('SELECT chunk_id, vec FROM embeddings WHERE model = ?').all(EMBED_MODEL) as { chunk_id: number; vec: Uint8Array }[]
    matrix = {
      model: EMBED_MODEL, count,
      ids:  rows.map(r => r.chunk_id),
      vecs: rows.map(r => new Float32Array(r.vec.buffer.slice(r.vec.byteOffset, r.vec.byteOffset + r.vec.byteLength))),
    }
  }
  const [q] = await embed([query], 'query')
  const scored = matrix.vecs.map((v, i) => {
    let s = 0
    for (let d = 0; d < v.length; d++) s += v[d] * q[d]
    return { id: matrix!.ids[i], score: s }
  })
  return scored.sort((a, b) => b.score - a.score).slice(0, k)
}

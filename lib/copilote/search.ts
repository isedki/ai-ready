import { embeddingsEnabled, vectorSearch } from './embed'
import type { Store }                       from './store'

export type Hit = {
  chunkId:  number
  sourceId: number
  kind:     string
  title:    string
  version:  string | null
  date:     string | null
  author:   string | null
  locator:  string | null
  heading:  string | null
  text:     string
  score:    number
}

export type SearchOptions = { k?: number; kind?: string; since?: string }

const STOP = new Set(`le la les l un une des de du d et ou à a au aux en dans pour par sur avec sans est sont été être
que qui quoi quel quelle quels quelles quand comment combien où ce cet cette ces il elle on nous vous ils elles
pas plus ne n se s sa son ses leur leurs y c qu the of to and is are was what who which how when where for on in
with`.split(/\s+/))

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Question → FTS5 query. Terms are OR-ed so a passage matching only the rare words still
 * ranks (BM25 does the weighting). A term with inner punctuation — an IP, A-038, MGEN-3918,
 * EB25_SOI — becomes a phrase over its parts, which matches it exactly.
 */
export function ftsQuery(q: string): string | null {
  const terms = new Set<string>()
  for (const raw of fold(q).match(/[a-z0-9][a-z0-9._\-/]*[a-z0-9]|[a-z0-9]/g) ?? []) {
    const parts = raw.split(/[._\-/]+/).filter(Boolean)
    if (parts.length > 1) terms.add(`"${parts.join(' ')}"`)
    else if (!STOP.has(raw) && (raw.length > 1 || /\d/.test(raw))) terms.add(raw.length >= 4 && !/\d/.test(raw) ? `${raw}*` : raw)
  }
  return terms.size ? [...terms].join(' OR ') : null
}

const SELECT = `
  SELECT c.id chunkId, s.id sourceId, s.kind, s.title, s.version, s.date, s.author, c.locator, c.heading, c.text
  FROM chunks c JOIN sources s ON s.id = c.source_id`

function filters(opts: SearchOptions): { sql: string; args: string[] } {
  const sql: string[] = []
  const args: string[] = []
  if (opts.kind) { sql.push('s.kind = ?'); args.push(opts.kind) }
  if (opts.since) { sql.push('s.date >= ?'); args.push(opts.since) }
  return { sql: sql.length ? ' AND ' + sql.join(' AND ') : '', args }
}

export function keywordSearch(db: Store, q: string, opts: SearchOptions = {}): Hit[] {
  const match = ftsQuery(q)
  if (!match) return []
  const f = filters(opts)
  // bm25 weights: title 6, heading 2, text 1 (lower = better in SQLite, hence the minus).
  return db.prepare(`
    SELECT c.id chunkId, s.id sourceId, s.kind, s.title, s.version, s.date, s.author, c.locator, c.heading, c.text,
           -bm25(chunks_fts, 6.0, 2.0, 1.0) score
    FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid JOIN sources s ON s.id = c.source_id
    WHERE chunks_fts MATCH ?${f.sql} ORDER BY score DESC LIMIT ?`)
    .all(match, ...f.args, opts.k ?? 8) as Hit[]
}

/**
 * Hybrid search: BM25 and (when enabled) dense vectors, merged by reciprocal rank fusion.
 * RRF needs no score calibration between the two lists, which is why it is the usual choice.
 */
export async function search(db: Store, q: string, opts: SearchOptions = {}): Promise<Hit[]> {
  const k = opts.k ?? 8
  const kw = keywordSearch(db, q, { ...opts, k: k * 3 })
  if (!embeddingsEnabled()) return kw.slice(0, k)
  let vec: { id: number; score: number }[] = []
  try { vec = await vectorSearch(db, q, k * 3) } catch { return kw.slice(0, k) }
  const rrf = new Map<number, number>()
  kw.forEach((h, i) => rrf.set(h.chunkId, (rrf.get(h.chunkId) ?? 0) + 1 / (60 + i)))
  vec.forEach((v, i) => rrf.set(v.id, (rrf.get(v.id) ?? 0) + 1 / (60 + i)))
  const ids = [...rrf.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0])
  const byId = new Map(kw.map(h => [h.chunkId, h]))
  const f = filters(opts)
  const get = db.prepare(`${SELECT} WHERE c.id = ?${f.sql}`)
  const out: Hit[] = []
  for (const id of ids) {
    const h = byId.get(id) ?? (get.get(id, ...f.args) as Hit | undefined)
    if (h) out.push({ ...h, score: rrf.get(id)! })
    if (out.length >= k) break
  }
  return out
}

/** A passage with its neighbours in the same source, to read around a hit. */
export function readAround(db: Store, chunkId: number, span = 1): Hit[] {
  const c = db.prepare('SELECT source_id, ord FROM chunks WHERE id = ?').get(chunkId) as { source_id: number; ord: number } | undefined
  if (!c) return []
  return db.prepare(`${SELECT} WHERE c.source_id = ? AND c.ord BETWEEN ? AND ? ORDER BY c.ord`)
    .all(c.source_id, c.ord - span, c.ord + span).map(h => ({ ...(h as Hit), score: 0 }))
}

export function listSources(db: Store, opts: { kind?: string; q?: string; limit?: number } = {}) {
  const where: string[] = []
  const args: (string | number)[] = []
  if (opts.kind) { where.push('kind = ?'); args.push(opts.kind) }
  if (opts.q) { where.push('title LIKE ?'); args.push(`%${opts.q}%`) }
  return db.prepare(`SELECT id, kind, title, version, date, author, (SELECT COUNT(*) FROM chunks WHERE source_id = sources.id) passages
    FROM sources ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY date DESC LIMIT ?`).all(...args, opts.limit ?? 50)
}

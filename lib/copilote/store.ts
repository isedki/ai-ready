import { DatabaseSync } from 'node:sqlite'
import { mkdirSync }    from 'node:fs'
import { dirname }      from 'node:path'

/**
 * Copilote store: one SQLite file (default data/copilote.sqlite, git-ignored).
 *
 *   sources     one row per ingested document, email thread or imported pack
 *   chunks      the passages the assistant reads and cites
 *   chunks_fts  FTS5 index over chunks (BM25, accents folded)
 *   embeddings  optional dense vectors, one per chunk and model
 *
 * A source is identified by its `uri` (file path, kb thread id, pack id). Re-ingesting
 * a uri with the same sha256 is a no-op; a changed file replaces its chunks.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS sources (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uri         TEXT UNIQUE NOT NULL,
  kind        TEXT NOT NULL,          -- doc | email | suivi | annuaire | formation | note
  title       TEXT NOT NULL,
  version     TEXT,
  date        TEXT,                   -- YYYY-MM-DD of the content, not of ingestion
  author      TEXT,
  sha256      TEXT,
  sensitivity TEXT DEFAULT 'interne', -- interne | restreint
  ingested_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chunks (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  ord       INTEGER NOT NULL,
  locator   TEXT,                     -- "p. 14", "onglet Abaques", "§ 2.2", message date
  heading   TEXT,                     -- breadcrumb inside the source
  text      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chunks_source ON chunks(source_id, ord);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  title, heading, text,
  content='', contentless_delete=1,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS embeddings (
  chunk_id INTEGER NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  model    TEXT NOT NULL,
  vec      BLOB NOT NULL,             -- Float32Array, L2-normalised
  PRIMARY KEY (chunk_id, model)
);

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
`

export type Store = DatabaseSync

export type SourceInput = {
  uri:          string
  kind:         string
  title:        string
  version?:     string | null
  date?:        string | null
  author?:      string | null
  sha256?:      string | null
  sensitivity?: string
}

export type ChunkInput = { locator?: string | null; heading?: string | null; text: string }

let opened: { path: string; db: DatabaseSync } | null = null

export function openStore(path = process.env.COPILOTE_DB ?? 'data/copilote.sqlite'): Store {
  if (opened?.path === path) return opened.db
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
  db.exec(SCHEMA)
  opened = { path, db }
  return db
}

export function tx<T>(db: Store, fn: () => T): T {
  db.exec('BEGIN')
  try {
    const out = fn()
    db.exec('COMMIT')
    return out
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export function findSource(db: Store, uri: string): { id: number; sha256: string | null } | undefined {
  return db.prepare('SELECT id, sha256 FROM sources WHERE uri = ?').get(uri) as { id: number; sha256: string | null } | undefined
}

/** Delete a source, its chunks, their FTS rows and embeddings. */
export function removeSource(db: Store, id: number): void {
  const ids = db.prepare('SELECT id FROM chunks WHERE source_id = ?').all(id) as { id: number }[]
  const delFts = db.prepare('DELETE FROM chunks_fts WHERE rowid = ?')
  for (const c of ids) delFts.run(c.id)
  db.prepare('DELETE FROM embeddings WHERE chunk_id IN (SELECT id FROM chunks WHERE source_id = ?)').run(id)
  db.prepare('DELETE FROM chunks WHERE source_id = ?').run(id)
  db.prepare('DELETE FROM sources WHERE id = ?').run(id)
}

/**
 * Insert or replace a source with its chunks. Returns 'unchanged' when the same uri was
 * already ingested with the same hash.
 */
export function upsertSource(db: Store, src: SourceInput, chunks: ChunkInput[]): 'added' | 'replaced' | 'unchanged' {
  const existing = findSource(db, src.uri)
  if (existing && src.sha256 && existing.sha256 === src.sha256) return 'unchanged'
  return tx(db, () => {
    if (existing) removeSource(db, existing.id)
    const res = db.prepare(`
      INSERT INTO sources (uri, kind, title, version, date, author, sha256, sensitivity, ingested_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(src.uri, src.kind, src.title, src.version ?? null, src.date ?? null, src.author ?? null,
      src.sha256 ?? null, src.sensitivity ?? 'interne', new Date().toISOString())
    const sourceId = Number(res.lastInsertRowid)
    const insChunk = db.prepare('INSERT INTO chunks (source_id, ord, locator, heading, text) VALUES (?, ?, ?, ?, ?)')
    const insFts   = db.prepare('INSERT INTO chunks_fts (rowid, title, heading, text) VALUES (?, ?, ?, ?)')
    chunks.forEach((c, i) => {
      const r = insChunk.run(sourceId, i, c.locator ?? null, c.heading ?? null, c.text)
      insFts.run(Number(r.lastInsertRowid), src.title, c.heading ?? '', c.text)
    })
    return existing ? 'replaced' : 'added'
  })
}

export function getMeta(db: Store, key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setMeta(db: Store, key: string, value: string): void {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}

export type Stats = { sources: number; chunks: number; embedded: number; byKind: Record<string, number>; lastIngest: string | null }

export function stats(db: Store): Stats {
  const one = (sql: string) => Number((db.prepare(sql).get() as { n: number }).n)
  const byKind: Record<string, number> = {}
  for (const r of db.prepare('SELECT kind, COUNT(*) n FROM sources GROUP BY kind').all() as { kind: string; n: number }[]) byKind[r.kind] = Number(r.n)
  const last = db.prepare('SELECT MAX(ingested_at) d FROM sources').get() as { d: string | null }
  return {
    sources:  one('SELECT COUNT(*) n FROM sources'),
    chunks:   one('SELECT COUNT(*) n FROM chunks'),
    embedded: one('SELECT COUNT(DISTINCT chunk_id) n FROM embeddings'),
    byKind,
    lastIngest: last.d,
  }
}

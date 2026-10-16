import { DatabaseSync } from 'node:sqlite'
import { mkdirSync }     from 'node:fs'
import { dirname }       from 'node:path'

/**
 * Knowledge-base store. Everything the pipeline knows lives in one SQLite file
 * (default data/kb.sqlite, git-ignored because it holds mailbox content).
 *
 * The LLM only ever writes `extractions` and `decisions`; procedures, steps,
 * evidence and the RACI are maintained by code from those rows.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS messages (
  id           TEXT PRIMARY KEY,
  thread_id    TEXT,
  folder       TEXT,
  subject      TEXT,
  norm_subject TEXT,
  from_addr    TEXT,
  from_name    TEXT,
  to_addrs     TEXT,      -- JSON [{addr,name}]
  cc_addrs     TEXT,      -- JSON [{addr,name}]
  date         TEXT,      -- ISO
  in_reply_to  TEXT,
  refs         TEXT,      -- JSON [message-id]
  body_raw     TEXT,
  body_clean   TEXT,
  is_noise     INTEGER DEFAULT 0,
  noise_reason TEXT
);
CREATE INDEX IF NOT EXISTS messages_thread ON messages(thread_id);

CREATE TABLE IF NOT EXISTS people (
  addr TEXT PRIMARY KEY,
  name TEXT,
  team TEXT
);

CREATE TABLE IF NOT EXISTS threads (
  id             TEXT PRIMARY KEY,
  subject        TEXT,
  participants   TEXT,     -- JSON [{addr,name}]
  first_date     TEXT,
  last_date      TEXT,
  message_count  INTEGER,
  text           TEXT,     -- cleaned, redacted, ready for the LLM
  token_estimate INTEGER,
  status         TEXT      -- pending | skipped | extracted | irrelevant | failed | folded
);

CREATE TABLE IF NOT EXISTS extractions (
  thread_id  TEXT PRIMARY KEY,
  json       TEXT,
  model      TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS procedures (
  id            TEXT PRIMARY KEY,
  title         TEXT,
  action        TEXT,
  object        TEXT,
  system        TEXT,
  environment   TEXT,
  summary       TEXT,
  first_seen    TEXT,
  last_seen     TEXT,
  thread_count  INTEGER DEFAULT 0,
  merged_into   TEXT,
  needs_summary INTEGER DEFAULT 1,
  created_at    TEXT
);

CREATE TABLE IF NOT EXISTS steps (
  id           TEXT PRIMARY KEY,
  procedure_id TEXT,
  ord          REAL,
  label        TEXT,
  seen_count   INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS steps_proc ON steps(procedure_id);

CREATE TABLE IF NOT EXISTS evidence (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  procedure_id TEXT,
  step_id      TEXT,
  thread_id    TEXT,
  actor        TEXT,     -- email address (lowercase)
  raci         TEXT,     -- R | A | C | I
  date         TEXT,
  quote        TEXT
);
CREATE INDEX IF NOT EXISTS evidence_proc ON evidence(procedure_id);

-- Free-text facts attached to a procedure (artifacts, prerequisites, gotchas, variants)
CREATE TABLE IF NOT EXISTS facts (
  procedure_id TEXT,
  kind         TEXT,
  text         TEXT,
  norm         TEXT,
  count        INTEGER DEFAULT 1,
  last_seen    TEXT,
  PRIMARY KEY (procedure_id, kind, norm)
);

CREATE TABLE IF NOT EXISTS procedure_threads (
  procedure_id TEXT,
  thread_id    TEXT,
  relation     TEXT,     -- same | variant | new
  date         TEXT,
  lead_time    REAL,
  outcome      TEXT,
  PRIMARY KEY (procedure_id, thread_id)
);

CREATE TABLE IF NOT EXISTS snapshots (
  procedure_id TEXT,
  as_of        TEXT,
  card         TEXT,
  PRIMARY KEY (procedure_id, as_of)
);

CREATE TABLE IF NOT EXISTS changes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  procedure_id TEXT,
  as_of        TEXT,
  kind         TEXT,
  detail       TEXT,
  reviewed     INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS batches (
  id         TEXT PRIMARY KEY,
  kind       TEXT,
  label      TEXT,
  status     TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS llm_calls (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT,
  model         TEXT,
  batch         INTEGER,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  cache_read    INTEGER,
  cache_write   INTEGER,
  created_at    TEXT
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`

export type DB = DatabaseSync

let instance: DatabaseSync | null = null

export function openDb(path = process.env.KB_DB ?? 'data/kb.sqlite'): DatabaseSync {
  if (instance) return instance
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;')
  db.exec(SCHEMA)
  instance = db
  return db
}

export function closeDb(): void {
  instance?.close()
  instance = null
}

export function tx<T>(db: DatabaseSync, fn: () => T): T {
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

export function getMeta(db: DatabaseSync, key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setMeta(db: DatabaseSync, key: string, value: string): void {
  db.prepare('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value)
}

import { DatabaseSync } from 'node:sqlite'
import { mkdirSync }     from 'node:fs'
import { dirname }       from 'node:path'

/**
 * Knowledge-base store. Everything the pipeline knows lives in one SQLite file
 * (default data/kb.sqlite, git-ignored because it holds mailbox content).
 *
 * The LLM writes `extractions` and decides which entry an item belongs to;
 * contacts, departments and facts are maintained by code from those rows.
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
  signature    TEXT,
  is_noise     INTEGER DEFAULT 0,
  noise_reason TEXT
);
CREATE INDEX IF NOT EXISTS messages_thread ON messages(thread_id);

CREATE TABLE IF NOT EXISTS people (
  addr TEXT PRIMARY KEY,
  name TEXT,
  team TEXT          -- set from teams.json; overrides the voted department
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

-- One directory entry = one kind of request ("Provision a new VM") and who handles it.
CREATE TABLE IF NOT EXISTS entries (
  id           TEXT PRIMARY KEY,
  title        TEXT,
  domain       TEXT,
  subdomain    TEXT,
  first_seen   TEXT,
  last_seen    TEXT,
  thread_count INTEGER DEFAULT 0,
  merged_into  TEXT,
  created_at   TEXT
);

-- Who handled / approved / dispatched the request in each thread. "Who to email" is a recency-weighted vote over these rows.
CREATE TABLE IF NOT EXISTS contacts (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id  TEXT,
  thread_id TEXT,
  actor     TEXT,
  role      TEXT,     -- handles | approves | dispatches | cc
  date      TEXT
);
CREATE INDEX IF NOT EXISTS contacts_entry ON contacts(entry_id);

-- Short notes attached to an entry: what to include, how to ask (channel), example subjects.
CREATE TABLE IF NOT EXISTS facts (
  entry_id  TEXT,
  kind      TEXT,     -- include | how | channel | subject
  text      TEXT,
  norm      TEXT,
  count     INTEGER DEFAULT 1,
  last_seen TEXT,
  PRIMARY KEY (entry_id, kind, norm)
);

CREATE TABLE IF NOT EXISTS entry_threads (
  entry_id  TEXT,
  thread_id TEXT,
  date      TEXT,
  PRIMARY KEY (entry_id, thread_id)
);

-- Department guesses for a person, voted from signatures and thread context.
CREATE TABLE IF NOT EXISTS departments (
  addr       TEXT,
  department TEXT,
  count      INTEGER DEFAULT 1,
  PRIMARY KEY (addr, department)
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

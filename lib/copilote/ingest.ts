import { createHash }                          from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, resolve }              from 'node:path'
import { DatabaseSync }                        from 'node:sqlite'
import { redactSecrets }                       from '../kb/clean'
import { chunkSections }                       from './chunk'
import { loadFile, SUPPORTED }                 from './loaders'
import { removeSource, upsertSource, type Store } from './store'

export type IngestReport = { added: number; replaced: number; unchanged: number; failed: { path: string; error: string }[]; chunks: number }

const empty = (): IngestReport => ({ added: 0, replaced: 0, unchanged: 0, failed: [], chunks: 0 })

function* files(path: string): Generator<string> {
  const st = statSync(path)
  if (st.isFile()) { yield path; return }
  for (const name of readdirSync(path).sort()) {
    if (name.startsWith('.') || name.startsWith('~$')) continue   // hidden files, Office lock files
    const p = join(path, name)
    if (statSync(p).isDirectory()) yield* files(p)
    else if (SUPPORTED.includes(extname(name).toLowerCase())) yield p
  }
}

/**
 * Ingest files or folders (recursively). The uri is the absolute path, so a file that
 * is edited and dropped again replaces its old passages; an unchanged file is skipped.
 */
export async function ingestPaths(db: Store, paths: string[], opts: { kind?: string; sensitivity?: string; log?: (s: string) => void } = {}): Promise<IngestReport> {
  const rep = empty()
  for (const root of paths) {
    for (const file of files(root)) {
      if (extname(file).toLowerCase() === '.json') {
        const r = importPack(db, file)
        rep.added += r.added; rep.replaced += r.replaced; rep.unchanged += r.unchanged; rep.chunks += r.chunks
        continue
      }
      try {
        const doc = await loadFile(file, opts.kind)
        const chunks = chunkSections(doc.sections)
        if (!chunks.length) { rep.failed.push({ path: file, error: 'aucun texte lisible (document scanné ?)' }); continue }
        const res = upsertSource(db, {
          uri: resolve(file), kind: doc.kind, title: doc.title, version: doc.version, date: doc.date,
          author: doc.author, sha256: doc.sha256, sensitivity: opts.sensitivity,
        }, chunks)
        rep[res]++
        if (res !== 'unchanged') rep.chunks += chunks.length
        opts.log?.(`${res === 'unchanged' ? '=' : res === 'added' ? '+' : '~'} ${doc.title}${res === 'unchanged' ? '' : ` (${chunks.length} passages)`}`)
      } catch (err) {
        rep.failed.push({ path: file, error: (err as Error).message })
        opts.log?.(`! ${file}: ${(err as Error).message}`)
      }
    }
  }
  return rep
}

/**
 * Import a JSON pack: {chunks: [{kind, title, source, date, text}]}. This is the format the
 * Claude artifact « Copilote Phénix » keeps in its database, so its base can be moved here.
 */
export function importPack(db: Store, file: string): IngestReport {
  const rep = empty()
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { chunks?: { id?: string; kind?: string; title?: string; source?: string; date?: string; text?: string }[] }
  const list = Array.isArray(raw.chunks) ? raw.chunks : []
  for (const c of list) {
    if (!c.text?.trim()) continue
    const text = redactSecrets(c.text)
    const uri = `pack:${c.id ?? createHash('sha1').update(`${c.title}|${text}`).digest('hex').slice(0, 16)}`
    const res = upsertSource(db, {
      uri, kind: c.kind ?? 'note', title: c.title ?? 'Sans titre', date: c.date || null, author: c.source ?? null,
      sha256: createHash('sha256').update(text).digest('hex'),
    }, [{ text, locator: c.source ?? null }])
    rep[res]++
    if (res !== 'unchanged') rep.chunks++
  }
  return rep
}

/**
 * Import the email threads already cleaned and redacted by the email KB pipeline
 * (npm run kb -- ingest dump.pst → data/kb.sqlite). One source per thread.
 */
export function importEmailKb(db: Store, kbPath = process.env.KB_DB ?? 'data/kb.sqlite', log?: (s: string) => void): IngestReport {
  const rep = empty()
  if (!existsSync(kbPath)) throw new Error(`Base emails introuvable : ${kbPath}. Lance d'abord npm run kb -- ingest <dump.pst>.`)
  const kb = new DatabaseSync(kbPath, { readOnly: true })
  const threads = kb.prepare(`
    SELECT id, subject, participants, first_date, last_date, message_count, text
    FROM threads WHERE status NOT IN ('skipped') AND text IS NOT NULL AND length(text) > 40
  `).all() as { id: string; subject: string; participants: string; first_date: string; last_date: string; message_count: number; text: string }[]
  for (const t of threads) {
    const people = (JSON.parse(t.participants || '[]') as { addr: string; name: string }[]).map(p => p.name || p.addr).slice(0, 8).join(', ')
    const chunks = chunkSections([{ text: t.text, heading: t.subject, locator: `${t.first_date?.slice(0, 10)} → ${t.last_date?.slice(0, 10)}` }])
    const res = upsertSource(db, {
      uri: `kb-thread:${t.id}`, kind: 'email', title: t.subject || '(sans objet)', date: t.last_date?.slice(0, 10) ?? null,
      author: people, sha256: createHash('sha256').update(t.text).digest('hex'),
    }, chunks)
    rep[res]++
    if (res !== 'unchanged') rep.chunks += chunks.length
  }
  kb.close()
  log?.(`${threads.length} fils lus dans ${kbPath}`)
  return rep
}

/** Remove sources whose file no longer exists (a document deleted from the watched folder). */
export function pruneMissing(db: Store): number {
  const rows = db.prepare("SELECT id, uri FROM sources WHERE uri NOT LIKE 'pack:%' AND uri NOT LIKE 'kb-thread:%'").all() as { id: number; uri: string }[]
  let n = 0
  for (const r of rows) if (!existsSync(r.uri)) { removeSource(db, r.id); n++ }
  return n
}

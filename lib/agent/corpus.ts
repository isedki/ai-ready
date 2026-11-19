/**
 * Turns an export of the Claude artefacts (ArtifactData list with out_dir) into JSON
 * packs the Copilote ingests. Three shapes are handled:
 *   kb/<doc>.json         {data:{chunks:[…]}}            → the chunks as they are
 *   docs/<doc>.json       {data:{name, at, notes:{…}}}   → one passage per document
 *   directory/<doc>.json  {data:{entries:[…]}}           → one passage per directory entry
 * A document written by ArtifactData may or may not be wrapped in {data}; both work.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join }                                                 from 'node:path'

export type Chunk = { id: string; kind: string; title: string; source: string; date: string; text: string }

const unwrap = (raw: unknown): Record<string, unknown> => {
  const o = (raw ?? {}) as Record<string, unknown>
  return (o.data && typeof o.data === 'object' ? o.data : o) as Record<string, unknown>
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

export function kbChunks(raw: unknown): Chunk[] {
  const d = unwrap(raw)
  const list = Array.isArray(d.chunks) ? (d.chunks as Record<string, unknown>[]) : []
  return list
    .filter(c => str(c.text).trim())
    .map((c, i) => ({
      id: str(c.id) || `${str(d.source) || 'kb'}-${i}`,
      kind: str(c.kind) || 'note',
      title: str(c.title) || 'Sans titre',
      source: str(c.source) || str(d.source),
      date: str(c.date).slice(0, 10),
      text: str(c.text),
    }))
}

export function docChunks(id: string, raw: unknown): Chunk[] {
  const d = unwrap(raw)
  const notes = d.notes ?? d
  const text = typeof notes === 'string' ? notes : JSON.stringify(notes, null, 1)
  if (!text.trim()) return []
  return [{ id: `docs-${id}`, kind: 'doc', title: str(d.name) || id, source: 'Qui contacter · documents', date: str(d.at).slice(0, 10), text }]
}

export function directoryChunks(id: string, raw: unknown): Chunk[] {
  const d = unwrap(raw)
  const entries = Array.isArray(d.entries) ? (d.entries as Record<string, unknown>[]) : []
  return entries.map((e, i) => ({
    id: `dir-${id}-${i}`,
    kind: 'email',
    title: `Qui contacter · ${str(e.domain)} · ${str(e.subdomain) || str(e.title) || str(e.example_subject) || 'entrée'}`,
    source: `annuaire tiré des emails (${str(d.imported_at).slice(0, 10) || 'date inconnue'})`,
    date: (str(e.last_seen) || str(e.first_seen)).slice(0, 10),
    text: JSON.stringify(e).slice(0, 3000),
  }))
}

const jsonFiles = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')) : [])

/** Reads <raw>/{kb,docs,directory} and writes <out>/<collection>-<doc>.json packs. */
export function buildPacks(raw: string, out: string): { files: number; chunks: number } {
  mkdirSync(out, { recursive: true })
  let files = 0, chunks = 0
  const write = (name: string, list: Chunk[]) => {
    if (!list.length) return
    writeFileSync(join(out, name), JSON.stringify({ chunks: list }))
    files++; chunks += list.length
  }
  const read = (f: string) => JSON.parse(readFileSync(f, 'utf8'))
  for (const f of jsonFiles(join(raw, 'kb')))        write(`kb-${f}`, kbChunks(read(join(raw, 'kb', f))))
  for (const f of jsonFiles(join(raw, 'docs')))      write(`docs-${f}`, docChunks(basename(f, '.json'), read(join(raw, 'docs', f))))
  for (const f of jsonFiles(join(raw, 'directory'))) write(`directory-${f}`, directoryChunks(basename(f, '.json'), read(join(raw, 'directory', f))))
  return { files, chunks }
}

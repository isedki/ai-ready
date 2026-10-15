import fs   from 'node:fs/promises'
import path from 'node:path'
import type { LexiconEntry, TrackedAction, RefinedSegment, MeetingContext, MeetingDigest } from './schema'
import { formatTime } from './prompts'

/**
 * The agent's long-term memory lives in a plain folder on your machine, so you can
 * read, edit and back it up yourself, and Claude can search it with its file tools:
 *
 *   workspace/
 *     CLAUDE.md            how the agent should use this folder
 *     knowledge/           documents you hand over (md, txt, pdf, csv…)
 *     memory/lexicon.json  names & jargon you confirmed (Arabic + Latin spellings)
 *     memory/notes.md      learnings you approved (people, project facts, your preferences)
 *     memory/actions.json  action tracker carried across meetings
 *     meetings/<id>/       transcript.md, meeting.json, qa.md per meeting
 */
export const WORKSPACE = path.resolve(/*turbopackIgnore: true*/ process.env.MEETING_WORKSPACE || 'workspace')

const p = {
  claudeMd: path.join(WORKSPACE, 'CLAUDE.md'),
  knowledge: path.join(WORKSPACE, 'knowledge'),
  lexicon:   path.join(WORKSPACE, 'memory', 'lexicon.json'),
  notes:     path.join(WORKSPACE, 'memory', 'notes.md'),
  actions:   path.join(WORKSPACE, 'memory', 'actions.json'),
  meetings:  path.join(WORKSPACE, 'meetings'),
}

const CHARTER = `# Meeting Copilot workspace

This folder is the long-term memory of a meeting assistant used in Moroccan professional meetings (Darija / French).

- knowledge/ — reference documents handed over by the user. Treat as authoritative background.
- memory/lexicon.json — names, companies and jargon the user CONFIRMED. Always use these spellings.
- memory/notes.md — learnings the user approved: people, roles, project facts, the user's preferences.
- memory/actions.json — action items tracked across meetings.
- meetings/<id>/transcript.md — past meeting transcripts; meetings/<id>/qa.md — questions the user asked.

When answering, search here (Grep/Glob/Read) before relying on assumptions, and cite the file or timestamp you used.
You can also open this folder in Claude Code (\`claude\`) and talk to the agent directly.
`

export async function ensureWorkspace() {
  await Promise.all([p.knowledge, path.dirname(p.lexicon), p.meetings].map(d => fs.mkdir(d, { recursive: true })))
  await writeIfMissing(p.claudeMd, CHARTER)
  await writeIfMissing(p.lexicon, '[]')
  await writeIfMissing(p.actions, '[]')
  await writeIfMissing(p.notes, '# Learned notes\n')
}

async function writeIfMissing(file: string, content: string) {
  try { await fs.writeFile(file, content, { flag: 'wx' }) } catch { /* exists */ }
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(file, 'utf8')) as T } catch { return fallback }
}

// ── Lexicon ───────────────────────────────────────────────────────────────

export const getLexicon = () => readJson<LexiconEntry[]>(p.lexicon, [])

export async function upsertLexicon(entry: LexiconEntry) {
  const all = await getLexicon()
  const norm = (s: string) => s.trim().toLowerCase()
  const existing = all.find(e => norm(e.canonical) === norm(entry.canonical) && e.kind === entry.kind)
  if (existing) {
    existing.arabic   = entry.arabic || existing.arabic
    existing.meaning  = entry.meaning || existing.meaning
    existing.variants = [...new Set([...existing.variants, ...entry.variants])]
  } else {
    all.push(entry)
  }
  await fs.writeFile(p.lexicon, JSON.stringify(all, null, 2))
  return all
}

// ── Notes ─────────────────────────────────────────────────────────────────

export const getNotes = async () => { try { return await fs.readFile(p.notes, 'utf8') } catch { return '' } }

export async function appendNotes(items: { category: string; content: string }[], source: string) {
  if (!items.length) return
  const date = new Date().toISOString().slice(0, 10)
  const lines = items.map(i => `- [${i.category}] ${i.content} _(${date}, ${source})_`)
  await fs.appendFile(p.notes, '\n' + lines.join('\n') + '\n')
}

// ── Action tracker ────────────────────────────────────────────────────────

export const getActions = () => readJson<TrackedAction[]>(p.actions, [])
export const saveActions = (a: TrackedAction[]) => fs.writeFile(p.actions, JSON.stringify(a, null, 2))

// ── Meetings ──────────────────────────────────────────────────────────────

const safeId = (id: string) => id.replace(/[^\w-]/g, '_').slice(0, 80)

export async function saveMeeting(id: string, data: { context: MeetingContext; segments: RefinedSegment[]; digest?: MeetingDigest }) {
  const dir = path.join(p.meetings, safeId(id))
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'meeting.json'), JSON.stringify(data, null, 2))
  const md = [`# ${data.context.title || id}`, '',
    ...data.segments.map(s => `[${formatTime(s.start)}] ${s.speaker}${s.uncertain ? ' (?)' : ''}: ${s.original}${s.translation ? `\n  ↳ ${s.translation}` : ''}`)]
  await fs.writeFile(path.join(dir, 'transcript.md'), md.join('\n'))
}

export async function appendQa(id: string, question: string, answer: string) {
  const dir = path.join(p.meetings, safeId(id))
  await fs.mkdir(dir, { recursive: true })
  await fs.appendFile(path.join(dir, 'qa.md'), `\n## Q: ${question}\n\n${answer}\n`)
}

export async function readQa(id: string) {
  try { return await fs.readFile(path.join(p.meetings, safeId(id), 'qa.md'), 'utf8') } catch { return '' }
}

// ── Knowledge base ────────────────────────────────────────────────────────

export const KNOWLEDGE_TYPES = ['.md', '.txt', '.pdf', '.csv', '.json']

export async function listKnowledge() {
  const files = await fs.readdir(p.knowledge).catch(() => [] as string[])
  return Promise.all(files.filter(f => !f.startsWith('.')).map(async f => {
    const st = await fs.stat(path.join(p.knowledge, f))
    return { name: f, size: st.size }
  }))
}

export async function saveKnowledge(name: string, data: Buffer) {
  const clean = path.basename(name).replace(/[^\w.\- ]/g, '_')
  if (!KNOWLEDGE_TYPES.includes(path.extname(clean).toLowerCase())) {
    throw new Error(`Unsupported file type for ${name}. Use ${KNOWLEDGE_TYPES.join(', ')} (convert Word/PowerPoint to PDF).`)
  }
  await fs.writeFile(path.join(p.knowledge, clean), data)
  return clean
}

export async function memoryStats() {
  const [lexicon, actions, notes, knowledge, meetings] = await Promise.all([
    getLexicon(), getActions(), getNotes(), listKnowledge(),
    fs.readdir(p.meetings).catch(() => [] as string[]),
  ])
  return {
    workspace: WORKSPACE,
    terms:       lexicon.filter(l => l.kind !== 'ignore').length,
    notes:       notes.split('\n').filter(l => l.startsWith('- ')).length,
    openActions: actions.filter(a => a.status === 'open' || a.status === 'blocked').length,
    knowledge,
    meetings:    meetings.length,
  }
}

// ── Settings (set from the UI, so no .env editing is needed) ──────────────

export interface Settings {
  sttProvider:   'elevenlabs' | 'openai'
  elevenlabsKey: string
  openaiKey:     string
}

const settingsFile = () => path.join(WORKSPACE, 'settings.json')

/** UI-saved settings win; environment variables remain a fallback for people who prefer .env. */
export async function getSettings(): Promise<Settings> {
  const saved = await readJson<Partial<Settings>>(settingsFile(), {})
  return {
    sttProvider:   saved.sttProvider ?? (process.env.STT_PROVIDER === 'openai' ? 'openai' : 'elevenlabs'),
    elevenlabsKey: saved.elevenlabsKey || process.env.ELEVENLABS_API_KEY || '',
    openaiKey:     saved.openaiKey || process.env.OPENAI_API_KEY || '',
  }
}

export async function saveSettings(patch: Partial<Settings>) {
  const current = await readJson<Partial<Settings>>(settingsFile(), {})
  const next = { ...current, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined && v !== '')) }
  await fs.writeFile(settingsFile(), JSON.stringify(next, null, 2), { mode: 0o600 })
}

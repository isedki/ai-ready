import fs   from 'node:fs/promises'
import path from 'node:path'
import { structured, MODELS }          from '@/lib/meeting/claude'
import { briefSystemPrompt }           from '@/lib/meeting/prompts'
import { unauthorized, errorResponse } from '@/lib/meeting/auth'
import { WORKSPACE, ensureWorkspace, getActions, getLexicon, getNotes } from '@/lib/meeting/workspace'
import { Brief, type OutputLanguage }  from '@/lib/meeting/schema'

export const maxDuration = 300

const briefFile = (date: string) => path.join(WORKSPACE, 'briefs', `${date}.json`)

/**
 * The daily brief: who to chase, what is slipping, what to prepare. Generated once
 * a day (the app asks for it when you open it) and cached in workspace/briefs/.
 * POST regenerates it on demand.
 */
export async function GET(req: Request) {
  const denied = unauthorized(req)
  if (denied) return denied
  const today = new Date().toISOString().slice(0, 10)
  try {
    return Response.json({ date: today, brief: JSON.parse(await fs.readFile(briefFile(today), 'utf8')) })
  } catch {
    return Response.json({ date: today, brief: null })
  }
}

export async function POST(req: Request) {
  const denied = unauthorized(req)
  if (denied) return denied
  try {
    await ensureWorkspace()
    const { language = 'fr' } = await req.json().catch(() => ({})) as { language?: OutputLanguage }
    const today = new Date().toISOString().slice(0, 10)
    const [lexicon, notes, actions] = await Promise.all([getLexicon(), getNotes(), getActions()])

    const brief = await structured(Brief, {
      system:    briefSystemPrompt(language, { lexicon, notes, actions }, today),
      model:     MODELS.deep,
      effort:    'medium',
      readFiles: true,
      timeoutMs: 280_000,
      prompt:    'Prepare today\'s brief. Look at the most recent meetings in meetings/ if they help.',
    })

    await fs.mkdir(path.dirname(briefFile(today)), { recursive: true })
    await fs.writeFile(briefFile(today), JSON.stringify(brief, null, 2))
    return Response.json({ date: today, brief })
  } catch (err) {
    return errorResponse('brief', err)
  }
}

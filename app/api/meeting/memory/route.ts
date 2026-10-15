import { authStatus }                  from '@/lib/meeting/claude'
import { unauthorized, errorResponse } from '@/lib/meeting/auth'
import {
  appendNotes, ensureWorkspace, getActions, getLexicon, memoryStats, saveActions, upsertLexicon,
} from '@/lib/meeting/workspace'
import {
  LexiconEntry, type MeetingDigest, type TrackedAction,
} from '@/lib/meeting/schema'

/** Workspace status: Claude login, memory size, lexicon and action tracker. */
export async function GET(req: Request) {
  const denied = unauthorized(req)
  if (denied) return denied
  try {
    await ensureWorkspace()
    const [auth, stats, lexicon, actions] = await Promise.all([authStatus(), memoryStats(), getLexicon(), getActions()])
    return Response.json({ auth, stats, lexicon, actions })
  } catch (err) {
    return errorResponse('memory', err)
  }
}

type Body =
  | { op: 'lexicon'; entry: unknown }
  | { op: 'notes'; meetingId: string; items: { category: string; content: string }[] }
  | { op: 'track'; meetingId: string; digest: MeetingDigest }
  | { op: 'action-status'; id: string; status: TrackedAction['status']; note: string }

/** Every write to memory goes through here, and only after the user approved it in the UI. */
export async function POST(req: Request) {
  const denied = unauthorized(req)
  if (denied) return denied
  try {
    await ensureWorkspace()
    const body = await req.json() as Body
    const today = new Date().toISOString().slice(0, 10)

    switch (body.op) {
      case 'lexicon': {
        const entry = LexiconEntry.parse(body.entry)
        return Response.json({ lexicon: await upsertLexicon(entry) })
      }
      case 'notes': {
        await appendNotes(body.items, `meeting ${body.meetingId}`)
        return Response.json({ ok: true })
      }
      case 'track': {
        // Add this meeting's actions and apply status updates on earlier ones
        const actions = await getActions()
        const existingIds = new Set(actions.map(a => a.id))
        body.digest.action_items.forEach((a, i) => {
          const id = `${body.meetingId}-${i + 1}`
          if (existingIds.has(id)) return
          actions.push({
            id, action: a.action, owner: a.owner, due: a.due, status: 'open',
            meeting: body.meetingId, createdAt: today,
            history: [{ date: today, status: 'open', note: `${a.commitment_strength} commitment: "${a.quote}" [${a.timestamp}]` }],
          })
        })
        for (const u of body.digest.previous_actions) {
          const a = actions.find(x => x.id === u.id)
          if (!a || u.status === 'not_discussed') continue
          const status = u.status === 'progressing' ? 'open' : u.status
          a.status = status
          a.history.push({ date: today, status, note: `${u.note}${u.quote ? ` — "${u.quote}" [${u.timestamp}]` : ''} (meeting ${body.meetingId})` })
        }
        await saveActions(actions)
        return Response.json({ actions })
      }
      case 'action-status': {
        const actions = await getActions()
        const a = actions.find(x => x.id === body.id)
        if (!a) return Response.json({ error: 'Unknown action' }, { status: 404 })
        a.status = body.status
        a.history.push({ date: today, status: body.status, note: body.note || 'updated manually' })
        await saveActions(actions)
        return Response.json({ actions })
      }
    }
    return Response.json({ error: 'Unknown op' }, { status: 400 })
  } catch (err) {
    return errorResponse('memory', err)
  }
}

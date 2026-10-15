import { structured, MODELS }          from '@/lib/meeting/claude'
import { digestSystemPrompt, transcriptBlock } from '@/lib/meeting/prompts'
import { unauthorized, errorResponse } from '@/lib/meeting/auth'
import { verifyDigest }                from '@/lib/meeting/verify'
import { getActions, getLexicon, getNotes, saveMeeting } from '@/lib/meeting/workspace'
import { MeetingDigest, type MeetingContext, type RefinedSegment } from '@/lib/meeting/schema'

export const maxDuration = 600

export async function POST(req: Request) {
  const denied = unauthorized(req)
  if (denied) return denied

  try {
    const { meetingId, segments, context, mode, pendingTerms } = await req.json() as {
      meetingId:    string
      segments:     RefinedSegment[]
      context:      MeetingContext
      mode:         'live' | 'final'
      pendingTerms: string[]
    }
    if (!segments?.length) return Response.json({ error: 'Nothing transcribed yet' }, { status: 400 })

    const [lexicon, notes, actions] = await Promise.all([getLexicon(), getNotes(), getActions()])

    const digest = await structured(MeetingDigest, {
      system:    digestSystemPrompt(context, mode, { lexicon, notes, actions }, pendingTerms ?? []),
      model:     MODELS.deep,
      // Live digests run every few minutes during the meeting; the final one gets full depth.
      effort:    mode === 'final' ? 'high' : 'medium',
      readFiles: mode === 'final',
      timeoutMs: 540_000,
      prompt:    `<transcript>\n${transcriptBlock(segments)}\n</transcript>\n\nProduce the meeting digest.`,
    })

    const verified = verifyDigest(digest, segments)
    if (mode === 'final') await saveMeeting(meetingId, { context, segments, digest: verified })
    return Response.json(verified)
  } catch (err) {
    return errorResponse('digest', err)
  }
}

import { structured, MODELS }          from '@/lib/meeting/claude'
import { learnSystemPrompt, transcriptBlock } from '@/lib/meeting/prompts'
import { unauthorized, errorResponse } from '@/lib/meeting/auth'
import { getActions, getLexicon, getNotes, readQa } from '@/lib/meeting/workspace'
import { LearningProposal, type MeetingContext, type MeetingDigest, type RefinedSegment } from '@/lib/meeting/schema'

export const maxDuration = 300

/** Proposes durable learnings from a meeting. Nothing is stored until the user approves (see /api/meeting/memory). */
export async function POST(req: Request) {
  const denied = unauthorized(req)
  if (denied) return denied

  try {
    const { meetingId, segments, digest, context } = await req.json() as {
      meetingId: string
      segments:  RefinedSegment[]
      digest:    MeetingDigest | null
      context:   MeetingContext
    }
    const [lexicon, notes, actions, qa] = await Promise.all([getLexicon(), getNotes(), getActions(), readQa(meetingId)])

    const out = await structured(LearningProposal, {
      system:    learnSystemPrompt(context, { lexicon, notes, actions }),
      model:     MODELS.deep,
      effort:    'medium',
      readFiles: false,
      timeoutMs: 280_000,
      prompt: [
        `<transcript>\n${transcriptBlock(segments ?? [], { meetingOnly: true })}\n</transcript>`,
        digest ? `<digest_summary>\n${digest.executive_summary}\n\n${digest.analysis.overall_read}\n</digest_summary>` : '',
        qa ? `<questions_the_user_asked>\n${qa.slice(-10000)}\n</questions_the_user_asked>` : '',
        'Propose learnings.',
      ].filter(Boolean).join('\n\n'),
    })
    return Response.json(out)
  } catch (err) {
    return errorResponse('learn', err)
  }
}

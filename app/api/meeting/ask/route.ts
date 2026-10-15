import { text, MODELS }                from '@/lib/meeting/claude'
import { askSystemPrompt, transcriptBlock } from '@/lib/meeting/prompts'
import { unauthorized, errorResponse } from '@/lib/meeting/auth'
import { appendQa, getActions, getLexicon, getNotes, readQa } from '@/lib/meeting/workspace'
import type { MeetingContext, RefinedSegment } from '@/lib/meeting/schema'

export const maxDuration = 300

/** Questions the user asks are answered from transcript + memory + knowledge, and logged so the agent learns what matters to them. */
export async function POST(req: Request) {
  const denied = unauthorized(req)
  if (denied) return denied

  try {
    const { meetingId, question, segments, context } = await req.json() as {
      meetingId: string
      question:  string
      segments:  RefinedSegment[]
      context:   MeetingContext
    }
    if (!question?.trim()) return Response.json({ error: 'Empty question' }, { status: 400 })

    const [lexicon, notes, actions, previousQa] = await Promise.all([getLexicon(), getNotes(), getActions(), readQa(meetingId)])

    const answer = await text({
      system:    askSystemPrompt(context, { lexicon, notes, actions }),
      model:     MODELS.deep,
      effort:    'medium',
      readFiles: true,
      timeoutMs: 280_000,
      prompt: [
        segments?.length ? `<current_meeting_transcript>\n${transcriptBlock(segments, { meetingOnly: true })}\n</current_meeting_transcript>` : '(no meeting transcript yet)',
        previousQa ? `<earlier_questions_this_meeting>\n${previousQa.slice(-8000)}\n</earlier_questions_this_meeting>` : '',
        `<question>\n${question}\n</question>`,
      ].filter(Boolean).join('\n\n'),
    })

    await appendQa(meetingId, question, answer)
    return Response.json({ answer })
  } catch (err) {
    return errorResponse('ask', err)
  }
}

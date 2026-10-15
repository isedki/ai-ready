import { structured }                                   from '@/lib/meeting/claude'
import { digestSystemPrompt, transcriptBlock }          from '@/lib/meeting/prompts'
import { unauthorized }                                 from '@/lib/meeting/auth'
import { MeetingDigest, type MeetingContext, type RefinedSegment } from '@/lib/meeting/schema'

export const maxDuration = 300

export async function POST(req: Request) {
  const denied = unauthorized(req)
  if (denied) return denied

  try {
    const { segments, context, mode } = await req.json() as {
      segments: RefinedSegment[]
      context:  MeetingContext
      mode:     'live' | 'final'
    }

    if (!segments?.length) {
      return Response.json({ error: 'Nothing transcribed yet' }, { status: 400 })
    }

    const digest = await structured({
      schema:    MeetingDigest,
      system:    digestSystemPrompt(context, mode),
      // Live digests run every few minutes during the meeting; the final one gets full depth.
      effort:    mode === 'final' ? 'high' : 'medium',
      maxTokens: 64000,
      prompt:    `<transcript>\n${transcriptBlock(segments)}\n</transcript>\n\nProduce the meeting digest.`,
    })
    return Response.json(digest)
  } catch (err) {
    console.error('[meeting/digest]', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Digest failed' },
      { status: 500 }
    )
  }
}

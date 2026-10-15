import { transcribe }                         from '@/lib/meeting/stt'
import { structured }                         from '@/lib/meeting/claude'
import { refineSystemPrompt, transcriptBlock, formatTime } from '@/lib/meeting/prompts'
import { unauthorized }                       from '@/lib/meeting/auth'
import { RefinedChunk, type MeetingContext, type RefinedSegment } from '@/lib/meeting/schema'

export const maxDuration = 120

/**
 * One audio chunk in → speech-to-text → Claude fidelity pass → refined segments out.
 * If the fidelity pass fails, the raw ASR is returned so nothing said is lost.
 */
export async function POST(req: Request) {
  const denied = unauthorized(req)
  if (denied) return denied

  try {
    const form    = await req.formData()
    const audio   = form.get('audio')
    const offset  = Number(form.get('offset') ?? 0)
    const context = JSON.parse(String(form.get('context') ?? '{}')) as MeetingContext
    const previous = JSON.parse(String(form.get('previous') ?? '[]')) as RefinedSegment[]

    if (!(audio instanceof Blob)) {
      return Response.json({ error: 'Missing audio' }, { status: 400 })
    }

    const raw = await transcribe(audio, offset)
    if (raw.length === 0) return Response.json({ segments: [], refined: true })

    try {
      const rawText = raw
        .map(s => `[start=${s.start.toFixed(1)} | ${formatTime(s.start)}] ${s.speaker}: ${s.text}`)
        .join('\n')

      const { segments } = await structured({
        schema:    RefinedChunk,
        system:    refineSystemPrompt(context),
        effort:    'medium',
        maxTokens: 32000,
        prompt: [
          previous.length
            ? `<previous_chunk_tail>\n${transcriptBlock(previous)}\n</previous_chunk_tail>\n`
            : '<previous_chunk_tail>(this is the start of the meeting)</previous_chunk_tail>\n',
          `<raw_asr_chunk>\n${rawText}\n</raw_asr_chunk>`,
          '\nReturn the refined segments for the raw chunk only (not the previous tail).',
        ].join('\n'),
      })
      return Response.json({ segments, refined: true })
    } catch (err) {
      console.error('[meeting/chunk] refine failed, returning raw ASR', err)
      const segments: RefinedSegment[] = raw.map(s => ({
        speaker: s.speaker, start: s.start, original: s.text, translation: '',
        uncertain: true, note: 'Unrefined ASR output',
      }))
      return Response.json({ segments, refined: false })
    }
  } catch (err) {
    console.error('[meeting/chunk]', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Transcription failed' },
      { status: 500 }
    )
  }
}

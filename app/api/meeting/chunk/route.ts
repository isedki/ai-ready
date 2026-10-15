import { transcribe }                    from '@/lib/meeting/stt'
import { structured, MODELS }            from '@/lib/meeting/claude'
import { refineSystemPrompt, transcriptBlock, formatTime } from '@/lib/meeting/prompts'
import { unauthorized, errorResponse }   from '@/lib/meeting/auth'
import { getLexicon }                    from '@/lib/meeting/workspace'
import { dropHallucinations }            from '@/lib/meeting/noise'
import { RefinedChunk, type MeetingContext, type RefinedSegment } from '@/lib/meeting/schema'

export const maxDuration = 180

/**
 * One audio chunk in → speech-to-text → Claude fidelity pass → refined segments
 * plus names/jargon to confirm. If the fidelity pass fails, the raw ASR is
 * returned so nothing said is lost.
 */
export async function POST(req: Request) {
  const denied = unauthorized(req)
  if (denied) return denied

  try {
    const form     = await req.formData()
    const audio    = form.get('audio')
    const offset   = Number(form.get('offset') ?? 0)
    const context  = JSON.parse(String(form.get('context') ?? '{}')) as MeetingContext
    const previous = JSON.parse(String(form.get('previous') ?? '[]')) as RefinedSegment[]
    const audioInfo = {
      snrDb:       Number(form.get('snrDb') ?? 20),
      speechRatio: Number(form.get('speechRatio') ?? 1),
    }

    if (!(audio instanceof Blob)) return Response.json({ error: 'Missing audio' }, { status: 400 })

    const { kept: raw, dropped } = dropHallucinations(await transcribe(audio, offset))
    if (dropped) console.info(`[meeting/chunk] dropped ${dropped} noise/silence artefact(s)`)
    if (raw.length === 0) return Response.json({ segments: [], unknown_terms: [], refined: true })

    try {
      const lexicon = await getLexicon()
      const rawText = raw
        .map(s => `[start=${s.start.toFixed(1)} | ${formatTime(s.start)}] ${s.speaker}: ${s.text}`)
        .join('\n')

      const out = await structured(RefinedChunk, {
        system:    refineSystemPrompt(context, lexicon, audioInfo),
        model:     MODELS.chunk,
        effort:    'medium',
        readFiles: false,
        timeoutMs: 150_000,
        prompt: [
          previous.length
            ? `<previous_chunk_tail>\n${transcriptBlock(previous)}\n</previous_chunk_tail>`
            : '<previous_chunk_tail>(start of the meeting)</previous_chunk_tail>',
          `<raw_asr_chunk>\n${rawText}\n</raw_asr_chunk>`,
          'Return the refined segments for the raw chunk only (not the previous tail), and the terms to confirm.',
        ].join('\n\n'),
      })

      // Never ask twice about something already confirmed or ignored
      const known = new Set(lexicon.flatMap(l => [l.canonical, ...l.variants]).map(s => s.trim().toLowerCase()))
      const unknown_terms = out.unknown_terms.filter(t => !known.has(t.heard.trim().toLowerCase()))

      return Response.json({ segments: out.segments, unknown_terms, refined: true })
    } catch (err) {
      console.error('[meeting/chunk] refine failed, returning raw ASR', err)
      const segments: RefinedSegment[] = raw.map(s => ({
        speaker: s.speaker, start: s.start, original: s.text, translation: '',
        uncertain: true, background: false, note: `Unrefined ASR output (${err instanceof Error ? err.message.slice(0, 120) : 'error'})`,
      }))
      return Response.json({ segments, unknown_terms: [], refined: false })
    }
  } catch (err) {
    return errorResponse('chunk', err)
  }
}

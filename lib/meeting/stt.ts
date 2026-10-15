import type { RawSegment } from './schema'

/**
 * Speech-to-text providers. No vendor publishes reliable benchmarks for Moroccan
 * Darija + French code-switching, so the provider is swappable via STT_PROVIDER:
 * record one real meeting, run it through each, and keep the best.
 *
 *   STT_PROVIDER=elevenlabs  (default) ELEVENLABS_API_KEY, STT_MODEL (default scribe_v2)
 *   STT_PROVIDER=openai      OPENAI_API_KEY, STT_MODEL (default gpt-4o-transcribe-diarize)
 *
 * Language is left on auto-detect on purpose: forcing "ar" or "fr" degrades
 * code-switched speech. Claude's fidelity pass fixes names and terms afterwards.
 */
export async function transcribe(audio: Blob, offsetSeconds: number): Promise<RawSegment[]> {
  const provider = process.env.STT_PROVIDER ?? 'elevenlabs'
  const segments =
    provider === 'openai'     ? await openai(audio) :
    provider === 'elevenlabs' ? await elevenlabs(audio) :
    (() => { throw new Error(`Unknown STT_PROVIDER "${provider}"`) })()

  return segments
    .filter(s => s.text.trim())
    .map(s => ({ ...s, start: s.start + offsetSeconds, end: s.end + offsetSeconds }))
}

// ── ElevenLabs Scribe ─────────────────────────────────────────────────────

type ElevenWord = { text: string; start: number; end: number; type: string; speaker_id?: string }

async function elevenlabs(audio: Blob): Promise<RawSegment[]> {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set')

  const form = new FormData()
  form.append('file', audio, 'chunk.wav')
  form.append('model_id', process.env.STT_MODEL ?? 'scribe_v2')
  form.append('diarize', 'true')
  form.append('tag_audio_events', 'false')
  form.append('timestamps_granularity', 'word')

  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method:  'POST',
    headers: { 'xi-api-key': key },
    body:    form,
  })
  if (!res.ok) throw new Error(`ElevenLabs STT ${res.status}: ${await res.text()}`)
  const data = await res.json() as { text: string; words?: ElevenWord[] }

  // Group consecutive words by speaker into segments
  const segments: RawSegment[] = []
  for (const w of data.words ?? []) {
    const last = segments[segments.length - 1]
    if (w.type === 'spacing') { if (last) last.text += ' '; continue }
    if (w.type !== 'word') continue
    const speaker = w.speaker_id ?? 'speaker_0'
    if (last && last.speaker === speaker && w.start - last.end < 1.5) {
      last.text += w.text
      last.end = w.end
    } else {
      segments.push({ speaker, start: w.start, end: w.end, text: w.text })
    }
  }
  if (segments.length === 0 && data.text?.trim()) {
    segments.push({ speaker: 'speaker_0', start: 0, end: 0, text: data.text })
  }
  return segments.map(s => ({ ...s, text: s.text.trim() }))
}

// ── OpenAI ────────────────────────────────────────────────────────────────

async function openai(audio: Blob): Promise<RawSegment[]> {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY is not set')
  const model = process.env.STT_MODEL ?? 'gpt-4o-transcribe-diarize'
  const diarize = model.includes('diarize')

  const form = new FormData()
  form.append('file', audio, 'chunk.wav')
  form.append('model', model)
  form.append('response_format', diarize ? 'diarized_json' : 'json')
  if (diarize) form.append('chunking_strategy', 'auto')

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method:  'POST',
    headers: { Authorization: `Bearer ${key}` },
    body:    form,
  })
  if (!res.ok) throw new Error(`OpenAI STT ${res.status}: ${await res.text()}`)
  const data = await res.json() as {
    text: string
    segments?: { speaker?: string; start: number; end: number; text: string }[]
  }

  if (data.segments?.length) {
    return data.segments.map(s => ({ speaker: s.speaker ?? 'speaker_0', start: s.start, end: s.end, text: s.text }))
  }
  return [{ speaker: 'speaker_0', start: 0, end: 0, text: data.text }]
}

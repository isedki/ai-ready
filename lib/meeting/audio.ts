'use client'

/**
 * Browser-side audio capture. Audio is downmixed to 16 kHz mono PCM and cut into
 * self-contained WAV chunks (~45 s, ~1.4 MB each — well under serverless body
 * limits). Cuts are placed at the quietest moment near the target length so
 * words are not split across chunks.
 */

export const SAMPLE_RATE = 16000
const TARGET_SECONDS = 45
const SEARCH_WINDOW  = 8      // look for a pause in the last N seconds of a chunk
const QUIET_WINDOW   = 0.3    // length of the "pause" we look for

/** Signal measurements for one chunk, used to skip silence and to warn Claude about noise. */
export interface AudioStats {
  speechRatio: number   // share of 30 ms frames clearly above the noise floor
  snrDb:       number   // rough loud-vs-quiet contrast; low in noisy open spaces
  seconds:     number
}
export type ChunkHandler = (wav: Blob, offsetSeconds: number, stats: AudioStats) => void

/** Below this share of speech frames a chunk is treated as silence and not transcribed. */
export const MIN_SPEECH_RATIO = 0.03
export type CaptureSource = 'mic' | 'mic+tab'

const WORKLET = `
class Tap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0]
    if (ch && ch.length) {
      const out = new Float32Array(ch[0].length)
      for (const c of ch) for (let i = 0; i < out.length; i++) out[i] += c[i] / ch.length
      this.port.postMessage(out, [out.buffer])
    }
    return true
  }
}
registerProcessor('tap', Tap)
`

export class ChunkRecorder {
  private ctx:     AudioContext | null = null
  private streams: MediaStream[] = []
  private buffer:  Float32Array[] = []
  private buffered = 0
  private emitted  = 0          // samples already sent, = offset of next chunk
  private ratio    = 1
  private carry    = 0          // fractional resampling position
  private prev     = 0          // last input sample of the previous frame

  /** Root-mean-square level of the last frame, 0..1 — for a VU meter. */
  level = 0

  constructor(private onChunk: ChunkHandler) {}

  async start(source: CaptureSource, startOffsetSeconds = 0) {
    this.emitted = Math.round(startOffsetSeconds * SAMPLE_RATE)

    const mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    this.streams.push(mic)

    if (source === 'mic+tab') {
      // Chrome only returns tab audio when video is requested too; the video is ignored.
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      if (display.getAudioTracks().length === 0) {
        display.getTracks().forEach(t => t.stop())
        this.stop()
        throw new Error('No audio shared. Pick the meeting tab and tick "Share tab audio".')
      }
      this.streams.push(display)
    }

    this.ctx = new AudioContext()
    this.ratio = this.ctx.sampleRate / SAMPLE_RATE
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
    await this.ctx.audioWorklet.addModule(url)
    URL.revokeObjectURL(url)

    const tap = new AudioWorkletNode(this.ctx, 'tap', { channelCount: 1, channelCountMode: 'explicit' })
    // Cut low-frequency rumble (HVAC, desk knocks, traffic) that open spaces are full of
    const highpass = new BiquadFilterNode(this.ctx, { type: 'highpass', frequency: 90 })
    highpass.connect(tap)
    for (const s of this.streams) {
      if (s.getAudioTracks().length) this.ctx.createMediaStreamSource(s).connect(highpass)
    }
    tap.port.onmessage = (e: MessageEvent<Float32Array>) => this.push(e.data)
  }

  /** Stops capture and flushes the last partial chunk. */
  stop() {
    this.streams.forEach(s => s.getTracks().forEach(t => t.stop()))
    this.streams = []
    this.ctx?.close()
    this.ctx = null
    this.flush(true)
  }

  private push(frame: Float32Array) {
    let sum = 0
    for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i]
    this.level = Math.sqrt(sum / frame.length)

    // Linear-interpolation resample to 16 kHz. src[0] is the previous frame's last
    // sample so interpolation stays continuous (and timestamps don't drift) across frames.
    const src = new Float32Array(frame.length + 1)
    src[0] = this.prev
    src.set(frame, 1)
    const out: number[] = []
    let pos = this.carry
    while (pos < src.length - 1) {
      const i = Math.floor(pos)
      out.push(src[i] + (src[i + 1] - src[i]) * (pos - i))
      pos += this.ratio
    }
    this.carry = pos - frame.length
    this.prev  = frame[frame.length - 1]
    const chunk = Float32Array.from(out)
    this.buffer.push(chunk)
    this.buffered += chunk.length

    if (this.buffered >= TARGET_SECONDS * SAMPLE_RATE) this.flush(false)
  }

  private flush(final: boolean) {
    if (this.buffered === 0) return
    const all = concat(this.buffer, this.buffered)
    const cut = final ? all.length : findCut(all)
    this.emit(all.subarray(0, cut))
    const rest = all.slice(cut)
    this.buffer = rest.length ? [rest] : []
    this.buffered = rest.length
  }

  private emit(samples: Float32Array) {
    if (samples.length < SAMPLE_RATE / 2) return  // ignore < 0.5 s tails
    this.onChunk(encodeWav(samples), this.emitted / SAMPLE_RATE, analyze(samples))
    this.emitted += samples.length
  }
}

/** Decodes an uploaded recording and splits it into the same chunks as live capture. */
export async function chunkFile(file: File, onChunk: ChunkHandler) {
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
  try {
    const decoded = await ctx.decodeAudioData(await file.arrayBuffer())
    const mono = new Float32Array(decoded.length)
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      const data = decoded.getChannelData(c)
      for (let i = 0; i < mono.length; i++) mono[i] += data[i] / decoded.numberOfChannels
    }
    let start = 0
    while (start < mono.length) {
      const remaining = mono.subarray(start)
      const cut = remaining.length <= TARGET_SECONDS * SAMPLE_RATE * 1.2
        ? remaining.length
        : findCut(remaining.subarray(0, TARGET_SECONDS * SAMPLE_RATE))
      const piece = remaining.subarray(0, cut)
      onChunk(encodeWav(piece), start / SAMPLE_RATE, analyze(piece))
      start += cut
    }
  } finally {
    ctx.close()
  }
}

// ── helpers ───────────────────────────────────────────────────────────────

/**
 * Adaptive voice-activity estimate: the noise floor is the quiet end of this
 * chunk's own energy distribution, so constant open-space hum doesn't count as
 * speech, but a quiet room doesn't make whispers vanish either.
 */
export function analyze(samples: Float32Array): AudioStats {
  const frame = Math.round(0.03 * SAMPLE_RATE)
  const energies: number[] = []
  for (let s = 0; s + frame <= samples.length; s += frame) {
    let e = 0
    for (let i = s; i < s + frame; i++) e += samples[i] * samples[i]
    energies.push(Math.sqrt(e / frame))
  }
  const seconds = samples.length / SAMPLE_RATE
  if (energies.length === 0) return { speechRatio: 0, snrDb: 0, seconds }
  const sorted = [...energies].sort((a, b) => a - b)
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
  const floor = Math.max(pct(0.2), 1e-5)
  const threshold = Math.max(floor * 3, 0.008)
  return {
    speechRatio: energies.filter(e => e > threshold).length / energies.length,
    snrDb:       20 * Math.log10(Math.max(pct(0.9), 1e-5) / floor),
    seconds,
  }
}

function concat(parts: Float32Array[], total: number) {
  const out = new Float32Array(total)
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

/** Index of the quietest QUIET_WINDOW in the last SEARCH_WINDOW seconds. */
function findCut(samples: Float32Array): number {
  const win  = Math.round(QUIET_WINDOW * SAMPLE_RATE)
  const from = Math.max(0, samples.length - SEARCH_WINDOW * SAMPLE_RATE)
  let best = samples.length, bestEnergy = Infinity
  for (let s = from; s + win <= samples.length; s += win / 2) {
    let e = 0
    for (let i = s; i < s + win; i++) e += samples[i] * samples[i]
    if (e < bestEnergy) { bestEnergy = e; best = s + win / 2 }
  }
  return Math.round(best)
}

function encodeWav(samples: Float32Array): Blob {
  const buf  = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buf)
  const str  = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE')
  str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, SAMPLE_RATE, true); view.setUint32(28, SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  str(36, 'data'); view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buf], { type: 'audio/wav' })
}

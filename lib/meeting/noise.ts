import type { RawSegment } from './schema'

/**
 * Speech-to-text models "hear" text in silence and noise: subtitle credits,
 * YouTube outros, endless repetitions. These phrases never occur in a real work
 * meeting, so they are removed before Claude sees the chunk.
 */
const HALLUCINATIONS: RegExp[] = [
  /اشتركوا?\s+في\s+القناة/u,                  // "subscribe to the channel"
  /ترجمة\s+نانسي\s+قنقر/u,                     // classic Arabic subtitle credit
  /(شكرا|شكراً)\s+(على|لكم\s+على)\s+(المشاهدة|المتابعة)/u,
  /^\s*(موسيقى|\[موسيقى\]|♪+)\s*$/u,
  /sous-titr(age|es|é)\s+(par|réalisés?|st'?)/i,
  /merci\s+d'avoir\s+regard[ée]/i,
  /abonnez-vous/i,
  /thanks?\s+(you\s+)?for\s+watching/i,
  /subscribe\s+to\s+(my|the|our)\s+channel/i,
  /amara\.org/i,
  /^\s*\[?(music|musique|applause|silence|bruit|noise|inaudible)\]?\s*$/i,
]

/** True when the same short phrase repeats over and over — a decoder loop, not speech. */
function isLoop(text: string): boolean {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length < 8) return false
  for (let n = 1; n <= 4; n++) {
    const gram = (i: number) => words.slice(i, i + n).join(' ')
    const counts = new Map<string, number>()
    for (let i = 0; i + n <= words.length; i += n) counts.set(gram(i), (counts.get(gram(i)) ?? 0) + 1)
    const top = Math.max(...counts.values())
    if (top * n >= words.length * 0.6 && top >= 5) return true
  }
  return false
}

export function dropHallucinations(segments: RawSegment[]): { kept: RawSegment[]; dropped: number } {
  const kept = segments.filter(s => {
    const t = s.text.trim()
    if (t.length < 2) return false
    if (HALLUCINATIONS.some(re => re.test(t))) return false
    if (isLoop(t)) return false
    return true
  })
  return { kept, dropped: segments.length - kept.length }
}

import type { DroppedItem, MeetingDigest, RefinedSegment, VerifiedDigest } from './schema'

/**
 * Code-level guard against invented content: every evidence quote in the digest
 * must actually appear in the transcript. Matching is tolerant of punctuation,
 * case, Arabic diacritics and small ASR-level differences (token overlap), but a
 * quote that isn't there gets the item removed and listed under `dropped`.
 */

const MIN_OVERLAP = 0.75

function normalize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[ً-ٰٟـ]/g, '')      // Arabic harakat + tatweel
    .replace(/[̀-ͯ]/g, '')                  // Latin accents
    .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

export function makeQuoteChecker(segments: RefinedSegment[]) {
  // Windows of 3 consecutive segments, so quotes spanning a speaker turn still match.
  const windows = segments.map((_, i) => {
    const text = segments.slice(i, i + 3).map(s => `${s.original} ${s.translation}`).join(' ')
    return new Set(normalize(text))
  })
  return (quote: string | null | undefined): boolean => {
    if (!quote) return false
    const tokens = normalize(quote)
    if (tokens.length === 0) return false
    return windows.some(w => tokens.filter(t => w.has(t)).length / tokens.length >= MIN_OVERLAP)
  }
}

export function verifyDigest(d: MeetingDigest, segments: RefinedSegment[]): VerifiedDigest {
  const found = makeQuoteChecker(segments)
  const dropped: DroppedItem[] = []

  function keep<T extends { quote: string }>(section: string, items: T[], label: (t: T) => string): T[] {
    return items.filter(item => {
      if (found(item.quote)) return true
      dropped.push({ section, text: label(item), quote: item.quote })
      return false
    })
  }

  return {
    ...d,
    key_points:   keep('key point', d.key_points, x => x.point),
    decisions:    keep('decision', d.decisions, x => x.decision),
    action_items: keep('action', d.action_items, x => x.action),
    risks: d.risks.filter(r => {
      // Inferred risks are the analyst's opinion; they still need a real anchor in the transcript.
      if (found(r.quote)) return true
      dropped.push({ section: r.raised_explicitly ? 'risk' : 'inferred risk', text: r.risk, quote: r.quote })
      return false
    }),
    previous_actions: d.previous_actions.filter(p => {
      if (p.status === 'not_discussed' || found(p.quote)) return true
      dropped.push({ section: 'previous action update', text: p.note, quote: p.quote ?? '(no quote)' })
      return false
    }),
    dropped,
  }
}

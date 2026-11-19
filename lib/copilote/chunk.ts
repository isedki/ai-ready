import type { ChunkInput } from './store'

/**
 * A loader returns sections in reading order: a PDF page, a Word section under its
 * heading, an Excel sheet, an email message. The chunker cuts each section into
 * passages the assistant can read and cite, never mixing two sections, so every
 * passage keeps an exact locator ("p. 14", "onglet Abaques").
 */
export type Section = { text: string; heading?: string | null; locator?: string | null }

const TARGET  = Number(process.env.COPILOTE_CHUNK_CHARS ?? 1600)
const OVERLAP = Number(process.env.COPILOTE_CHUNK_OVERLAP ?? 200)

/** Paragraphs, but a table (consecutive lines with | or tabs) stays one unit when it fits. */
function units(text: string): string[] {
  const paras = text.replace(/\r\n?/g, '\n').split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
  const out: string[] = []
  for (const p of paras) {
    if (p.length <= TARGET) { out.push(p); continue }
    // Long paragraph or table: split on lines, then on sentences if a line is still too long.
    for (const line of p.split('\n')) {
      if (line.length <= TARGET) out.push(line)
      else out.push(...line.split(/(?<=[.;!?])\s+/))
    }
  }
  return out
}

export function chunkSections(sections: Section[]): ChunkInput[] {
  const chunks: ChunkInput[] = []
  for (const s of sections) {
    const parts = units(s.text)
    let cur: string[] = []
    let len = 0
    let fresh = false        // cur holds something not yet emitted (beyond the carried-over tail)
    const flush = () => {
      if (!fresh) return
      chunks.push({ heading: s.heading ?? null, locator: s.locator ?? null, text: cur.join('\n\n') })
      // Carry the tail of this passage into the next one so a fact cut at the edge stays findable.
      const tail: string[] = []
      let tl = 0
      for (let i = cur.length - 1; i >= 0 && tl + cur[i].length <= OVERLAP; i--) { tail.unshift(cur[i]); tl += cur[i].length + 2 }
      cur = tail
      len = tl
      fresh = false
    }
    for (const u of parts) {
      const piece = u.length > TARGET ? u.slice(0, TARGET) : u
      if (len + piece.length > TARGET && fresh) flush()
      cur.push(piece)
      len += piece.length + 2
      fresh = true
    }
    flush()
  }
  return chunks.filter(c => c.text.trim().length > 20)
}

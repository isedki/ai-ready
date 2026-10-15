'use client'

import type { LexiconEntry, RefinedSegment } from './schema'

export const KEY_STORE = 'meeting:key'

/** fetch() for the meeting API: adds the access key and turns error JSON into thrown errors. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let key = ''
  try { key = JSON.parse(localStorage.getItem(KEY_STORE) ?? '""') } catch { /* none */ }
  const headers = new Headers(init.headers)
  if (key) headers.set('x-meeting-key', key)
  if (init.body && typeof init.body === 'string') headers.set('Content-Type', 'application/json')
  const res  = await fetch(path, { ...init, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
  return data as T
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const hasArabic = (s: string) => /[؀-ۿ]/.test(s)

/** After the user confirms a term, rewrite it everywhere in the transcript, in the script it was heard in. */
export function applyTerm(segments: RefinedSegment[], heard: string, entry: LexiconEntry): RefinedSegment[] {
  if (!heard.trim() || entry.kind === 'ignore') return segments
  const target = hasArabic(heard) && entry.arabic ? entry.arabic : entry.canonical
  // \b doesn't work for Arabic script, so match on non-letter boundaries instead
  const re = new RegExp(`(^|[^\\p{L}])${escape(heard)}(?=$|[^\\p{L}])`, 'giu')
  const swap = (s: string, to: string) => s.replace(re, (_, pre) => pre + to)
  return segments.map(s => ({
    ...s,
    speaker:     s.speaker === heard ? entry.canonical : s.speaker,
    original:    swap(s.original, target),
    translation: swap(s.translation, entry.canonical),
  }))
}

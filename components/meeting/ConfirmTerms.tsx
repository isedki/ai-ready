'use client'

import { useState } from 'react'
import type { LexiconEntry, UnknownTerm } from '@/lib/meeting/schema'

const KINDS = ['person', 'company', 'product', 'technical', 'acronym', 'place', 'other'] as const

interface Props {
  terms:     UnknownTerm[]
  onConfirm: (term: UnknownTerm, entry: LexiconEntry) => Promise<void>
  onIgnore:  (term: UnknownTerm) => Promise<void>
}

/** Names and jargon the agent was unsure about. Nothing is spelled "for real" until you confirm it here. */
export default function ConfirmTerms({ terms, onConfirm, onIgnore }: Props) {
  if (terms.length === 0) return null
  return (
    <section className="border border-yellow-900/60 rounded-xl bg-yellow-950/10">
      <div className="px-5 py-3 font-mono text-xs tracking-widest text-yellow-400">
        TO CONFIRM · {terms.length} <span className="text-zinc-500 normal-case tracking-normal">names & jargon — confirmed once, remembered forever</span>
      </div>
      <div className="px-5 pb-4 space-y-3 max-h-80 overflow-y-auto">
        {terms.map(t => <TermRow key={t.heard} term={t} onConfirm={onConfirm} onIgnore={onIgnore} />)}
      </div>
    </section>
  )
}

function TermRow({ term, onConfirm, onIgnore }: { term: UnknownTerm } & Omit<Props, 'terms'>) {
  const [latin, setLatin]     = useState(term.latin ?? term.heard)
  const [arabic, setArabic]   = useState(term.arabic ?? '')
  const [kind, setKind]       = useState<(typeof KINDS)[number]>(term.kind)
  const [meaning, setMeaning] = useState('')
  const [busy, setBusy]       = useState(false)

  const field = 'bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 min-w-0'
  const act = async (fn: () => Promise<void>) => { setBusy(true); try { await fn() } finally { setBusy(false) } }

  return (
    <div className="border-b border-zinc-800/70 pb-3 last:border-0">
      <div className="text-sm">
        <span className="text-yellow-300" dir="auto">{term.heard}</span>
        <span className="text-xs text-zinc-500 ml-2" dir="auto">“{term.context}”</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
        <input className={field} value={latin} onChange={e => setLatin(e.target.value)} placeholder="Latin spelling" />
        <input className={field} value={arabic} onChange={e => setArabic(e.target.value)} placeholder="بالعربية" dir="rtl" />
        <select className={field} value={kind} onChange={e => setKind(e.target.value as typeof kind)}>
          {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        <input className={field} value={meaning} onChange={e => setMeaning(e.target.value)}
          placeholder={kind === 'person' ? 'Role (e.g. DAF client)' : 'Meaning'} />
      </div>
      <div className="flex gap-2 mt-2">
        <button disabled={busy || !latin.trim()}
          onClick={() => act(() => onConfirm(term, {
            canonical: latin.trim(), arabic: arabic.trim() || null, kind,
            meaning: meaning.trim() || null, variants: [term.heard],
          }))}
          className="font-mono text-xs px-3 py-1 rounded border border-green-800 text-green-400 hover:bg-green-950/40 disabled:opacity-40">
          ✓ Confirm
        </button>
        <button disabled={busy} onClick={() => act(() => onIgnore(term))}
          className="font-mono text-xs px-3 py-1 rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500 disabled:opacity-40">
          Ordinary word — never ask
        </button>
      </div>
    </div>
  )
}

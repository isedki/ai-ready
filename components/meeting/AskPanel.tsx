'use client'

import { useState } from 'react'

export type QA = { question: string; answer: string }

interface Props {
  history: QA[]
  onAsk:   (question: string) => Promise<void>
}

/** Ask anything about this meeting, past meetings or the knowledge base. Questions are logged so the agent learns your priorities. */
export default function AskPanel({ history, onAsk }: Props) {
  const [q, setQ]       = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!q.trim() || busy) return
    setBusy(true)
    try { await onAsk(q.trim()); setQ('') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <textarea value={q} onChange={e => setQ(e.target.value)} rows={2} dir="auto"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
          placeholder="e.g. Who committed to what on the SAP connector? What should I tell the DG on Friday?"
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600" />
        <button onClick={submit} disabled={busy || !q.trim()}
          className="font-mono text-xs px-4 rounded-lg border border-cyan-800 text-cyan-400 hover:bg-cyan-950/40 disabled:opacity-40">
          {busy ? '…' : 'Ask'}
        </button>
      </div>
      {busy && <div className="font-mono text-xs text-cyan-400 animate-pulse">Searching transcript, memory and knowledge base…</div>}
      {[...history].reverse().map((h, i) => (
        <div key={i} className="border border-zinc-800 rounded-xl p-4 bg-zinc-900/40">
          <div className="text-sm text-cyan-300 mb-2" dir="auto">{h.question}</div>
          <div className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed" dir="auto">{h.answer}</div>
        </div>
      ))}
      {history.length === 0 && !busy && (
        <p className="text-sm text-zinc-600 text-center py-8">Answers cite the transcript timestamp, memory note or document they rely on.</p>
      )}
    </div>
  )
}

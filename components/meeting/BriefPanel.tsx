'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/meeting/client'
import type { Brief, OutputLanguage } from '@/lib/meeting/schema'

/**
 * Between meetings the agent works for you on its own: once a day it reviews the
 * tracker, notes and past meetings and tells you who to chase (with a draft
 * message), what is slipping, and what to prepare.
 */
export default function BriefPanel({ language, auto }: { language: OutputLanguage; auto: boolean }) {
  const [brief, setBrief] = useState<Brief | null>(null)
  const [date, setDate]   = useState('')
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  async function generate() {
    setBusy(true); setError(null)
    try {
      const r = await api<{ date: string; brief: Brief }>('/api/meeting/brief', { method: 'POST', body: JSON.stringify({ language }) })
      setBrief(r.brief); setDate(r.date)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    api<{ date: string; brief: Brief | null }>('/api/meeting/brief')
      .then(r => {
        setDate(r.date)
        if (r.brief) setBrief(r.brief)
        else if (auto) void generate()
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [copied, setCopied] = useState<number | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-zinc-500">Brief · {date}</span>
        <button onClick={generate} disabled={busy}
          className="ml-auto font-mono text-xs px-3 py-1.5 rounded border border-cyan-800 text-cyan-400 hover:bg-cyan-950/40 disabled:opacity-40">
          {busy ? 'Reviewing tracker & meetings…' : brief ? '⟳ Refresh' : 'Prepare brief'}
        </button>
      </div>
      {error && <div className="text-sm text-red-300 border border-red-900 bg-red-950/30 rounded-lg px-3 py-2">{error}</div>}
      {!brief && !busy && !error && <p className="text-sm text-zinc-600 text-center py-8">No brief yet today.</p>}
      {brief && (
        <>
          <div className="border border-cyan-900/50 rounded-xl p-5 bg-cyan-950/10 text-lg font-bold">{brief.headline}</div>

          {brief.chase.length > 0 && (
            <section className="border border-zinc-800 rounded-xl p-5 bg-zinc-900/40">
              <h3 className="font-mono text-xs tracking-widest text-zinc-400 mb-4">CHASE · {brief.chase.length}</h3>
              <div className="space-y-4">
                {brief.chase.map((c, i) => (
                  <div key={i} className="border-b border-zinc-800/70 pb-3 last:border-0">
                    <div className="text-sm text-white"><b>{c.who}</b> — {c.about}
                      {c.action_id && <span className="font-mono text-xs text-zinc-600 ml-2">{c.action_id}</span>}</div>
                    <div className="text-xs text-yellow-500 mt-0.5">{c.why_now}</div>
                    <pre className="mt-2 text-sm text-zinc-300 whitespace-pre-wrap font-sans bg-zinc-950/60 rounded p-2" dir="auto">{c.draft_message}</pre>
                    <button onClick={() => { navigator.clipboard.writeText(c.draft_message); setCopied(i); setTimeout(() => setCopied(null), 1500) }}
                      className="mt-1 font-mono text-xs px-2 py-1 rounded border border-zinc-700 hover:border-zinc-500">{copied === i ? 'Copied ✓' : 'Copy message'}</button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {brief.watch.length > 0 && (
            <section className="border border-zinc-800 rounded-xl p-5 bg-zinc-900/40">
              <h3 className="font-mono text-xs tracking-widest text-zinc-400 mb-4">WATCH · patterns across meetings</h3>
              <ul className="space-y-2 text-sm">
                {brief.watch.map((w, i) => <li key={i}>{w.item}<div className="text-xs text-zinc-500">{w.evidence}</div></li>)}
              </ul>
            </section>
          )}

          {brief.prepare.length > 0 && (
            <section className="border border-zinc-800 rounded-xl p-5 bg-zinc-900/40">
              <h3 className="font-mono text-xs tracking-widest text-zinc-400 mb-4">PREPARE</h3>
              <ul className="list-disc pl-5 space-y-1 text-sm text-zinc-300">{brief.prepare.map((p, i) => <li key={i}>{p}</li>)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}

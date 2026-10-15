'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/meeting/client'
import SetupBanner from './SetupBanner'
import type { LearningProposal, LexiconEntry, TrackedAction, VerifiedDigest } from '@/lib/meeting/schema'

type Status = {
  stats:   { workspace: string; terms: number; notes: number; openActions: number; knowledge: { name: string; size: number }[]; meetings: number }
  lexicon: LexiconEntry[]
  actions: TrackedAction[]
}
type Proposal = LearningProposal['proposals'][number]

interface Props {
  meetingId: string
  digest:    VerifiedDigest | null
  isFinal:   boolean
  /** Asks Claude for learning proposals from the current meeting. */
  propose:   () => Promise<Proposal[]>
}

const STATUS_COLOR = { open: 'text-yellow-400', blocked: 'text-red-400', done: 'text-green-400', dropped: 'text-zinc-600' } as const

export default function MemoryPanel({ meetingId, digest, isFinal, propose }: Props) {
  const [status, setStatus]       = useState<Status | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [busy, setBusy]           = useState<string | null>(null)
  const [proposals, setProposals] = useState<(Proposal & { keep: boolean })[]>([])
  const [tracked, setTracked]     = useState(false)

  const refresh = useCallback(async () => {
    try { setStatus(await api<Status>('/api/meeting/memory')); setError(null) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [])

  useEffect(() => {
    let cancelled = false
    api<Status>('/api/meeting/memory')
      .then(s => { if (!cancelled) setStatus(s) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [])

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setError(null)
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(null) }
  }

  const upload = (files: FileList) => run('upload', async () => {
    const form = new FormData()
    Array.from(files).forEach(f => form.append('files', f))
    await api('/api/meeting/knowledge', { method: 'POST', body: form })
    await refresh()
  })

  const track = () => run('track', async () => {
    await api('/api/meeting/memory', { method: 'POST', body: JSON.stringify({ op: 'track', meetingId, digest }) })
    setTracked(true)
    await refresh()
  })

  const setActionStatus = (a: TrackedAction, s: TrackedAction['status']) => run('action', async () => {
    const note = window.prompt(`Note for "${a.action}" → ${s}`, '') ?? ''
    await api('/api/meeting/memory', { method: 'POST', body: JSON.stringify({ op: 'action-status', id: a.id, status: s, note }) })
    await refresh()
  })

  const learn = () => run('learn', async () => {
    const p = await propose()
    setProposals(p.map(x => ({ ...x, keep: true })))
  })

  const saveLearnings = () => run('save', async () => {
    const items = proposals.filter(p => p.keep).map(p => ({ category: p.category, content: p.content }))
    await api('/api/meeting/memory', { method: 'POST', body: JSON.stringify({ op: 'notes', meetingId, items }) })
    setProposals([])
    await refresh()
  })

  const btn = 'font-mono text-xs px-3 py-1.5 rounded border transition-colors disabled:opacity-40'
  const box = 'border border-zinc-800 rounded-xl p-5 bg-zinc-900/40'
  const title = 'font-mono text-xs tracking-widest text-zinc-400 mb-3'
  const open = status?.actions.filter(a => a.status === 'open' || a.status === 'blocked') ?? []

  return (
    <div className="space-y-4">
      {error && <div className="text-sm text-red-300 border border-red-900 bg-red-950/30 rounded-lg px-3 py-2">{error}</div>}

      <SetupBanner settings />
      {status && (
        <div className="text-xs text-zinc-500 font-mono break-all">
          Workspace: {status.stats.workspace} · {status.stats.meetings} meetings · {status.stats.terms} confirmed terms · {status.stats.notes} notes · {status.stats.openActions} open actions
        </div>
      )}

      <section className={box}>
        <div className={title}>AFTER THE MEETING</div>
        <div className="flex flex-wrap gap-2">
          <button onClick={track} disabled={!isFinal || !digest || tracked || !!busy}
            className={`${btn} border-green-800 text-green-400 hover:bg-green-950/40`}>
            {tracked ? 'Actions tracked ✓' : busy === 'track' ? 'Saving…' : 'Save actions to tracker'}
          </button>
          <button onClick={learn} disabled={!!busy}
            className={`${btn} border-cyan-800 text-cyan-400 hover:bg-cyan-950/40`}>
            {busy === 'learn' ? 'Thinking…' : 'Propose learnings'}
          </button>
        </div>
        {!isFinal && <p className="text-xs text-zinc-600 mt-2">Run the final digest first to track actions.</p>}

        {proposals.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-zinc-500">Untick anything wrong. Only ticked items are remembered.</p>
            {proposals.map((p, i) => (
              <label key={i} className="flex gap-2 items-start text-sm cursor-pointer">
                <input type="checkbox" className="mt-1" checked={p.keep}
                  onChange={e => setProposals(ps => ps.map((x, j) => j === i ? { ...x, keep: e.target.checked } : x))} />
                <span>
                  <span className="font-mono text-xs text-cyan-500 mr-1">[{p.category}]</span>{p.content}
                  <span className="block text-xs text-zinc-600" dir="auto">{p.evidence}</span>
                </span>
              </label>
            ))}
            <button onClick={saveLearnings} disabled={!!busy || !proposals.some(p => p.keep)}
              className={`${btn} border-green-800 text-green-400 hover:bg-green-950/40`}>Remember ticked items</button>
          </div>
        )}
      </section>

      <section className={box}>
        <div className={title}>ACTION TRACKER · {open.length} open</div>
        {open.length === 0 && <p className="text-sm text-zinc-600">No open actions.</p>}
        <div className="space-y-2">
          {open.map(a => (
            <div key={a.id} className="text-sm border-b border-zinc-800/70 pb-2 last:border-0">
              <div><span className={`font-mono text-xs mr-2 ${STATUS_COLOR[a.status]}`}>[{a.status}]</span>{a.action}</div>
              <div className="font-mono text-xs text-zinc-500">👤 {a.owner ?? '—'} · 📅 {a.due ?? '—'} · {a.meeting}</div>
              <div className="flex gap-1 mt-1">
                {(['done', 'blocked', 'open', 'dropped'] as const).filter(s => s !== a.status).map(s => (
                  <button key={s} onClick={() => setActionStatus(a, s)} disabled={!!busy}
                    className="font-mono text-[11px] px-2 py-0.5 rounded border border-zinc-800 text-zinc-500 hover:text-zinc-300">{s}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={box}>
        <div className={title}>KNOWLEDGE BASE · {status?.stats.knowledge.length ?? 0} files</div>
        <p className="text-xs text-zinc-500 mb-3">
          Project docs, org charts, contracts, glossaries (md, txt, pdf, csv, json). The agent searches them when it digests and answers.
          You can also copy files straight into the workspace&apos;s knowledge folder.
        </p>
        <label className={`${btn} border-zinc-700 text-zinc-300 hover:border-zinc-500 cursor-pointer inline-block`}>
          {busy === 'upload' ? 'Uploading…' : '⇪ Add documents'}
          <input type="file" multiple accept=".md,.txt,.pdf,.csv,.json" className="hidden"
            onChange={e => { if (e.target.files?.length) upload(e.target.files); e.target.value = '' }} />
        </label>
        <ul className="mt-3 text-xs text-zinc-400 space-y-0.5">
          {status?.stats.knowledge.map(f => <li key={f.name}>📄 {f.name} <span className="text-zinc-600">{Math.ceil(f.size / 1024)} KB</span></li>)}
        </ul>
      </section>

      <section className={box}>
        <div className={title}>CONFIRMED NAMES & JARGON · {status?.lexicon.filter(l => l.kind !== 'ignore').length ?? 0}</div>
        <div className="space-y-1 text-sm max-h-64 overflow-y-auto">
          {status?.lexicon.filter(l => l.kind !== 'ignore').map((l, i) => (
            <div key={i} className="flex flex-wrap gap-x-2">
              <span className="text-white">{l.canonical}</span>
              {l.arabic && <span className="text-zinc-300" dir="rtl">{l.arabic}</span>}
              <span className="font-mono text-xs text-zinc-600">{l.kind}</span>
              {l.meaning && <span className="text-xs text-zinc-500">{l.meaning}</span>}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

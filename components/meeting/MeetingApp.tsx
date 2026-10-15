'use client'

import { useEffect, useRef, useState } from 'react'
import { ChunkRecorder, chunkFile, SAMPLE_RATE, type CaptureSource } from '@/lib/meeting/audio'
import { formatTime }  from '@/lib/meeting/prompts'
import { toMarkdown }  from '@/lib/meeting/export'
import { api, applyTerm, KEY_STORE } from '@/lib/meeting/client'
import type {
  LearningProposal, LexiconEntry, MeetingContext, RefinedSegment, UnknownTerm, VerifiedDigest,
} from '@/lib/meeting/schema'
import DigestView   from './DigestView'
import ConfirmTerms from './ConfirmTerms'
import AskPanel, { type QA } from './AskPanel'
import MemoryPanel  from './MemoryPanel'

const LIVE_DIGEST_EVERY = 5 * 60   // seconds of new audio between automatic live digests
const STORE = {
  ctx: 'meeting:ctx', segments: 'meeting:segments', digest: 'meeting:digest',
  id: 'meeting:id', terms: 'meeting:terms', qa: 'meeting:qa',
}

const EMPTY_CTX: MeetingContext = { title: '', participants: '', project: '', glossary: '', myRole: '', language: 'fr' }

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) as T : fallback
  } catch { return fallback }
}
function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage full or blocked */ }
}
function newMeetingId() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

type Digest = { data: VerifiedDigest; mode: 'live' | 'final' }
type FailedChunk = { wav: Blob; offset: number; error: string }
type Tab = 'digest' | 'ask' | 'memory'

export default function MeetingApp() {
  const [meetingId, setMeetingId] = useState<string>(() => load(STORE.id, '') || newMeetingId())
  const [ctx, setCtx]             = useState<MeetingContext>(() => load(STORE.ctx, EMPTY_CTX))
  const [accessKey, setAccessKey] = useState<string>(() => load(KEY_STORE, ''))
  const [segments, setSegments]   = useState<RefinedSegment[]>(() => load(STORE.segments, []))
  const [digest, setDigest]       = useState<Digest | null>(() => load(STORE.digest, null))
  const [terms, setTerms]         = useState<UnknownTerm[]>(() => load(STORE.terms, []))
  const [qa, setQa]               = useState<QA[]>(() => load(STORE.qa, []))
  const [recording, setRecording] = useState<CaptureSource | null>(null)
  const [pending, setPending]     = useState(0)
  const [failed, setFailed]       = useState<FailedChunk[]>([])
  const [digestBusy, setDigestBusy] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [view, setView]           = useState<'both' | 'original' | 'translation'>('both')
  const [autoLive, setAutoLive]   = useState(true)
  const [level, setLevel]         = useState(0)
  const [showSetup, setShowSetup] = useState(true)
  const [tab, setTab]             = useState<Tab>('digest')

  const recorderRef   = useRef<ChunkRecorder | null>(null)
  const queueRef      = useRef<Promise<void>>(Promise.resolve())
  const segmentsRef   = useRef(segments)
  const termsRef      = useRef(terms)
  const ctxRef        = useRef(ctx)
  const idRef         = useRef(meetingId)
  const audioEndRef   = useRef(segments.length ? segments[segments.length - 1].start + 30 : 0)
  const lastDigestRef = useRef(0)
  const digestBusyRef = useRef(false)
  const autoLiveRef   = useRef(autoLive)
  const recordingRef  = useRef(recording)

  useEffect(() => { ctxRef.current = ctx; save(STORE.ctx, ctx) }, [ctx])
  useEffect(() => { save(KEY_STORE, accessKey) }, [accessKey])
  useEffect(() => { idRef.current = meetingId; save(STORE.id, meetingId) }, [meetingId])
  useEffect(() => { save(STORE.segments, segments) }, [segments])
  useEffect(() => { termsRef.current = terms; save(STORE.terms, terms) }, [terms])
  useEffect(() => { save(STORE.digest, digest) }, [digest])
  useEffect(() => { save(STORE.qa, qa) }, [qa])
  useEffect(() => { autoLiveRef.current = autoLive }, [autoLive])
  useEffect(() => { recordingRef.current = recording }, [recording])

  // VU meter
  useEffect(() => {
    if (!recording) return
    const id = setInterval(() => setLevel(recorderRef.current?.level ?? 0), 120)
    return () => clearInterval(id)
  }, [recording])

  function updateSegments(next: RefinedSegment[]) {
    segmentsRef.current = next
    setSegments(next)
  }

  // ── Digest ──────────────────────────────────────────────────────────────

  async function runDigest(mode: 'live' | 'final') {
    if (digestBusyRef.current || segmentsRef.current.length === 0) return
    digestBusyRef.current = true
    setDigestBusy(true)
    setError(null)
    try {
      const data = await api<VerifiedDigest>('/api/meeting/digest', {
        method: 'POST',
        body: JSON.stringify({
          meetingId: idRef.current, segments: segmentsRef.current, context: ctxRef.current, mode,
          pendingTerms: termsRef.current.map(t => t.heard),
        }),
      })
      setDigest({ data, mode })
      lastDigestRef.current = audioEndRef.current
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      digestBusyRef.current = false
      setDigestBusy(false)
    }
  }

  // ── Chunk pipeline (sequential, so each chunk sees the previous one for speaker continuity) ──

  async function processChunk(wav: Blob, offset: number) {
    const form = new FormData()
    form.append('audio', wav, 'chunk.wav')
    form.append('offset', String(offset))
    form.append('context', JSON.stringify(ctxRef.current))
    form.append('previous', JSON.stringify(segmentsRef.current.slice(-8)))

    let lastErr = ''
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const data = await api<{ segments: RefinedSegment[]; unknown_terms: UnknownTerm[] }>(
          '/api/meeting/chunk', { method: 'POST', body: form })
        updateSegments([...segmentsRef.current, ...data.segments].sort((a, b) => a.start - b.start))

        const seen = new Set(termsRef.current.map(t => t.heard.toLowerCase()))
        const fresh = data.unknown_terms.filter(t => !seen.has(t.heard.toLowerCase()))
        if (fresh.length) setTerms(ts => [...ts, ...fresh])

        const audioSeconds = (wav.size - 44) / 2 / SAMPLE_RATE
        audioEndRef.current = Math.max(audioEndRef.current, offset + audioSeconds)
        if (recordingRef.current && autoLiveRef.current
            && audioEndRef.current - lastDigestRef.current >= LIVE_DIGEST_EVERY) {
          void runDigest('live')
        }
        return
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e)
        if (lastErr.includes('access key')) break
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1)))
      }
    }
    setFailed(f => [...f, { wav, offset, error: lastErr }])
  }

  function enqueue(wav: Blob, offset: number) {
    setPending(p => p + 1)
    queueRef.current = queueRef.current
      .then(() => processChunk(wav, offset))
      .finally(() => setPending(p => p - 1))
  }

  function retryFailed() {
    const items = failed
    setFailed([])
    items.forEach(f => enqueue(f.wav, f.offset))
  }

  // ── Capture ─────────────────────────────────────────────────────────────

  async function start(source: CaptureSource) {
    setError(null)
    const rec = new ChunkRecorder(enqueue)
    try {
      await rec.start(source, audioEndRef.current)
      recorderRef.current = rec
      setRecording(source)
      setShowSetup(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function stop() {
    recorderRef.current?.stop()
    recorderRef.current = null
    setRecording(null)
    setLevel(0)
  }

  async function upload(file: File) {
    setError(null)
    setShowSetup(false)
    // Append after anything already transcribed; captured once so offsets don't drift as chunks land
    const base = audioEndRef.current
    try {
      await chunkFile(file, (wav, offset) => enqueue(wav, base + offset))
    } catch (e) {
      setError(`Could not decode this file: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // ── Names & jargon ──────────────────────────────────────────────────────

  async function confirmTerm(term: UnknownTerm, entry: LexiconEntry) {
    try {
      await api('/api/meeting/memory', { method: 'POST', body: JSON.stringify({ op: 'lexicon', entry }) })
      updateSegments(applyTerm(segmentsRef.current, term.heard, entry))
      setTerms(ts => ts.filter(t => t.heard.toLowerCase() !== term.heard.toLowerCase()))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function ignoreTerm(term: UnknownTerm) {
    const entry: LexiconEntry = { canonical: term.heard, arabic: null, kind: 'ignore', meaning: null, variants: [term.heard] }
    await confirmTerm(term, entry)
  }

  function renameSpeaker(from: string) {
    const to = window.prompt(`Rename "${from}" to:`, from)?.trim()
    if (!to || to === from) return
    updateSegments(segmentsRef.current.map(s => s.speaker === from ? { ...s, speaker: to } : s))
  }

  // ── Q&A and learning ────────────────────────────────────────────────────

  async function ask(question: string) {
    setError(null)
    try {
      const { answer } = await api<{ answer: string }>('/api/meeting/ask', {
        method: 'POST',
        body: JSON.stringify({ meetingId: idRef.current, question, segments: segmentsRef.current, context: ctxRef.current }),
      })
      setQa(h => [...h, { question, answer }])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function proposeLearnings() {
    const out = await api<LearningProposal>('/api/meeting/learn', {
      method: 'POST',
      body: JSON.stringify({ meetingId: idRef.current, segments: segmentsRef.current, digest: digest?.data ?? null, context: ctxRef.current }),
    })
    return out.proposals
  }

  // ── Misc ────────────────────────────────────────────────────────────────

  function exportMarkdown() {
    if (!digest) return
    const md = toMarkdown(digest.data, segments, ctx)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }))
    a.download = `${meetingId}-${(ctx.title || 'meeting').replace(/[^\w-]+/g, '_')}.md`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function newMeeting() {
    if (recording || pending) return
    if (segments.length && !window.confirm('Start a new meeting? The current one stays saved in the workspace if you ran the final digest.')) return
    updateSegments([])
    audioEndRef.current = 0
    lastDigestRef.current = 0
    setDigest(null)
    setFailed([])
    setTerms([])
    setQa([])
    setMeetingId(newMeetingId())
    setCtx(c => ({ ...c, title: '' }))
    setShowSetup(true)
    setTab('digest')
  }

  const transcriptEnd = useRef<HTMLDivElement>(null)
  useEffect(() => { transcriptEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [segments.length])

  const field = 'w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600'
  const btn   = 'font-mono text-xs px-3 py-2 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <main className="min-h-screen flex flex-col">
      <nav className="border-b border-zinc-800 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
        <span className="font-mono text-sm text-zinc-400 tracking-widest">MEETING COPILOT <span className="text-zinc-600 text-xs">{meetingId}</span></span>
        <div className="flex items-center gap-2 flex-wrap">
          {recording ? (
            <>
              <span className="flex items-center gap-2 font-mono text-xs text-red-400">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                REC
                <span className="inline-block w-16 h-1.5 bg-zinc-800 rounded overflow-hidden">
                  <span className="block h-full bg-green-500" style={{ width: `${Math.min(100, level * 400)}%` }} />
                </span>
              </span>
              <button onClick={stop} className={`${btn} border-red-800 text-red-400 hover:bg-red-950/40`}>■ Stop</button>
            </>
          ) : (
            <>
              <button onClick={() => start('mic')} className={`${btn} border-green-800 text-green-400 hover:bg-green-950/40`}>● Mic (in-room)</button>
              <button onClick={() => start('mic+tab')} className={`${btn} border-green-800 text-green-400 hover:bg-green-950/40`}>● Mic + call tab</button>
              <label className={`${btn} border-zinc-700 text-zinc-300 hover:border-zinc-500 cursor-pointer`}>
                ⇪ Upload recording
                <input type="file" accept="audio/*,video/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
              </label>
            </>
          )}
          <button onClick={newMeeting} disabled={!!recording || pending > 0} className={`${btn} border-zinc-800 text-zinc-500 hover:border-zinc-600`}>New</button>
        </div>
      </nav>

      {error && (
        <div className="mx-4 sm:mx-6 mt-4 border border-red-900 bg-red-950/30 text-red-300 text-sm rounded-lg px-4 py-2 flex justify-between gap-3">
          <span>{error}</span><button onClick={() => setError(null)} className="text-red-500">✕</button>
        </div>
      )}

      <div className="flex-1 grid lg:grid-cols-2 gap-4 p-4 sm:p-6 min-h-0">
        {/* ── Left: setup + names to confirm + transcript ── */}
        <div className="flex flex-col gap-4 min-w-0">
          <section className="border border-zinc-800 rounded-xl bg-zinc-900/40">
            <button onClick={() => setShowSetup(s => !s)} className="w-full text-left px-5 py-3 font-mono text-xs tracking-widest text-zinc-400 flex justify-between">
              <span>CONTEXT {ctx.title && <span className="text-zinc-200 normal-case tracking-normal">· {ctx.title}</span>}</span>
              <span>{showSetup ? '−' : '+'}</span>
            </button>
            {showSetup && (
              <div className="px-5 pb-5 grid gap-3">
                <p className="text-xs text-zinc-500">
                  Confirmed names, your knowledge base and past meetings are used automatically. Add anything specific to this meeting here.
                </p>
                <input className={field} placeholder="Meeting title" value={ctx.title} onChange={e => setCtx({ ...ctx, title: e.target.value })} />
                <input className={field} placeholder="Participants & roles — e.g. Karim (PM), Salma (DSI client), moi (architecte)" value={ctx.participants} onChange={e => setCtx({ ...ctx, participants: e.target.value })} />
                <input className={field} placeholder="My role / what I want from this meeting" value={ctx.myRole} onChange={e => setCtx({ ...ctx, myRole: e.target.value })} />
                <textarea className={field} rows={3} placeholder="Project background: goals, stakeholders, deadlines, known issues…" value={ctx.project} onChange={e => setCtx({ ...ctx, project: e.target.value })} />
                <textarea className={field} rows={2} placeholder="Extra glossary for this meeting (comma-separated)" value={ctx.glossary} onChange={e => setCtx({ ...ctx, glossary: e.target.value })} />
                <div className="flex flex-wrap gap-3 items-center">
                  <label className="text-xs text-zinc-500 font-mono">Output
                    <select className="ml-2 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-200" value={ctx.language}
                      onChange={e => setCtx({ ...ctx, language: e.target.value as MeetingContext['language'] })}>
                      <option value="fr">Français</option>
                      <option value="en">English</option>
                    </select>
                  </label>
                  <input type="password" className={`${field} flex-1 min-w-40`} placeholder="Access key (if MEETING_ACCESS_KEY is set)" value={accessKey} onChange={e => setAccessKey(e.target.value)} />
                </div>
                <p className="text-xs text-zinc-600">⚖️ Tell participants the meeting is being recorded and transcribed.</p>
              </div>
            )}
          </section>

          <ConfirmTerms terms={terms} onConfirm={confirmTerm} onIgnore={ignoreTerm} />

          <section className="border border-zinc-800 rounded-xl bg-zinc-900/40 flex flex-col min-h-[320px] lg:max-h-[calc(100vh-11rem)]">
            <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between gap-2 flex-wrap">
              <span className="font-mono text-xs tracking-widest text-zinc-400">
                TRANSCRIPT <span className="text-zinc-600">· {segments.length}</span>
                {pending > 0 && <span className="text-cyan-400 ml-2">processing {pending}…</span>}
              </span>
              <div className="flex gap-1 font-mono text-xs">
                {(['both', 'original', 'translation'] as const).map(v => (
                  <button key={v} onClick={() => setView(v)}
                    className={`px-2 py-1 rounded ${view === v ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>{v}</button>
                ))}
              </div>
            </div>
            {failed.length > 0 && (
              <div className="mx-5 mt-3 text-xs text-yellow-400 border border-yellow-900/60 bg-yellow-950/20 rounded px-3 py-2 flex justify-between gap-3">
                <span>{failed.length} chunk(s) failed: {failed[failed.length - 1].error}</span>
                <button onClick={retryFailed} className="underline shrink-0">Retry</button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
              {segments.length === 0 && (
                <p className="text-sm text-zinc-600 py-10 text-center">
                  Start recording or upload a recording. Text appears about every 45 seconds.
                </p>
              )}
              {segments.map((s, i) => (
                <div key={i} className={`text-sm ${s.uncertain ? 'border-l-2 border-yellow-700/70 pl-2' : ''}`}>
                  <div className="flex gap-2 items-baseline">
                    <span className="font-mono text-xs text-zinc-600">{formatTime(s.start)}</span>
                    <button onClick={() => renameSpeaker(s.speaker)} title="Click to rename this speaker everywhere"
                      className="font-mono text-xs text-cyan-500 hover:underline">{s.speaker}</button>
                  </div>
                  {view !== 'translation' && <div className="text-zinc-100" dir="auto">{s.original}</div>}
                  {view !== 'original' && s.translation && (
                    <div className={view === 'both' ? 'text-zinc-500 text-xs mt-0.5' : 'text-zinc-100'}>{s.translation}</div>
                  )}
                  {s.note && <div className="text-xs text-yellow-600 mt-0.5">ⓘ {s.note}</div>}
                </div>
              ))}
              <div ref={transcriptEnd} />
            </div>
          </section>
        </div>

        {/* ── Right: digest / ask / memory ── */}
        <div className="flex flex-col gap-4 min-w-0 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
          <div className="flex gap-1 font-mono text-xs border-b border-zinc-800">
            {([['digest', 'Digest'], ['ask', `Ask${qa.length ? ` · ${qa.length}` : ''}`], ['memory', 'Memory & tracker']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`px-3 py-2 -mb-px border-b-2 ${tab === k ? 'border-cyan-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>{label}</button>
            ))}
          </div>

          {tab === 'digest' && (
            <>
              <div className="flex flex-wrap gap-2 items-center">
                <button onClick={() => runDigest('live')} disabled={digestBusy || segments.length === 0}
                  className={`${btn} border-cyan-800 text-cyan-400 hover:bg-cyan-950/40`}>⟳ Digest so far</button>
                <button onClick={() => runDigest('final')} disabled={digestBusy || segments.length === 0 || pending > 0}
                  className={`${btn} border-green-800 text-green-400 hover:bg-green-950/40`}>✓ Final digest</button>
                <button onClick={exportMarkdown} disabled={!digest}
                  className={`${btn} border-zinc-700 text-zinc-300 hover:border-zinc-500`}>↓ Markdown</button>
                <label className="font-mono text-xs text-zinc-500 flex items-center gap-1.5 ml-auto">
                  <input type="checkbox" checked={autoLive} onChange={e => setAutoLive(e.target.checked)} />
                  auto every 5 min
                </label>
              </div>
              {terms.length > 0 && (
                <div className="text-xs text-yellow-500">
                  {terms.length} name(s)/term(s) not confirmed yet — they will appear with “(?)”. Confirm them on the left for a clean final digest.
                </div>
              )}
              {digestBusy && <div className="font-mono text-xs text-cyan-400 animate-pulse">Analysing the meeting… (the final digest searches your knowledge base and can take 2–4 minutes)</div>}
              {digest
                ? <DigestView digest={digest.data} live={digest.mode === 'live'} />
                : !digestBusy && (
                  <div className="border border-dashed border-zinc-800 rounded-xl p-10 text-center text-sm text-zinc-600">
                    Action items, decisions, risks, execution plan and management report will appear here.
                  </div>
                )}
            </>
          )}

          {tab === 'ask' && <AskPanel history={qa} onAsk={ask} />}

          {tab === 'memory' && (
            <MemoryPanel meetingId={meetingId} digest={digest?.data ?? null} isFinal={digest?.mode === 'final'} propose={proposeLearnings} />
          )}
        </div>
      </div>
    </main>
  )
}

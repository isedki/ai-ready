'use client'

import { useChat }         from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useState, useRef, useEffect, useCallback } from 'react'
import DimensionPanel      from './DimensionPanel'
import ExecutiveBrief      from './ExecutiveBrief'
import { DIMENSION_ORDER } from '@/lib/assessment/prompts'
import type { DimensionKey, AssessmentResult } from '@/lib/assessment/schema'

interface DimScore {
  dimension:   DimensionKey
  score:       number
  confidence:  'low' | 'medium' | 'high'
  key_finding: string
}

export default function ChatInterface() {
  const [scores, setScores]           = useState<DimScore[]>([])
  const [companySize, setCompanySize] = useState('scaleup')
  const [current, setCurrent]         = useState<DimensionKey | null>(null)
  const [evidencePaste, setEvidence]  = useState('')
  const [showEvidence, setShowEvid]   = useState(false)
  const [synthesizing, setSynth]      = useState(false)
  const [result, setResult]           = useState<AssessmentResult | null>(null)
  const [synthError, setSynthError]   = useState<string | null>(null)
  const [input, setInput]             = useState('')
  const bottomRef                     = useRef<HTMLDivElement>(null)
  const inputRef                      = useRef<HTMLInputElement>(null)

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
    onToolCall({ toolCall }) {
      const name = (toolCall as any).toolName as string
      const args = (toolCall as any).input as any
      if (name === 'score_dimension') {
        setScores(prev => {
          const exists = prev.find(s => s.dimension === args.dimension)
          if (exists) return prev
          const updated = [...prev, {
            dimension:   args.dimension,
            score:       args.score,
            confidence:  args.confidence,
            key_finding: args.key_finding,
          }]
          const nextDim = DIMENSION_ORDER.find(d => !updated.map(s => s.dimension).includes(d)) ?? null
          setCurrent(nextDim as DimensionKey | null)
          return updated
        })
      }
      if (name === 'extract_profile') {
        if (args.size) setCompanySize(args.size)
      }
      if (name === 'request_evidence') {
        setShowEvid(true)
      }
    },
  })

  const isLoading = status === 'streaming' || status === 'submitted'

  // Scroll to bottom on new messages
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Set initial current dimension
  useEffect(() => {
    if (messages.length === 0) setCurrent(null)
  }, [messages.length])

  const allDone = scores.length === 5

  const handleEvidenceSubmit = () => {
    if (!evidencePaste.trim()) return
    sendMessage({ text: `[EVIDENCE PASTED]\n\n${evidencePaste}` })
    setEvidence('')
    setShowEvid(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    sendMessage({ text: input })
    setInput('')
  }

  const handleSynthesize = async () => {
    setSynth(true)
    setSynthError(null)
    try {
      const res = await fetch('/api/synthesize', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setResult(await res.json())
    } catch (err) {
      setSynthError(err instanceof Error ? err.message : 'Synthesis failed')
    } finally {
      setSynth(false)
    }
  }

  const handleRetake = useCallback(() => {
    setResult(null)
    setScores([])
    setCurrent(null)
    setCompanySize('scaleup')
    setSynthError(null)
    window.location.reload()
  }, [])

  if (result) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white p-4 sm:p-8">
        <ExecutiveBrief result={result} onRetake={handleRetake} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col lg:flex-row">
      {/* Chat column */}
      <div className="flex-1 flex flex-col max-h-screen">
        {/* Header */}
        <div className="border-b border-zinc-800 px-4 py-3 flex items-center gap-3 flex-shrink-0">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="font-mono text-sm text-zinc-400 tracking-wider">AI READINESS INTERVIEW</span>
          {scores.length > 0 && (
            <span className="ml-auto text-xs font-mono text-zinc-600">
              {scores.length}/5 dimensions
            </span>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3 max-w-sm">
                <div className="text-3xl">🎯</div>
                <p className="text-zinc-500 font-mono text-sm leading-relaxed">
                  An AI analyst will interview you about your organisation's readiness to deploy AI to production.
                </p>
                <p className="text-zinc-700 font-mono text-xs">
                  ~15 minutes · 5 dimensions · honest assessment
                </p>
                <button
                  onClick={() => sendMessage({ text: 'Start my AI readiness assessment.' })}
                  className="mt-4 px-6 py-3 rounded-lg border border-green-900/50 bg-green-950/20 text-green-400 font-mono text-sm hover:border-green-700/60 hover:bg-green-950/30 transition-all"
                >
                  Begin Assessment →
                </button>
              </div>
            </div>
          )}

          {messages.map((m, i) => {
            const isUser = m.role === 'user'

            // Extract text from parts (v4 UIMessage format)
            const text = m.parts
              .filter((p: any) => p.type === 'text')
              .map((p: any) => p.text)
              .join('')

            // Skip messages with no visible text (tool-only turns)
            if (!text && !isUser) return null

            // Don't render evidence dumps in full
            const display = text?.startsWith('[EVIDENCE PASTED]')
              ? '📎 Evidence submitted — analyzing...'
              : text

            if (!display) return null

            return (
              <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                {!isUser && (
                  <div className="w-7 h-7 rounded-full bg-cyan-950 border border-cyan-800 flex items-center justify-center text-xs mr-2 flex-shrink-0 mt-1">
                    🤖
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    isUser
                      ? 'bg-zinc-800 text-zinc-200 rounded-tr-sm'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-tl-sm'
                  }`}
                >
                  {display}
                </div>
              </div>
            )
          })}

          {isLoading && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-full bg-cyan-950 border border-cyan-800 flex items-center justify-center text-xs mr-2 flex-shrink-0 mt-1">🤖</div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl rounded-tl-sm px-4 py-3">
                <div className="flex gap-1">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 bg-cyan-700 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Evidence paste area */}
        {showEvidence && (
          <div className="border-t border-zinc-800 px-4 py-3 bg-zinc-900/50">
            <div className="text-xs font-mono text-cyan-600 mb-2">📎 Paste artifact (job description, tech stack, org structure…)</div>
            <textarea
              value={evidencePaste}
              onChange={e => setEvidence(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 font-mono resize-none focus:outline-none focus:border-cyan-700"
              rows={4}
              placeholder="Paste any relevant document, description, or data here…"
            />
            <div className="flex gap-2 mt-2">
              <button onClick={handleEvidenceSubmit} className="px-4 py-2 bg-cyan-950 border border-cyan-800 text-cyan-400 rounded-lg font-mono text-xs hover:bg-cyan-900/30 transition-all">
                Submit Evidence
              </button>
              <button onClick={() => setShowEvid(false)} className="px-4 py-2 text-zinc-600 font-mono text-xs hover:text-zinc-400 transition-all">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-zinc-800 px-4 py-3 flex-shrink-0">
          {allDone && !result ? (
            <div className="space-y-2">
              {synthError && <p className="text-xs text-red-500 font-mono">{synthError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleSynthesize}
                  disabled={synthesizing}
                  className="flex-1 py-3 rounded-lg border border-green-700/60 bg-green-950/20 text-green-400 font-mono text-sm hover:bg-green-950/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {synthesizing ? '⏳ Generating executive brief…' : '▶ Generate Executive Brief'}
                </button>
                <button onClick={() => setShowEvid(v => !v)} className="px-3 py-3 border border-zinc-700 rounded-lg text-zinc-500 hover:text-zinc-300 transition-all" title="Add more context">
                  📎
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowEvid(v => !v)}
                className="p-2.5 border border-zinc-800 rounded-lg text-zinc-600 hover:text-zinc-400 transition-all flex-shrink-0"
                title="Paste evidence"
              >
                📎
              </button>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={messages.length === 0 ? 'Press Begin or type here…' : 'Your answer…'}
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-700 font-mono focus:outline-none focus:border-zinc-600 transition-colors"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 font-mono text-sm hover:bg-zinc-700 transition-all disabled:opacity-40"
              >
                →
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Scoring panel (desktop) */}
      <div className="hidden lg:flex w-72 border-l border-zinc-800 p-4 flex-col bg-zinc-950">
        <div className="text-xs font-mono tracking-widest text-zinc-600 mb-4">LIVE SCORING</div>
        <DimensionPanel scores={scores} current={current} companySize={companySize} />
      </div>

      {/* Scoring panel (mobile — bottom drawer) */}
      {scores.length > 0 && (
        <div className="lg:hidden border-t border-zinc-800 px-4 py-3 bg-zinc-950">
          <div className="text-xs font-mono text-zinc-600 mb-3 tracking-wider">SCORES SO FAR</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {scores.map(s => {
              const color = s.score >= 75 ? '#00ff41' : s.score >= 50 ? '#ffd700' : s.score >= 25 ? '#ff9944' : '#ff5555'
              return (
                <div key={s.dimension} className="flex-shrink-0 text-center border border-zinc-800 rounded-lg p-2 min-w-[56px]">
                  <div className="text-xs font-mono" style={{ color }}>{s.score}</div>
                  <div className="text-xs text-zinc-600">{s.dimension}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

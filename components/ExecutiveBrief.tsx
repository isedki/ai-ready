'use client'

import { useState }              from 'react'
import type { AssessmentResult } from '@/lib/assessment/schema'
import { DIMENSION_META }        from '@/lib/assessment/prompts'
import { getPeerCount }          from '@/lib/assessment/benchmarks'

const TIER_META = {
  not_ready:   { label: 'Not Ready',    color: '#ff5555', bg: 'rgba(255,85,85,0.08)',   border: 'rgba(255,85,85,0.25)'   },
  foundations: { label: 'Foundations',  color: '#ff9944', bg: 'rgba(255,153,68,0.08)',  border: 'rgba(255,153,68,0.25)'  },
  emerging:    { label: 'Emerging',     color: '#ffd700', bg: 'rgba(255,215,0,0.08)',   border: 'rgba(255,215,0,0.25)'   },
  ready:       { label: 'Ready',        color: '#00d4ff', bg: 'rgba(0,212,255,0.08)',   border: 'rgba(0,212,255,0.25)'   },
  leading:     { label: 'Leading',      color: '#00ff41', bg: 'rgba(0,255,65,0.08)',    border: 'rgba(0,255,65,0.25)'    },
}

interface Props { result: AssessmentResult; onRetake: () => void }

export default function ExecutiveBrief({ result, onRetake }: Props) {
  const [copied, setCopied] = useState(false)
  const tier    = TIER_META[result.tier]
  const peers   = getPeerCount(result.company.size)

  const shareText = `AI Readiness Assessment Result\n\n${result.exec_headline}\n\nOverall: ${result.overall_score}/100 (${tier.label})\nBenchmark: top ${100 - result.benchmark_percentile + 1}% of ${result.company.size} companies\n\nAssessed by ai-ready.vercel.app`

  const handleCopy = () => {
    navigator.clipboard.writeText(shareText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="border rounded-xl p-6" style={{ borderColor: tier.border, background: tier.bg }}>
        <div className="text-xs font-mono tracking-widest mb-3" style={{ color: tier.color }}>
          AI READINESS ASSESSMENT · EXECUTIVE BRIEF
        </div>
        <div className="text-2xl font-bold text-white mb-2 leading-tight">
          {result.exec_headline}
        </div>
        <div className="flex flex-wrap gap-3 mt-4">
          <div className="flex items-center gap-2">
            <span className="text-4xl font-mono font-bold" style={{ color: tier.color }}>
              {result.overall_score}
            </span>
            <div>
              <div className="text-xs text-zinc-500 font-mono">OVERALL</div>
              <div className="text-sm font-bold" style={{ color: tier.color }}>{tier.label}</div>
            </div>
          </div>
          <div className="h-12 w-px bg-zinc-700 self-center hidden sm:block" />
          <div>
            <div className="text-xs text-zinc-500 font-mono">BENCHMARK</div>
            <div className="text-sm text-white font-mono">
              Top {100 - result.benchmark_percentile + 1}%
              <span className="text-zinc-600 ml-1">of {peers} similar cos.</span>
            </div>
          </div>
          <div className="h-12 w-px bg-zinc-700 self-center hidden sm:block" />
          <div>
            <div className="text-xs text-zinc-500 font-mono">TIME TO PROD</div>
            <div className="text-sm text-zinc-300 font-mono">{result.time_to_production}</div>
          </div>
        </div>
      </div>

      {/* Dimension scores */}
      <div>
        <div className="text-xs font-mono tracking-widest text-zinc-500 mb-3">DIMENSION BREAKDOWN</div>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
          {result.dimensions.map(d => {
            const meta  = DIMENSION_META[d.dimension]
            const color = d.score >= 75 ? '#00ff41' : d.score >= 50 ? '#ffd700' : d.score >= 25 ? '#ff9944' : '#ff5555'
            return (
              <div key={d.dimension} className="border border-zinc-800 rounded-lg p-3 bg-zinc-950 text-center">
                <div className="text-xl mb-1">{meta.icon}</div>
                <div className="text-xs text-zinc-500 font-mono mb-1">{meta.label.toUpperCase()}</div>
                <div className="text-xl font-bold font-mono" style={{ color }}>{d.score}</div>
                <div className="h-1 bg-zinc-800 rounded mt-2">
                  <div className="h-full rounded transition-all" style={{ width: `${d.score}%`, background: color }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Narrative */}
      <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-950">
        <div className="text-xs font-mono tracking-widest text-zinc-500 mb-4">ANALYST NARRATIVE</div>
        <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap font-serif">
          {result.exec_narrative}
        </div>
      </div>

      {/* Blockers + Quick wins */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="border border-red-900/30 rounded-xl p-4 bg-red-950/10">
          <div className="text-xs font-mono tracking-widest text-red-500 mb-3">TOP BLOCKERS</div>
          <ol className="space-y-2">
            {result.top_blockers.map((b, i) => (
              <li key={i} className="flex gap-2 text-sm text-zinc-400">
                <span className="text-red-600 font-mono font-bold flex-shrink-0">{i + 1}.</span>
                <span>{b}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="border border-green-900/30 rounded-xl p-4 bg-green-950/10">
          <div className="text-xs font-mono tracking-widest text-green-500 mb-3">QUICK WINS (30 DAYS)</div>
          <ol className="space-y-2">
            {result.quick_wins.map((w, i) => (
              <li key={i} className="flex gap-2 text-sm text-zinc-400">
                <span className="text-green-600 font-mono font-bold flex-shrink-0">{i + 1}.</span>
                <span>{w}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 pt-2">
        <button
          onClick={handleCopy}
          className="flex-1 sm:flex-none px-5 py-3 rounded-lg border font-mono text-sm transition-all"
          style={{
            borderColor: copied ? '#00ff41' : 'rgba(0,255,65,0.3)',
            color:        copied ? '#00ff41' : '#4a8a5a',
            background:   copied ? 'rgba(0,255,65,0.08)' : 'transparent',
          }}
        >
          {copied ? '✓ Copied' : '↗ Share results'}
        </button>
        <a
          href="https://issam-resume.vercel.app"
          target="_blank"
          className="flex-1 sm:flex-none px-5 py-3 rounded-lg border border-cyan-900/40 text-cyan-700 hover:text-cyan-400 hover:border-cyan-700/50 font-mono text-sm text-center transition-all"
        >
          Talk to Issam →
        </a>
        <button
          onClick={onRetake}
          className="flex-1 sm:flex-none px-5 py-3 rounded-lg border border-zinc-800 text-zinc-600 hover:text-zinc-400 font-mono text-sm transition-all"
        >
          Retake
        </button>
      </div>

      {/* Footer */}
      <div className="text-center pt-4 border-t border-zinc-900">
        <p className="text-xs text-zinc-700 font-mono">
          Assessment powered by Claude · Architecture by{' '}
          <a href="https://issam-resume.vercel.app" className="text-zinc-600 hover:text-zinc-400 transition-colors">
            Issam Sedki, PhD
          </a>
        </p>
      </div>
    </div>
  )
}

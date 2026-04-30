'use client'

import { DIMENSION_META, DIMENSION_ORDER } from '@/lib/assessment/prompts'
import { getDimensionPercentile }           from '@/lib/assessment/benchmarks'
import type { DimensionKey }               from '@/lib/assessment/schema'

interface DimScore {
  dimension:   DimensionKey
  score:       number
  confidence:  'low' | 'medium' | 'high'
  key_finding: string
}

interface Props {
  scores:      DimScore[]
  current:     DimensionKey | null
  companySize: string
}

const TIER_COLORS: Record<string, string> = {
  low:    'bg-red-900/30 border-red-700/40 text-red-400',
  medium: 'bg-yellow-900/30 border-yellow-700/40 text-yellow-400',
  high:   'bg-green-900/30 border-green-700/40 text-green-400',
}

function ScoreBar({ score, dim, size }: { score: number; dim: DimensionKey; size: string }) {
  const pct = getDimensionPercentile(dim, score, size)
  const color =
    score >= 75 ? '#00ff41' :
    score >= 50 ? '#ffd700' :
    score >= 25 ? '#ff9944' : '#ff5555'

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-xs">
        <span style={{ color }} className="font-mono font-bold">{score}</span>
        <span className="text-zinc-600 font-mono">top {100 - pct + 1}%</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, background: color, boxShadow: `0 0 6px ${color}66` }}
        />
      </div>
    </div>
  )
}

export default function DimensionPanel({ scores, current, companySize }: Props) {
  const overall = scores.length
    ? Math.round(scores.reduce((s, d) => s + d.score, 0) / scores.length)
    : null

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Overall */}
      {overall !== null && (
        <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-950">
          <div className="text-xs text-zinc-500 font-mono tracking-widest mb-2">OVERALL READINESS</div>
          <div className="flex items-end gap-2 mb-2">
            <span className="text-4xl font-bold font-mono" style={{ color: overall >= 65 ? '#00ff41' : overall >= 40 ? '#ffd700' : '#ff5555' }}>
              {overall}
            </span>
            <span className="text-zinc-600 text-sm font-mono mb-1">/ 100</span>
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${overall}%`,
                background: overall >= 65 ? '#00ff41' : overall >= 40 ? '#ffd700' : '#ff5555',
              }}
            />
          </div>
        </div>
      )}

      {/* Dimensions */}
      <div className="flex flex-col gap-2 flex-1">
        {DIMENSION_ORDER.map(dim => {
          const scored  = scores.find(s => s.dimension === dim)
          const meta    = DIMENSION_META[dim]
          const active  = current === dim
          const pending = !scored && !active

          return (
            <div
              key={dim}
              className={`border rounded-lg p-3 transition-all duration-300 ${
                active   ? 'border-cyan-700/60 bg-cyan-950/20' :
                scored   ? 'border-zinc-700/40 bg-zinc-950'    :
                           'border-zinc-800/40 bg-zinc-950/50 opacity-50'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">{meta.icon}</span>
                <span className={`text-xs font-mono font-bold tracking-wider ${
                  active ? 'text-cyan-400' : scored ? 'text-zinc-300' : 'text-zinc-600'
                }`}>
                  {meta.label.toUpperCase()}
                </span>
                {active && (
                  <span className="ml-auto text-xs text-cyan-500 font-mono animate-pulse">● ACTIVE</span>
                )}
                {scored && (
                  <span className={`ml-auto text-xs font-mono px-1.5 py-0.5 rounded border ${TIER_COLORS[scored.confidence]}`}>
                    {scored.confidence}
                  </span>
                )}
                {pending && (
                  <span className="ml-auto text-xs text-zinc-700 font-mono">pending</span>
                )}
              </div>

              {scored ? (
                <>
                  <ScoreBar score={scored.score} dim={dim} size={companySize} />
                  <p className="text-xs text-zinc-600 mt-2 leading-relaxed line-clamp-2">
                    {scored.key_finding}
                  </p>
                </>
              ) : (
                <div className="text-xs text-zinc-700 font-mono">{meta.focus}</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Attribution */}
      <div className="text-center pt-2 border-t border-zinc-800">
        <a
          href="https://issam-resume.vercel.app"
          target="_blank"
          className="text-xs text-zinc-700 hover:text-zinc-500 font-mono transition-colors"
        >
          by Issam Sedki →
        </a>
      </div>
    </div>
  )
}

'use client'

import { useState }          from 'react'
import type { MeetingDigest } from '@/lib/meeting/schema'

const LEVEL_COLOR = { low: 'text-zinc-400', medium: 'text-yellow-400', high: 'text-red-400' } as const
const GOOD_COLOR = { low: 'text-red-400', medium: 'text-yellow-400', high: 'text-green-400' } as const
const COMMIT_COLOR = { firm: 'text-green-400', soft: 'text-yellow-400', vague: 'text-red-400' } as const

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="border border-zinc-800 rounded-xl p-5 bg-zinc-900/40">
      <h3 className="font-mono text-xs tracking-widest text-zinc-400 mb-4">
        {title}{count !== undefined && <span className="text-zinc-600"> · {count}</span>}
      </h3>
      {children}
    </section>
  )
}

function Quote({ quote, timestamp }: { quote: string; timestamp: string }) {
  return (
    <div className="mt-1 text-xs text-zinc-500 border-l border-zinc-700 pl-2" dir="auto">
      <span className="font-mono text-zinc-600">{timestamp}</span> “{quote}”
    </div>
  )
}

export default function DigestView({ digest: d, live }: { digest: MeetingDigest; live: boolean }) {
  const [copied, setCopied] = useState(false)

  const copyFollowUp = () => {
    navigator.clipboard.writeText(d.follow_up_message)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="border border-cyan-900/50 rounded-xl p-5 bg-cyan-950/10">
        <div className="font-mono text-xs tracking-widest text-cyan-400 mb-2">
          {live ? 'LIVE DIGEST · SO FAR' : 'FINAL DIGEST'}
        </div>
        <div className="text-xl font-bold mb-3">{d.title}</div>
        <p className="text-sm text-zinc-300 whitespace-pre-line leading-relaxed">{d.executive_summary}</p>
        <div className="mt-3 flex flex-wrap gap-4 font-mono text-xs text-zinc-500">
          <span>Effectiveness <b className="text-zinc-200">{d.meeting_effectiveness.score}/10</b></span>
          <span>Decisions <b className={GOOD_COLOR[d.meeting_effectiveness.decision_clarity]}>{d.meeting_effectiveness.decision_clarity}</b></span>
          <span>Ownership <b className={GOOD_COLOR[d.meeting_effectiveness.ownership_clarity]}>{d.meeting_effectiveness.ownership_clarity}</b></span>
          <span>Alignment <b className={GOOD_COLOR[d.analysis.alignment]}>{d.analysis.alignment}</b></span>
          <span>Transcript <b className={GOOD_COLOR[d.transcript_quality.level]}>{d.transcript_quality.level}</b></span>
        </div>
        {d.transcript_quality.issues.length > 0 && (
          <ul className="mt-2 text-xs text-zinc-500 list-disc pl-5">
            {d.transcript_quality.issues.map((x, i) => <li key={i}>{x}</li>)}
          </ul>
        )}
      </div>

      <Section title="ACTION ITEMS" count={d.action_items.length}>
        <div className="space-y-3">
          {d.action_items.map((a, i) => (
            <div key={i} className="border-b border-zinc-800/70 pb-3 last:border-0 last:pb-0">
              <div className="flex gap-2 items-start">
                <span className="font-mono text-xs text-zinc-600 mt-0.5">{i + 1}.</span>
                <div className="flex-1">
                  <div className="text-sm text-white">{a.action}</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 font-mono text-xs">
                    <span className={a.owner ? 'text-zinc-300' : 'text-red-400'}>
                      👤 {a.owner ?? 'NO OWNER'}{a.owner && !a.owner_explicit && <span className="text-yellow-500"> (implied)</span>}
                    </span>
                    <span className={a.due ? 'text-zinc-300' : 'text-zinc-500'}>
                      📅 {a.due ?? 'no date'}{a.due && !a.due_explicit && <span className="text-yellow-500"> (implied)</span>}
                    </span>
                    <span className={LEVEL_COLOR[a.priority]}>▲ {a.priority}</span>
                    <span className={COMMIT_COLOR[a.commitment_strength]}>● {a.commitment_strength}</span>
                  </div>
                  {a.missing_info.length > 0 && (
                    <div className="text-xs text-yellow-600 mt-1">Missing: {a.missing_info.join(' · ')}</div>
                  )}
                  <Quote quote={a.quote} timestamp={a.timestamp} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {d.decisions.length > 0 && (
        <Section title="DECISIONS" count={d.decisions.length}>
          <div className="space-y-3">
            {d.decisions.map((x, i) => (
              <div key={i}>
                <div className="text-sm">
                  <span className={x.status === 'firm' ? 'text-green-400' : x.status === 'tentative' ? 'text-yellow-400' : 'text-red-400'}>
                    [{x.status}]
                  </span>{' '}{x.decision}{x.made_by && <span className="text-zinc-500"> — {x.made_by}</span>}
                </div>
                <Quote quote={x.quote} timestamp={x.timestamp} />
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="RISKS" count={d.risks.length}>
        <div className="space-y-3">
          {d.risks.map((r, i) => (
            <div key={i}>
              <div className="text-sm text-white">
                {r.risk}
                {!r.raised_explicitly && <span className="ml-2 font-mono text-xs text-purple-400">inferred</span>}
              </div>
              <div className="font-mono text-xs mt-1 text-zinc-500">
                {r.category} · likelihood <span className={LEVEL_COLOR[r.likelihood]}>{r.likelihood}</span> · impact <span className={LEVEL_COLOR[r.impact]}>{r.impact}</span>
              </div>
              <div className="text-xs text-green-500/80 mt-1">→ {r.mitigation}</div>
              <Quote quote={r.quote} timestamp={r.timestamp} />
            </div>
          ))}
        </div>
      </Section>

      {d.clarifications_needed.length > 0 && (
        <Section title="TO CLARIFY (transcript unclear or contradictory)" count={d.clarifications_needed.length}>
          <ul className="space-y-2 text-sm">
            {d.clarifications_needed.map((c, i) => <li key={i}>⚠️ {c.item} <span className="text-zinc-500">— {c.why}</span></li>)}
          </ul>
        </Section>
      )}

      {d.open_questions.length > 0 && (
        <Section title="OPEN QUESTIONS" count={d.open_questions.length}>
          <ul className="space-y-2 text-sm">
            {d.open_questions.map((q, i) => (
              <li key={i}>
                {q.question}
                <div className="text-xs text-zinc-500">{q.why_it_matters}{q.suggested_owner && ` · → ${q.suggested_owner}`}</div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {d.disagreements.length > 0 && (
        <Section title="DISAGREEMENTS" count={d.disagreements.length}>
          <div className="space-y-3 text-sm">
            {d.disagreements.map((x, i) => (
              <div key={i}>
                <div className="text-white">{x.topic} {x.resolved ? <span className="text-green-400 text-xs">resolved</span> : <span className="text-red-400 text-xs">open</span>}</div>
                <ul className="text-xs text-zinc-400 list-disc pl-5 mt-1">
                  {x.positions.map((p, j) => <li key={j}><b>{p.speaker}</b>: {p.position}</li>)}
                </ul>
                <div className="text-xs text-zinc-500 mt-1">{x.note}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="KEY POINTS" count={d.key_points.length}>
        <div className="space-y-3">
          {d.key_points.map((k, i) => (
            <div key={i}>
              <div className="text-sm"><span className="text-zinc-500">{k.speaker}:</span> {k.point}</div>
              <Quote quote={k.quote} timestamp={k.timestamp} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="ANALYSIS · OPINION">
        <div className="space-y-3 text-sm text-zinc-300 leading-relaxed">
          <p>{d.analysis.overall_read}</p>
          <p>{d.analysis.dynamics}</p>
          {d.analysis.unspoken_signals.length > 0 && (
            <ul className="list-disc pl-5 text-zinc-400">
              {d.analysis.unspoken_signals.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          )}
          <p className="text-xs text-zinc-500 italic">{d.analysis.confidence_note}</p>
        </div>
      </Section>

      <div className="grid sm:grid-cols-2 gap-4">
        {(['project', 'process'] as const).map(k => (
          <Section key={k} title={`SUGGESTIONS · ${k.toUpperCase()}`}>
            <ul className="space-y-3 text-sm">
              {d.suggestions[k].map((s, i) => (
                <li key={i}>
                  <div className="text-white">{s.suggestion} <span className="font-mono text-xs text-zinc-600">effort {s.effort}</span></div>
                  <div className="text-xs text-zinc-500 mt-0.5">{s.rationale}</div>
                </li>
              ))}
            </ul>
          </Section>
        ))}
      </div>

      <Section title="FOLLOW-UP MESSAGE">
        <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-sans" dir="auto">{d.follow_up_message}</pre>
        <button onClick={copyFollowUp} className="mt-3 font-mono text-xs px-3 py-1.5 rounded border border-zinc-700 hover:border-zinc-500">
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </Section>
    </div>
  )
}


'use client'

import { useState }           from 'react'
import type { VerifiedDigest } from '@/lib/meeting/schema'

const LEVEL_COLOR  = { low: 'text-zinc-400', medium: 'text-yellow-400', high: 'text-red-400' } as const
const GOOD_COLOR   = { low: 'text-red-400', medium: 'text-yellow-400', high: 'text-green-400' } as const
const COMMIT_COLOR = { firm: 'text-green-400', soft: 'text-yellow-400', vague: 'text-red-400' } as const
const RAG_COLOR    = { green: 'text-green-400 border-green-800', amber: 'text-yellow-400 border-yellow-800', red: 'text-red-400 border-red-800' } as const

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

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="font-mono text-xs px-3 py-1.5 rounded border border-zinc-700 hover:border-zinc-500">
      {copied ? 'Copied ✓' : label}
    </button>
  )
}

export default function DigestView({ digest: d, live }: { digest: VerifiedDigest; live: boolean }) {
  const mr = d.execution.management_report

  return (
    <div className="space-y-4">
      {live && (d.ask_now ?? []).length > 0 && (
        <section className="border-2 border-yellow-600/70 rounded-xl p-5 bg-yellow-950/20">
          <h3 className="font-mono text-xs tracking-widest text-yellow-400 mb-3">SAY THIS NOW · before the meeting ends</h3>
          <ul className="space-y-3">
            {d.ask_now.map((a, i) => (
              <li key={i}>
                <div className="text-base text-white" dir="auto">“{a.say}”</div>
                <div className="text-xs text-zinc-400 mt-0.5">{a.why}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

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

      {d.clarifications_needed.length > 0 && (
        <Section title="CHECK WITH PARTICIPANTS" count={d.clarifications_needed.length}>
          <ul className="space-y-2 text-sm">
            {d.clarifications_needed.map((c, i) => <li key={i}>⚠️ {c.item} <span className="text-zinc-500">— {c.why}</span></li>)}
          </ul>
        </Section>
      )}

      <Section title="ACTION ITEMS" count={d.action_items.length}>
        {d.action_items.length === 0 && <p className="text-sm text-zinc-600">No commitments found.</p>}
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

      {d.previous_actions.length > 0 && (
        <Section title="FOLLOW-UP ON PREVIOUS ACTIONS" count={d.previous_actions.length}>
          <div className="space-y-3">
            {d.previous_actions.map((p, i) => (
              <div key={i} className="text-sm">
                <span className={`font-mono text-xs mr-2 ${p.status === 'done' ? 'text-green-400' : p.status === 'blocked' ? 'text-red-400' : 'text-yellow-400'}`}>[{p.status}]</span>
                {p.note} <span className="font-mono text-xs text-zinc-600">{p.id}</span>
                {p.quote && p.timestamp && <Quote quote={p.quote} timestamp={p.timestamp} />}
              </div>
            ))}
          </div>
        </Section>
      )}

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

      {d.risks.length > 0 && (
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
      )}

      {/* ── How to run the work ── */}
      <Section title="EXECUTION · NEXT STEPS" count={d.execution.next_steps.length}>
        <ol className="space-y-2 text-sm">
          {d.execution.next_steps.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="font-mono text-xs text-zinc-600 mt-0.5">{i + 1}.</span>
              <div>
                <div className="text-white">{s.step}</div>
                <div className="font-mono text-xs text-zinc-500">⏱ {s.when} · 👤 {s.owner ?? '—'}</div>
                <div className="text-xs text-zinc-500">{s.why_first}</div>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="EXECUTION · TRACKING">
        <p className="text-sm text-zinc-300">{d.execution.tracking.method}</p>
        <p className="text-sm text-zinc-400 mt-2">🔁 {d.execution.tracking.cadence}</p>
        {d.execution.tracking.checkpoints.length > 0 && (
          <table className="w-full text-xs mt-3">
            <tbody>
              {d.execution.tracking.checkpoints.map((c, i) => (
                <tr key={i} className="border-t border-zinc-800">
                  <td className="py-1.5 pr-3 font-mono text-zinc-400 whitespace-nowrap align-top">{c.when}</td>
                  <td className="py-1.5 pr-3 text-zinc-300">{c.check}</td>
                  <td className="py-1.5 text-zinc-500">{c.with_whom}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {d.execution.log_entries.length > 0 && (
        <Section title="EXECUTION · LOG ENTRIES (RAID / DECISION LOG)" count={d.execution.log_entries.length}>
          <ul className="space-y-1.5 text-sm">
            {d.execution.log_entries.map((l, i) => (
              <li key={i}><span className="font-mono text-xs text-cyan-500 mr-2">{l.type.toUpperCase()}</span>{l.entry}
                <span className="text-xs text-zinc-500"> · {l.owner ?? '—'} · {l.date}</span></li>
            ))}
          </ul>
          <div className="mt-3">
            <CopyButton label="Copy as TSV" text={d.execution.log_entries.map(l => [l.date, l.type, l.entry, l.owner ?? ''].join('\t')).join('\n')} />
          </div>
        </Section>
      )}

      <Section title="REPORT TO MANAGEMENT">
        <div className={`inline-block font-mono text-xs border rounded px-2 py-1 mb-3 ${RAG_COLOR[mr.status]}`}>
          {mr.status.toUpperCase()} — {mr.status_reason}
        </div>
        <div className="grid sm:grid-cols-3 gap-3 text-xs mb-3">
          {([['Highlights', mr.highlights], ['Blockers', mr.blockers], ['Asks', mr.asks]] as const).map(([t, list]) => (
            <div key={t}>
              <div className="font-mono text-zinc-500 mb-1">{t}</div>
              <ul className="list-disc pl-4 text-zinc-300 space-y-0.5">{list.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          ))}
        </div>
        <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-sans border-t border-zinc-800 pt-3" dir="auto">{mr.message}</pre>
        <div className="mt-3"><CopyButton text={mr.message} /></div>
      </Section>

      {(d.suggestions.project.length > 0 || d.suggestions.process.length > 0) && (
        <div className="grid sm:grid-cols-2 gap-4">
          {(['project', 'process'] as const).map(k => (
            <Section key={k} title={`SUGGESTIONS · ${k.toUpperCase()}`}>
              {d.suggestions[k].length === 0 && <p className="text-sm text-zinc-600">Nothing worth changing.</p>}
              <ul className="space-y-3 text-sm">
                {d.suggestions[k].map((s, i) => (
                  <li key={i}>
                    <div className="text-white">{s.suggestion}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">{s.rationale}</div>
                    <div className="font-mono text-xs text-zinc-600 mt-0.5">↳ {s.anchor} · effort {s.effort}</div>
                  </li>
                ))}
              </ul>
            </Section>
          ))}
        </div>
      )}

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

      {d.key_points.length > 0 && (
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
      )}

      <Section title="FOLLOW-UP MESSAGE FOR PARTICIPANTS">
        <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-sans" dir="auto">{d.follow_up_message}</pre>
        <div className="mt-3"><CopyButton text={d.follow_up_message} /></div>
      </Section>

      {d.dropped.length > 0 && (
        <details className="border border-zinc-800 rounded-xl p-4 text-xs text-zinc-500">
          <summary className="cursor-pointer font-mono">Removed by evidence check · {d.dropped.length} (quote not found in transcript)</summary>
          <ul className="mt-2 space-y-1">
            {d.dropped.map((x, i) => <li key={i}>[{x.section}] {x.text} — “{x.quote}”</li>)}
          </ul>
        </details>
      )}
    </div>
  )
}

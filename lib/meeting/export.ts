import type { MeetingContext, MeetingDigest, RefinedSegment } from './schema'
import { formatTime } from './prompts'

const L = {
  fr: {
    summary: 'Résumé', decisions: 'Décisions', actions: 'Actions', risks: 'Risques', questions: 'Questions ouvertes',
    disagreements: 'Désaccords', analysis: 'Analyse', suggestions: 'Recommandations', project: 'Projet', process: 'Processus',
    clarify: 'À clarifier', followup: 'Message de suivi', transcript: 'Transcription', owner: 'Responsable', due: 'Échéance',
    unassigned: 'non assigné', none: 'non fixée', effectiveness: 'Efficacité de la réunion',
  },
  en: {
    summary: 'Summary', decisions: 'Decisions', actions: 'Action items', risks: 'Risks', questions: 'Open questions',
    disagreements: 'Disagreements', analysis: 'Analysis', suggestions: 'Suggestions', project: 'Project', process: 'Process',
    clarify: 'To clarify', followup: 'Follow-up message', transcript: 'Transcript', owner: 'Owner', due: 'Due',
    unassigned: 'unassigned', none: 'not set', effectiveness: 'Meeting effectiveness',
  },
}

export function toMarkdown(d: MeetingDigest, segments: RefinedSegment[], ctx: MeetingContext): string {
  const t = L[ctx.language]
  const out: string[] = []
  out.push(`# ${d.title}`, '', `## ${t.summary}`, d.executive_summary, '')

  if (d.decisions.length) {
    out.push(`## ${t.decisions}`)
    d.decisions.forEach(x => out.push(`- **${x.decision}** (${x.status}) — _"${x.quote}"_ [${x.timestamp}]`))
    out.push('')
  }
  if (d.action_items.length) {
    out.push(`## ${t.actions}`, `| # | Action | ${t.owner} | ${t.due} | Priority | Commitment |`, '|---|---|---|---|---|---|')
    d.action_items.forEach((a, i) => out.push(
      `| ${i + 1} | ${a.action} | ${a.owner ?? t.unassigned}${a.owner && !a.owner_explicit ? ' (?)' : ''} | ${a.due ?? t.none}${a.due && !a.due_explicit ? ' (?)' : ''} | ${a.priority} | ${a.commitment_strength} |`
    ))
    out.push('')
  }
  if (d.risks.length) {
    out.push(`## ${t.risks}`)
    d.risks.forEach(r => out.push(`- **${r.risk}** — ${r.likelihood}/${r.impact}${r.raised_explicitly ? '' : ' _(inferred)_'}. → ${r.mitigation}`))
    out.push('')
  }
  if (d.open_questions.length) {
    out.push(`## ${t.questions}`)
    d.open_questions.forEach(q => out.push(`- ${q.question} — ${q.why_it_matters}`))
    out.push('')
  }
  if (d.disagreements.length) {
    out.push(`## ${t.disagreements}`)
    d.disagreements.forEach(x => out.push(`- **${x.topic}**: ${x.positions.map(p => `${p.speaker}: ${p.position}`).join(' / ')}${x.resolved ? ' ✓' : ''}`))
    out.push('')
  }
  out.push(`## ${t.analysis}`, d.analysis.overall_read, '', d.analysis.dynamics, '')
  d.analysis.unspoken_signals.forEach(s => out.push(`- ${s}`))
  out.push('', `_${d.analysis.confidence_note}_`, '')
  out.push(`## ${t.suggestions}`, `### ${t.project}`)
  d.suggestions.project.forEach(s => out.push(`- **${s.suggestion}** — ${s.rationale}`))
  out.push(`### ${t.process}`)
  d.suggestions.process.forEach(s => out.push(`- **${s.suggestion}** — ${s.rationale}`))
  out.push('', `## ${t.effectiveness}: ${d.meeting_effectiveness.score}/10`, d.meeting_effectiveness.time_use, '')
  if (d.clarifications_needed.length) {
    out.push(`## ${t.clarify}`)
    d.clarifications_needed.forEach(c => out.push(`- ${c.item} — ${c.why}`))
    out.push('')
  }
  out.push(`## ${t.followup}`, '```', d.follow_up_message, '```', '')
  out.push(`## ${t.transcript}`)
  segments.forEach(s => out.push(`- [${formatTime(s.start)}] **${s.speaker}**${s.uncertain ? ' (?)' : ''}: ${s.original}${s.translation ? `  \n  _${s.translation}_` : ''}`))
  return out.join('\n')
}

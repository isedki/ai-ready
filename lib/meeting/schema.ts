import { z } from 'zod'

// ── Transcript ────────────────────────────────────────────────────────────

/** A raw segment as returned by the speech-to-text provider (times in seconds from meeting start). */
export const RawSegment = z.object({
  speaker: z.string(),
  start:   z.number(),
  end:     z.number(),
  text:    z.string(),
})

/** A segment after Claude's fidelity pass: speaker resolved, original kept, translation added. */
export const RefinedSegment = z.object({
  speaker:     z.string().describe('Stable speaker label across the meeting: a confirmed name if known, else "Speaker A", "Speaker B"...'),
  start:       z.number().describe('Start time in seconds, copied from the raw segment'),
  original:    z.string().describe('What was said, in the language/script it was spoken. Only obvious ASR errors corrected.'),
  translation: z.string().describe('Faithful translation into the output language'),
  uncertain:   z.boolean().describe('True if the audio/ASR is unclear and the wording may be wrong'),
  note:        z.string().nullable().describe('Short note on what is uncertain or what an ambiguous term means; null if none'),
})

export const TermKind = z.enum(['person', 'company', 'product', 'technical', 'acronym', 'place', 'other'])

/** A name or jargon term the agent is not sure about and wants the user to confirm. */
export const UnknownTerm = z.object({
  heard:       z.string().describe('The term exactly as it appears in your refined "original" text'),
  kind:        TermKind,
  arabic:      z.string().nullable().describe('Best guess in Arabic script, or null'),
  latin:       z.string().nullable().describe('Best guess in Latin script, or null'),
  context:     z.string().describe('Short quote around the term'),
  start:       z.number(),
})

export const RefinedChunk = z.object({
  segments:      z.array(RefinedSegment),
  unknown_terms: z.array(UnknownTerm).describe('Names and jargon NOT in the confirmed lexicon whose spelling or meaning you are not sure of. Empty if none.'),
})

// ── Memory ────────────────────────────────────────────────────────────────

export const LexiconEntry = z.object({
  canonical: z.string(),            // preferred Latin spelling, e.g. "Si Abdelhak Bennani"
  arabic:    z.string().nullable(), // e.g. "عبد الحق بناني"
  kind:      z.union([TermKind, z.literal('ignore')]),
  meaning:   z.string().nullable(), // role, definition, which client…
  variants:  z.array(z.string()),   // how the ASR heard it
})

export const ActionStatus = z.enum(['open', 'done', 'blocked', 'dropped'])

export const TrackedAction = z.object({
  id:        z.string(),
  action:    z.string(),
  owner:     z.string().nullable(),
  due:       z.string().nullable(),
  status:    ActionStatus,
  meeting:   z.string(),
  createdAt: z.string(),
  history:   z.array(z.object({ date: z.string(), status: ActionStatus, note: z.string() })),
})

// ── Digest ────────────────────────────────────────────────────────────────

const Evidence = {
  quote:     z.string().describe('Exact quote copied from the transcript (original language) supporting this item'),
  timestamp: z.string().describe('mm:ss of the quote'),
}

export const Level      = z.enum(['low', 'medium', 'high'])
export const Commitment = z.enum(['firm', 'soft', 'vague'])

export const ActionItem = z.object({
  action:              z.string().describe('Verb-first, concrete, testable'),
  owner:               z.string().nullable(),
  owner_explicit:      z.boolean().describe('True only if someone explicitly took or was explicitly given it'),
  due:                 z.string().nullable(),
  due_explicit:        z.boolean(),
  priority:            Level,
  commitment_strength: Commitment.describe('firm = clear yes + owner; soft = "inchallah", "ghadi nchouf", "on verra"; vague = nobody really committed'),
  missing_info:        z.array(z.string()).describe('What must be clarified for this to actually happen'),
  ...Evidence,
})

export const Decision = z.object({
  decision: z.string(),
  made_by:  z.string().nullable(),
  status:   z.enum(['firm', 'tentative', 'contested']),
  ...Evidence,
})

export const Risk = z.object({
  risk:              z.string(),
  category:          z.enum(['delivery', 'scope', 'technical', 'resourcing', 'budget', 'stakeholder', 'legal_compliance', 'communication', 'other']),
  likelihood:        Level,
  impact:            Level,
  raised_explicitly: z.boolean().describe('False if inferred by the analyst rather than said in the meeting'),
  mitigation:        z.string().describe('Concrete next step: who does what by when'),
  ...Evidence,
})

const Suggestion = z.object({
  suggestion: z.string().describe('Specific and actionable: who does what, how'),
  rationale:  z.string().describe('The specific moment or fact in this meeting / memory that motivates it'),
  anchor:     z.string().describe('mm:ss in the transcript, or the memory/knowledge file it comes from'),
  effort:     Level,
})

export const Execution = z.object({
  next_steps: z.array(z.object({
    step:      z.string(),
    owner:     z.string().nullable(),
    when:      z.string().describe('e.g. "today", "before Thursday\'s steering", a date'),
    why_first: z.string(),
  })).describe('Ordered sequence of what to do next, most urgent first'),
  tracking: z.object({
    method:      z.string().describe('How to track these items given the tools/practices known from memory; concrete fields and statuses'),
    cadence:     z.string().describe('When and with whom to check progress'),
    checkpoints: z.array(z.object({ when: z.string(), check: z.string(), with_whom: z.string() })),
  }),
  log_entries: z.array(z.object({
    type:  z.enum(['decision', 'risk', 'issue', 'assumption', 'dependency', 'change']),
    entry: z.string().describe('One line, ready to paste into a RAID / decision log'),
    owner: z.string().nullable(),
    date:  z.string(),
  })),
  management_report: z.object({
    status:         z.enum(['green', 'amber', 'red']),
    status_reason:  z.string(),
    highlights:     z.array(z.string()),
    blockers:       z.array(z.string()),
    asks:           z.array(z.string()).describe('Decisions or support needed from management'),
    message:        z.string().describe('Ready-to-send status note for management, 6-12 lines, in the output language'),
  }),
})

export const MeetingDigest = z.object({
  title:              z.string(),
  executive_summary:  z.string().describe('3-6 lines, only what matters'),
  transcript_quality: z.object({
    level:  Level,
    issues: z.array(z.string()),
  }),
  key_points: z.array(z.object({
    point:   z.string(),
    speaker: z.string(),
    ...Evidence,
  })),
  decisions:      z.array(Decision),
  action_items:   z.array(ActionItem),
  previous_actions: z.array(z.object({
    id:        z.string().describe('id from the action tracker'),
    status:    z.enum(['done', 'progressing', 'blocked', 'dropped', 'not_discussed']),
    note:      z.string(),
    quote:     z.string().nullable(),
    timestamp: z.string().nullable(),
  })).describe('Status of open actions from previous meetings, based ONLY on this transcript. Omit not_discussed items unless overdue.'),
  risks:          z.array(Risk),
  open_questions: z.array(z.object({
    question:        z.string(),
    raised_by:       z.string().nullable(),
    why_it_matters:  z.string(),
    suggested_owner: z.string().nullable(),
  })),
  disagreements: z.array(z.object({
    topic:     z.string(),
    positions: z.array(z.object({ speaker: z.string(), position: z.string() })),
    resolved:  z.boolean(),
    note:      z.string(),
  })),
  analysis: z.object({
    overall_read:      z.string().describe('Candid interpretation: where this really stands'),
    dynamics:          z.string().describe('Who drove, who resisted, who stayed silent'),
    unspoken_signals:  z.array(z.string()).describe('Hedges, avoidance, things notably not said — each tied to a moment'),
    alignment:         Level,
    confidence_note:   z.string().describe('What is solid vs speculative'),
  }),
  suggestions: z.object({
    project: z.array(Suggestion),
    process: z.array(Suggestion),
  }),
  execution: Execution,
  meeting_effectiveness: z.object({
    score:              z.number().describe('0-10'),
    decision_clarity:   Level,
    ownership_clarity:  Level,
    time_use:           z.string(),
  }),
  clarifications_needed: z.array(z.object({
    item: z.string(),
    why:  z.string(),
  })).describe('Things to verify with participants because the transcript was unclear or contradictory'),
  follow_up_message: z.string().describe('Ready-to-send recap (email/WhatsApp) for participants in the output language'),
})

/** Learnings Claude proposes after a meeting; the user approves each one before it is stored. */
export const LearningProposal = z.object({
  proposals: z.array(z.object({
    category: z.enum(['person', 'project', 'client', 'process', 'preference', 'technical']),
    content:  z.string().describe('One self-contained fact, stated precisely'),
    evidence: z.string().describe('Quote + timestamp, or the question the user asked'),
  })),
})

export type RawSegment       = z.infer<typeof RawSegment>
export type RefinedSegment   = z.infer<typeof RefinedSegment>
export type UnknownTerm      = z.infer<typeof UnknownTerm>
export type RefinedChunk     = z.infer<typeof RefinedChunk>
export type LexiconEntry     = z.infer<typeof LexiconEntry>
export type TrackedAction    = z.infer<typeof TrackedAction>
export type MeetingDigest    = z.infer<typeof MeetingDigest>
export type LearningProposal = z.infer<typeof LearningProposal>

/** Items removed by the code-level evidence check, shown separately so nothing is silently lost. */
export type DroppedItem = { section: string; text: string; quote: string }
export type VerifiedDigest = MeetingDigest & { dropped: DroppedItem[] }

export type OutputLanguage = 'fr' | 'en'

export interface MeetingContext {
  title:        string
  participants: string   // free text: "Karim (PM), Salma (client, DSI)..."
  project:      string   // background, goals, stakeholders
  glossary:     string   // product names, acronyms, client names — helps fix ASR errors
  myRole:       string   // who the user is in this meeting, for tailored advice
  language:     OutputLanguage
}

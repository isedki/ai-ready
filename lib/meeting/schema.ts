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
  speaker:     z.string().describe('Stable speaker label across the meeting: a real name if known, else "Speaker A", "Speaker B"...'),
  start:       z.number().describe('Start time in seconds, copied from the raw segment'),
  original:    z.string().describe('What was said, in the language/script it was spoken. Only obvious ASR errors corrected.'),
  translation: z.string().describe('Faithful translation into the output language'),
  uncertain:   z.boolean().describe('True if the audio/ASR is unclear and the wording may be wrong'),
  note:        z.string().nullable().describe('Short note on what is uncertain or what an ambiguous term means; null if none'),
})

export const RefinedChunk = z.object({
  segments: z.array(RefinedSegment),
})

// ── Digest ────────────────────────────────────────────────────────────────

const Evidence = {
  quote:     z.string().describe('Exact quote from the transcript (original language) supporting this item'),
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
  mitigation:        z.string(),
  ...Evidence,
})

export const MeetingDigest = z.object({
  title:              z.string(),
  executive_summary:  z.string().describe('5-8 lines, what a busy executive must know'),
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
    dynamics:          z.string().describe('Who drove, who resisted, who stayed silent, power and alignment'),
    unspoken_signals:  z.array(z.string()).describe('Hedges, avoidance, tone shifts, things notably not said'),
    alignment:         Level,
    confidence_note:   z.string().describe('How much of this interpretation is solid vs speculative'),
  }),
  suggestions: z.object({
    project: z.array(z.object({ suggestion: z.string(), rationale: z.string(), effort: Level })),
    process: z.array(z.object({ suggestion: z.string(), rationale: z.string(), effort: Level })),
  }),
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
  follow_up_message: z.string().describe('Ready-to-send recap (email/WhatsApp) in the output language: decisions, actions with owners & dates, open points'),
})

export type RawSegment     = z.infer<typeof RawSegment>
export type RefinedSegment = z.infer<typeof RefinedSegment>
export type RefinedChunk   = z.infer<typeof RefinedChunk>
export type MeetingDigest  = z.infer<typeof MeetingDigest>

export type OutputLanguage = 'fr' | 'en'

export interface MeetingContext {
  title:        string
  participants: string   // free text: "Karim (PM), Salma (client, DSI)..."
  project:      string   // background, goals, stakeholders
  glossary:     string   // product names, acronyms, client names — helps fix ASR errors
  myRole:       string   // who the user is in this meeting, for tailored advice
  language:     OutputLanguage
}

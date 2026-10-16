import { z } from 'zod'

/* ── Pass 1: what one email thread shows about how work gets done ───────── */

export const ExtractedStep = z.object({
  what:   z.string().describe('What was done in this step, short, e.g. "approve VM request", "create firewall rule"'),
  actor:  z.string().nullable().describe('Email address of who did it, copied exactly from the participant list; null if unknown'),
  raci:   z.enum(['R', 'A', 'C', 'I']).describe('R = did the work, A = approved / owns the decision, C = was consulted, I = only informed'),
  date:   z.string().nullable().describe('ISO date of the message showing this step'),
  quote:  z.string().describe('Short verbatim quote (max 200 chars) from the thread that shows this step'),
})

export const ExtractedProcess = z.object({
  title:          z.string().describe('Short imperative name of the task, in English, e.g. "Provision a new VM", "Open a network flow", "Grant AD group access"'),
  action:         z.string().describe('Main verb, lowercase English, e.g. provision, install, open, grant, reset, deploy'),
  object:         z.string().describe('What is acted on, e.g. VM, firewall flow, AD account, database'),
  system:         z.string().nullable().describe('Tool or platform involved, e.g. vCenter, Active Directory, ServiceNow, Fortigate'),
  environment:    z.string().nullable().describe('Environment if stated: DEV, UAT, PREPROD, PROD, …'),
  summary:        z.string().describe('One or two sentences: how it was done in this thread'),
  requester:      z.string().nullable().describe('Email address of who asked for it'),
  steps:          z.array(ExtractedStep),
  artifacts:      z.array(z.string()).describe('Forms, templates, ticket categories, portals or files that had to be used'),
  prerequisites:  z.array(z.string()).describe('Information or approvals that had to exist before it could be done'),
  gotchas:        z.array(z.string()).describe('Pitfalls, rejections and their reasons, rules learned the hard way'),
  outcome:        z.enum(['done', 'pending', 'rejected', 'unknown']),
  lead_time_days: z.number().nullable().describe('Days from request to completion if both are visible'),
})

export const ThreadExtraction = z.object({
  relevant:  z.boolean().describe('True only if the thread shows how an operational or IT task is requested, approved or carried out'),
  processes: z.array(ExtractedProcess).describe('Usually 0 or 1, at most 3'),
})
export type ThreadExtraction = z.infer<typeof ThreadExtraction>
export type ExtractedProcess = z.infer<typeof ExtractedProcess>

/* ── Pass 2: attach extracted items to the evolving set of procedures ──── */

export const FoldDecision = z.object({
  item_id:       z.string(),
  decision:      z.enum(['same', 'variant', 'new', 'not_a_process']),
  procedure_id:  z.string().nullable().describe('Existing procedure id for same/variant; null otherwise'),
  new_group:     z.string().nullable().describe('For decision "new": a short key; items in this request that describe the same new procedure share the key'),
  new_title:     z.string().nullable().describe('For decision "new": canonical title for the new procedure'),
  variant_note:  z.string().nullable().describe('For "variant": what differs, e.g. "PROD requires CAB approval"'),
  step_map: z.array(z.object({
    item_step:   z.number().int().describe('Index of the step in the item (0-based)'),
    step_id:     z.string().nullable().describe('Existing step id it corresponds to, or null if it is a new step'),
    new_label:   z.string().nullable().describe('Canonical label for a new step (generic, no names or dates)'),
    after_step:  z.string().nullable().describe('For a new step: id of the existing step it comes after, or null if unknown (appended at the end)'),
  })),
})

export const FoldResult = z.object({
  decisions: z.array(FoldDecision),
})
export type FoldResult   = z.infer<typeof FoldResult>
export type FoldDecision = z.infer<typeof FoldDecision>

export const MergeCheck = z.object({
  same_procedure: z.boolean(),
  keep_title:     z.string().describe('Best canonical title if merged'),
  reason:         z.string(),
})

export const ProcedureSummary = z.object({
  summary: z.string().describe('3-6 sentence "how to" for someone who needs to get this done, naming roles/teams to contact'),
})

import { z } from 'zod'

/* ── Pass 1: what kind of request a thread shows, and who handled it ──── */

const Contact = z.object({
  email:      z.string().describe('Email address copied exactly from the participant list'),
  role:       z.enum(['handles', 'approves', 'dispatches']).describe('handles = did the work; approves = had to say yes first; dispatches = shared mailbox / manager who routed it to someone'),
  department: z.string().nullable().describe('Department or team of this person if visible (signature, mailbox name, context), e.g. "Infra Ops / DSI"; null if unknown'),
})

function requestItem(domain: z.ZodType<string>) {
  return z.object({
    title:          z.string().describe('Generic imperative name of the kind of request, in English: "Provision a new VM", "Open a network flow", "Create an AD account"'),
    domain,
    subdomain:      z.string().describe('Short area within the domain, in English, e.g. "Virtual machines", "Firewall flows", "AD accounts & groups"'),
    contacts:       z.array(Contact).describe('Who you would email next time to get this done; exclude the requester'),
    cc:             z.array(z.string()).describe('Addresses usually kept in copy (managers, shared mailboxes), from the participant list'),
    requester:      z.string().nullable().describe('Email address of who asked'),
    channel:        z.enum(['email', 'ticket', 'portal', 'phone', 'other']).describe('How the request was made'),
    channel_detail: z.string().nullable().describe('Ticket tool and category, portal name, form name; null if plain email'),
    include:        z.array(z.string()).describe('Information the request had to contain (max 5, short), e.g. "sizing vCPU/RAM/disk", "source/destination IP and port"'),
    tip:            z.string().nullable().describe('One practical tip learned from this thread (rejection reason, needed approval, delay), or null'),
  })
}

export const RequestItem = requestItem(z.string())
export type RequestItem  = z.infer<typeof RequestItem>

export function threadExtractionSchema(domains: string[]) {
  return z.object({
    relevant: z.boolean().describe('True only if the thread shows someone asking another person/team to get an operational or IT task done'),
    items:    z.array(requestItem(z.enum(domains as [string, ...string[]]))).describe('Usually 0 or 1, at most 3'),
  })
}
export type ThreadExtraction = { relevant: boolean; items: RequestItem[] }

/* ── Pass 2: attach items to directory entries ─────────────────────────── */

export const FoldResult = z.object({
  decisions: z.array(z.object({
    item_id:   z.string(),
    decision:  z.enum(['same', 'new', 'not_a_request']),
    entry_id:  z.string().nullable().describe('Existing entry id for "same"; null otherwise'),
    new_group: z.string().nullable().describe('For "new": items in this request that are the same new kind of request share this key'),
    title:     z.string().nullable().describe('For "new": generic canonical title'),
    subdomain: z.string().nullable().describe('For "new": reuse an existing subdomain of the domain when it fits, else a short new one'),
  })),
})
export type FoldResult = z.infer<typeof FoldResult>

export const MergeCheck = z.object({
  same_request: z.boolean(),
  keep_title:   z.string().describe('Best canonical title if merged'),
  reason:       z.string(),
})

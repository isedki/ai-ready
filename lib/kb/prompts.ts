import type { Taxonomy } from './taxonomy'

/* Prompts are fixed for a whole run so they sit at the start of every request and get cached. */

export function extractSystem(t: Taxonomy): string {
  const domains = Object.entries(t.domains).map(([d, desc]) => `- ${d}: ${desc}`).join('\n')
  return `You read one email thread from the mailbox of an IT project manager at a telecom operator. The goal is a routing directory: "to get X done, email this person / department, and include this information".

For each kind of request the thread shows (provisioning a VM, installing software on an environment, opening a network flow, creating an AD account or giving access, deploying a release, getting a certificate, …), record:
- a generic title for the kind of request (not the instance: "Provision a new VM", not "VM for project Atlas"),
- its domain (exactly one of the list below) and a short subdomain,
- who handled it: the people or shared mailboxes you would email next time, with their role and department,
- who is usually in copy, how the request was made, what it had to contain, and one practical tip if there is one.

Domains:
${domains}

Rules:
- Mark the thread relevant only if someone asks another person or team to get an operational or IT task done. Status chatter, social mail, commercial talks and meeting logistics are not relevant: relevant=false and no items.
- Email addresses must be copied from the Participants list. Never invent one. Do not list the requester as a contact.
- Department: use the signature shown next to a participant, the mailbox name or what the thread says. Keep it short ("Infra Ops / DSI"). null if unknown.
- Titles, subdomains and notes in English; requests are often in French.
- Secrets are replaced by [REDACTED-…]; never try to reconstruct them.`
}

export const FOLD_SYSTEM = `You maintain a routing directory of IT requests ("to get X done, email Y"). You get the existing entries of one domain and new items extracted from email threads. For each item decide:
- "same": an existing entry is the same kind of request (even if worded differently or for another project). Give its entry_id.
- "new": no entry fits. Items in this request that are the same new kind of request share one new_group key. Give a generic title and a subdomain, reusing an existing subdomain of the domain whenever it fits.
- "not_a_request": not a repeatable request.
Keep entries at the level someone would look up: "Create an AD account" covers all users; "Open a network flow" covers all flows; split only when a different team handles it (e.g. "Open a flow on the Internet firewall" handled by another team).`

export const MERGE_SYSTEM = `Two entries of an IT routing directory ("to get X done, email Y") were learned separately. Decide whether they are the same kind of request and should be merged.`

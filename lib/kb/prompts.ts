/* Prompts are fixed strings so they sit at the start of every request and get cached. */

export const EXTRACT_SYSTEM = `You read one email thread from the mailbox of an IT project manager at a telecom operator, and record how operational work gets done: who asks, who approves, who executes, what has to be provided, what goes wrong.

Typical examples: provisioning a VM, installing software on an environment, opening a network flow / firewall rule, granting Active Directory access or credentials, creating a database, deploying a release, getting a certificate, requesting VPN access. Do not limit yourself to these: record any repeatable task you see being requested and carried out.

Rules:
- Mark the thread relevant only if it shows part of how such a task is requested, approved or carried out. Pure status chatter, social mail, commercial discussions and meeting logistics are not relevant: return relevant=false with no processes.
- A thread may show only part of a task (only the request, only the approval). Record what is visible; do not invent steps that are not in the thread.
- Actors must be email addresses copied from the Participants list. Never invent an address.
- RACI per step: R = person who does the work of that step, A = person who approves or owns the decision, C = consulted for input, I = only informed (in copy, notified).
- Requests are often in French; write titles, step labels and summaries in English, but quotes stay verbatim.
- Secrets have been replaced by [REDACTED-…]; never try to reconstruct them.
- Titles name the generic task, not the instance: "Provision a new VM", not "VM for project Atlas".`

export const FOLD_SYSTEM = `You maintain a catalogue of IT procedures learned from email. You get the existing procedures that might match (with their step ids) and new items extracted from email threads. For each item decide:
- "same": it is one of the existing procedures.
- "variant": same procedure but with a meaningful difference (other environment needing extra approval, other system). Use the existing procedure_id and describe the difference in variant_note.
- "new": no existing procedure fits. Items in this request describing the same new procedure must share one new_group key and title.
- "not_a_process": the item is not a repeatable task.

Map every step of the item (by 0-based index) to an existing step id when it is the same step, even if worded differently. Otherwise give a new generic label (no person names, no dates) and the step it comes after.
Prefer matching to an existing procedure over creating near-duplicates; generic tasks such as "Grant AD group access" should not be split by group name.`

export const MERGE_SYSTEM = `Two procedures were learned separately from email. Decide whether they describe the same repeatable task (and should be merged), or are genuinely different tasks.`

export const SUMMARY_SYSTEM = `Write a short practical "how to" for an IT procedure, from the structured card you are given (steps, RACI, artifacts, gotchas, evidence counts). Address someone who needs to get this done. Name who to contact by role/team and name. Mention required inputs and the main pitfalls. Do not invent anything not in the card.`

# Email → procedures & RACI knowledge base

Builds a catalogue of "how things get done" (provision a VM, open a network flow, grant AD access, …)
from a mailbox dump, with a computed RACI per step, evidence links to the source threads, and a history
of how each procedure changed over time.

## How it works

```
PST / .eml ──► clean + redact + thread ──► Pass 1: extract (per thread, cheap model, Batch API)
                                                   │
                       month-by-month replay ◄─────┘
                                │
                     Pass 2: fold (match each item to existing procedures,
                             or create a new one; merge near-duplicates)
                                │
            code: evidence → recency-weighted RACI, snapshots, change log
                                │
                   summarize (only changed procedures) ──► render
```

- **Processes come from the emails.** There is no predefined list; a procedure is created the first time a
  thread shows a repeatable task, and grows as later threads confirm, extend or change it.
- **The LLM extracts facts, code builds the knowledge base.** The RACI is a recency-weighted vote over
  evidence rows (half-life 180 days, `KB_HALF_LIFE_DAYS`), so it shifts gradually and never drifts
  from rewriting. When the main R or A of a step changes, it is logged in `changes` for review.
- **Secrets are redacted at ingest** (passwords incl. French "mot de passe"/"mdp", tokens, keys, JWTs),
  before storage and before any API call.
- Quoted replies, signatures, disclaimers, newsletters, meeting notices and auto-replies are removed
  before the LLM sees anything; this is most of the cost saving.

## Usage

```bash
export ANTHROPIC_API_KEY=…
npm run kb -- ingest /path/to/dump.pst        # or a folder of .eml files; repeatable
npm run kb -- teams teams.json                # optional, see below
npm run kb -- estimate                        # cost estimate, no API calls

# Trial on a sample first (sync = immediate, full price; a few cents)
npm run kb -- extract --sample 150 --sync
npm run kb -- extract --sample 150 --sync --model claude-sonnet-5-5   # compare on another sample if quality is lacking

# Full run (Batch API, 50% off; batches usually finish within an hour)
npm run kb -- extract
npm run kb -- fold                            # --window quarter for fewer, larger rounds
npm run kb -- summarize
npm run kb -- render --out kb-out
npm run kb -- stats                           # progress + spend so far
```

Each command is resumable: a crash during a batch is picked up on the next run, failed threads can be
re-queued with `npm run kb -- retry`, and threads already folded are never re-processed.

`teams.json` maps addresses or whole domains to teams, so the RACI grid can be read by team:

```json
{ "infra.ops@inwi.ma": "Infra", "network@inwi.ma": "Network", "@vendor.com": "Vendor X" }
```

## Output (`kb-out/`)

| File | Content |
|---|---|
| `README.md` | Index of procedures with confidence, last seen, main Responsible / Accountable |
| `procedures/<id>.md` | One card per procedure: how-to, steps × RACI, inputs, forms/tools, gotchas, variants, history, source threads |
| `RACI.md` | Procedures × people/teams grid |
| `directory.md` | Who does what |
| `kb.json` | Everything above as JSON, for the web UI |

## Models and cost

| Pass | Default model | Env override |
|---|---|---|
| Extract (every thread) | `claude-haiku-5-5` | `KB_EXTRACT_MODEL` |
| Fold / merge (relevant items only) | `claude-sonnet-5-5` | `KB_FOLD_MODEL` |
| Summary (changed procedures only) | `claude-sonnet-5-5` | `KB_SUMMARY_MODEL` |

For ~4,000 emails the expected first-run cost is roughly $1–3 all-Haiku, ~$15 with a Sonnet fold,
~$30 all-Sonnet (Batch API prices). `estimate` gives a figure for your actual dump; `stats` reports
real spend from token usage.

## Data

Everything is in `data/kb.sqlite` (`KB_DB` to change). It contains mailbox content: it is git-ignored
and should stay on an access-controlled machine. Tables: `messages`, `threads`, `extractions`,
`procedures`, `steps`, `evidence`, `facts`, `procedure_threads`, `snapshots`, `changes`, `llm_calls`.

## Not built yet

- Live Outlook sync (Microsoft Graph delta queries) feeding the same fold step
- Web UI over `kb.json` (cards, RACI grid, review queue for `changes`)
- Chat ("how do I …") over the cards

# Email → "who to ask for what" directory

Reads a mailbox dump and produces a routing directory, clustered by domain and subdomain:

```
## Infrastructure
### Virtual machines
- **Provision a new VM** → email **Infra Ops** `infra.ops@inwi.ma`
  - Approval: Hamid Director · Via: email: form "Demande VM v3"
  - Include: sizing (vCPU/RAM/disk); environment
  - medium confidence · 3 threads · last 2024-07-08 · e.g. "VM PREPROD Atlas 2"
## Network
### Firewall flows
- **Open a network flow** → email **Network Team** `network@inwi.ma`
  - Approval: Secops (Security)
  - Tip: Security must validate before Network implements
```

## How it works

```
PST / .eml ─► clean, remove secrets, group into threads
           ─► Pass 1 (every thread, Haiku, Batch API): what was asked, domain/subdomain,
              who handled / approved it + their department, what the request had to include
           ─► Pass 2 (month by month): attach each request to an existing entry of its domain, or create one
           ─► code: "email to" = recency-weighted vote over who handled it; department from signatures
```

- **Domains** come from `config/kb-taxonomy.json` (Infrastructure, Network, Security, Portal & Web, …). Edit the
  names and descriptions to match inwi's organisation before running. **Subdomains are discovered** from the
  emails and reused across entries.
- **Who to email** follows the most recent threads (half-life 180 days, `KB_HALF_LIFE_DAYS`). A shared mailbox
  (e.g. `infra.ops@`) is preferred over an individual when it is used for that request. People not seen for a
  year while others handle the request are listed as "previously handled by".
- **Departments** are read from email signatures and context, voted across threads; `teams.json` overrides them.
- **Secrets are removed when the dump is loaded** (passwords incl. "mot de passe"/"mdp", tokens, keys, JWTs),
  before storage and before any API call. Quoted replies, signatures, newsletters, invites and auto-replies are
  stripped too, which is most of the cost saving.

## Usage

```bash
export ANTHROPIC_API_KEY=…
npm run kb -- ingest /path/to/dump.pst        # or a folder of .eml files; repeatable
npm run kb -- estimate                        # cost estimate, no API calls

npm run kb -- extract --sample 150 --sync     # trial on a sample (immediate, a few cents)
npm run kb -- extract                         # everything, Batch API (50% off, usually < 1 h)
npm run kb -- fold                            # --window quarter for fewer, larger rounds
npm run kb -- render --out kb-out
npm run kb -- stats                           # progress + spend so far
```

Every command can be re-run: an interrupted batch is resumed, failed threads are re-queued with
`npm run kb -- retry`, and folded threads are not processed again.

Optional `teams.json` to force departments:

```json
{ "infra.ops@inwi.ma": "Infra Ops / DSI", "@vendor.com": "Vendor X" }
```

## Output (`kb-out/`)

| File | Content |
|---|---|
| `README.md` | The directory: domain → subdomain → request → who to email, approval, cc, what to include, tips |
| `directory.csv` | Same, one row per request, for Excel / SharePoint |
| `contacts.md` | People and shared mailboxes by department, with what they handle |
| `kb.json` | Everything as JSON, for a web UI or a chat assistant |

## Models and cost

Both passes default to `claude-haiku-5-5` (`KB_EXTRACT_MODEL`, `KB_FOLD_MODEL`). Pass 2 only sees short
extracted items, so switching it to `claude-sonnet-5-5` for better matching costs a few dollars at most.
For ~4,000 emails expect roughly **$1–3** for a full Haiku run with the Batch API; `estimate` gives a figure
for your dump and `stats` reports actual spend.

## Data

Everything lives in `data/kb.sqlite` (`KB_DB` to change). It holds mailbox content: it is git-ignored and
should stay on an access-controlled machine.

## Not built yet

- Live Outlook sync (Microsoft Graph delta queries) feeding the same two passes
- A web page / chat ("who do I ask to …?") over `kb.json`

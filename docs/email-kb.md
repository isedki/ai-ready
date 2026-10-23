# Email → "who to ask for what" directory

## Quick start (laptop, ~15 minutes of your time)

It runs on your **Claude subscription** (Pro or Max) through Claude Code. No API key is needed.

**Once:**
1. Install [Node.js 22 or newer](https://nodejs.org) (LTS).
2. Install Claude Code and log in with your Claude account:
   `npm install -g @anthropic-ai/claude-code`, then type `claude`, log in, and type `/exit`.
3. Get this project (GitHub → branch → Code → Download ZIP, or `git clone`), then in its folder: `npm install`
4. Optional: edit `config/kb-taxonomy.json` so the domains match inwi's organisation.

**Build the directory** (Outlook → File → Open & Export → Import/Export → Export to a file → .pst):

```bash
npm run kb -- run "C:\path\to\dump.pst"
```

Run it **from the project folder**, with the full path to the PST (e.g. `~/Downloads/archive.pst`). It asks
before starting, then runs on its own (roughly 30–60 minutes for ~4,000 emails; leave the window open). Each
email thread is one short request to Claude Haiku that counts toward your plan's usage limits, at no extra
charge. If the limit is reached, it stops cleanly and says so: run the same command again after the reset and
it continues where it stopped.

With an API key instead (`ANTHROPIC_API_KEY=…` in a `.env.local` file), it uses the Batch API (about $1–3 for
~4,000 emails) and shows the cost before starting. `KB_BACKEND=claude` or `api` forces one or the other.

**Use it, every day:** on the phone page (below), which also uses your subscription. The laptop page
(`npm run ask`) needs an API key:

```bash
npm run ask
```

Opens `http://localhost:3210/ask` in your browser. Type what you need ("ouvrir un flux en UAT vers la base
billing"); you get who to contact, the approval needed, what to include, and a **French draft email**: edit it
if needed, then **Ouvrir dans Outlook** opens a new message with To / Cc / Objet / body filled in.
Each question costs about one cent.

**On the phone** (main way to use it): the private page *Qui contacter* in your Claude account
(source: `phone/qui-contacter.html`, published at https://claude.ai/artifact/ULSMj55EzN3r3XvFWykfou). Open it
in the Claude app, then Sources → *Importer kb.json* once after each build. On the page you can also:
- add architecture documents (HLD, DAT, LLD, flow matrices, scope, operations; PDF, Word, PowerPoint, Excel/CSV,
  photos of diagrams).
  Text and tables are read on the device (passwords removed), diagram pages inside PDFs are read as images
  (up to 8 per document), and Claude extracts components with their owning team and support level, servers,
  flows, escalation levels and scope; the extracted lists can be checked under each document. For each
  situation the page sends the components it names, what depends on them, and the related servers, flows
  and support: the analysis uses them for the owning team to contact and for the **impacts** (what else is
  or will be affected downstream, and which teams to warn);
- paste an email or describe a call (optionally with a screenshot and who reported it) and get a **triage** first:
  the problem restated (what, where, since when, impact, who), a verdict *réel / à confirmer / fausse alerte
  probable* with evidence for and against, the evidence the next team will need (provided / missing / unclear),
  quick checks you can do yourself, and a gate *prêt à escalader* or the next step (ask the reporter, with a French
  message ready, or verify yourself). Add the reporter's answer or your findings and the analysis updates;
- then ranked contacts with a confidence level, the recommended channel (email, WhatsApp, visit, call), and
  French drafts (Outlook link, WhatsApp link);
- follow up on any part of the analysis ("Approfondir" on a contact, an impact or a missing element, or
  "Discuter du diagnostic"): ask why, who else, what to prepare, or give extra details; a detail can then be
  folded into the analysis ("Intégrer à l'analyse") or saved on the person's card ("Noter sur …"). The
  conversation is kept with the case;
- **sources**: every line of data sent to Claude is tagged ([E3] email directory entry with its source email
  subjects and dates, [D2 p.14] document with type/version/page, [P5] person card, [C1] past case, [N] notes,
  [S]/[U1] your input). Claude must cite them for each claim; the page shows them as chips that open the exact
  excerpt that was sent. The page then checks the answer itself: cited ids must exist, email addresses must be
  in your data (otherwise they are removed), impacted components must be in your documents, unsourced claims
  are marked; the result is shown in "Contrôle des sources";
- **Autotest** (Sources tab): 5 scenarios on fixed fictional data, including traps (topic absent from the data,
  unknown person, missing phone number), run against Claude and checked by code; results are stored in the
  page's database (`tests` collection) for review;
- **Dossiers** tab: *démarches* are the usual chain of steps for a kind of request (who does what, in which
  order, the expected result), created from a Planner screenshot or pasted task list (Claude reads it, you check
  it), or saved from a finished dossier. A *dossier* is one live request built from a démarche (or proposed by
  Claude from your démarches, emails and documents, with sources and the same address checks as an analysis).
  Each step has a status (à faire / en cours / en attente / fait), shows what it is waiting for, and has a
  ready-made French email or WhatsApp to its owner. **Rapport** builds a weekly progress report (done, in
  progress, waiting on whom since when, next steps, open incidents) from the recorded statuses only, ready to
  copy or send. Démarches and open dossiers are also given to the analysis ([B1] / [F1] sources), so an email
  about a dossier is tied to the right step;
- **Moi** (Sources tab): your addresses, then those of people whose role you took over. They are marked VOUS
  in everything sent to Claude: you are never suggested as the contact; when a request was theirs, the
  analysis says it is yours and who to ask to get it done. The directory shows "→ Vous" on those entries;
- close each case as réel / fausse alerte / doublon: past outcomes are used to spot false alarms and duplicates;
- note people's WhatsApp number and location, log each contact (channel, result, 1–5 rating) and set a
  follow-up; the Suivis tab lists what to chase, with a ready-made French reminder.
Questions on the page use your Claude subscription, not the API key.

**Update it** every month or two: export a new PST and run the same `npm run kb -- run new.pst`. Only new
threads are analysed.

---

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
| `emails.xlsx` | With `npm run kb -- emails`: every email (date, folder, from, to, cc, subject, status, thread, requests learned, start of the text with secrets removed) and every thread, with filters |

## Models and cost

On the subscription, each request is a `claude -p` call with no tools, no MCP servers and no settings, only the
pass's own instructions, and the answer is checked against the same JSON schema (`KB_CONCURRENCY`, default 4
at a time). Both passes default to `claude-haiku-5-5` (`KB_EXTRACT_MODEL`, `KB_FOLD_MODEL`). Pass 2 only sees short
extracted items, so switching it to `claude-sonnet-5-5` for better matching costs a few dollars at most.
For ~4,000 emails expect roughly **$1–3** for a full Haiku run with the Batch API; `estimate` gives a figure
for your dump and `stats` reports actual spend.

## Data

Everything lives in `data/kb.sqlite` (`KB_DB` to change). It holds mailbox content: it is git-ignored and
should stay on an access-controlled machine.

## The assistant (`npm run ask`)

`app/ask` + `app/api/ask` + `lib/kb/ask.ts`. The whole directory (`kb-out/kb.json`) is placed in a cached
system prompt, so the model sees every entry and follow-up questions only pay for the cached read
(`KB_ASK_MODEL`, default `claude-opus-5-5`). Answers are in the language of the question; drafts are in French.
It runs only on your laptop (localhost).

## Not built yet

- Live Outlook sync (Microsoft Graph delta queries) instead of periodic PST exports

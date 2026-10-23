/**
 * Email → "who to ask for what" directory, clustered by domain / subdomain.
 *
 * Uses your Claude subscription through the Claude Code CLI (`claude`, logged in once), or the API
 * when ANTHROPIC_API_KEY is set (.env.local). KB_BACKEND=claude|api forces one.
 *
 *   npm run kb -- run dump.pst               everything in one go (asks before spending); also for later updates
 *   npm run ask                              open the "qui contacter pour quoi ?" page
 *
 * Individual steps, if needed:
 *   npm run kb -- ingest dump.pst            parse PST (or a folder of .eml), clean, redact, thread
 *   npm run kb -- teams teams.json           optional: force departments for addresses / @domains
 *   npm run kb -- estimate                   token count and cost estimate before spending anything
 *   npm run kb -- extract --sample 150 --sync   trial run on a random sample
 *   npm run kb -- extract                    pass 1 over every pending thread (API: Batch API, 50% off)
 *   npm run kb -- fold                       pass 2: replay month by month into directory entries
 *   npm run kb -- render --out kb-out        README.md by domain, directory.csv, contacts.md, kb.json
 *   npm run kb -- stats                      progress and spend so far
 *   npm run kb -- emails                     Excel list of every email and thread, and what was learned from it
 */
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname }                  from 'node:path'
import { createInterface }          from 'node:readline/promises'
import { openDb, closeDb, tx }      from '../lib/kb/db'
import { ingestPst }                from '../lib/kb/ingest/pst'
import { ingestEmlDir }             from '../lib/kb/ingest/eml'
import { buildThreads, unifyExchangeAddresses } from '../lib/kb/threads'
import { extractThreads, selectPending } from '../lib/kb/extract'
import { foldAll }                  from '../lib/kb/fold'
import { renderAll }                from '../lib/kb/render'
import { AnthropicRunner, ClaudeCodeRunner, claudeCliStatus, MODELS, costOf, knownPrice, type Runner } from '../lib/kb/llm'
import { estimateTokens }           from '../lib/kb/clean'
import { extractSystem }            from '../lib/kb/prompts'
import { loadTaxonomy }             from '../lib/kb/taxonomy'
import { exportEmails }             from '../lib/kb/export'

const USAGE = readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*\*\n/, '').replace(/^ \* ?/gm, '')

// An API key, if you use one, lives in .env.local (shared with `npm run ask`).
if (existsSync('.env.local')) process.loadEnvFile('.env.local')

const [cmd, ...rest] = process.argv.slice(2)
const flag = (name: string) => rest.includes(`--${name}`)
const opt  = (name: string) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined }
const VALUE_OPTS = new Set(['--sample', '--limit', '--model', '--window', '--out'])
const positional = rest.filter((a, i) => !a.startsWith('--') && !VALUE_OPTS.has(rest[i - 1]))
const log = (s: string) => console.log(s)
const usd = (n: number) => `$${n.toFixed(2)}`

async function confirm(question: string): Promise<boolean> {
  if (flag('yes')) return true
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(`${question} [y/N] `)
  rl.close()
  return /^(y|yes|o|oui)$/i.test(answer.trim())
}

async function main() {
  const db = openDb()
  const backend = process.env.KB_BACKEND ?? (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? 'api' : 'claude')
  const subscription = backend !== 'api'
  let shared: Runner | null = null
  const runner = (): Runner => {
    if (shared) return shared
    if (subscription) {
      if (!claudeCliStatus()) throw new Error('Claude Code is not installed (it runs the analysis on your Claude subscription). Install it once:\n  npm install -g @anthropic-ai/claude-code\nthen type  claude  and log in with your Claude account (Pro or Max), type /exit, and run this command again.')
      return (shared = new ClaudeCodeRunner(db, log))
    }
    return (shared = new AnthropicRunner(db, flag('sync') ? 'sync' : 'batch', log))
  }
  const stoppedNote = () => {
    if (!runner().stopped) return false
    log(`\nStopped: your Claude plan's usage limit was reached (${runner().stopped}).`)
    log('Nothing is lost. Run the same command again once the limit resets (the message from Claude says when): it continues where it stopped.')
    return true
  }

  const ingest = async (paths: string[]) => {
    if (paths.length === 0) throw new Error('usage: kb ingest <file.pst | eml-folder> …')
    for (const p of paths) {
      if (!existsSync(p)) throw new Error(`not found: ${p}`)
      const r = statSync(p).isDirectory()
        ? await ingestEmlDir(db, p)
        : ingestPst(db, p, n => process.stdout.write(`\r  ${n} messages…`))
      log(`\n${p}: ${r.seen} messages read, ${r.inserted} new`)
    }
    unifyExchangeAddresses(db)
    const t = buildThreads(db)
    log(`${t.threads} threads, ${t.pending} new to analyse (${t.skipped} skipped as noise/empty)`)
    return t.pending
  }

  const estimate = (quiet = false) => {
    const rows = db.prepare("SELECT token_estimate FROM threads WHERE status = 'pending'").all() as { token_estimate: number }[]
    const threadTokens = rows.reduce((s, r) => s + r.token_estimate, 0)
    const sys = estimateTokens(extractSystem(loadTaxonomy())) + 900 // instructions + JSON schema
    const n = rows.length
    // Extraction: thread + cached instructions in, ~700 tokens out (brief thinking + JSON).
    const ex = { input: threadTokens, cacheRead: sys * n, output: 700 * n }
    // Fold: assume ~55% of threads are relevant, ~1.2 items each; ~600 tokens in / 250 out per item
    // plus the domain's entry list once per call of 15 items (~3k tokens).
    const items = Math.round(n * 0.55 * 1.2)
    const fo = { input: items * 600 + Math.ceil(items / 15) * 3000, output: items * 250 }
    const batch = !flag('sync')
    const total = costOf(MODELS.extract, ex, batch) + costOf(MODELS.fold, fo, batch)
    if (!quiet) {
      log(`${n} threads, ~${(threadTokens / 1e6).toFixed(2)}M tokens of cleaned email text`)
      log(`Estimates (list prices, Batch API 50% off; real cost depends on how many threads are relevant):`)
      for (const model of ['claude-haiku-5-5', 'claude-sonnet-5-5']) {
        log(`  extract with ${model}: ${usd(costOf(model, ex, true))}   |   fold with ${model}: ${usd(costOf(model, fo, true))}`)
      }
      log(`Configured: extract=${MODELS.extract}, fold=${MODELS.fold}`)
    }
    return total
  }

  const extract = async (sel: { sample?: number; limit?: number } = {}, model = MODELS.extract) => {
    const threads = selectPending(db, sel)
    if (threads.length === 0) return log('nothing new to extract')
    log(`reading ${threads.length} threads with ${model} (${subscription ? 'Claude subscription, several at a time' : flag('sync') ? 'immediate' : 'Batch API — usually under an hour'})`)
    const r = await extractThreads(db, runner(), threads, loadTaxonomy(), model)
    log(`relevant ${r.relevant} (${r.items} requests), irrelevant ${r.irrelevant}, failed ${r.failed}${r.notRun ? `, not yet read ${r.notRun}` : ''}`)
    r.errors.slice(0, 10).forEach(e => log(`  ${e}`))
    if (r.failed) log(`Failed threads can be re-queued with: npm run kb -- retry`)
  }

  const fold = async () => {
    const window = (opt('window') ?? 'month') as 'month' | 'quarter'
    const r = await foldAll(db, runner(), { window, log })
    if (runner().stopped) return
    log(`${r.windows} months processed, ${r.created} new entries${r.failed ? `, ${r.failed} threads failed (run again to retry)` : ''}`)
  }

  const render = () => {
    const out = opt('out') ?? 'kb-out'
    const r = renderAll(db, out)
    log(`directory: ${r.entries} kinds of request in ${r.domains} domains → ${out}/README.md, ${out}/directory.csv`)
  }

  const spend = () => {
    const calls = db.prepare(`SELECT kind, model, batch, COUNT(*) n, SUM(input_tokens) i, SUM(output_tokens) o, SUM(cache_read) cr, SUM(cache_write) cw
      FROM llm_calls GROUP BY kind, model, batch`).all() as { kind: string; model: string; batch: number; n: number; i: number; o: number; cr: number; cw: number }[]
    let total = 0
    for (const c of calls) {
      if (knownPrice(c.model)) total += costOf(c.model, { input: c.i, output: c.o, cacheRead: c.cr, cacheWrite: c.cw }, c.batch === 1)
    }
    return { calls, total }
  }

  switch (cmd) {
    case 'run':
    case 'update': {
      if (positional.length) await ingest(positional)
      const pending = (db.prepare("SELECT COUNT(*) n FROM threads WHERE status = 'pending'").get() as { n: number }).n
      if (pending > 0) {
        runner() // fail before asking if Claude Code / the API key is missing
        const question = subscription
          ? `Analyse ${pending} threads with your Claude subscription (about ${pending} short requests to ${MODELS.extract}; they count toward your plan's usage limits, no extra charge)?`
          : `Analyse ${pending} threads for about ${usd(estimate(true))}?`
        if (!(await confirm(question))) { log('Stopped; nothing was used.'); break }
        await extract()
        if (stoppedNote()) { render(); break }
      }
      await fold()
      if (stoppedNote()) { render(); break }
      render()
      if (!subscription) log(`total spend so far ≈ ${usd(spend().total)}`)
      log(`\nDone. On the phone: open the "Qui contacter" page in the Claude app → Sources → Importer kb.json (file: kb-out/kb.json).`)
      log(`On this laptop: npm run ask`)
      break
    }

    case 'ingest':
      await ingest(positional)
      break

    case 'teams': {
      // { "jane.doe@inwi.ma": "Infra Ops / DSI", "@vendor.com": "Vendor X" }  (overrides departments guessed from signatures)
      const file = positional[0]
      if (!file) throw new Error('usage: kb teams <teams.json>')
      const map = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>
      tx(db, () => {
        for (const [key, team] of Object.entries(map)) {
          const k = key.toLowerCase()
          if (k.startsWith('@')) db.prepare('UPDATE people SET team = ? WHERE addr LIKE ?').run(team, `%${k}`)
          else db.prepare('INSERT INTO people(addr, name, team) VALUES (?, \'\', ?) ON CONFLICT(addr) DO UPDATE SET team = excluded.team').run(k, team)
        }
      })
      log(`applied ${Object.keys(map).length} team mappings; run "npm run kb -- render" to update the directory`)
      break
    }

    case 'estimate':
      estimate()
      break

    case 'emails': {
      const out = opt('out') ?? 'kb-out/emails.xlsx'
      mkdirSync(dirname(out), { recursive: true })
      const r = exportEmails(db, out)
      log(`${r.emails} emails and ${r.threads} threads → ${out}`)
      break
    }

    case 'extract':
      await extract({ sample: opt('sample') ? Number(opt('sample')) : undefined, limit: opt('limit') ? Number(opt('limit')) : undefined }, opt('model') ?? MODELS.extract)
      break

    case 'retry': {
      const r = db.prepare("UPDATE threads SET status = 'pending' WHERE status = 'failed'").run()
      log(`${r.changes} threads back to pending`)
      break
    }

    case 'fold':
      await fold()
      break

    case 'render':
      render()
      break

    case 'stats': {
      log('threads: ' + (db.prepare('SELECT status, COUNT(*) n FROM threads GROUP BY status').all() as { status: string; n: number }[])
        .map(r => `${r.status} ${r.n}`).join(', '))
      log('entries: ' + (db.prepare('SELECT domain, COUNT(*) n FROM entries WHERE merged_into IS NULL GROUP BY domain ORDER BY n DESC').all() as { domain: string; n: number }[])
        .map(r => `${r.domain} ${r.n}`).join(', '))
      const { calls, total } = spend()
      for (const c of calls) {
        const cost = costOf(c.model, { input: c.i, output: c.o, cacheRead: c.cr, cacheWrite: c.cw }, c.batch === 1)
        const price = c.model.endsWith('(abonnement)') ? 'Claude subscription' : knownPrice(c.model) ? `≈ ${usd(cost)}` : '?'
        log(`  ${c.kind.padEnd(8)} ${c.model.padEnd(18)} ${c.batch ? 'batch' : 'sync '} ${String(c.n).padStart(6)} calls  in ${c.i} out ${c.o} cache-read ${c.cr}  ${price}`)
      }
      if (calls.some(c => !c.model.endsWith('(abonnement)'))) log(`API spend so far ≈ ${usd(total)} (list prices; questions asked in the assistant are not included)`)
      break
    }

    default:
      log(USAGE)
  }
  closeDb()
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})

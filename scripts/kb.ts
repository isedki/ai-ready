/**
 * Email → "who to ask for what" directory, clustered by domain / subdomain.
 *
 *   npm run kb -- ingest dump.pst            parse PST (or a folder of .eml), clean, redact, thread
 *   npm run kb -- teams teams.json           optional: force departments for addresses / @domains
 *   npm run kb -- estimate                   token count and cost estimate before spending anything
 *   npm run kb -- extract --sample 150 --sync   trial run on a random sample
 *   npm run kb -- extract                    pass 1 over every pending thread (Batch API, 50% off)
 *   npm run kb -- fold                       pass 2: replay month by month into directory entries
 *   npm run kb -- render --out kb-out        README.md by domain, directory.csv, contacts.md, kb.json
 *   npm run kb -- stats                      progress and spend so far
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { openDb, closeDb, tx }      from '../lib/kb/db'
import { ingestPst }                from '../lib/kb/ingest/pst'
import { ingestEmlDir }             from '../lib/kb/ingest/eml'
import { buildThreads, unifyExchangeAddresses } from '../lib/kb/threads'
import { extractThreads, selectPending } from '../lib/kb/extract'
import { foldAll }                  from '../lib/kb/fold'
import { renderAll }                from '../lib/kb/render'
import { AnthropicRunner, MODELS, costOf, knownPrice } from '../lib/kb/llm'
import { estimateTokens }           from '../lib/kb/clean'
import { extractSystem }            from '../lib/kb/prompts'
import { loadTaxonomy }             from '../lib/kb/taxonomy'

const USAGE = `Email → "who to ask for what" directory, clustered by domain / subdomain.\n\n  npm run kb -- ingest dump.pst            parse PST (or a folder of .eml), clean, redact, thread\n  npm run kb -- teams teams.json           optional: force departments for addresses / @domains\n  npm run kb -- estimate                   token count and cost estimate before spending anything\n  npm run kb -- extract --sample 150 --sync   trial run on a random sample\n  npm run kb -- extract                    pass 1 over every pending thread (Batch API, 50% off)\n  npm run kb -- fold                       pass 2: replay month by month into directory entries\n  npm run kb -- render --out kb-out        README.md by domain, directory.csv, contacts.md, kb.json\n  npm run kb -- stats                      progress and spend so far`

const [cmd, ...rest] = process.argv.slice(2)
const flag = (name: string) => rest.includes(`--${name}`)
const opt  = (name: string) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined }
const VALUE_OPTS = new Set(['--sample', '--limit', '--model', '--window', '--out'])
const positional = rest.filter((a, i) => !a.startsWith('--') && !VALUE_OPTS.has(rest[i - 1]))
const log = (s: string) => console.log(s)
const usd = (n: number) => `$${n.toFixed(2)}`

async function main() {
  const db = openDb()
  const runner = () => {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) throw new Error('Set ANTHROPIC_API_KEY first.')
    return new AnthropicRunner(db, flag('sync') ? 'sync' : 'batch', log)
  }

  switch (cmd) {
    case 'ingest': {
      if (positional.length === 0) throw new Error('usage: kb ingest <file.pst | eml-folder> …')
      for (const p of positional) {
        if (!existsSync(p)) throw new Error(`not found: ${p}`)
        const r = statSync(p).isDirectory()
          ? await ingestEmlDir(db, p)
          : ingestPst(db, p, n => process.stdout.write(`\r  ${n} messages…`))
        log(`\n${p}: ${r.seen} messages read, ${r.inserted} new`)
      }
      log(`unified ${unifyExchangeAddresses(db)} Exchange addresses`)
      const t = buildThreads(db)
      const noise = db.prepare('SELECT COUNT(*) n FROM messages WHERE is_noise = 1').get() as { n: number }
      log(`${t.threads} threads (${t.pending} to analyse, ${t.skipped} skipped as noise/empty); ${noise.n} noise messages filtered`)
      break
    }

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
      log(`applied ${Object.keys(map).length} team mappings`)
      break
    }

    case 'estimate': {
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
      log(`${n} threads, ~${(threadTokens / 1e6).toFixed(2)}M tokens of cleaned email text`)
      log(`Estimates (list prices, Batch API 50% off; real cost depends on how many threads are relevant):`)
      for (const model of ['claude-haiku-5-5', 'claude-sonnet-5-5']) {
        log(`  extract with ${model}: ${usd(costOf(model, ex, true))}   |   fold with ${model}: ${usd(costOf(model, fo, true))}`)
      }
      log(`Configured: extract=${MODELS.extract}, fold=${MODELS.fold}`)
      break
    }

    case 'extract': {
      const model = opt('model') ?? MODELS.extract
      const sample = opt('sample') ? Number(opt('sample')) : undefined
      const limit  = opt('limit') ? Number(opt('limit')) : undefined
      const threads = selectPending(db, { sample, limit })
      log(`extracting ${threads.length} threads with ${model} (${flag('sync') ? 'sync' : 'batch'})`)
      const r = await extractThreads(db, runner(), threads, loadTaxonomy(), model)
      log(`relevant ${r.relevant} (${r.items} requests), irrelevant ${r.irrelevant}, failed ${r.failed}`)
      r.errors.slice(0, 10).forEach(e => log(`  ${e}`))
      if (r.failed) log(`Failed threads are marked 'failed'; reset with: kb retry`)
      break
    }

    case 'retry': {
      const r = db.prepare("UPDATE threads SET status = 'pending' WHERE status = 'failed'").run()
      log(`${r.changes} threads back to pending`)
      break
    }

    case 'fold': {
      const window = (opt('window') ?? 'month') as 'month' | 'quarter'
      const r = await foldAll(db, runner(), { window, log })
      log(`${r.windows} windows, ${r.created} entries created, ${r.failed} threads failed (re-run fold to retry them)`)
      break
    }

    case 'render': {
      const out = opt('out') ?? 'kb-out'
      const r = renderAll(db, out)
      log(`wrote ${r.entries} entries in ${r.domains} domains to ${out}/`)
      break
    }

    case 'stats': {
      log('threads: ' + (db.prepare('SELECT status, COUNT(*) n FROM threads GROUP BY status').all() as { status: string; n: number }[])
        .map(r => `${r.status} ${r.n}`).join(', '))
      log('entries: ' + (db.prepare('SELECT domain, COUNT(*) n FROM entries WHERE merged_into IS NULL GROUP BY domain ORDER BY n DESC').all() as { domain: string; n: number }[])
        .map(r => `${r.domain} ${r.n}`).join(', '))
      const calls = db.prepare(`SELECT kind, model, batch, COUNT(*) n, SUM(input_tokens) i, SUM(output_tokens) o, SUM(cache_read) cr, SUM(cache_write) cw
        FROM llm_calls GROUP BY kind, model, batch`).all() as { kind: string; model: string; batch: number; n: number; i: number; o: number; cr: number; cw: number }[]
      let total = 0
      for (const c of calls) {
        const cost = costOf(c.model, { input: c.i, output: c.o, cacheRead: c.cr, cacheWrite: c.cw }, c.batch === 1)
        if (knownPrice(c.model)) total += cost
        log(`  ${c.kind.padEnd(8)} ${c.model.padEnd(18)} ${c.batch ? 'batch' : 'sync '} ${String(c.n).padStart(6)} calls  in ${c.i} out ${c.o} cache-read ${c.cr}  ≈ ${knownPrice(c.model) ? usd(cost) : '?'}`)
      }
      log(`spend so far ≈ ${usd(total)} (list prices)`)
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

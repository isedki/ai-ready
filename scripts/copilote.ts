/**
 * Copilote projet : questions-réponses sourcées sur les documents et les emails d'un projet.
 *
 *   npm run copilote -- ingest <fichier|dossier>...   PDF, Word, Excel, PowerPoint, .md/.txt/.csv, .eml, packs .json
 *        [--kind doc|email|suivi|annuaire|formation|note] [--restreint]
 *   npm run copilote -- watch <dossier>               réindexe le dossier toutes les 5 min (dossier Drive synchronisé)
 *   npm run copilote -- import-kb [data/kb.sqlite]    importe les fils d'emails déjà nettoyés par npm run kb
 *   npm run copilote -- embed                         calcule les vecteurs (COPILOTE_EMBEDDINGS=local)
 *   npm run copilote -- search "<question>"           recherche seule, sans appel à Claude
 *   npm run copilote -- ask "<question>"              réponse sourcée dans le terminal
 *   npm run copilote -- eval [eval/questions.json] [--answers]   rappel de la recherche (et réponses si --answers)
 *   npm run copilote -- sources [mot]                 liste les sources indexées
 *   npm run copilote -- prune                         retire les fichiers supprimés du disque
 *   npm run copilote -- stats
 *
 * Base : data/copilote.sqlite (COPILOTE_DB). Clé API : ANTHROPIC_API_KEY dans .env.local.
 */
import { existsSync, readFileSync } from 'node:fs'
import { answer }                   from '../lib/copilote/agent'
import { embedMissing, embeddingsEnabled } from '../lib/copilote/embed'
import { importEmailKb, ingestPaths, pruneMissing } from '../lib/copilote/ingest'
import { listSources, search }      from '../lib/copilote/search'
import { openStore, stats }         from '../lib/copilote/store'
import { runEval }                  from '../lib/copilote/eval'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

const USAGE = readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*\*\n/, '').replace(/^ \* ?/gm, '')
const [cmd, ...rest] = process.argv.slice(2)
const flags = new Set(rest.filter(a => a.startsWith('--')))
const args  = rest.filter((a, i) => !a.startsWith('--') && !(rest[i - 1] === '--kind'))
const kindArg = rest.includes('--kind') ? rest[rest.indexOf('--kind') + 1] : undefined

async function main() {
  const db = openStore()
  switch (cmd) {
    case 'ingest': {
      if (!args.length) throw new Error('Indique un fichier ou un dossier.')
      const rep = await ingestPaths(db, args, { kind: kindArg, sensitivity: flags.has('--restreint') ? 'restreint' : undefined, log: console.log })
      console.log(`\n${rep.added} ajoutés, ${rep.replaced} mis à jour, ${rep.unchanged} inchangés, ${rep.failed.length} en échec, ${rep.chunks} passages écrits.`)
      if (embeddingsEnabled() && rep.chunks) console.log(`Vecteurs : ${await embedMissing(db)} passages calculés.`)
      break
    }
    case 'watch': {
      if (!args.length) throw new Error('Indique le dossier à surveiller.')
      const every = Number(process.env.COPILOTE_WATCH_MINUTES ?? 5) * 60_000
      const tick = async () => {
        const rep = await ingestPaths(db, args, { kind: kindArg })
        const pruned = pruneMissing(db)
        if (rep.added || rep.replaced || pruned || rep.failed.length) {
          console.log(`${new Date().toISOString()} +${rep.added} ~${rep.replaced} -${pruned}${rep.failed.length ? ` !${rep.failed.length}` : ''}`)
          if (embeddingsEnabled()) await embedMissing(db)
        }
      }
      await tick()
      console.log(`Surveillance de ${args.join(', ')} toutes les ${every / 60_000} min (Ctrl+C pour arrêter).`)
      setInterval(() => { tick().catch(e => console.error(e)) }, every)
      return
    }
    case 'import-kb': {
      const rep = importEmailKb(db, args[0], console.log)
      console.log(`${rep.added} fils ajoutés, ${rep.replaced} mis à jour, ${rep.unchanged} inchangés (${rep.chunks} passages).`)
      break
    }
    case 'embed': {
      if (!embeddingsEnabled()) throw new Error('Mets COPILOTE_EMBEDDINGS=local (et npm install @huggingface/transformers).')
      console.log(`${await embedMissing(db, s => process.stdout.write(`\r${s}`))} passages vectorisés.`)
      break
    }
    case 'search': {
      const q = args.join(' ')
      for (const [i, h] of (await search(db, q, { k: 10, kind: kindArg })).entries()) {
        console.log(`\n[${i + 1}] ${h.title}${h.version ? ` v${h.version}` : ''} · ${h.kind} · ${h.date ?? ''} · ${h.locator ?? ''}  (score ${h.score.toFixed(2)})`)
        console.log(h.text.slice(0, 300).replace(/\n+/g, ' ') + (h.text.length > 300 ? '…' : ''))
      }
      break
    }
    case 'ask': {
      const sources: string[] = []
      for await (const ev of answer(args.join(' '), { telco: !flags.has('--strict'), db })) {
        if (ev.type === 'status') process.stderr.write(`\x1b[2m· ${ev.text}\x1b[0m\n`)
        else if (ev.type === 'source') sources.push(`[${ev.source.ref}] ${ev.source.title}${ev.source.version ? ` v${ev.source.version}` : ''} · ${ev.source.date ?? ''} · ${ev.source.locator ?? ''}`)
        else if (ev.type === 'text') process.stdout.write(ev.delta)
        else if (ev.type === 'error') console.error(`\n${ev.message}`)
        else if (ev.type === 'done') {
          const cited = new Set(ev.check.cited)
          console.log('\n\nSources citées :\n' + sources.filter(s => cited.has(s.slice(1, s.indexOf(']')))).join('\n'))
          if (ev.check.unknown.length) console.log(`Références inconnues : ${ev.check.unknown.join(', ')}`)
          if (ev.check.unsourced) console.log('Attention : réponse sans aucune référence.')
          console.log(`\n${ev.model} · ${ev.usage.input} in / ${ev.usage.output} out / ${ev.usage.cacheRead} cache`)
        }
      }
      break
    }
    case 'eval': {
      await runEval(db, args[0] ?? 'eval/questions.json', { answers: flags.has('--answers'), log: console.log })
      break
    }
    case 'sources': {
      console.table(listSources(db, { q: args[0], kind: kindArg, limit: 200 }))
      break
    }
    case 'prune': {
      console.log(`${pruneMissing(db)} sources retirées.`)
      break
    }
    case 'stats': {
      console.log(stats(db))
      break
    }
    default:
      console.log(USAGE)
  }
}

main().catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1) })

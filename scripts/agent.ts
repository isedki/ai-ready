/**
 * Agent PMO packagé : une configuration par projet, des gabarits de tâches communs.
 *
 *   npm run agent -- validate [projet]          vérifie agent/projects/<projet>/config.json
 *   npm run agent -- render   [projet]          écrit dist/agent/<projet>/tasks.json et un .md par tâche
 *   npm run agent -- rules-pack [projet]        écrit dist/agent/<projet>/p-regles.json (règles → pack kb)
 *   npm run agent -- index    [projet]          export du Copilote (<corpus>/raw) → packs → index local
 *   npm run agent -- install  [projet]          affiche la marche à suivre pour créer les tâches programmées
 *
 * Projet par défaut : AGENT_PROJECT, sinon « phenix ». Voir docs/agent.md.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve }                     from 'node:path'
import { loadConfig }                        from '../lib/agent/config'
import { buildPacks }                        from '../lib/agent/corpus'
import { renderTasks, rulesPack }            from '../lib/agent/render'
import { ingestPaths }                       from '../lib/copilote/ingest'
import { getMeta, openStore, setMeta, stats } from '../lib/copilote/store'

const [cmd, projectArg] = process.argv.slice(2)
const project = projectArg ?? process.env.AGENT_PROJECT ?? 'phenix'
const projectDir = join('agent', 'projects', project)
const configPath = join(projectDir, 'config.json')
const outDir = join('dist', 'agent', project)

const USAGE = readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*\*\n/, '').replace(/^ \* ?/gm, '')

function newest(dir: string): number {
  if (!existsSync(dir)) return 0
  let t = 0
  for (const f of readdirSync(dir, { recursive: true }) as string[]) {
    const s = statSync(join(dir, f))
    if (s.isFile()) t = Math.max(t, s.mtimeMs)
  }
  return t
}

async function main() {
  switch (cmd) {
    case 'validate': {
      const cfg = loadConfig(configPath)
      renderTasks(cfg)
      console.log(`${configPath} : valide (${cfg.personnes.length} personnes, ${cfg.taches.length} tâches, ${cfg.priorites.ordre.length} priorités).`)
      break
    }
    case 'render': {
      const cfg = loadConfig(configPath)
      const tasks = renderTasks(cfg)
      mkdirSync(outDir, { recursive: true })
      writeFileSync(join(outDir, 'tasks.json'), JSON.stringify(tasks, null, 2))
      for (const t of tasks) writeFileSync(join(outDir, `${t.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')}.md`), t.prompt + '\n')
      console.log(`${tasks.length} tâches écrites dans ${outDir} (tasks.json + un .md par tâche).`)
      break
    }
    case 'rules-pack': {
      const dir = join(projectDir, 'rules')
      const files = readdirSync(dir).filter(f => f.endsWith('.md')).sort()
        .map(f => ({ name: f.replace(/\.md$/, ''), text: readFileSync(join(dir, f), 'utf8') }))
      mkdirSync(outDir, { recursive: true })
      const file = join(outDir, 'p-regles.json')
      writeFileSync(file, JSON.stringify(rulesPack(files, new Date().toISOString().slice(0, 10)), null, 1))
      console.log(`${files.length} règles → ${file} (à écrire dans kb/p-regles avec ArtifactData, if_version).`)
      break
    }
    case 'index': {
      const cfg = loadConfig(configPath)
      const raw = join(cfg.index.corpus, 'raw')
      const packs = join(cfg.index.corpus, 'packs')
      const docs = join(cfg.index.corpus, 'files')
      process.env.COPILOTE_DB ??= cfg.index.db
      const db = openStore()
      const last = Date.parse(getMeta(db, 'agent_index_at') ?? '') || 0
      if (last && last >= Math.max(newest(raw), newest(docs))) {
        console.log(`Index à jour (${resolve(process.env.COPILOTE_DB)}) : rien de plus récent dans ${cfg.index.corpus}.`)
        console.log(stats(db))
        break
      }
      const built = buildPacks(raw, packs)
      console.log(`${built.chunks} extraits en ${built.files} packs (${packs}).`)
      const rep = await ingestPaths(db, [packs, ...(existsSync(docs) ? [docs] : [])])
      console.log(`${rep.added} ajoutés, ${rep.replaced} mis à jour, ${rep.unchanged} inchangés, ${rep.failed.length} en échec.`)
      for (const f of rep.failed) console.log(`  ! ${f.path} : ${f.error}`)
      setMeta(db, 'agent_index_at', new Date().toISOString())
      console.log(stats(db))
      break
    }
    case 'install': {
      const cfg = loadConfig(configPath)
      const tasks = renderTasks(cfg)
      mkdirSync(outDir, { recursive: true })
      writeFileSync(join(outDir, 'tasks.json'), JSON.stringify(tasks, null, 2))
      console.log(`Tâches prêtes dans ${join(outDir, 'tasks.json')}. Dans une session Claude Code liée à ce dépôt, demande :`)
      console.log(`  « Installe les tâches de ${join(outDir, 'tasks.json')} : pour chacune, mets à jour la tâche programmée du même nom (update_trigger) ou crée-la (create_trigger), avec son cron et son prompt ; désactive celles marquées enabled: false. »`)
      for (const t of tasks) console.log(`  - ${t.name} · ${t.cron ?? 'à la demande'}${t.enabled ? '' : ' (désactivée)'}`)
      break
    }
    default:
      console.log(USAGE)
      if (cmd) process.exitCode = 1
  }
}

main().catch(e => { console.error((e as Error).message); process.exit(1) })

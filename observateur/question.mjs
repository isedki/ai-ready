#!/usr/bin/env node
// Observateur · question du soir (18h25, lundi→vendredi). Le code choisit le moment le plus marquant
// de la journée (arrêt après plantage, va-et-vient, ralentissement, sujet repris souvent) et pose UNE
// question courte dans une fenêtre macOS. La réponse devient une note, qui fait foi pour l'analyse
// de 18h35 et pour l'équipe d'agents. Sans réponse en 10 minutes, la fenêtre se ferme.
import { execFileSync }                         from 'node:child_process'
import { dayStats, readDay }                    from './analyse.mjs'
import { categorize, loadConfig, localDay }     from './lib.mjs'
import { addNote }                              from './savoir.mjs'
import { eveningQuestion, frustration, workThreads } from './signaux.mjs'

const cfg = loadConfig()
const day = localDay()
const recs = readDay(cfg.dossier_donnees, day)
if (!recs.some(r => !r.inactif)) process.exit(0)

const s = dayStats(recs, cfg)
const q = eveningQuestion({
  frictions: frustration(recs, cfg),
  slowdowns: s.ralentissements,
  threads: workThreads(recs.map(r => ({ ...r, cat: categorize(r, cfg) })), cfg),
})

const esc = x => x.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
const script = `display dialog "${esc(q)}" default answer "" with title "Observateur · question du soir" buttons {"Passer", "Répondre"} default button "Répondre" giving up after 600
if gave up of result then return ""
if button returned of result is "Passer" then return ""
return text returned of result`
let answer = ''
try { answer = execFileSync('osascript', ['-e', script], { encoding: 'utf8', timeout: 660_000 }).trim() } catch { /* fenêtre fermée */ }
if (answer) addNote(cfg, `Question du soir (${day}) : ${q} → Réponse : ${answer}`)
console.log(answer ? 'Réponse notée.' : 'Pas de réponse.')

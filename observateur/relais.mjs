#!/usr/bin/env node
// Relais Drive de l'Observateur : vérifier / réparer.
//   node observateur/relais.mjs verifier [--depuis AAAA-MM-JJ]   rapports absents ou différents, conversations manquantes (code 1 si écart)
//   node observateur/relais.mjs reparer  [--depuis AAAA-MM-JJ]   recopie les rapports absents ou différents (jamais un rapport vide sur un vrai)
// Ne touche ni ~/.observateur ni les formats ; n'écrit que dans « Observateur · rapports » (Drive).
import { loadConfig, isMain } from './lib.mjs'
import { relaisEtat, relaisReparer } from './savoir.mjs'

function rapport(e) {
  const l = [`Drive pour ordinateur : ${e.drive ? 'trouvé' : 'INTROUVABLE'}`]
  l.push(`Rapports absents de Drive : ${e.absents.join(', ') || 'aucun'}`)
  l.push(`Rapports de taille différente : ${e.differents.join(', ') || 'aucun'}`)
  l.push(`Rapports vides gardés hors de Drive (le vrai rapport est conservé) : ${e.vides_proteges.join(', ') || 'aucun'}`)
  l.push(`Jours actifs sans résumé de conversation sur Drive : ${e.conversations_manquantes.join(', ') || 'aucun'} (déposé le soir par la tâche « resume-conversations-frictions »)`)
  return l.join('\n')
}
const ecart = e => !e.drive || e.absents.length || e.differents.length || e.conversations_manquantes.length

export function main(argv = process.argv.slice(2)) {
  const cmd = argv[0], i = argv.indexOf('--depuis'), depuis = i >= 0 ? argv[i + 1] : undefined
  const cfg = loadConfig()
  if (cmd === 'verifier') { const e = relaisEtat(cfg, undefined, { depuis }); console.log(rapport(e)); return ecart(e) ? 1 : 0 }
  if (cmd === 'reparer') {
    const r = relaisReparer(cfg, undefined, { depuis })
    console.log('Recopiés : ' + (r.copies.join(', ') || 'rien') + (r.issues.length ? '\nÉchecs : ' + r.issues.map(x => x.raison).join(' ; ') : '') + '\n--- après\n' + rapport(r.apres))
    return ecart(r.apres) ? 1 : 0
  }
  console.error('usage : relais.mjs verifier|reparer [--depuis AAAA-MM-JJ]'); return 2
}
if (isMain(import.meta.url)) process.exitCode = main()

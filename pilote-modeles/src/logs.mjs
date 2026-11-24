// Lecture lisible du journal des passages (coût, statut, erreurs classées ; jamais de contenu) + fin du journal du planificateur.
import fs from 'node:fs'
import path from 'node:path'
import { JOURNAL_DIR, DATA, ALERTES } from './config.mjs'

export function lignesJournal(n = 30) {
  const toutes = []
  if (fs.existsSync(JOURNAL_DIR)) for (const f of fs.readdirSync(JOURNAL_DIR).filter((x) => x.endsWith('.jsonl')).sort()) {
    for (const l of fs.readFileSync(path.join(JOURNAL_DIR, f), 'utf8').split('\n').filter(Boolean)) { try { toutes.push(JSON.parse(l)) } catch {} }
  }
  return toutes.slice(-n).map((j) => {
    const err = j.erreurs_outils && Object.keys(j.erreurs_outils).length ? ` erreurs=${JSON.stringify(j.erreurs_outils)}` : ''
    const outils = j.appels_outils ? ` outils=${Object.entries(j.appels_outils).map(([k, v]) => `${k}:${v}`).join(',')}` : ''
    return `${j.at.slice(0, 16).replace('T', ' ')} UTC  ${String(j.modele).split('/').pop().padEnd(18)} ${String(j.statut).padEnd(22)} ${j.cout_usd ? j.cout_usd.toFixed(4) + ' $' : '—'.padEnd(8)}  ${j.tours ? `tours=${j.tours} ` : ''}${j.jetons_entree ? `jetons=${j.jetons_entree}/${j.jetons_sortie} ` : ''}${j.taille_rapport != null ? `rapport=${j.taille_rapport} ` : ''}${j.relance ? 'relance ' : ''}${outils}${err}`.trimEnd()
  })
}
export function finPlanificateur(octets = 3000) {
  try { const t = fs.readFileSync(path.join(DATA, 'launchd.log'), 'utf8'); return t.slice(-octets).trim() } catch { return '' }
}
export function alertes() { try { return JSON.parse(fs.readFileSync(ALERTES, 'utf8')) } catch { return {} } }

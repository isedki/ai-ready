// Résumé des coûts par jour et par modèle, lu dans le journal (sans contenu).
import fs from 'node:fs'
import path from 'node:path'
import { JOURNAL_DIR, charger } from './config.mjs'
const cfg = charger()
const lignes = []
if (fs.existsSync(JOURNAL_DIR)) for (const f of fs.readdirSync(JOURNAL_DIR).sort()) for (const l of fs.readFileSync(path.join(JOURNAL_DIR, f), 'utf8').split('\n').filter(Boolean)) { try { lignes.push(JSON.parse(l)) } catch {} }
if (!lignes.length) { console.log('Aucun passage enregistré.'); process.exit(0) }
const par = {}
for (const j of lignes) {
  const k = `${j.at.slice(0, 10)}  ${j.modele}`
  const p = (par[k] ||= { n: 0, ok: 0, usd: 0, jin: 0, jout: 0, max: 0 })
  p.n++; if (j.statut === 'ok') p.ok++; p.usd += j.cout_usd || 0; p.jin += j.jetons_entree || 0; p.jout += j.jetons_sortie || 0; p.max = Math.max(p.max, j.cout_usd || 0)
}
console.log('jour        modèle                          passages  ok   coût $   (max/passage)  jetons entrée/sortie')
for (const [k, p] of Object.entries(par)) console.log(`${k.padEnd(44)}${String(p.n).padStart(4)} ${String(p.ok).padStart(4)}  ${p.usd.toFixed(4)}   ${p.max.toFixed(4)}          ${p.jin}/${p.jout}`)
const tot = lignes.reduce((s, j) => s + (j.cout_usd || 0), 0)
console.log(`\nTotal : ${tot.toFixed(4)} $ sur un plafond de ${cfg.plafonds.total_usd} $ (${((tot / cfg.plafonds.total_usd) * 100).toFixed(1)} %). Cible par passage : ${cfg.plafonds.par_passage_usd} $.`)

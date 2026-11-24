// État du pilote en un coup d'œil (aucun contenu, aucun secret).
import fs from 'node:fs'
import path from 'node:path'
import { charger, mode, JOURNAL_DIR, VERROU } from './config.mjs'
import { depenseTotale } from './lanceur.mjs'
import { scopesJeton } from './google.mjs'
const cfg = charger()
const d = depenseTotale(cfg.compter_depuis || '')
console.log(`Mode d'écriture : ${mode() === 'brouillons' ? `BROUILLONS GMAIL (étiquette ${cfg.ecriture_gmail.etiquette}, modèles : ${cfg.ecriture_gmail.modeles.join(', ')})` : 'OMBRE (fichiers locaux seulement)'}`)
console.log(`Autorisation brouillons Gmail : ${scopesJeton().includes('gmail.modify') ? 'accordée' : 'NON accordée (./pilote.sh connexion)'}`)
console.log(`Horaires (jours ouvrés) : ${cfg.planning.map((p) => `${p.h}h${String(p.m).padStart(2, '0')}`).join(', ')}`)
let verrou = 'aucun passage en cours'
try { const v = JSON.parse(fs.readFileSync(VERROU, 'utf8')); verrou = `passage en cours depuis ${Math.round((Date.now() - v.at) / 60000)} min` } catch {}
console.log(`Verrou : ${verrou}`)
for (const [cle, id] of Object.entries(cfg.modeles).filter(([c]) => cfg.modeles_par_passage.includes(c))) {
  const m = d.par[id] || { essais: 0, ok: 0 }
  console.log(`Modèle ${cle} (${id}) : ${m.ok}/${cfg.plafonds.passages_max} passages réussis, ${m.essais} essai(s)`)
}
console.log(`Dépense totale : ${d.usd.toFixed(4)} $ sur ${cfg.plafonds.total_usd} $`)
const lignes = []
if (fs.existsSync(JOURNAL_DIR)) for (const f of fs.readdirSync(JOURNAL_DIR).sort().slice(-2)) for (const l of fs.readFileSync(path.join(JOURNAL_DIR, f), 'utf8').split('\n').filter(Boolean)) { try { lignes.push(JSON.parse(l)) } catch {} }
console.log('Derniers passages :')
for (const j of lignes.slice(-4)) console.log(`  ${j.at.slice(0, 16).replace('T', ' ')} UTC  ${String(j.modele).split('/').pop().padEnd(20)} ${j.statut}${j.cout_usd ? `  ${j.cout_usd.toFixed(4)} $` : ''}`)

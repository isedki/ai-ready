// Contrôle public (sans clé, sans donnée du projet) : les modèles du pilote existent-ils, avec outils et zéro rétention, aux prix de la config ?
import { charger } from './config.mjs'
const cfg = charger()
const get = async (u) => (await fetch(u)).json()
const [liste, zdr] = await Promise.all([get('https://openrouter.ai/api/v1/models'), get('https://openrouter.ai/api/v1/endpoints/zdr')])
let ko = 0
for (const [cle, id] of Object.entries(cfg.modeles)) {
  const m = liste.data.find((x) => x.id === id)
  const z = zdr.data.filter((e) => e.model_id === id)
  const prix = m && [+m.pricing.prompt * 1e6, +m.pricing.completion * 1e6]
  const attendu = cfg.prix_par_million_usd[id]
  const prixOk = prix && attendu && Math.abs(prix[0] - attendu[0]) < 1e-6 && Math.abs(prix[1] - attendu[1]) < 1e-6
  const ok = m && m.supported_parameters.includes('tools') && z.length > 0 && prixOk
  if (!ok) ko++
  console.log(`${cle.padEnd(4)} ${id.padEnd(34)} existe:${m ? 'oui' : 'NON'} outils:${m?.supported_parameters.includes('tools') ? 'oui' : 'NON'} zéro-rétention:${z.length ? 'oui (' + z.length + ' point(s) d\'accès)' : 'NON'} prix:${prix ? prix.map((x) => x.toFixed(2)).join('/') : '?'} ${prixOk ? '(conforme à la config)' : '(DIFFÉRENT de la config)'}`)
}
process.exit(ko ? 1 : 0)

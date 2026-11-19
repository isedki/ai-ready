// Passerelle : fonctions pures (testées sans Mac).
import { createHash } from 'node:crypto'

/** Empreinte d'un brouillon : change si l'objet, les destinataires ou le texte changent. */
export function fingerprint(d) {
  return createHash('sha256').update(JSON.stringify([d.subject, d.to, d.cc, d.content])).digest('hex').slice(0, 16)
}

/**
 * Brouillons à recopier : ceux du compte Gmail préparés par l'assistant (Issam en copie à son adresse
 * waroom, c'est la règle de tous ses brouillons), pas encore recopiés dans cette version.
 */
export function toCopy(drafts, state, cfg) {
  const own = cfg.adresse_waroom.toLowerCase()
  return drafts.filter(d =>
    d.account === cfg.compte_gmail &&
    [...d.to, ...d.cc].map(a => a.toLowerCase()).includes(own) &&
    state.copies[d.id] !== fingerprint(d))
}

/** Une ligne de journal lisible. */
export function logLine(now, d, ok, why = '') {
  return `${now.toISOString()} ${ok ? 'copié' : 'ÉCHEC'} « ${d.subject} » → ${d.to.join(', ')}${why ? ` (${why})` : ''}`
}

/** Lit la sortie de DRAFTS_AS. */
export function parseDrafts(text, account) {
  if (text.startsWith('ERREUR\x1f')) return { erreur: `Dossier Brouillons introuvable dans ${account} : ${text.slice(7)}` }
  const split = s => s.split(',').map(x => x.trim()).filter(Boolean)
  const records = text.split('\x1e').filter(r => r.includes('\x1f'))
  const head = records[0]?.startsWith('COMPTE\x1f') ? records.shift() : null
  const list = records.map(r => {
    const [id, subject, to, cc, ...content] = r.split('\x1f')
    return { id: id.trim(), account, subject, to: split(to), cc: split(cc), content: content.join('\x1f') }
  })
  // Nombre de brouillons récents vus par Mail, avant le filtre sur l'adresse waroom (diagnostic).
  list.recent = head ? Number(head.split('\x1f')[1]) : list.length
  return list
}

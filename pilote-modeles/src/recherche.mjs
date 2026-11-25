// US-9 : recherche directe (sans modèle, sans coût) dans la base Copilote et dans les mails. LECTURE SEULE.
// Copilote : seuls les outils `search` et `read_around` du serveur MCP local sont appelés (liste blanche).
// Mails : API Gmail en lecture (le même consentement que le pilote). Rien n'est écrit, rien n'est envoyé.
import { api } from './google.mjs'
import { disponibleLocal, appelLocal } from './copilote.mjs'
import { journaliser } from './journal.mjs'

const q = encodeURIComponent
const OUTILS_COPILOTE = new Set(['search', 'read_around'])
const court = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s }

// Format du serveur : « [id] titre vN · kind · date · auteur… » puis le texte du passage.
export function analyserCopilote(texte) {
  return String(texte || '').split(/\n(?=\[\d+\] )/).filter((b) => /^\[\d+\] /.test(b)).map((b) => {
    const [entete, ...reste] = b.split('\n'), champs = entete.replace(/^\[\d+\] /, '').split(' · ')
    return { id: +entete.match(/^\[(\d+)\]/)[1], titre: court(champs[0], 120), source: `Copilote · ${champs[1] || '?'}`, date: champs[2] || 'sans date', extrait: court(reste.join(' '), 280) }
  })
}

export async function appelCopilote(nom, args) {
  if (!OUTILS_COPILOTE.has(nom)) throw new Error('Copilote : outil non autorisé en recherche')
  return appelLocal(nom, args)
}

async function chercherCopilote(requete, kind) {
  if (!disponibleLocal()) return { etat: 'indisponible', resultats: [] }
  try { return { etat: 'ok', resultats: analyserCopilote(await appelCopilote('search', { query: requete, k: 8, ...(kind ? { kind } : {}) })) } } catch { return { etat: 'erreur', resultats: [] } }
}

async function chercherMails(requete) {
  try {
    const l = await api(`gmail.googleapis.com/gmail/v1/users/me/threads?q=${q(requete)}&maxResults=8`)
    const lot = await Promise.all((l.threads || []).slice(0, 8).map((t) => api(`gmail.googleapis.com/gmail/v1/users/me/threads/${t.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`).then((f) => ({ f, snippet: t.snippet }))))
    const h = (hs, n) => (hs || []).find((x) => x.name.toLowerCase() === n)?.value || ''
    return { etat: 'ok', resultats: lot.map(({ f, snippet }) => { const m = f.messages?.[f.messages.length - 1]; return { id: f.id, titre: court(h(m?.payload?.headers, 'subject') || '(sans objet)', 120), source: `Mail · ${court(h(m?.payload?.headers, 'from'), 50)}`, date: m?.internalDate ? new Date(+m.internalDate).toISOString().slice(0, 10) : 'sans date', extrait: court(snippet, 280) } }) }
  } catch (e) { return { etat: /jeton|Google 40[13]|pas de jeton/i.test(String(e.message)) ? 'non autorisé' : 'erreur', resultats: [] } }
}

export async function rechercher({ requete, copilote = true, mails = true, kind } = {}) {
  const mots = String(requete || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200)
  if (!mots) return { erreur: 'requête vide' }
  const t0 = Date.now()
  const [c, m] = await Promise.all([copilote ? chercherCopilote(mots, kind) : null, mails ? chercherMails(mots) : null])
  // Journal : nombre de résultats et durée seulement (ni requête ni extrait).
  journaliser({ agent: 'recherche', statut: 'ok', nb_copilote: c?.resultats.length ?? null, nb_mails: m?.resultats.length ?? null, duree_ms: Date.now() - t0, cout_usd: 0 })
  return { copilote: c, mails: m }
}

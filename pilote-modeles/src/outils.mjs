// Outils exposés au modèle. TOUS en lecture seule, sauf deux écritures LOCALES : brouillon (fichier) et notification.
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { api, apiEcrire, scopesJeton } from './google.mjs'
import { BROUILLONS_DIR, lireEnv, charger, mesAdresses, ccAuto, mode } from './config.mjs'
import { disponibleLocal, appelLocal } from './copilote.mjs'

const b64 = (s) => Buffer.from(String(s || ''), 'base64url').toString('utf8')
const entete = (hs, n) => (hs || []).find((h) => h.name.toLowerCase() === n)?.value || ''
const q = encodeURIComponent

function texteDe(part, acc = { texte: [], pj: [] }) {
  if (!part) return acc
  if (part.filename) acc.pj.push(part.filename)
  else if (part.mimeType === 'text/plain' && part.body?.data) acc.texte.push(b64(part.body.data))
  for (const p of part.parts || []) texteDe(p, acc)
  return acc
}


const BRUIT = ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_FORUMS', 'CATEGORY_UPDATES']

// Classement par importance (déterministe). Critères : ce que TU as fait récemment (réponse envoyée),
// les échanges avec plusieurs allers-retours, une réponse qu'on attend de toi, importants/non lus/étoilés, activité récente.
const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
export function noter(f, maintenant = Date.now(), cfg = charger(), moi = mesAdresses()) {
  const ms = f.messages || []
  const dernier = ms[ms.length - 1]
  const h = (t) => (maintenant - t) / 3600000
  const deMoi = (m) => (m.labelIds || []).includes('SENT') || moi.some((a) => String((m.payload?.headers || []).find((x) => x.name.toLowerCase() === 'from')?.value || '').toLowerCase().includes(a))
  const mes = ms.filter(deMoi)
  const monDernier = mes.length ? Math.max(...mes.map((m) => +m.internalDate)) : 0
  const labels = new Set(ms.flatMap((m) => m.labelIds || []))
  const exp = ms.map((m) => (m.payload?.headers || []).find((x) => x.name.toLowerCase() === 'from')?.value || '')
  let allers = 0
  for (let i = 1; i < exp.length; i++) if (exp[i] !== exp[i - 1]) allers++
  const pourquoi = []
  let score = 0
  const ajoute = (n, t) => { score += n; pourquoi.push(t) }
  if (monDernier && h(monDernier) <= 8) ajoute(6, 'tu as répondu il y a moins de 8 h')
  else if (monDernier && h(monDernier) <= 24) ajoute(4, 'tu as répondu dans les 24 h')
  else if (monDernier && h(monDernier) <= 72) ajoute(2, 'tu as répondu dans les 3 jours')
  if (allers >= 4) ajoute(4, `${allers} allers-retours`)
  else if (allers >= 2) ajoute(2, `${allers} allers-retours`)
  if (monDernier && +dernier.internalDate > monDernier && !deMoi(dernier)) ajoute(3, 'on attend ta réponse (dernier message reçu après le tien)')
  if (labels.has('IMPORTANT')) ajoute(2, 'marqué important')
  if (labels.has('UNREAD')) ajoute(2, 'non lu')
  if (labels.has('STARRED')) ajoute(3, 'étoilé')
  // Critères de contenu (config/pilote.json > mots_importants) : blocages, accès impossibles, flux, recette, retards, urgence.
  const texte = norm(`${f.texte || ''} ${(dernier.payload?.headers || []).find((x) => x.name.toLowerCase() === 'subject')?.value || ''}`)
  let bonus = 0
  for (const [nom, { poids, mots }] of Object.entries(cfg.mots_importants || {})) {
    const trouve = mots.find((w) => new RegExp(`(^|[^a-z0-9])${norm(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(texte))
    if (trouve && bonus < (cfg.mots_importants_plafond ?? 8)) { bonus += poids; ajoute(poids, `${nom} (« ${trouve} »)`) }
  }
  if (h(+dernier.internalDate) <= 8) ajoute(1, 'activité de moins de 8 h')
  if (ms.length >= 8) ajoute(1, 'long fil')
  if ([...labels].some((l) => BRUIT.includes(l)) && !monDernier) ajoute(-4, 'catégorie promotions/mises à jour')
  return { score, pourquoi }
}

async function fils(query, max) {
  // Candidats : Gmail cherche lui-même les fils importants (l'ordre de la liste simple n'est pas chronologique,
  // un fil important peut être très loin). Union : importants, non lus utiles, TES envois, mots-clés de blocage/retard…, plus la recherche demandée.
  const cfg = charger()
  const mots = Object.values(cfg.mots_importants || {}).flatMap((x) => x.mots).map((w) => (/\s|-/.test(w) ? `"${w}"` : w))
  const requetes = [
    [query, Math.min(max, 40)],
    ['newer_than:2d is:important', 50],
    ['newer_than:2d is:unread -category:promotions -category:updates -category:social', 40],
    ['in:sent newer_than:3d', 30],
    ...mesAdresses().map((a) => [`from:${a} newer_than:3d`, 30]),
    ['is:starred newer_than:5d', 20],
    [`newer_than:2d {${mots.join(' ')}}`, 40],
  ]
  const listes = await Promise.all(requetes.map(([r, n]) => api(`gmail.googleapis.com/gmail/v1/users/me/threads?q=${q(r)}&maxResults=${n}`).catch(() => ({}))))
  const tous = new Map()
  for (const l of listes) for (const t of l.threads || []) if (!tous.has(t.id)) tous.set(t.id, t)
  const ids = [...tous.keys()].slice(0, 120), out = []
  const snippets = new Map([...tous.values()].map((t) => [t.id, t.snippet || '']))
  for (let i = 0; i < ids.length; i += 10) {
    const lot = await Promise.all(ids.slice(i, i + 10).map((id) => api(`gmail.googleapis.com/gmail/v1/users/me/threads/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`)))
    for (const f of lot) {
      const m = f.messages?.[f.messages.length - 1]
      const { score, pourquoi } = noter({ ...f, texte: snippets.get(f.id) })
      out.push({ id: f.id, score, pourquoi, quand: new Date(+m.internalDate).toISOString().slice(0, 16), messages: f.messages.length, de: entete(m?.payload?.headers, 'from').slice(0, 60), objet: entete(m?.payload?.headers, 'subject').slice(0, 100), _t: +m.internalDate })
    }
  }
  out.sort((a, b) => b.score - a.score || b._t - a._t)
  return out.map(({ _t, ...r }) => r)
}

// Fils des 2 derniers jours classés par importance (utilisé aussi pour le pré-chargement du lanceur).
// Mémorisé 10 min dans le processus : les passages A et B partagent la même liste (moins d'appels, quota Gmail ménagé).
const memo = new Map()
export function classerFils(query = 'newer_than:2d', max = 80) {
  const k = `${query}|${max}`, m = memo.get(k)
  if (m && Date.now() - m.t < 600000) return m.p
  const p = fils(query, max)
  memo.set(k, { t: Date.now(), p })
  p.catch(() => memo.delete(k))
  return p
}

export const contexte = { cle: '', forcerBrouillons: false }

let etiquetteId = null
async function etiquette(nom) {
  if (etiquetteId) return etiquetteId
  const l = await api('gmail.googleapis.com/gmail/v1/users/me/labels')
  let e = (l.labels || []).find((x) => x.name === nom)
  if (!e) e = await apiEcrire('gmail.googleapis.com/gmail/v1/users/me/labels', { name: nom, labelListVisibility: 'labelShow', messageListVisibility: 'show' })
  return (etiquetteId = e.id)
}
const propre = (v) => String(v).replace(/[\r\n]+/g, ' ').trim()
const adresseOk = (x) => /^[^\s<>@,;]+@[^\s<>@,;]+$/.test(x) || /^[^<>]*<[^\s<>@,;]+@[^\s<>@,;]+>$/.test(x)
const enc = (t) => (/^[\x20-\x7e]*$/.test(t) ? t : `=?UTF-8?B?${Buffer.from(t, 'utf8').toString('base64')}?=`)

// Vrai brouillon Gmail, balisé par l'étiquette du pilote. JAMAIS d'envoi (liste blanche dans google.mjs).
async function brouillonGmail(a, cle) {
  const nom = charger().ecriture_gmail?.etiquette || 'PILOTE-US8'
  if (!scopesJeton().includes('gmail.modify')) throw new Error('brouillon_gmail : autorisation manquante, lance ./pilote.sh connexion')
  const bons = [...a.a, ...a.cc].filter(adresseOk)
  if (bons.length !== a.a.length + a.cc.length) throw new Error('brouillon_gmail : adresse de destinataire invalide')
  const idEt = await etiquette(nom)
  const fil = a.repond_au_fil ? propre(a.repond_au_fil) : ''
  const heads = {}
  let sujet = propre(a.objet)
  if (fil) {
    const ex = await api(`gmail.googleapis.com/gmail/v1/users/me/drafts?q=${q('label:' + nom)}&maxResults=100`).catch(() => ({}))
    if ((ex.drafts || []).some((d) => d.message?.threadId === fil)) return 'Un brouillon pilote existe déjà sur ce fil : non dupliqué (supprime-le ou envoie-le pour en refaire un).'
    const f = await api(`gmail.googleapis.com/gmail/v1/users/me/threads/${q(fil)}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References&metadataHeaders=Subject`)
    const h = f.messages?.[f.messages.length - 1]?.payload?.headers
    const id = propre(entete(h, 'message-id')), refs = propre(entete(h, 'references')), sj = propre(entete(h, 'subject'))
    if (id) { heads['In-Reply-To'] = id; heads.References = `${refs} ${id}`.trim() }
    if (sj) sujet = /^re:/i.test(sj) ? sj : `Re: ${sj}`
  }
  const entete_corps = `[PILOTE US-8 / ${cle} : à relire, supprime ces lignes avant d'envoyer. Routage : ${propre(a.justification_routage)}${a.etat === 'pret' ? '' : ' | À COMPLÉTER'}]\n\n`
  const lignes = [`To: ${a.a.map(propre).join(', ')}`, ...(a.cc.length ? [`Cc: ${a.cc.map(propre).join(', ')}`] : []), `Subject: ${enc(sujet)}`,
    ...Object.entries(heads).map(([k, v]) => `${k}: ${v}`), `X-Pilote-US8: ${cle}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
    Buffer.from(entete_corps + a.corps, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n')]
  const d = await apiEcrire('gmail.googleapis.com/gmail/v1/users/me/drafts', { message: { raw: Buffer.from(lignes.join('\r\n'), 'utf8').toString('base64url'), ...(fil ? { threadId: fil } : {}) } })
  if (d.message?.id) await apiEcrire(`gmail.googleapis.com/gmail/v1/users/me/messages/${d.message.id}/modify`, { addLabelIds: [idEt] })
  return `Brouillon Gmail créé (étiquette ${nom}, non envoyé).`
}

export const DEFINITIONS = [
  ['gmail_chercher', "Cherche des fils Gmail (syntaxe Gmail, ex. newer_than:2d) et les renvoie CLASSÉS PAR IMPORTANCE (score et raisons : tu as répondu récemment, plusieurs allers-retours, réponse attendue de toi, important, non lu, étoilé). Traite-les dans l\'ordre.", { query: { type: 'string' }, max: { type: 'integer' } }, ['query']],
  ['gmail_lire_fil', "Lit un fil Gmail : messages (expéditeur, destinataires, date, texte tronqué) et noms des pièces jointes.", { thread_id: { type: 'string' } }, ['thread_id']],
  ['calendrier_evenements', "Liste les événements de l'agenda principal des prochains jours.", { jours: { type: 'integer' } }, []],
  ['drive_chercher', 'Cherche dans Drive par texte. Renvoie id, nom, type, date de modification.', { query: { type: 'string' } }, ['query']],
  ['drive_lire', "Lit le texte d'un Google Doc ou d'un fichier texte de Drive (tronqué).", { file_id: { type: 'string' } }, ['file_id']],
  ['copilote_chercher', "Recherche dans l'historique du projet (Copilote) : mails, documents, suivi, annuaire, règles. Filtre kind possible : annuaire, regle, email, doc, suivi. Cite titre et date.", { requete: { type: 'string' }, kind: { type: 'string' } }, ['requete']],
  ['copilote_lire_autour', "Lit les passages voisins d'un passage trouvé par copilote_chercher (contexte), par son identifiant numérique.", { chunk_id: { type: 'integer' } }, ['chunk_id']],
  ['suivi_lire', "Lit l'export local du suivi (actions, état), s'il est fourni.", {}, []],
  ['ecrire_brouillon', 'Enregistre un brouillon de mail dans un fichier LOCAL (rien n\'est envoyé).', { a: { type: 'array', items: { type: 'string' } }, cc: { type: 'array', items: { type: 'string' } }, objet: { type: 'string' }, corps: { type: 'string' }, justification_routage: { type: 'string' }, repond_au_fil: { type: 'string', description: 'identifiant du fil Gmail auquel ce brouillon répond (obligatoire pour une réponse)' }, etat: { type: 'string', enum: ['pret', 'a_completer'] } }, ['objet', 'corps', 'justification_routage', 'etat']],
  ['notifier', 'Notification locale pour une urgence réelle uniquement.', { message: { type: 'string' } }, ['message']],
].map(([name, description, properties, required]) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } }))

export const IMPL = {
  async gmail_chercher({ query, max = 80 }) {
    const f = await classerFils(query, max)
    return JSON.stringify({ total_fils: f.length, note: 'Triés par IMPORTANCE décroissante (score et raisons). Traite-les dans cet ordre.', fils: f.slice(0, 50) })
  },
  async gmail_lire_fil({ thread_id }) {
    const f = await api(`gmail.googleapis.com/gmail/v1/users/me/threads/${q(thread_id)}?format=full`)
    return JSON.stringify((f.messages || []).slice(-5).map((m) => {
      const { texte, pj } = texteDe(m.payload)
      const h = m.payload?.headers
      return { id: m.id, de: entete(h, 'from'), a: entete(h, 'to'), cc: entete(h, 'cc'), date: entete(h, 'date'), objet: entete(h, 'subject'), texte: texte.join('\n').slice(0, 2000), pieces_jointes: pj }
    }))
  },
  async calendrier_evenements({ jours = 2 }) {
    const d = new Date(), f = new Date(Date.now() + Math.min(jours, 7) * 86400000)
    const r = await api(`www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${q(d.toISOString())}&timeMax=${q(f.toISOString())}&singleEvents=true&orderBy=startTime&maxResults=20`)
    return JSON.stringify((r.items || []).map((e) => ({ titre: e.summary, debut: e.start?.dateTime || e.start?.date, fin: e.end?.dateTime || e.end?.date, participants: (e.attendees || []).length })))
  },
  async drive_chercher({ query }) {
    const safe = String(query).replace(/['\\]/g, ' ')
    const r = await api(`www.googleapis.com/drive/v3/files?pageSize=10&q=${q(`fullText contains '${safe}' and trashed=false`)}&fields=${q('files(id,name,mimeType,modifiedTime)')}&orderBy=${q('modifiedTime desc')}`)
    return JSON.stringify(r.files || [])
  },
  async drive_lire({ file_id }) {
    const meta = await api(`www.googleapis.com/drive/v3/files/${q(file_id)}?fields=name,mimeType`)
    const chemin = meta.mimeType === 'application/vnd.google-apps.document'
      ? `www.googleapis.com/drive/v3/files/${q(file_id)}/export?mimeType=text/plain`
      : `www.googleapis.com/drive/v3/files/${q(file_id)}?alt=media`
    if (!/^application\/vnd\.google-apps\.document$|^text\//.test(meta.mimeType)) return JSON.stringify({ nom: meta.name, note: `type ${meta.mimeType} non lisible par cet outil` })
    return JSON.stringify({ nom: meta.name, texte: (await api(chemin, { brut: true })).slice(0, 6000) })
  },
  async copilote_chercher({ requete, kind }) {
    if (disponibleLocal()) return appelLocal('search', { query: requete, ...(kind ? { kind } : {}), k: 8 })
    const env = { ...lireEnv(), ...process.env }
    if (!env.COPILOTE_AGENT_URL || !env.COPILOTE_AGENT_TOKEN) return 'Copilote non configuré : outil indisponible.'
    const r = await fetch(env.COPILOTE_AGENT_URL, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${env.COPILOTE_AGENT_TOKEN}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search', arguments: { query: requete, ...(kind ? { kind } : {}) } } }) })
    if (!r.ok) return `Copilote indisponible (HTTP ${r.status}).`
    const t = await r.text()
    const data = t.startsWith('event:') || t.includes('\ndata:') ? t.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5)).pop() : t
    try { return (JSON.parse(data).result?.content || []).map((c) => c.text).join('\n') } catch { return 'Réponse Copilote illisible.' }
  },
  async copilote_lire_autour({ chunk_id }) {
    if (!disponibleLocal()) return 'Copilote local non disponible.'
    return appelLocal('read_around', { chunk_id, span: 1 })
  },
  async suivi_lire() {
    const f = charger().suivi_export
    return f && fs.existsSync(f) ? fs.readFileSync(f, 'utf8').slice(0, 8000) : "Pas d'export du suivi fourni."
  },
  async ecrire_brouillon(a) {
    // Tolérant : destinataires en liste OU en texte (« a@x, b@y »), champs manquants remplacés par une valeur explicite.
    const liste = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/[,;]/)).map((x) => String(x).trim()).filter(Boolean)
    a = { ...a, a: liste(a.a), cc: liste(a.cc), objet: String(a.objet ?? '(sans objet)'), corps: String(a.corps ?? ''), justification_routage: String(a.justification_routage ?? 'non précisée'), etat: a.etat === 'pret' ? 'pret' : 'a_completer' }
    if (!a.corps.trim()) throw new Error('corps du brouillon vide : fournis le texte complet')
    // Tu te mets toujours en Cc de tes réponses : ajouté d'office (règle de routage rg-33).
    const moi = ccAuto()
    if (moi && ![...a.a, ...a.cc].some((x) => x.toLowerCase().includes(moi))) a.cc.push(moi)
    fs.mkdirSync(BROUILLONS_DIR, { recursive: true, mode: 0o700 })
    const nom = `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 6)}.md`
    const md = `# Brouillon (${a.etat === 'pret' ? 'prêt' : 'à compléter'}) — NON ENVOYÉ\n\n**À** : ${(a.a || []).join(', ')}\n**Cc** : ${(a.cc || []).join(', ')}\n**Objet** : ${a.objet}\n**Répond au fil** : ${a.repond_au_fil || '—'}\n\n**Routage** : ${a.justification_routage}\n\n---\n${a.corps}\n`
    fs.writeFileSync(path.join(BROUILLONS_DIR, nom), md, { mode: 0o600 })
    let suite = ''
    const ec = charger().ecriture_gmail
    if ((mode() === 'brouillons' || contexte.forcerBrouillons) && ec?.modeles?.includes(contexte.cle)) {
      try { suite = ' ' + (await brouillonGmail(a, contexte.cle)) } catch (e) { throw new Error(`brouillon_gmail : copie locale écrite, mais ${String(e.message).replace(/^brouillon_gmail : /, '')}`) }
    }
    return `Brouillon enregistré localement (${nom}). Rien n'a été envoyé.${suite}`
  },
  async notifier({ message }) {
    if (process.env.PILOTE_SANS_NOTIF) return 'Notification simulée.'
    const m = String(message).replace(/["\\]/g, ' ').slice(0, 200)
    execFile('osascript', ['-e', `display notification "${m}" with title "Pilote US-8"`], () => {})
    return 'Notification envoyée.'
  },
}

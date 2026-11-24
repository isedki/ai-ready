// Outils exposés au modèle. TOUS en lecture seule, sauf deux écritures LOCALES : brouillon (fichier) et notification.
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { api } from './google.mjs'
import { BROUILLONS_DIR, lireEnv, charger } from './config.mjs'

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

export const DEFINITIONS = [
  ['gmail_chercher', 'Cherche des fils Gmail (syntaxe Gmail, ex. newer_than:1d). Renvoie id, expéditeur, objet, date, extrait.', { query: { type: 'string' }, max: { type: 'integer' } }, ['query']],
  ['gmail_lire_fil', "Lit un fil Gmail : messages (expéditeur, destinataires, date, texte tronqué) et noms des pièces jointes.", { thread_id: { type: 'string' } }, ['thread_id']],
  ['calendrier_evenements', "Liste les événements de l'agenda principal des prochains jours.", { jours: { type: 'integer' } }, []],
  ['drive_chercher', 'Cherche dans Drive par texte. Renvoie id, nom, type, date de modification.', { query: { type: 'string' } }, ['query']],
  ['drive_lire', "Lit le texte d'un Google Doc ou d'un fichier texte de Drive (tronqué).", { file_id: { type: 'string' } }, ['file_id']],
  ['copilote_chercher', "Recherche dans l'historique du projet (Copilote) : mails, documents, annuaire, règles. Cite titre et date.", { requete: { type: 'string' } }, ['requete']],
  ['suivi_lire', "Lit l'export local du suivi (actions, état), s'il est fourni.", {}, []],
  ['ecrire_brouillon', 'Enregistre un brouillon de mail dans un fichier LOCAL (rien n\'est envoyé).', { a: { type: 'array', items: { type: 'string' } }, cc: { type: 'array', items: { type: 'string' } }, objet: { type: 'string' }, corps: { type: 'string' }, justification_routage: { type: 'string' }, repond_au_fil: { type: 'string' }, etat: { type: 'string', enum: ['pret', 'a_completer'] } }, ['objet', 'corps', 'justification_routage', 'etat']],
  ['notifier', 'Notification locale pour une urgence réelle uniquement.', { message: { type: 'string' } }, ['message']],
].map(([name, description, properties, required]) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } }))

export const IMPL = {
  async gmail_chercher({ query, max = 8 }) {
    const l = await api(`gmail.googleapis.com/gmail/v1/users/me/threads?q=${q(query)}&maxResults=${Math.min(max, 10)}`)
    const out = []
    for (const t of l.threads || []) {
      const f = await api(`gmail.googleapis.com/gmail/v1/users/me/threads/${t.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`)
      const m = f.messages?.[f.messages.length - 1]
      out.push({ id: t.id, messages: f.messages?.length, de: entete(m?.payload?.headers, 'from'), objet: entete(m?.payload?.headers, 'subject'), date: entete(m?.payload?.headers, 'date'), extrait: (t.snippet || '').slice(0, 200) })
    }
    return JSON.stringify(out)
  },
  async gmail_lire_fil({ thread_id }) {
    const f = await api(`gmail.googleapis.com/gmail/v1/users/me/threads/${q(thread_id)}?format=full`)
    return JSON.stringify((f.messages || []).slice(-8).map((m) => {
      const { texte, pj } = texteDe(m.payload)
      const h = m.payload?.headers
      return { id: m.id, de: entete(h, 'from'), a: entete(h, 'to'), cc: entete(h, 'cc'), date: entete(h, 'date'), objet: entete(h, 'subject'), texte: texte.join('\n').slice(0, 3000), pieces_jointes: pj }
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
  async copilote_chercher({ requete }) {
    const env = { ...lireEnv(), ...process.env }
    if (!env.COPILOTE_AGENT_URL || !env.COPILOTE_AGENT_TOKEN) return 'Copilote non configuré : outil indisponible.'
    const r = await fetch(env.COPILOTE_AGENT_URL, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${env.COPILOTE_AGENT_TOKEN}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search', arguments: { query: requete } } }) })
    if (!r.ok) return `Copilote indisponible (HTTP ${r.status}).`
    const t = await r.text()
    const data = t.startsWith('event:') || t.includes('\ndata:') ? t.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5)).pop() : t
    try { return (JSON.parse(data).result?.content || []).map((c) => c.text).join('\n') } catch { return 'Réponse Copilote illisible.' }
  },
  async suivi_lire() {
    const f = charger().suivi_export
    return f && fs.existsSync(f) ? fs.readFileSync(f, 'utf8').slice(0, 8000) : "Pas d'export du suivi fourni."
  },
  async ecrire_brouillon(a) {
    fs.mkdirSync(BROUILLONS_DIR, { recursive: true, mode: 0o700 })
    const nom = `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 6)}.md`
    const md = `# Brouillon (${a.etat === 'pret' ? 'prêt' : 'à compléter'}) — NON ENVOYÉ\n\n**À** : ${(a.a || []).join(', ')}\n**Cc** : ${(a.cc || []).join(', ')}\n**Objet** : ${a.objet}\n**Répond au fil** : ${a.repond_au_fil || '—'}\n\n**Routage** : ${a.justification_routage}\n\n---\n${a.corps}\n`
    fs.writeFileSync(path.join(BROUILLONS_DIR, nom), md, { mode: 0o600 })
    return `Brouillon enregistré localement (${nom}). Rien n'a été envoyé.`
  },
  async notifier({ message }) {
    if (process.env.PILOTE_SANS_NOTIF) return 'Notification simulée.'
    const m = String(message).replace(/["\\]/g, ' ').slice(0, 200)
    execFile('osascript', ['-e', `display notification "${m}" with title "Pilote US-8"`], () => {})
    return 'Notification envoyée.'
  },
}

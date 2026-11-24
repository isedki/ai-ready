// Accès Google en lecture seule (API classiques Gmail, Calendar, Drive) avec un jeton de renouvellement local.
import fs from 'node:fs'
import { TOKEN_FILE, lireEnv } from './config.mjs'

const TOKEN_URL = () => process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token'
const BASE = () => process.env.GOOGLE_API_BASE || 'https://'
let cache = null

export async function jetonAcces() {
  if (cache && cache.exp > Date.now() + 60000) return cache.jeton
  const env = lireEnv()
  if (!fs.existsSync(TOKEN_FILE)) throw new Error('pas de jeton Google : lance ./pilote.sh connexion')
  const { refresh_token } = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'))
  const r = await fetch(TOKEN_URL(), {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token, client_id: env.GOOGLE_CLIENT_ID || '', client_secret: env.GOOGLE_CLIENT_SECRET || '' }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`jeton Google refusé (${r.status} ${j.error || ''})`)
  cache = { jeton: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 }
  return cache.jeton
}

export async function api(chemin, { brut = false } = {}) {
  // Reprise automatique en cas de quota par minute (HTTP 429, ou 403 « Quota exceeded ») : jusqu'à 3 attentes.
  for (let essai = 0; ; essai++) {
    const r = await fetch(`${BASE()}${chemin}`, { headers: { authorization: `Bearer ${await jetonAcces()}` } })
    if (r.ok) return brut ? r.text() : r.json()
    const j = await r.json().catch(() => ({}))
    const msg = String(j.error?.message || '')
    if (essai < 3 && (r.status === 429 || (r.status === 403 && /quota|rate/i.test(msg)))) {
      await new Promise((ok) => setTimeout(ok, Number(process.env.PILOTE_ATTENTE_QUOTA_MS) || 20000))
      continue
    }
    throw new Error(`Google ${r.status} : ${msg.slice(0, 200)}`)
  }
}

// Écritures Gmail : LISTE BLANCHE stricte (créer un brouillon, créer/poser notre étiquette). Jamais d'envoi, de suppression ni de corbeille.
const AUTORISE = [
  /^gmail\.googleapis\.com\/gmail\/v1\/users\/me\/drafts$/,
  /^gmail\.googleapis\.com\/gmail\/v1\/users\/me\/labels$/,
  /^gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages\/[A-Za-z0-9_-]+\/modify$/,
]
export async function apiEcrire(chemin, corps) {
  if (!AUTORISE.some((re) => re.test(chemin))) throw new Error(`écriture Google non autorisée : ${chemin.split('/').slice(-2).join('/')}`)
  if (/\/modify$/.test(chemin) && (Object.keys(corps).some((k) => k !== 'addLabelIds') || (corps.removeLabelIds || []).length)) throw new Error('écriture Google non autorisée : seul l\'ajout d\'étiquette est permis')
  for (let essai = 0; ; essai++) {
    const r = await fetch(`${BASE()}${chemin}`, { method: 'POST', headers: { authorization: `Bearer ${await jetonAcces()}`, 'content-type': 'application/json' }, body: JSON.stringify(corps) })
    const j = await r.json().catch(() => ({}))
    if (r.ok) return j
    const msg = String(j.error?.message || '')
    if (essai < 3 && (r.status === 429 || (r.status === 403 && /quota|rate/i.test(msg)))) { await new Promise((ok) => setTimeout(ok, Number(process.env.PILOTE_ATTENTE_QUOTA_MS) || 20000)); continue }
    throw new Error(`Google ${r.status} : ${msg.slice(0, 200)}`)
  }
}
export const scopesJeton = () => { try { return String(JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')).scope || '') } catch { return '' } }

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
  const r = await fetch(`${BASE()}${chemin}`, { headers: { authorization: `Bearer ${await jetonAcces()}` } })
  if (!r.ok) {
    const j = await r.json().catch(() => ({}))
    throw new Error(`Google ${r.status} : ${String(j.error?.message || '').slice(0, 200)}`)
  }
  return brut ? r.text() : r.json()
}

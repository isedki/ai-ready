// Plan B : API Google classiques (stables), même jeton de renouvellement, lecture seule, comptage seulement.
import fs from 'node:fs'
import { TOKEN_FILE, readEnv, refreshAccessToken } from './lib.mjs'
const base = process.env.SPIKE_REST_BASE || 'https://'
const env = readEnv()
if (!fs.existsSync(TOKEN_FILE)) { console.error("Pas de jeton : lance d'abord  ./spike.sh connexion"); process.exit(2) }
const { refresh_token } = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'))
const at = (await refreshAccessToken(env, refresh_token)).access_token
const tests = {
  gmail: ['gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=1', (j) => (j.threads || []).length],
  calendar: ['www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1', (j) => (j.items || []).length],
  drive: ['www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id)', (j) => (j.files || []).length],
}
let tout = true
for (const [nom, [url, n]] of Object.entries(tests)) {
  const r = await fetch(`${base}${url}`, { headers: { authorization: `Bearer ${at}` } })
  const j = await r.json().catch(() => ({}))
  const ok = r.ok
  tout &&= ok
  console.log(`API classique ${nom} : lecture seule ${ok ? 'OUI' : 'NON'} (HTTP ${r.status})` + (ok ? `, ${n(j)} élément(s) lu(s)` : ` — ${String(j.error?.message || '').slice(0, 250)}`))
}
console.log(`\nVERDICT PLAN B : ${tout ? 'OUI, les API classiques répondent avec le même jeton.' : 'NON ou partiel : voir ci-dessus.'}`)
process.exit(tout ? 0 : 1)

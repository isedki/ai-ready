// Étape D : prouve (ou non) qu'un script peut utiliser un jeton de renouvellement avec les serveurs MCP Google.
import fs from 'node:fs'
import { SERVERS, TOKEN_FILE, RESULT_FILE, readEnv, refreshAccessToken, McpClient, pickArgs, countItems, writeSecret } from './lib.mjs'

const env = readEnv()
if (!fs.existsSync(TOKEN_FILE)) { console.error("Pas de jeton : lance d'abord  ./spike.sh connexion"); process.exit(2) }
const { refresh_token } = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'))
const res = { date: new Date().toISOString(), serveurs: {} }
const ok = (b) => (b ? 'OUI' : 'NON')

// 1) Renouvellement deux fois de suite, sans nouveau consentement.
let acces = null
try {
  const a = await refreshAccessToken(env, refresh_token)
  const b = await refreshAccessToken(env, refresh_token)
  acces = b.access_token
  res.renouvellement = { ok: true, expire_en_s: b.expires_in, deux_fois: true }
} catch (e) { res.renouvellement = { ok: false, erreur: String(e.message).slice(0, 200) } }
console.log(`1) Jeton de renouvellement utilisable par un script, sans nouveau consentement : ${ok(res.renouvellement.ok)}` +
  (res.renouvellement.ok ? ` (le jeton d'accès dure ${res.renouvellement.expire_en_s} s, renouvelé automatiquement)` : ` — ${res.renouvellement.erreur}`))

// 2) Chaque serveur MCP avec ce jeton : initialisation, outils, un appel en lecture seule.
const lectures = {
  gmail: ['search_threads', { query: 'newer_than:1d', pageSize: 1 }],
  calendar: ['list_calendars', {}],
  drive: ['list_recent_files', { pageSize: 1 }],
}
if (acces) for (const [nom, url] of Object.entries(SERVERS)) {
  const r = { init: false, outils: 0, lecture: false }
  try {
    const c = new McpClient(url, acces)
    const i = await c.init()
    r.init = !i.error && i.status < 400
    if (!r.init) r.erreur = `HTTP ${i.status} ${(i.error?.message || '').slice(0, 120)}`
    else {
      const t = (await c.tools()).result?.tools || []
      r.outils = t.length
      const [outil, args] = lectures[nom]
      const def = t.find((x) => x.name === outil)
      if (def) {
        const a = await c.call(outil, pickArgs(def, args))
        r.lecture = !a.error && !a.result?.isError
        r.elements = countItems(a.result)
        if (!r.lecture) r.erreur = `appel refusé : ${(a.error?.message || '').slice(0, 120)}`
      } else r.erreur = `outil ${outil} absent`
    }
  } catch (e) { r.erreur = String(e.message).slice(0, 120) }
  res.serveurs[nom] = r
  console.log(`2) ${nom} : connexion ${ok(r.init)}, ${r.outils} outils, lecture seule ${ok(r.lecture)}${r.erreur ? ' — ' + r.erreur : ''}`)
}
res.verdict = res.renouvellement.ok && Object.values(res.serveurs).every((s) => s.init && s.lecture)
console.log(`\nVERDICT : ${res.verdict ? 'OUI, un script peut utiliser ces serveurs avec un jeton stocké.' : 'NON ou partiel : voir les lignes ci-dessus.'}`)
writeSecret(RESULT_FILE, JSON.stringify(res, null, 2))
console.log(`Résultat sans contenu enregistré : ${RESULT_FILE}`)
process.exit(res.verdict ? 0 : 1)

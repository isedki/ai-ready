// Consentement Google (lecture seule), une fois. Stocke le jeton de renouvellement en local (droits 600).
import http from 'node:http'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { TOKEN_FILE, lireEnv, ecrireSecret } from './config.mjs'

const SCOPES = ['https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/calendar.events.readonly', 'https://www.googleapis.com/auth/calendar.calendarlist.readonly', 'https://www.googleapis.com/auth/drive.readonly']
const env = lireEnv()
if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) { console.error("Il manque l'identifiant ou le secret Google : lance  ./pilote.sh reglage"); process.exit(2) }
const verifier = crypto.randomBytes(48).toString('base64url')
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
const state = crypto.randomBytes(16).toString('hex')
const srv = http.createServer()
await new Promise((r) => srv.listen(0, '127.0.0.1', r))
const redirect = `http://127.0.0.1:${srv.address().port}`
const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirect, response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', code_challenge: challenge, code_challenge_method: 'S256', state })
console.log("Ouverture du navigateur (consentement en lecture seule). Si rien ne s'ouvre, copie ce lien :\n" + url + '\n')
execFile('open', [url], () => {})
const code = await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('délai dépassé (5 min)')), 300000)
  srv.on('request', (req, res) => {
    const p = new URL(req.url, redirect).searchParams
    if (p.get('state') !== state) { res.end('état invalide'); return }
    res.end('OK, tu peux fermer cet onglet.'); clearTimeout(t)
    p.get('code') ? resolve(p.get('code')) : reject(new Error('refusé : ' + (p.get('error') || 'inconnu')))
  })
})
srv.close()
const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirect, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET }) })
const j = await r.json()
if (!r.ok || !j.refresh_token) { console.error('Pas de jeton de renouvellement obtenu.'); process.exit(3) }
ecrireSecret(TOKEN_FILE, JSON.stringify({ refresh_token: j.refresh_token, scope: j.scope, obtenu: new Date().toISOString() }))
console.log('Jeton enregistré en local (droits 600).')

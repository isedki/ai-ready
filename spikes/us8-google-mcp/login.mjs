// Étape C (une fois, par Issam) : consentement Google, stocke le jeton de renouvellement en local.
import http from 'node:http'
import { execFile } from 'node:child_process'
import crypto from 'node:crypto'
import { AUTH_URL, SCOPES, TOKEN_FILE, readEnv, pkce, exchangeCode, writeSecret } from './lib.mjs'

const env = readEnv()
if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
  console.error("Il manque l'identifiant ou le secret du client : lance d'abord  ./spike.sh reglage")
  process.exit(2)
}
const { verifier, challenge } = pkce()
const state = crypto.randomBytes(16).toString('hex')
const server = http.createServer()
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const redirect = `http://127.0.0.1:${server.address().port}`
const url = `${AUTH_URL}?` + new URLSearchParams({
  client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirect, response_type: 'code', scope: SCOPES.join(' '),
  access_type: 'offline', prompt: 'consent', code_challenge: challenge, code_challenge_method: 'S256', state,
})
console.log('Ouverture du navigateur pour le consentement Google (lecture seule). Si rien ne s\'ouvre, copie ce lien :\n' + url + '\n')
execFile('open', [url], () => {})
const code = await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('délai dépassé (5 min)')), 300000)
  server.on('request', (req, res) => {
    const q = new URL(req.url, redirect).searchParams
    if (q.get('state') !== state) { res.end('état invalide'); return }
    res.end('OK, tu peux fermer cet onglet et revenir au terminal.')
    clearTimeout(t)
    q.get('code') ? resolve(q.get('code')) : reject(new Error('refusé : ' + (q.get('error') || 'inconnu')))
  })
})
server.close()
const tok = await exchangeCode(env, code, verifier, redirect)
if (!tok.refresh_token) { console.error("Google n'a pas donné de jeton de renouvellement (verdict : NON pour ce type de client)."); process.exit(3) }
writeSecret(TOKEN_FILE, JSON.stringify({ refresh_token: tok.refresh_token, scope: tok.scope, obtenu: new Date().toISOString() }))
console.log('Jeton de renouvellement enregistré en local (droits 600). Étape suivante : ./spike.sh verifier')

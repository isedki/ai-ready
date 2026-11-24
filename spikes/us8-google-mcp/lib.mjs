// Spike US-8 : outils communs. Aucune dépendance. N'imprime jamais de contenu ni de secret.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

export const DIR = process.env.SPIKE_DIR || path.join(os.homedir(), '.config', 'us8-spike')
export const ENV_FILE = path.join(DIR, 'env')
export const TOKEN_FILE = path.join(DIR, 'token.json')
export const RESULT_FILE = path.join(DIR, 'resultat.json')
export const TOKEN_URL = process.env.SPIKE_TOKEN_URL || 'https://oauth2.googleapis.com/token'
export const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
export const SERVERS = {
  gmail: process.env.SPIKE_GMAIL_URL || 'https://gmailmcp.googleapis.com/mcp/v1',
  calendar: process.env.SPIKE_CALENDAR_URL || 'https://calendarmcp.googleapis.com/mcp/v1',
  drive: process.env.SPIKE_DRIVE_URL || 'https://drivemcp.googleapis.com/mcp/v1',
}
// Lecture seule uniquement.
export const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
]

export function ensureDir() {
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 })
}
export function readEnv() {
  const out = {}
  if (!fs.existsSync(ENV_FILE)) return out
  for (const l of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}
export function writeSecret(file, text) {
  ensureDir()
  fs.writeFileSync(file, text, { mode: 0o600 })
  fs.chmodSync(file, 0o600)
}

export function pkce() {
  const verifier = crypto.randomBytes(48).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

async function tokenCall(body) {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`jeton refusé (${r.status} ${j.error || ''}${j.error_description ? ' : ' + j.error_description : ''})`)
  return j
}
export const exchangeCode = (env, code, verifier, redirect) =>
  tokenCall({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirect, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET })
export const refreshAccessToken = (env, refreshToken) =>
  tokenCall({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET })

// Lit une réponse MCP (JSON simple ou flux SSE) et renvoie le message JSON-RPC.
export async function readRpc(res) {
  const text = await res.text()
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('text/event-stream')) {
    const datas = text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).filter(Boolean)
    for (const d of datas.reverse()) { try { const j = JSON.parse(d); if (j.result || j.error) return j } catch {} }
    return { error: { message: 'flux vide' } }
  }
  try { return JSON.parse(text) } catch { return { error: { message: `réponse illisible (${res.status})` } } }
}

export class McpClient {
  constructor(url, accessToken) { this.url = url; this.token = accessToken; this.session = null; this.id = 0 }
  async rpc(method, params, notify = false) {
    const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }
    if (this.token) headers.authorization = `Bearer ${this.token}`
    if (this.session) headers['mcp-session-id'] = this.session
    const body = { jsonrpc: '2.0', method, ...(params ? { params } : {}), ...(notify ? {} : { id: ++this.id }) }
    const res = await fetch(this.url, { method: 'POST', headers, body: JSON.stringify(body) })
    const sid = res.headers.get('mcp-session-id')
    if (sid) this.session = sid
    if (notify) { await res.text().catch(() => ''); return { status: res.status } }
    const msg = await readRpc(res)
    return { status: res.status, ...msg }
  }
  async init() {
    const r = await this.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'us8-spike', version: '0' } })
    if (r.error || r.status >= 400) return r
    await this.rpc('notifications/initialized', undefined, true)
    return r
  }
  tools() { return this.rpc('tools/list', {}) }
  call(name, args) { return this.rpc('tools/call', { name, arguments: args }) }
}

// Ne garde que les arguments connus du schéma de l'outil.
export function pickArgs(tool, wanted) {
  const props = Object.keys(tool?.inputSchema?.properties || {})
  return Object.fromEntries(Object.entries(wanted).filter(([k]) => props.includes(k)))
}
// Compte les éléments d'un résultat sans en afficher le contenu.
export function countItems(result) {
  const sc = result?.structuredContent
  if (sc && typeof sc === 'object') {
    for (const v of Object.values(sc)) if (Array.isArray(v)) return v.length
  }
  const c = result?.content
  if (Array.isArray(c)) return c.length
  return 0
}

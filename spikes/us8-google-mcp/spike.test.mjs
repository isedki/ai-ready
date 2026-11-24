// Test hors ligne : faux serveur de jetons + faux serveur MCP (JSON pour l'un, flux SSE pour l'autre).
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { pkce } from './lib.mjs'

const listen = (h) => new Promise((r) => { const s = http.createServer(h); s.listen(0, '127.0.0.1', () => r(s)) })
const port = (s) => s.address().port

test('PKCE : le défi est le hachage du vérificateur', () => {
  const { verifier, challenge } = pkce()
  assert.ok(verifier.length >= 43)
  assert.notEqual(verifier, challenge)
})

test("verifier : renouvellement x2 + 3 serveurs MCP en lecture seule, sans contenu dans le résultat", async () => {
  let n = 0
  const tok = await listen((req, res) => {
    let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
      const p = new URLSearchParams(b)
      res.setHeader('content-type', 'application/json')
      if (p.get('refresh_token') !== 'RT') { res.statusCode = 400; return res.end('{"error":"invalid_grant"}') }
      res.end(JSON.stringify({ access_token: 'AT' + ++n, expires_in: 3599 }))
    })
  })
  const mcp = (sse) => listen((req, res) => {
    let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
      if (!req.headers.authorization?.startsWith('Bearer AT')) { res.statusCode = 401; return res.end('{}') }
      const m = JSON.parse(b)
      if (m.method === 'notifications/initialized') { res.statusCode = 202; return res.end() }
      const tools = ['search_threads', 'list_calendars', 'list_recent_files'].map((name) => ({ name, inputSchema: { properties: { query: {}, pageSize: {} } } }))
      const result = m.method === 'initialize' ? { protocolVersion: '2025-06-18' }
        : m.method === 'tools/list' ? { tools }
        : { content: [{ type: 'text', text: 'SECRET-CONTENU' }], structuredContent: { items: [1] } }
      const body = JSON.stringify({ jsonrpc: '2.0', id: m.id, result })
      res.setHeader('mcp-session-id', 's1')
      if (sse) { res.setHeader('content-type', 'text/event-stream'); res.end(`event: message\ndata: ${body}\n\n`) }
      else { res.setHeader('content-type', 'application/json'); res.end(body) }
    })
  })
  const [a, b, c] = await Promise.all([mcp(false), mcp(true), mcp(false)])
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spike-'))
  fs.writeFileSync(path.join(dir, 'env'), 'GOOGLE_CLIENT_ID=x\nGOOGLE_CLIENT_SECRET=y\n')
  fs.writeFileSync(path.join(dir, 'token.json'), JSON.stringify({ refresh_token: 'RT' }))
  const env = { ...process.env, SPIKE_DIR: dir, SPIKE_TOKEN_URL: `http://127.0.0.1:${port(tok)}/t`,
    SPIKE_GMAIL_URL: `http://127.0.0.1:${port(a)}/`, SPIKE_CALENDAR_URL: `http://127.0.0.1:${port(b)}/`, SPIKE_DRIVE_URL: `http://127.0.0.1:${port(c)}/` }
  const out = await new Promise((r) => execFile('node', ['check.mjs'], { env, cwd: path.dirname(new URL(import.meta.url).pathname) }, (e, so) => r({ code: e?.code ?? 0, so })))
  for (const s of [tok, a, b, c]) s.close()
  assert.equal(out.code, 0, out.so)
  assert.match(out.so, /VERDICT : OUI/)
  assert.ok(n >= 2, 'deux renouvellements')
  const saved = fs.readFileSync(path.join(dir, 'resultat.json'), 'utf8')
  assert.ok(!saved.includes('SECRET-CONTENU') && !out.so.includes('SECRET-CONTENU') && !saved.includes('AT1'))
  assert.equal((fs.statSync(path.join(dir, 'resultat.json')).mode & 0o777), 0o600)
})

test('verifier : jeton révoqué → NON, code de sortie 1', async () => {
  const tok = await listen((req, res) => { res.statusCode = 400; res.setHeader('content-type', 'application/json'); res.end('{"error":"invalid_grant"}'); req.resume() })
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spike-'))
  fs.writeFileSync(path.join(dir, 'env'), 'GOOGLE_CLIENT_ID=x\nGOOGLE_CLIENT_SECRET=y\n')
  fs.writeFileSync(path.join(dir, 'token.json'), JSON.stringify({ refresh_token: 'RT' }))
  const env = { ...process.env, SPIKE_DIR: dir, SPIKE_TOKEN_URL: `http://127.0.0.1:${port(tok)}/t` }
  const out = await new Promise((r) => execFile('node', ['check.mjs'], { env, cwd: path.dirname(new URL(import.meta.url).pathname) }, (e, so) => r({ code: e?.code ?? 0, so })))
  tok.close()
  assert.equal(out.code, 1)
  assert.match(out.so, /VERDICT : NON/)
})

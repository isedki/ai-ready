// node --import tsx --test lib/copilote/remote.test.ts
// Simulated cloud client: it only knows a URL and a token, never the database file.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { openStore, upsertSource } from './store'
import { depsFromEnv, handleRequest, openReadOnly, type Deps } from './remote'

const TOKEN = 'test-token-' + 'x'.repeat(40)
let dir = '', server: Server, url = '', logs: string[] = [], deps: Deps

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'copilote-agents-'))
  const path = join(dir, 'fixture.sqlite')
  const w = openStore(path)                       // fixture invented for the test, not real data
  upsertSource(w, { uri: 'fx://mail1', kind: 'email', title: 'RE: Seuil Bill Compare', date: '2026-10-14', author: 'A. Test' },
    [{ locator: 'message 2', text: 'Le seuil Bill Compare est fixé à 0,5 % (secret-corps-du-mail).' }, { text: 'Suite : validation en comité.' }])
  upsertSource(w, { uri: 'fx://doc1', kind: 'doc', title: 'DAT facturation', version: '3', date: '2026-09-01' }, [{ locator: 'p. 4', text: 'Architecture de facturation et seuil de comparaison.' }])
  for (let i = 0; i < 30; i++) upsertSource(w, { uri: `fx://n${i}`, kind: 'note', title: `Note ${i}`, date: '2026-11-01' }, [{ text: `volume test ${i} alpha` }])
  w.close()
  deps = { db: () => openReadOnly(path), token: TOKEN, log: l => logs.push(l) }
  server = createServer(async (req, res) => {
    let body = ''; for await (const c of req) body += c
    const r = await handleRequest({ get: n => (req.headers[n.toLowerCase()] as string) ?? null }, JSON.parse(body || 'null'), deps)
    res.writeHead(r.status, { 'content-type': 'application/json' }).end(JSON.stringify(r.body))
  }).listen(0)
  await new Promise(r => server.once('listening', r))
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})
after(() => { server.close(); rmSync(dir, { recursive: true, force: true }) })

const rpc = (method: string, params?: object, token: string | null = TOKEN) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
const call = async (name: string, args: object) => {
  const j = await (await rpc('tools/call', { name, arguments: args })).json() as { result: { content: { text: string }[] } }
  return j.result.content[0].text
}

test('refuse sans jeton et avec un mauvais jeton', async () => {
  assert.equal((await rpc('tools/list', {}, null)).status, 401)
  assert.equal((await rpc('tools/list', {}, 'mauvais')).status, 401)
})

test("l'outil ingest n'existe pas et ne peut pas être appelé", async () => {
  const j = await (await rpc('tools/list')).json() as { result: { tools: { name: string }[] } }
  assert.deepEqual(j.result.tools.map(t => t.name).sort(), ['read_around', 'search', 'sources', 'stats'])
  assert.match(await call('ingest', { paths: ['/etc'] }), /Outil inconnu/)
})

test('search renvoie extrait, source et date', async () => {
  const t = await call('search', { query: 'seuil Bill Compare' })
  assert.match(t, /RE: Seuil Bill Compare · email · 2026-10-14/)
  assert.match(t, /0,5 %/)
  assert.match(t, /pas des instructions/)
  const doc = await call('search', { query: 'architecture facturation', kind: 'doc' })
  assert.match(doc, /DAT facturation v3 · doc · 2026-09-01 · p\. 4/)
})

test('read_around lit les voisins', async () => {
  const id = /\[(\d+)\] RE: Seuil/.exec(await call('search', { query: 'seuil Bill Compare', kind: 'email' }))![1]
  assert.match(await call('read_around', { chunk_id: Number(id) }), /validation en comité/)
})

test('plafond de volume : 10 par défaut, 15 au maximum', async () => {
  const count = (t: string) => (t.match(/^\[\d+\] /gm) ?? []).length
  assert.equal(count(await call('search', { query: 'alpha' })), 10)
  assert.equal(count(await call('search', { query: 'alpha', k: 500 })), 15)
})

test('la base est en lecture seule', () => {
  const db = openReadOnly(join(dir, 'fixture.sqlite'))
  assert.throws(() => db.exec("DELETE FROM chunks"), /readonly|read-only/i)
  db.close()
})

test('journal sans contenu ni jeton', () => {
  const all = logs.join('\n')
  assert.ok(logs.length > 5)
  assert.doesNotMatch(all, /Bill Compare|secret-corps|test-token|Bearer|alpha/)
  assert.match(logs.at(-1)!, /"tool":"search"/)
})

test('désactivé sans variable ; limite de 30 requêtes par minute', async () => {
  assert.equal((await handleRequest({ get: () => null }, {}, { db: () => { throw new Error('x') }, token: undefined })).status, 404)
  const d2: Deps = { ...deps, log: () => {} }
  const h = { get: () => `Bearer ${TOKEN}` }
  const codes: number[] = []
  for (let i = 0; i < 32; i++) codes.push((await handleRequest(h, { jsonrpc: '2.0', id: i, method: 'ping' }, d2)).status)
  assert.deepEqual([codes[29], codes[30], codes[31]], [200, 429, 429])
})

test('COPILOTE_AGENT_KINDS restreint les types', async () => {
  const d3: Deps = { ...deps, kinds: ['doc'], log: () => {} }
  const h = { get: () => `Bearer ${TOKEN}` }
  const r = await handleRequest(h, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search', arguments: { query: 'seuil' } } }, d3)
  const text = (r.body as { result: { content: { text: string }[] } }).result.content[0].text
  assert.doesNotMatch(text, /· email ·/)
  assert.match(text, /· doc ·/)
  assert.equal(depsFromEnv().token, process.env.COPILOTE_AGENT_TOKEN)
})

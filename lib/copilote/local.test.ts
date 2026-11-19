import assert       from 'node:assert/strict'
import { createServer } from 'node:http'
import { test }     from 'node:test'
import { buildMessages, callOllama } from './local'

const hit = { chunkId: 1, sourceId: 1, kind: 'email', title: 'Demande accès readOnly', version: null, date: '2026-01-19', author: null, locator: null, heading: null, text: 'PAYXDB1 10.76.53.132 1521', score: 1 }

test('les passages sont numérotés S1… et la question suit', () => {
  const m = buildMessages('accès PAYX ?', [hit])
  assert.equal(m[0].role, 'system')
  assert.match(m[1].content, /\[S1\] Demande accès readOnly · email · 2026-01-19\nPAYXDB1/)
  assert.match(m[1].content, /Question : accès PAYX \?$/)
})

test('appel réel HTTP à un faux Ollama', async () => {
  let body: { model?: string; stream?: boolean; messages?: unknown[] } = {}
  const srv = createServer((req, res) => {
    let raw = ''; req.on('data', c => (raw += c)); req.on('end', () => {
      body = JSON.parse(raw)
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ message: { role: 'assistant', content: ' Réponse [S1] ' } }))
    })
  })
  await new Promise<void>(r => srv.listen(0, '127.0.0.1', r))
  const port = (srv.address() as { port: number }).port
  const out = await callOllama(buildMessages('q', [hit]), { url: `http://127.0.0.1:${port}`, model: 'm' })
  srv.close()
  assert.equal(out, 'Réponse [S1]')
  assert.equal(body.model, 'm'); assert.equal(body.stream, false); assert.equal(body.messages?.length, 2)
})

test('Ollama arrêté : message clair', async () => {
  await assert.rejects(callOllama([], { url: 'http://127.0.0.1:9' }), /Ollama ne répond pas/)
})

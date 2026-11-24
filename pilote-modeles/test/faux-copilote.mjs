// Faux serveur MCP Copilote (stdio) pour les tests.
import readline from 'node:readline'
import fs from 'node:fs'
const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (l) => {
  const m = JSON.parse(l)
  if (m.method === 'tools/call') fs.appendFileSync(process.env.FAUX_COPILOTE_LOG, JSON.stringify(m.params) + '\n')
  if (m.id) console.log(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: m.method === 'initialize' ? { protocolVersion: '2025-06-18' } : { content: [{ type: 'text', text: '[1] Annuaire · annuaire · 2026-11-01 · à: responsable test' }] } }))
})

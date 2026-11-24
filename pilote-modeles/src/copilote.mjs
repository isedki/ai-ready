// Copilote LOCAL : le pilote tourne sur le Mac qui a déjà la base. On lance le serveur MCP du dépôt (stdio),
// sans réseau ni jeton ; seuls les extraits demandés partent vers le modèle. Repli : route HTTP à jeton (US-5).
import fs from 'node:fs'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { RACINE, lireEnv } from './config.mjs'

const DEPOT = path.resolve(RACINE, '..')

function baseDonnees(env) {
  const cands = [env.COPILOTE_DB]
  try { cands.push(path.resolve(DEPOT, execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: DEPOT, encoding: 'utf8' }).trim(), '..', 'data', 'copilote.sqlite')) } catch {}
  cands.push(path.join(DEPOT, 'data', 'copilote.sqlite'))
  return cands.find((c) => c && fs.existsSync(c))
}

export function disponibleLocal() {
  const env = { ...lireEnv(), ...process.env }
  return Boolean(env.PILOTE_COPILOTE_CMD || baseDonnees(env))
}

export function appelLocal(nom, args, delaiMs = 60000) {
  const env = { ...lireEnv(), ...process.env }
  const commande = env.PILOTE_COPILOTE_CMD ? JSON.parse(env.PILOTE_COPILOTE_CMD) : ['npx', 'tsx', 'scripts/copilote-mcp.ts']
  const db = baseDonnees(env)
  return new Promise((resolve, reject) => {
    const p = spawn(commande[0], commande.slice(1), { cwd: DEPOT, env: { ...process.env, ...(db ? { COPILOTE_DB: db } : {}) }, stdio: ['pipe', 'pipe', 'ignore'] })
    const fin = (err, val) => { clearTimeout(t); p.kill(); err ? reject(err) : resolve(val) }
    const t = setTimeout(() => fin(new Error('Copilote local : délai dépassé')), delaiMs)
    let tampon = ''
    p.on('error', (e) => fin(new Error('Copilote local indisponible : ' + e.message)))
    p.stdout.on('data', (d) => {
      tampon += d
      let i
      while ((i = tampon.indexOf('\n')) >= 0) {
        const l = tampon.slice(0, i).trim(); tampon = tampon.slice(i + 1)
        if (!l) continue
        try {
          const m = JSON.parse(l)
          if (m.id === 2) return fin(null, m.error ? `Copilote : ${m.error.message}` : (m.result?.content || []).map((c) => c.text).join('\n'))
        } catch {}
      }
    })
    const w = (o) => p.stdin.write(JSON.stringify(o) + '\n')
    w({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'pilote-us8', version: '0' } } })
    w({ jsonrpc: '2.0', method: 'notifications/initialized' })
    w({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: nom, arguments: args } })
  })
}

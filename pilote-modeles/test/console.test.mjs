// Tests de la console locale : sécurité (jeton, hôte, origine, liste blanche) et actions.
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function demarrer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'console-'))
  const faux = path.join(dir, 'faux.sh'); fs.writeFileSync(faux, '#!/bin/sh\necho "args: $@"\n', { mode: 0o755 })
  const env = { ...process.env, PILOTE_HOME: path.join(dir, 'h'), PILOTE_DATA: path.join(dir, 'd'), PILOTE_SH: faux, PILOTE_CONSOLE_PORT: '0', PILOTE_CONSOLE_TOKEN: 'tok123', PILOTE_SANS_OUVRIR: '1' }
  const p = spawn('node', ['console/serveur.mjs'], { cwd: RACINE, env })
  const port = await new Promise((ok, ko) => { let b = ''; p.stdout.on('data', (d) => { b += d; const m = b.match(/127\.0\.0\.1:(\d+)\//); if (m) ok(+m[1]) }); p.on('exit', () => ko(new Error('arrêt'))) })
  const req = (chemin, { methode = 'GET', headers = {}, corps } = {}) => new Promise((ok, ko) => {
    const r = http.request({ host: '127.0.0.1', port, path: chemin, method: methode, headers: { ...headers, ...(corps ? { 'content-type': 'application/json' } : {}) } }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => ok({ code: res.statusCode, corps: b })) })
    r.on('error', ko); if (corps) r.write(JSON.stringify(corps)); r.end()
  })
  const api = (chemin, corps, headers = {}) => req(chemin, { methode: corps ? 'POST' : 'GET', corps, headers: { 'x-token': 'tok123', ...headers } })
  return { p, port, req, api, fin: () => p.kill() }
}

test('page : refusée sans jeton, servie avec le jeton', async () => {
  const c = await demarrer()
  assert.equal((await c.req('/')).code, 403)
  const ok = await c.req('/?t=tok123')
  c.fin()
  assert.equal(ok.code, 200); assert.match(ok.corps, /Lancer un passage maintenant/); assert.match(ok.corps, /const T = 'tok123'/)
})

test('API : jeton, hôte et origine contrôlés', async () => {
  const c = await demarrer()
  assert.equal((await c.req('/api/etat')).code, 403, 'sans jeton')
  assert.equal((await c.req('/api/etat', { headers: { 'x-token': 'tok123', host: 'evil.test' } })).code, 403, 'hôte falsifié')
  assert.equal((await c.api('/api/action', { action: 'pause' }, { origin: 'http://evil.test' })).code, 403, 'origine étrangère')
  const e = await c.api('/api/etat')
  c.fin()
  assert.equal(e.code, 200)
  const j = JSON.parse(e.corps)
  assert.ok(Array.isArray(j.modeles) && j.modeles.length >= 1 && typeof j.depense_usd === 'number')
  assert.ok(!/OPENROUTER|sk-or|refresh_token|CLIENT_SECRET/i.test(e.corps), 'aucun secret dans l\'état')
})

test('actions : liste blanche, passage en tâche de fond, saisie assainie', async () => {
  const c = await demarrer()
  assert.equal((await c.api('/api/action', { action: 'rm -rf' })).code, 404)
  assert.equal((await c.api('/api/action', { action: 'ouvrir', param: '../../etc' })).code, 404)
  const r = JSON.parse((await c.api('/api/action', { action: 'passage' })).corps)
  let j = r
  for (let i = 0; i < 30 && j.statut === 'en cours'; i++) { await new Promise((ok) => setTimeout(ok, 100)); j = JSON.parse((await c.api('/api/jobs/' + r.id)).corps) }
  assert.equal(j.statut, 'terminé'); assert.match(j.sortie, /args: passage/)
  const m = JSON.parse((await c.api('/api/action', { action: 'retrouver', param: 'accès ; rm -rf / $(id) `x`' })).corps)
  let k = m
  for (let i = 0; i < 30 && k.statut === 'en cours'; i++) { await new Promise((ok) => setTimeout(ok, 100)); k = JSON.parse((await c.api('/api/jobs/' + m.id)).corps) }
  c.fin()
  assert.match(k.sortie, /args: retrouver accès/); assert.ok(!/[;$`\/]/.test(k.sortie.replace('args:', '')), k.sortie)
})

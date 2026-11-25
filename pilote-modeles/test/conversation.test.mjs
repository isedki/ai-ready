// Tests hors ligne US-9 (recherche) et US-16 (conversation) : faux Google, faux OpenRouter, faux Copilote. Aucune clé, aucun coût.
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SECRET = 'CHAINE-REPERABLE-XYZ'
const listen = (h) => new Promise((r) => { const s = http.createServer(h); s.listen(0, '127.0.0.1', () => r(s)) })
const lire = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)) })

async function monde({ cle = 'cle-test', jetonKo = false, coutParTour = 0.001, statutOr = 200, scenario = 'complet' } = {}) {
  const vus = { google: [], posts: [], or: [] }
  const google = await listen(async (req, res) => {
    vus.google.push(`${req.method} ${req.url.split('?')[0]}`)
    res.setHeader('content-type', 'application/json')
    if (req.method === 'POST') { const b = JSON.parse((await lire(req)) || '{}'); vus.posts.push({ url: req.url, corps: b }); if (req.url.endsWith('/labels')) return res.end('{"id":"L1"}'); if (req.url.endsWith('/drafts')) return res.end(JSON.stringify({ id: 'd1', message: { id: 'm9' } })); return res.end('{}') }
    if (req.url.includes('/profile')) return res.end('{"emailAddress":"moi@pro.test"}')
    if (req.url.includes('/labels')) return res.end('{"labels":[]}')
    if (req.url.includes('/drafts?')) return res.end('{"drafts":[]}')
    if (req.url.includes('/threads?')) return res.end(JSON.stringify({ threads: [{ id: 't1', snippet: 'extrait du mail' }] }))
    if (req.url.includes('/threads/t1')) return res.end(JSON.stringify({ messages: [{ id: 'm1', internalDate: '1790000000000', payload: { headers: [{ name: 'From', value: 'a@x.test' }, { name: 'Subject', value: 'Objet du fil' }, { name: 'Message-ID', value: '<a@x>' }] } }] }))
    res.end('{}')
  })
  const oauth = await listen(async (req, res) => { await lire(req); res.setHeader('content-type', 'application/json'); if (jetonKo) { res.statusCode = 400; return res.end('{"error":"invalid_grant"}') } res.end('{"access_token":"AT","expires_in":3600}') })
  const or = await listen(async (req, res) => {
    const corps = JSON.parse(await lire(req)); vus.or.push(corps)
    res.setHeader('content-type', 'application/json')
    if (statutOr !== 200) { res.statusCode = statutOr; return res.end('{"error":{"message":"x"}}') }
    const n = vus.or.length
    const appel = (name, args) => ({ id: 'c' + n, type: 'function', function: { name, arguments: JSON.stringify(args) } })
    let message
    if (scenario === 'boucle') message = { role: 'assistant', content: null, tool_calls: [appel('copilote_chercher', { requete: 'x' })] }
    else if (n === 1) message = { role: 'assistant', content: null, tool_calls: [appel('copilote_chercher', { requete: 'valideur flux', kind: 'annuaire' }), appel('gmail_envoyer', { a: 'x' }), appel('ecrire_brouillon', { a: ['x@y.test'], cc: [], objet: 'Re: Objet du fil', corps: 'Bonjour', justification_routage: 'test', etat: 'pret', repond_au_fil: 't1' })] }
    else message = { role: 'assistant', content: `Réponse sourcée [1] annuaire 2026-11-01. ${SECRET}` }
    res.end(JSON.stringify({ choices: [{ message }], usage: { prompt_tokens: 1000, completion_tokens: 100, cost: coutParTour } }))
  })
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conv-'))
  const home = path.join(dir, 'h'), data = path.join(dir, 'd'); fs.mkdirSync(home, { recursive: true }); fs.mkdirSync(data, { recursive: true })
  fs.writeFileSync(path.join(home, 'env'), `${cle ? `OPENROUTER_API_KEY=${cle}\n` : ''}GOOGLE_CLIENT_ID=x\nGOOGLE_CLIENT_SECRET=y\n`, { mode: 0o600 })
  fs.writeFileSync(path.join(home, 'google-token.json'), JSON.stringify({ refresh_token: 'RT', scope: 'https://www.googleapis.com/auth/gmail.modify' }), { mode: 0o600 })
  // Mode volontairement « ombre » (par défaut) : la conversation crée quand même de vrais brouillons (décision d'Issam).
  const env = { ...process.env, MES_ADRESSES: 'moi@pro.test', CC_AUTO: 'moi@pro.test', PILOTE_HOME: home, PILOTE_DATA: data, PILOTE_SANS_NOTIF: '1', PILOTE_CONSOLE_PORT: '0', PILOTE_CONSOLE_TOKEN: 'tok', PILOTE_SANS_OUVRIR: '1',
    PILOTE_COPILOTE_CMD: JSON.stringify(['node', path.join(RACINE, 'test', 'faux-copilote.mjs')]), FAUX_COPILOTE_LOG: path.join(dir, 'copilote.log'),
    OPENROUTER_BASE: `http://127.0.0.1:${or.address().port}`, GOOGLE_API_BASE: `http://127.0.0.1:${google.address().port}/`, GOOGLE_TOKEN_URL: `http://127.0.0.1:${oauth.address().port}/t`, PILOTE_ATTENTE_QUOTA_MS: '1' }
  delete env.OPENROUTER_API_KEY
  const p = spawn('node', ['console/serveur.mjs'], { cwd: RACINE, env })
  const port = await new Promise((ok, ko) => { let b = ''; p.stdout.on('data', (d) => { b += d; const m = b.match(/127\.0\.0\.1:(\d+)\//); if (m) ok(+m[1]) }); p.on('exit', () => ko(new Error('arrêt'))) })
  const req = (chemin, { methode = 'GET', headers = {}, corps } = {}) => new Promise((ok, ko) => {
    const r = http.request({ host: '127.0.0.1', port, path: chemin, method: methode, headers: { ...headers, ...(corps ? { 'content-type': 'application/json' } : {}) } }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => ok({ code: res.statusCode, corps: b })) })
    r.on('error', ko); if (corps) r.write(JSON.stringify(corps)); r.end()
  })
  const api = async (chemin, corps, headers = {}) => { const r = await req(chemin, { methode: corps ? 'POST' : 'GET', corps, headers: { 'x-token': 'tok', ...headers } }); return { code: r.code, j: r.corps ? JSON.parse(r.corps) : {}, brut: r.corps } }
  const journalBrut = () => { const d = path.join(data, 'journal'); return fs.existsSync(d) ? fs.readdirSync(d).map((f) => fs.readFileSync(path.join(d, f), 'utf8')).join('') : '' }
  const journal = () => journalBrut().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  return { vus, data, dir, api, req, journal, journalBrut, fin: () => { p.kill(); [google, oauth, or].forEach((s) => s.close()) } }
}

test('US-16 : route protégée, saisie libre sans commande, sans jeton 403', async () => {
  const m = await monde()
  assert.equal((await m.req('/api/demande', { methode: 'POST', corps: { texte: 'x' } })).code, 403, 'sans jeton')
  assert.equal((await m.api('/api/demande', { discussion: 'x', texte: 'x' }, { origin: 'http://evil.test' })).code, 403, 'origine étrangère')
  const d = (await m.api('/api/discussion/nouvelle', {})).j
  const r = await m.api('/api/demande', { discussion: d.id, texte: '; rm -rf / $(id) `x` "\'' })
  m.fin()
  assert.equal(r.code, 200); assert.equal(r.j.statut, 'ok')
  assert.ok(!fs.existsSync(path.join(m.dir, 'x')))
})

test('US-16 : outils Copilote (annuaire), brouillon Gmail réel étiqueté sans envoi, outil inconnu refusé, historique et journal sans contenu', async () => {
  const m = await monde()
  const d = (await m.api('/api/discussion/nouvelle', {})).j
  const r = await m.api('/api/demande', { discussion: d.id, texte: `Qui valide ? ${SECRET}-DEMANDE` })
  assert.equal(r.j.statut, 'ok'); assert.match(r.j.reponse, /Réponse sourcée/); assert.equal(r.j.brouillons_demandes, 1)
  assert.match(fs.readFileSync(path.join(m.dir, 'copilote.log'), 'utf8'), /"kind":"annuaire"/)
  // Écritures Google : uniquement étiquette, brouillon, pose d'étiquette. Jamais d'envoi.
  const posts = m.vus.posts.map((p) => p.url.split('?')[0].replace(/^.*users\/me\//, ''))
  assert.ok(posts.every((u) => /^(drafts|labels|messages\/[\w-]+\/modify)$/.test(u)), posts.join(','))
  assert.ok(posts.includes('drafts'), 'vrai brouillon Gmail créé même en mode ombre')
  assert.ok(!m.vus.google.some((g) => /send|trash|delete/i.test(g)))
  assert.equal(m.vus.or[0].tools.some((t) => t.function.name === 'notifier'), false, 'pas de notification depuis la conversation')
  assert.equal(m.vus.or[0].provider.zdr, true)
  // Journal : jamais de contenu ; les erreurs d'outils sont classées.
  const brut = m.journalBrut()
  assert.ok(!brut.includes(SECRET) && !brut.includes('valideur') && !brut.includes('cle-test'), 'aucun contenu dans le journal')
  const l = m.journal().find((e) => e.agent === 'conversation')
  assert.equal(l.erreurs_outils.gmail_envoyer.outil_inconnu, 1)
  // Conservation : la discussion est écrite (droits 0600) et la 2e demande rejoue l'historique.
  const f = path.join(m.data, 'rapports', 'conversations', `${d.id}.json`)
  assert.equal(fs.statSync(f).mode & 0o077, 0); assert.match(fs.readFileSync(f, 'utf8'), /Réponse sourcée/)
  const n0 = m.vus.or.length
  await m.api('/api/demande', { discussion: d.id, texte: 'Et ensuite ?' })
  assert.match(JSON.stringify(m.vus.or[n0].messages), /Réponse sourcée/, 'historique rejoué')
  assert.equal((await m.api('/api/discussion')).j.echanges.length, 2)
  // Suppression.
  assert.equal((await m.api('/api/discussion/supprimer', { id: d.id })).j.supprimee, true); assert.ok(!fs.existsSync(f))
  m.fin()
})

test('US-16 : plafonds (par demande, par jour), clé absente, crédit épuisé', async () => {
  let m = await monde({ coutParTour: 0.04, scenario: 'boucle' })
  let d = (await m.api('/api/discussion/nouvelle', {})).j
  let r = await m.api('/api/demande', { discussion: d.id, texte: 'x' })
  assert.equal(r.j.statut, 'coupe_plafond_demande'); assert.equal(m.vus.or.length, 2)
  // Plafond du jour atteint : aucun appel au fournisseur.
  const n = m.vus.or.length
  fs.writeFileSync(path.join(m.data, 'journal', `${new Date().toISOString().slice(0, 10)}.jsonl`), JSON.stringify({ agent: 'conversation', cout_usd: 1.0, statut: 'ok' }) + '\n', { flag: 'a' })
  r = await m.api('/api/demande', { discussion: d.id, texte: 'x' })
  assert.equal(r.j.statut, 'refuse_plafond_jour'); assert.equal(m.vus.or.length, n)
  // Les lignes de conversation ne consomment pas les compteurs d'évaluation (5 passages / 15 essais).
  const { depenseTotale } = await import('../src/lanceur.mjs')
  m.fin()
  m = await monde({ cle: '' }); d = (await m.api('/api/discussion/nouvelle', {})).j
  assert.equal((await m.api('/api/demande', { discussion: d.id, texte: 'x' })).j.statut, 'refuse_cle_absente'); assert.equal(m.vus.or.length, 0); m.fin()
  m = await monde({ statutOr: 402 }); d = (await m.api('/api/discussion/nouvelle', {})).j
  assert.equal((await m.api('/api/demande', { discussion: d.id, texte: 'x' })).j.statut, 'erreur_http_402'); m.fin()
  assert.equal(typeof depenseTotale, 'function')
})

test('US-16 : une demande à la fois (verrou partagé avec les passages)', async () => {
  const m = await monde()
  const d = (await m.api('/api/discussion/nouvelle', {})).j
  fs.writeFileSync(path.join(m.data, 'pilote.verrou'), JSON.stringify({ pid: process.pid, at: Date.now() }))
  const r = await m.api('/api/demande', { discussion: d.id, texte: 'x' })
  m.fin()
  assert.equal(r.code, 409); assert.equal(r.j.statut, 'refuse_occupe'); assert.equal(m.vus.or.length, 0)
})

test('US-9 : recherche Copilote + mails, lecture seule, journal sans contenu, jeton refusé sans consentement', async () => {
  const m = await monde({ cle: '' })
  const r = await m.api('/api/recherche', { requete: `flux ${SECRET}`, copilote: true, mails: true })
  assert.equal(r.code, 200); assert.equal(r.j.copilote.etat, 'ok'); assert.equal(r.j.copilote.resultats[0].source, 'Copilote · annuaire'); assert.equal(r.j.copilote.resultats[0].date, '2026-11-01')
  assert.equal(r.j.mails.resultats[0].titre, 'Objet du fil')
  assert.ok(m.vus.google.every((g) => g.startsWith('GET ')), 'Google : lectures seules')
  assert.ok(!/"name":"(ingest|sources|stats)"/.test(fs.readFileSync(path.join(m.dir, 'copilote.log'), 'utf8')), 'seuls search/read_around')
  const l = m.journal().find((e) => e.agent === 'recherche')
  assert.equal(l.nb_copilote, 1); assert.equal(l.nb_mails, 1); assert.ok(!m.journalBrut().includes(SECRET) && !m.journalBrut().includes('Objet du fil'))
  assert.equal((await m.api('/api/recherche', { requete: '' })).code, 400)
  assert.equal((await m.req('/api/recherche', { methode: 'POST', corps: { requete: 'x' } })).code, 403)
  m.fin()
  const k = await monde({ cle: '', jetonKo: true })
  const r2 = await k.api('/api/recherche', { requete: 'x', copilote: false, mails: true })
  k.fin()
  assert.equal(r2.code, 200); assert.equal(r2.j.mails.etat, 'non autorisé')
})

test('US-9 : l\'analyseur Copilote et la liste blanche des outils', async () => {
  const { analyserCopilote, appelCopilote } = await import('../src/recherche.mjs')
  const r = analyserCopilote('[12] Titre long v2 · regle · 2026-10-05 · auteur\nTexte du passage\nsuite\n\n[13] Autre · doc · sans date\nabc')
  assert.equal(r.length, 2); assert.equal(r[0].id, 12); assert.equal(r[0].source, 'Copilote · regle'); assert.equal(r[0].extrait, 'Texte du passage suite')
  await assert.rejects(appelCopilote('ingest', {}), /non autorisé/)
})

test('US-16 : les lignes de conversation et de recherche ne consomment pas les compteurs d\'évaluation, mais comptent dans la dépense totale', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpt-')); fs.mkdirSync(path.join(dir, 'd', 'journal'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'd', 'journal', '2026-12-01.jsonl'), [{ at: '2026-12-01T09:00:00Z', agent: 'conversation', modele: 'anthropic/claude-haiku-5.5', statut: 'ok', cout_usd: 0.2 }, { at: '2026-12-01T09:00:00Z', agent: 'veille-coach', modele: 'anthropic/claude-haiku-5.5', statut: 'ok', cout_usd: 0.1 }].map((x) => JSON.stringify(x)).join('\n') + '\n')
  const r = await new Promise((ok) => import('node:child_process').then(({ execFile }) => execFile('node', ['-e', "import('./src/lanceur.mjs').then(m=>console.log(JSON.stringify(m.depenseTotale('2026-01-01'))))"], { cwd: RACINE, env: { ...process.env, PILOTE_DATA: path.join(dir, 'd'), PILOTE_HOME: path.join(dir, 'h') } }, (e, so) => ok(JSON.parse(so)))))
  assert.equal(r.par['anthropic/claude-haiku-5.5'].ok, 1); assert.ok(Math.abs(r.usd - 0.3) < 1e-9)
})

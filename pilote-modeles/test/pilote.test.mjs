// Tests hors ligne : faux Google + faux OpenRouter. Aucune clé, aucun réseau externe.
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const listen = (h) => new Promise((r) => { const s = http.createServer(h); s.listen(0, '127.0.0.1', () => r(s)) })
const lire = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)) })

async function monde({ cleOr = 'cle-test', coutParTour = 0.001, toursOutils = 2, rapportCourt = false } = {}) {
  const vus = { google: [], or: [] }
  const google = await listen(async (req, res) => {
    vus.google.push(`${req.method} ${req.url.split('?')[0]}`)
    res.setHeader('content-type', 'application/json')
    if (req.url.includes('/threads?')) return res.end(JSON.stringify({ threads: [{ id: 't1', snippet: 'extrait' }] }))
    if (req.url.includes('/threads/t1')) return res.end(JSON.stringify({ messages: [{ id: 'm1', internalDate: '1790000000000', payload: { headers: [{ name: 'From', value: 'a@x.test' }, { name: 'Subject', value: 'Objet' }, { name: 'Date', value: 'lundi' }], mimeType: 'text/plain', body: { data: Buffer.from('CONTENU-CONFIDENTIEL').toString('base64url') } } }] }))
    res.end('{}')
  })
  const oauth = await listen(async (req, res) => { await lire(req); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ access_token: 'AT', expires_in: 3599 })) })
  const or = await listen(async (req, res) => {
    const corps = JSON.parse(await lire(req))
    vus.or.push({ auth: req.headers.authorization, corps })
    const n = vus.or.filter((x) => x.corps.model === corps.model).length
    const appel = (name, args) => ({ id: 'c' + n, type: 'function', function: { name, arguments: JSON.stringify(args) } })
    const message = n === 1 ? { role: 'assistant', content: null, tool_calls: [appel('gmail_chercher', { query: 'newer_than:1d' })] }
      : n === 2 && toursOutils >= 2 ? { role: 'assistant', content: null, tool_calls: [appel('gmail_lire_fil', { thread_id: 't1' }), appel('copilote_chercher', { requete: 'routage', kind: 'annuaire' }), appel('ecrire_brouillon', { a: ['x@y.test'], objet: 'Re', corps: 'Bonjour', justification_routage: 'test', etat: 'pret' })] }
      : { role: 'assistant', content: rapportCourt && !corps.messages.some((x) => String(x.content).includes('rapport est trop court')) ? 'Voici mes brouillons.' : '## Résumé\n' + 'Rapport complet. '.repeat(30) }
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message }], usage: { prompt_tokens: 1000, completion_tokens: 100, cost: coutParTour } }))
  })
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilote-'))
  const home = path.join(dir, 'home'), data = path.join(dir, 'data')
  fs.mkdirSync(home, { recursive: true }); fs.mkdirSync(data, { recursive: true })
  fs.writeFileSync(path.join(home, 'env'), `${cleOr ? `OPENROUTER_API_KEY=${cleOr}\n` : ''}GOOGLE_CLIENT_ID=x\nGOOGLE_CLIENT_SECRET=y\n`, { mode: 0o600 })
  fs.writeFileSync(path.join(home, 'google-token.json'), JSON.stringify({ refresh_token: 'RT' }), { mode: 0o600 })
  const env = { ...process.env, PILOTE_HOME: home, PILOTE_DATA: data, PILOTE_FORCER: '1', PILOTE_SANS_NOTIF: '1', PILOTE_SANS_LAUNCHD: '1', PILOTE_COPILOTE_CMD: JSON.stringify(['node', path.join(RACINE, 'test', 'faux-copilote.mjs')]), FAUX_COPILOTE_LOG: path.join(dir, 'copilote.log'), SPIKE_DIR: path.join(dir, 'pas-de-spike'),
    OPENROUTER_BASE: `http://127.0.0.1:${or.address().port}`, GOOGLE_API_BASE: `http://127.0.0.1:${google.address().port}/`, GOOGLE_TOKEN_URL: `http://127.0.0.1:${oauth.address().port}/t` }
  delete env.OPENROUTER_API_KEY
  const lancer = (...args) => new Promise((r) => execFile('node', args, { env, cwd: RACINE }, (e, so, se) => r({ code: e?.code ?? 0, so, se })))
  const journal = () => (fs.existsSync(path.join(data, 'journal')) ? fs.readdirSync(path.join(data, 'journal')).flatMap((f) => fs.readFileSync(path.join(data, 'journal', f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) : [])
  return { vus, home, data, env, lancer, journal, fin: () => [google, oauth, or].forEach((s) => s.close()) }
}

test('passage complet : outils lecture seule, brouillon local, ZDR demandé, coût journalisé sans contenu', async () => {
  const m = await monde()
  const r = await m.lancer('src/passage.mjs')
  m.fin()
  assert.equal(r.code, 0, r.so + r.se)
  const j = m.journal()
  assert.equal(j.length, 2, 'un passage par modèle (A et B)')
  assert.ok(j.every((e) => e.statut === 'ok' && e.cout_usd > 0 && e.jetons_entree > 0))
  assert.deepEqual(new Set(j.map((e) => e.modele)), new Set(['anthropic/claude-haiku-5.5', 'openai/gpt-oss-120b']))
  const brut = JSON.stringify(j)
  assert.ok(!brut.includes('CONTENU-CONFIDENTIEL') && !brut.includes('cle-test') && !brut.includes('newer_than'), 'aucun contenu, requête ni secret dans le journal')
  const req = m.vus.or[0]
  assert.equal(req.auth, 'Bearer cle-test')
  assert.equal(req.corps.provider.zdr, true)
  assert.equal(req.corps.provider.data_collection, 'deny')
  assert.ok(req.corps.tools.length >= 8)
  assert.match(JSON.stringify(req.corps.messages), /fils des 2 derniers jours, classés par importance/)
  const cop = fs.readFileSync(path.join(path.dirname(m.home), 'copilote.log'), 'utf8')
  assert.match(cop, /"name":"search"/)
  assert.match(cop, /"kind":"annuaire"/)
  assert.ok(m.vus.google.every((x) => x.startsWith('GET ')), 'Google : uniquement des lectures')
  const br = fs.readdirSync(path.join(m.data, 'brouillons'))
  assert.equal(br.length, 2)
  assert.match(fs.readFileSync(path.join(m.data, 'brouillons', br[0]), 'utf8'), /NON ENVOYÉ/)
  assert.equal(fs.readdirSync(path.join(m.data, 'rapports')).length, 2)
  assert.equal(fs.statSync(path.join(m.data, 'journal')).mode & 0o077, 0)
})

test('plafond total atteint : aucun appel au fournisseur', async () => {
  const m = await monde()
  fs.mkdirSync(path.join(m.data, 'journal'), { recursive: true })
  fs.writeFileSync(path.join(m.data, 'journal', '2026-01-01.jsonl'), JSON.stringify({ at: '2026-01-01T00:00:00Z', cout_usd: 5.0, statut: 'ok' }) + '\n')
  const r = await m.lancer('src/passage.mjs')
  m.fin()
  assert.equal(r.code, 0)
  assert.equal(m.vus.or.length, 0)
  assert.ok(m.journal().some((e) => e.statut === 'refuse_plafond_total'))
})

test('plafond par passage : coupure et statut explicite', async () => {
  const m = await monde({ coutParTour: 0.5 })
  await m.lancer('src/passage.mjs')
  m.fin()
  assert.ok(m.journal().filter((e) => e.agent).some((e) => e.statut === 'coupe_plafond_passage'))
})

test('clé absente : refus propre, aucun appel', async () => {
  const m = await monde({ cleOr: '' })
  const r = await m.lancer('src/passage.mjs')
  m.fin()
  assert.equal(r.code, 0)
  assert.equal(m.vus.or.length, 0)
  assert.ok(m.journal().every((e) => e.statut === 'refuse_cle_absente'))
})

test('couts : résumé lisible, sans contenu', async () => {
  const m = await monde()
  await m.lancer('src/passage.mjs')
  const r = await m.lancer('src/couts.mjs')
  m.fin()
  assert.match(r.so, /Total : 0\.00\d+ \$/)
  assert.ok(!r.so.includes('CONTENU-CONFIDENTIEL'))
})

test('reinstall propre : install, vérifier, passage, désinstaller --purger, plus aucun résidu', async () => {
  const m = await monde()
  const sh = (...a) => new Promise((r) => execFile('./pilote.sh', a, { env: m.env, cwd: RACINE }, (e, so, se) => r({ code: e?.code ?? 0, so, se })))
  fs.rmSync(m.home, { recursive: true, force: true }); fs.rmSync(m.data, { recursive: true, force: true })
  let r = await sh('install')
  assert.equal(r.code, 0, r.so + r.se)
  assert.ok(fs.existsSync(path.join(m.home, 'env')) && (fs.statSync(path.join(m.home, 'env')).mode & 0o777) === 0o600)
  r = await sh('install')   // idempotent
  assert.equal(r.code, 0, r.so + r.se)
  r = await sh('desinstaller', '--purger')
  m.fin()
  assert.equal(r.code, 0, r.so + r.se)
  assert.ok(!fs.existsSync(m.home) && !fs.existsSync(m.data))
})

test('rapport quasi vide : une relance, puis rapport complet ; sinon statut explicite', async () => {
  const m = await monde({ rapportCourt: true, toursOutils: 1 })
  await m.lancer('src/passage.mjs')
  m.fin()
  const j = m.journal().filter((e) => e.agent)
  assert.ok(j.every((e) => e.relance === true && e.statut === 'ok'), JSON.stringify(j))
  assert.ok(m.vus.or.some((r) => r.corps.messages.some((x) => String(x.content).includes('rapport est trop court'))))
})

test('classement par importance : tes réponses récentes et les allers-retours passent devant le bruit', async () => {
  const { noter } = await import('../src/outils.mjs')
  const maintenant = 1_800_000_000_000, h = (n) => String(maintenant - n * 3600000)
  const m = (de, il_y_a, labelIds = []) => ({ internalDate: h(il_y_a), labelIds, payload: { headers: [{ name: 'From', value: de }] } })
  const reponse = noter({ messages: [m('a', 30), m('moi', 3, ['SENT']), m('a', 1, ['UNREAD'])] }, maintenant)
  const allers = noter({ messages: [m('a', 20), m('b', 18), m('a', 12), m('b', 6), m('a', 2)] }, maintenant)
  const bruit = noter({ messages: [m('news', 2, ['UNREAD', 'CATEGORY_PROMOTIONS'])] }, maintenant)
  assert.ok(reponse.score > bruit.score && allers.score > bruit.score)
  assert.ok(reponse.pourquoi.some((x) => /moins de 8 h/.test(x)) && reponse.pourquoi.some((x) => /attend ta réponse/.test(x)))
  assert.ok(allers.pourquoi.some((x) => /allers-retours/.test(x)))
})

test('classement par importance : blocages, accès, flux, recette et retards pèsent sur le score', async () => {
  const { noter } = await import('../src/outils.mjs')
  const { charger } = await import('../src/config.mjs')
  const cfg = charger(), maintenant = 1_800_000_000_000
  const msg = { internalDate: String(maintenant - 40 * 3600000), labelIds: [], payload: { headers: [{ name: 'From', value: 'a' }, { name: 'Subject', value: 'RE: ' }] } }
  const neutre = noter({ messages: [msg], texte: 'Compte rendu de la réunion' }, maintenant, cfg)
  for (const [texte, motif] of [['Accès VPN impossible pour les testeurs', /blocage|acces/], ["Arrêt de la recette suite à l'anomalie", /recette/], ['Ouverture de flux en attente', /flux/], ['Retard de livraison du lot 2', /retard/]]) {
    const r = noter({ messages: [msg], texte }, maintenant, cfg)
    assert.ok(r.score > neutre.score, texte)
    assert.ok(r.pourquoi.some((x) => motif.test(x)), `${texte} -> ${r.pourquoi}`)
  }
  assert.equal(noter({ messages: [msg], texte: 'token tokyo' }, maintenant, cfg).score, neutre.score, 'pas de faux positif sur un mot contenant « ko »')
})

test('brouillon : destinataires en texte ou en liste acceptés, corps vide refusé', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'br-'))
  const code = `
    import { IMPL } from './src/outils.mjs'
    await IMPL.ecrire_brouillon({ a: 'x@y.test, z@y.test', cc: ['c@y.test'], objet: 'O', corps: 'Bonjour', justification_routage: 'r', etat: 'pret' })
    await IMPL.ecrire_brouillon({ a: ['x@y.test'], objet: 'O', corps: 'Bonjour', justification_routage: 'r', etat: 'bizarre' })
    let refus = false
    try { await IMPL.ecrire_brouillon({ a: [], objet: 'O', corps: '  ', justification_routage: 'r', etat: 'pret' }) } catch (e) { refus = /corps du brouillon vide/.test(e.message) }
    console.log(refus ? 'REFUS-OK' : 'REFUS-KO')`
  const r = await new Promise((ok) => execFile('node', ['--input-type=module', '-e', code], { cwd: RACINE, env: { ...process.env, PILOTE_DATA: dir, PILOTE_HOME: dir, MES_ADRESSES: '' } }, (e, so, se) => ok({ so, se })))
  assert.match(r.so, /REFUS-OK/, r.se)
  const f = fs.readdirSync(path.join(dir, 'brouillons'))
  assert.equal(f.length, 2)
  assert.match(fs.readFileSync(path.join(dir, 'brouillons', f[0]), 'utf8') + fs.readFileSync(path.join(dir, 'brouillons', f[1]), 'utf8'), /x@y\.test, z@y\.test/)
})

test('classement : une réponse envoyée depuis une autre boîte (adresse connue) compte comme « tu as répondu »', async () => {
  const { noter } = await import('../src/outils.mjs')
  const { charger } = await import('../src/config.mjs')
  const cfg = charger(), maintenant = 1_800_000_000_000, h = (n) => String(maintenant - n * 3600000)
  const m = (de, il_y_a) => ({ internalDate: h(il_y_a), labelIds: ['INBOX'], payload: { headers: [{ name: 'From', value: de }, { name: 'Subject', value: 'Objet' }] } })
  const f = { messages: [m('Autre <autre@x.test>', 20), m('Moi <moi@pro.test>', 3), m('Autre <autre@x.test>', 1)] }
  assert.ok(!noter(f, maintenant, cfg, []).pourquoi.some((x) => /tu as répondu/.test(x)))
  const r = noter(f, maintenant, cfg, ['moi@pro.test'])
  assert.ok(r.pourquoi.some((x) => /moins de 8 h/.test(x)) && r.pourquoi.some((x) => /attend ta réponse/.test(x)), r.pourquoi.join(';'))
})

test('brouillon : ton adresse est ajoutée d\'office en Cc', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-'))
  const code = `
    import { IMPL } from './src/outils.mjs'
    await IMPL.ecrire_brouillon({ a: ['x@y.test'], cc: [], objet: 'O', corps: 'Bonjour', justification_routage: 'r', etat: 'pret' })`
  await new Promise((ok) => execFile('node', ['--input-type=module', '-e', code], { cwd: RACINE, env: { ...process.env, PILOTE_DATA: dir, PILOTE_HOME: dir, CC_AUTO: '', MES_ADRESSES: 'moi@pro.test' } }, ok))
  const f = fs.readdirSync(path.join(dir, 'brouillons'))
  assert.match(fs.readFileSync(path.join(dir, 'brouillons', f[0]), 'utf8'), /\*\*Cc\*\* : moi@pro\.test/)
})

test('dernier tour : outils interdits pour forcer le rapport', async () => {
  const vus = []
  const or = await listen(async (req, res) => {
    const corps = JSON.parse(await lire(req)); vus.push(corps)
    const message = corps.tool_choice === 'none' ? { role: 'assistant', content: '## Résumé\n' + 'Rapport final. '.repeat(30) }
      : { role: 'assistant', content: null, tool_calls: [{ id: 'c' + vus.length, type: 'function', function: { name: 'suivi_lire', arguments: '{}' } }] }
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message, finish_reason: corps.tool_choice === 'none' ? 'stop' : 'tool_calls' }], usage: { prompt_tokens: 100, completion_tokens: 10, cost: 0.0001 } }))
  })
  const m = await monde()
  m.fin()
  const env = { ...m.env, OPENROUTER_BASE: `http://127.0.0.1:${or.address().port}` }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-'))
  env.PILOTE_DATA = dir; env.PILOTE_HOME = m.home
  await new Promise((ok) => execFile('node', ['src/passage.mjs'], { env, cwd: RACINE }, ok))
  or.close()
  assert.ok(vus.some((c) => c.tool_choice === 'none'), 'un tour sans outils a été imposé')
  const j = fs.readFileSync(path.join(dir, 'journal', fs.readdirSync(path.join(dir, 'journal'))[0]), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  assert.ok(j.every((e) => e.statut === 'ok' && e.taille_rapport > 300), JSON.stringify(j))
})

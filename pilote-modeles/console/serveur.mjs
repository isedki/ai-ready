// Console locale du pilote : une page web sur 127.0.0.1 avec des boutons. Aucune dépendance, aucun accès réseau extérieur.
// Sécurité : écoute 127.0.0.1 seulement, jeton aléatoire par démarrage, contrôle Host/Origin, actions en liste blanche (aucune commande saisie).
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { charger, mode, JOURNAL_DIR, RAPPORTS_DIR, BROUILLONS_DIR, VERROU } from '../src/config.mjs'
import { depenseTotale } from '../src/lanceur.mjs'
import { scopesJeton } from '../src/google.mjs'

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEPOT = path.resolve(RACINE, '..')
const SH = process.env.PILOTE_SH || path.join(RACINE, 'pilote.sh')
const PORT = Number(process.env.PILOTE_CONSOLE_PORT ?? 4317)
const TOKEN = process.env.PILOTE_CONSOLE_TOKEN || crypto.randomBytes(16).toString('hex')
const LABEL = 'com.pilote.us8.veille'

const ACTIONS = {
  statut: ['statut'], couts: ['couts'], verifier: ['verifier'], passage: ['passage'], pause: ['pause'], reprendre: ['reprendre'],
  'mode-ombre': ['mode', 'ombre'], 'mode-brouillons': ['mode', 'brouillons'],
}
const FOND = new Set(['passage'])               // actions longues : exécutées en tâche de fond, suivies par /api/jobs
const DOSSIERS = { rapports: () => RAPPORTS_DIR, brouillons: () => BROUILLONS_DIR }

const outilsExternes = () => { try { return JSON.parse(fs.readFileSync(path.join(RACINE, 'console', 'outils.json'), 'utf8')).outils || [] } catch { return [] } }
const jobs = new Map()
let compteur = 0

function lancer(argv, { fond = false, cwd = RACINE, cmd = SH, delai = 120000 } = {}) {
  const id = String(++compteur), job = { id, debut: Date.now(), statut: 'en cours', sortie: '' }
  jobs.set(id, job)
  for (const k of [...jobs.keys()].slice(0, -20)) jobs.delete(k)
  const fin = (err, so, se) => { job.statut = err && err.killed ? 'délai dépassé' : err ? 'erreur' : 'terminé'; job.sortie = `${so || ''}${se || ''}`.slice(-20000); job.fin = Date.now() }
  execFile(cmd, argv, { cwd, timeout: fond ? 900000 : delai, maxBuffer: 2e6, env: { ...process.env, PILOTE_FORCER: '1' } }, fin)
  return job
}

function launchctlActif() {
  return new Promise((ok) => execFile('launchctl', ['print', `gui/${process.getuid()}/${LABEL}`], (e) => ok(!e)))
}

async function etat() {
  const cfg = charger(), d = depenseTotale(cfg.compter_depuis || '')
  let verrou = null
  try { const v = JSON.parse(fs.readFileSync(VERROU, 'utf8')); try { process.kill(v.pid, 0); verrou = Math.round((Date.now() - v.at) / 60000) } catch {} } catch {}
  const derniers = []
  if (fs.existsSync(JOURNAL_DIR)) for (const f of fs.readdirSync(JOURNAL_DIR).sort().slice(-2)) for (const l of fs.readFileSync(path.join(JOURNAL_DIR, f), 'utf8').split('\n').filter(Boolean)) { try { derniers.push(JSON.parse(l)) } catch {} }
  return {
    mode: mode(), autorisation_brouillons: scopesJeton().includes('gmail.modify'), planification: await launchctlActif(),
    horaires: cfg.planning.map((p) => `${p.h}h${String(p.m).padStart(2, '0')}`), etiquette: cfg.ecriture_gmail?.etiquette,
    modeles: cfg.modeles_par_passage.map((c) => ({ cle: c, id: cfg.modeles[c], ok: (d.par[cfg.modeles[c]] || { ok: 0 }).ok, essais: (d.par[cfg.modeles[c]] || { essais: 0 }).essais, max: cfg.plafonds.passages_max })),
    depense_usd: +d.usd.toFixed(4), plafond_usd: cfg.plafonds.total_usd, passage_en_cours_min: verrou,
    derniers: derniers.slice(-6).reverse().map((j) => ({ at: j.at, modele: String(j.modele).split('/').pop(), statut: j.statut, cout: j.cout_usd || 0, rapport: j.taille_rapport })),
    jobs: [...jobs.values()].slice(-5).reverse().map((j) => ({ id: j.id, statut: j.statut })),
  }
}

const hostOk = (h) => [`127.0.0.1:${port()}`, `localhost:${port()}`].includes(h)
const port = () => server.address()?.port ?? PORT
const json = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(o)) }
const lire = (req) => new Promise((ok) => { let b = ''; req.on('data', (c) => { b += c; if (b.length > 10000) req.destroy() }); req.on('end', () => ok(b)) })

const server = http.createServer(async (req, res) => {
  try {
    if (!hostOk(req.headers.host)) return json(res, 403, { erreur: 'hôte refusé' })
    const url = new URL(req.url, `http://${req.headers.host}`)
    if (req.method === 'GET' && url.pathname === '/') {
      if (url.searchParams.get('t') !== TOKEN) { res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }); return res.end("Accès refusé : ouvre la console avec  ./pilote.sh console") }
      const html = fs.readFileSync(path.join(RACINE, 'console', 'index.html'), 'utf8').replace('__TOKEN__', TOKEN)
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'content-security-policy': "default-src 'self' 'unsafe-inline'; frame-ancestors 'none'" })
      return res.end(html)
    }
    if (!url.pathname.startsWith('/api/')) return json(res, 404, { erreur: 'introuvable' })
    if (req.headers['x-token'] !== TOKEN) return json(res, 403, { erreur: 'jeton invalide' })
    if (req.method === 'POST') {
      const o = req.headers.origin
      if (o && ![`http://127.0.0.1:${port()}`, `http://localhost:${port()}`].includes(o)) return json(res, 403, { erreur: 'origine refusée' })
    }
    if (req.method === 'GET' && url.pathname === '/api/etat') return json(res, 200, await etat())
    if (req.method === 'GET' && url.pathname === '/api/outils') return json(res, 200, outilsExternes().map(({ id, titre, description, actions }) => ({ id, titre, description, actions: (actions || []).map(({ id: a, libelle, confirmer }) => ({ id: a, libelle, confirmer: !!confirmer })) })))
    const m = url.pathname.match(/^\/api\/jobs\/(\d+)$/)
    if (req.method === 'GET' && m) { const j = jobs.get(m[1]); return j ? json(res, 200, j) : json(res, 404, { erreur: 'tâche inconnue' }) }
    if (req.method === 'POST' && url.pathname === '/api/action') {
      const { action, param } = JSON.parse((await lire(req)) || '{}')
      if (action === 'retrouver') {
        const mots = String(param || '').replace(/[^\p{L}\p{N} ._'-]/gu, ' ').trim().slice(0, 80)
        if (!mots) return json(res, 400, { erreur: 'mots manquants' })
        return json(res, 200, lancer(['retrouver', mots]))
      }
      if (action === 'ouvrir') {
        const d = DOSSIERS[param]; if (!d) return json(res, 404, { erreur: 'dossier inconnu' })
        fs.mkdirSync(d(), { recursive: true }); execFile('open', [d()], () => {}); return json(res, 200, { statut: 'ouvert' })
      }
      if (action === 'externe') {
        const [oid, aid] = String(param || '').split('/')
        const a = outilsExternes().find((o) => o.id === oid)?.actions?.find((x) => x.id === aid)
        if (!a || !Array.isArray(a.cmd) || !a.cmd.length) return json(res, 404, { erreur: 'action inconnue' })
        const cible = path.resolve(DEPOT, ...(a.cmd[1] ? [a.cmd[1]] : ['.']))
        if (!cible.startsWith(DEPOT + path.sep)) return json(res, 403, { erreur: 'chemin hors du dépôt' })
        return json(res, 200, lancer(a.cmd.slice(1), { cmd: a.cmd[0], cwd: DEPOT, fond: true }))
      }
      if (!ACTIONS[action]) return json(res, 404, { erreur: 'action inconnue' })
      if (FOND.has(action) && [...jobs.values()].some((j) => j.statut === 'en cours' && j.action === action)) return json(res, 409, { erreur: 'déjà en cours' })
      const j = lancer(ACTIONS[action], { fond: FOND.has(action) }); j.action = action
      return json(res, 200, j)
    }
    json(res, 404, { erreur: 'introuvable' })
  } catch (e) { json(res, 500, { erreur: String(e.message).slice(0, 200) }) }
})

server.listen(PORT, '127.0.0.1', () => {
  const adresse = `http://127.0.0.1:${server.address().port}/?t=${TOKEN}`
  console.log(`Console du pilote : ${adresse}\n(Ctrl+C pour arrêter ; la page ne répond qu'à ce Mac.)`)
  if (!process.env.PILOTE_SANS_OUVRIR) execFile('open', [adresse], () => {})
})

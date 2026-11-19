#!/usr/bin/env node
// Observateur · collecteur macOS. Lancé par launchd toutes les 30 s (voir install.sh) : prend UN
// échantillon et l'ajoute au journal du jour :
//   - application au premier plan, titre de sa fenêtre, domaine de l'onglet si c'est un navigateur ;
//   - secondes depuis la dernière action clavier ou souris ;
//   - l'environnement : plantages d'applications depuis l'échantillon précédent (rapports de
//     ~/Library/Logs/DiagnosticReports), réseau coupé, redémarrage du Mac.
// Ni capture d'écran, ni frappe clavier, ni contenu de document.
import { execFileSync }                                      from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir }                                           from 'node:os'
import { join }                                              from 'node:path'
import { crashApp, loadConfig, localDay, makeRecord, parseIdle } from './lib.mjs'

const FRONT = `
tell application "System Events"
  set p to first application process whose frontmost is true
  set n to name of p
  set w to ""
  try
    set w to value of attribute "AXTitle" of front window of p
  end try
end tell
return n & tab & w`

const BROWSERS = {
  'Safari': 'tell application "Safari" to return URL of front document',
  'Google Chrome': 'tell application "Google Chrome" to return URL of active tab of front window',
  'Microsoft Edge': 'tell application "Microsoft Edge" to return URL of active tab of front window',
  'Brave Browser': 'tell application "Brave Browser" to return URL of active tab of front window',
  'Arc': 'tell application "Arc" to return URL of active tab of front window',
}

const osa = script => execFileSync('osascript', ['-e', script], { encoding: 'utf8', timeout: 5000 }).trim()
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', timeout: 5000 })

const cfg = loadConfig()
const stateFile = join(cfg.dossier_donnees, '..', 'etat.json')
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {}
const now = new Date()

let app = '', title = '', url = '', idle = 0, online = true, boot = null
try { [app, title = ''] = osa(FRONT).split('\t') } catch { /* écran verrouillé ou Accessibilité non autorisée */ }
if (BROWSERS[app]) { try { url = osa(BROWSERS[app]) } catch { /* pas d'onglet, ou Automatisation non autorisée */ } }
try { idle = parseIdle(run('ioreg', ['-c', 'IOHIDSystem', '-d', '4'])) } catch { /* ignore */ }
try { run('route', ['-n', 'get', 'default']) } catch { online = false }

// Plantages : rapports apparus depuis le dernier échantillon.
const crashes = []
const reports = join(homedir(), 'Library', 'Logs', 'DiagnosticReports')
const since = state.dernier ? Date.parse(state.dernier) : now.getTime() - 60_000
try {
  for (const f of readdirSync(reports)) {
    const a = crashApp(f)
    if (a && statSync(join(reports, f)).mtimeMs > since && !crashes.includes(a)) crashes.push(a)
  }
} catch { /* dossier absent */ }

// Redémarrage : l'heure de démarrage du Mac a changé.
try {
  const m = /sec = (\d+)/.exec(run('sysctl', ['-n', 'kern.boottime']))
  const b = m ? new Date(Number(m[1]) * 1000).toISOString() : null
  if (b && b !== state.boot) { boot = b; state.boot = b }
} catch { /* ignore */ }

const rec = makeRecord({ now, app, title, url, idle, crashes, online, boot }, cfg)
mkdirSync(cfg.dossier_donnees, { recursive: true, mode: 0o700 })
if (rec && (rec.app || rec.plantages || rec.hors_ligne)) {
  appendFileSync(join(cfg.dossier_donnees, `${localDay(now)}.jsonl`), JSON.stringify(rec) + '\n', { mode: 0o600 })
}
state.dernier = now.toISOString()
writeFileSync(stateFile, JSON.stringify(state), { mode: 0o600 })

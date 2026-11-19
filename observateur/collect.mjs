#!/usr/bin/env node
// Observateur · collecteur macOS. Lancé par launchd toutes les 30 s (voir install.sh) : prend UN
// échantillon (application au premier plan, titre de sa fenêtre, domaine de l'onglet si c'est un
// navigateur, inactivité) et l'ajoute au journal du jour. Ni capture d'écran, ni frappe clavier,
// ni contenu de document : seulement ce qui est dans la barre de titre.
import { execFileSync }                 from 'node:child_process'
import { appendFileSync, mkdirSync }    from 'node:fs'
import { join }                         from 'node:path'
import { loadConfig, localDay, makeRecord, parseIdle } from './lib.mjs'

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

function sample() {
  let app = '', title = '', url = '', idle = 0
  try { [app, title = ''] = osa(FRONT).split('\t') } catch { /* écran verrouillé ou permission refusée */ }
  if (BROWSERS[app]) { try { url = osa(BROWSERS[app]) } catch { /* pas d'onglet, ou Automatisation non autorisée */ } }
  try { idle = parseIdle(execFileSync('ioreg', ['-c', 'IOHIDSystem', '-d', '4'], { encoding: 'utf8', timeout: 5000 })) } catch { /* ignore */ }
  return { app, title, url, idle }
}

const cfg = loadConfig()
const now = new Date()
const rec = makeRecord({ now, ...sample() }, cfg)
if (rec && rec.app) {
  mkdirSync(cfg.dossier_donnees, { recursive: true, mode: 0o700 })
  appendFileSync(join(cfg.dossier_donnees, `${localDay(now)}.jsonl`), JSON.stringify(rec) + '\n', { mode: 0o600 })
}

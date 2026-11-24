// Génère le fichier launchd (planificateur macOS) à partir de la config : une entrée par heure de passage.
import path from 'node:path'
import { RACINE, DATA, charger } from './config.mjs'
const cfg = charger()
const node = process.execPath
const jours = cfg.jours_ouvres_seulement ? [1, 2, 3, 4, 5] : [null]
const entrees = cfg.planning.flatMap((p) => jours.map((d) => `    <dict>${d ? `<key>Weekday</key><integer>${d}</integer>` : ''}<key>Hour</key><integer>${p.h}</integer><key>Minute</key><integer>${p.m}</integer></dict>`)).join('\n')
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
process.stdout.write(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.pilote.us8.veille</string>
  <key>ProgramArguments</key><array><string>${esc(node)}</string><string>${esc(path.join(RACINE, 'src', 'passage.mjs'))}</string></array>
  <key>WorkingDirectory</key><string>${esc(RACINE)}</string>
  <key>StartCalendarInterval</key><array>
${entrees}
  </array>
  <key>StandardOutPath</key><string>${esc(path.join(DATA, 'launchd.log'))}</string>
  <key>StandardErrorPath</key><string>${esc(path.join(DATA, 'launchd.log'))}</string>
</dict></plist>
`)

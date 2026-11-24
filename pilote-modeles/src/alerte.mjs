// Alerte locale (notification macOS) en cas d'échec, une fois par jour et par motif. Aucun contenu dans le message.
import fs from 'node:fs'
import { execFile } from 'node:child_process'
import { ALERTES, DATA } from './config.mjs'
export function alerter(motif, message) {
  const jour = new Date().toISOString().slice(0, 10)
  let etat = {}
  try { etat = JSON.parse(fs.readFileSync(ALERTES, 'utf8')) } catch {}
  if (etat[motif] === jour) return false
  etat[motif] = jour
  fs.mkdirSync(DATA, { recursive: true, mode: 0o700 })
  fs.writeFileSync(ALERTES, JSON.stringify(etat), { mode: 0o600 })
  if (!process.env.PILOTE_SANS_NOTIF) execFile('osascript', ['-e', `display notification "${String(message).replace(/["\\]/g, ' ').slice(0, 180)}" with title "Pilote US-8 : à voir"`], () => {})
  return true
}

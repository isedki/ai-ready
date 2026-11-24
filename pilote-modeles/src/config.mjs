// Chemins, configuration et secrets. Aucune dépendance. Les secrets ne sont jamais affichés.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const HOME = process.env.PILOTE_HOME || path.join(os.homedir(), '.config', 'us8-pilote')
export const DATA = process.env.PILOTE_DATA || path.join(os.homedir(), '.local', 'share', 'us8-pilote')
export const ENV_FILE = path.join(HOME, 'env')
export const TOKEN_FILE = path.join(HOME, 'google-token.json')
export const JOURNAL_DIR = path.join(DATA, 'journal')
export const RAPPORTS_DIR = path.join(DATA, 'rapports')
export const BROUILLONS_DIR = path.join(DATA, 'brouillons')

export const charger = () => JSON.parse(fs.readFileSync(process.env.PILOTE_CONFIG || path.join(RACINE, 'config', 'pilote.json'), 'utf8'))

export function lireEnv() {
  const out = {}
  if (fs.existsSync(ENV_FILE)) {
    for (const l of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
      const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)
      if (m) out[m[1]] = m[2]
    }
  }
  return out
}
export function ecrireSecret(fichier, texte) {
  fs.mkdirSync(path.dirname(fichier), { recursive: true, mode: 0o700 })
  fs.writeFileSync(fichier, texte, { mode: 0o600 })
  fs.chmodSync(fichier, 0o600)
}
export const dossiers = () => { for (const d of [HOME, DATA, JOURNAL_DIR, RAPPORTS_DIR, BROUILLONS_DIR]) fs.mkdirSync(d, { recursive: true, mode: 0o700 }) }

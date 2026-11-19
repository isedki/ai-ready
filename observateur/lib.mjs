// Observateur : fonctions communes au collecteur et à l'analyse (sans dépendance).
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { homedir }                  from 'node:os'
import { dirname, join }            from 'node:path'
import { fileURLToPath }            from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export const expand = p => (p && p.startsWith('~') ? join(homedir(), p.slice(1)) : p)

/** Configuration : ~/.observateur/config.json (OBSERVATEUR_CONFIG) par-dessus config.example.json. */
export function loadConfig(path = process.env.OBSERVATEUR_CONFIG ?? '~/.observateur/config.json') {
  const base = JSON.parse(readFileSync(join(here, 'config.example.json'), 'utf8'))
  const file = expand(path)
  const own = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  const cfg = { ...base, ...own }
  cfg.dossier_donnees = expand(cfg.dossier_donnees)
  cfg.dossier_rapports = expand(cfg.dossier_rapports)
  cfg.dossier_savoir = expand(cfg.dossier_savoir)
  return cfg
}

/** Date locale AAAA-MM-JJ et heure HH:MM d'un instant. */
export const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const localTime = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/** Secondes d'inactivité depuis la sortie de `ioreg -c IOHIDSystem` (HIDIdleTime en nanosecondes). */
export function parseIdle(ioreg) {
  const m = /"HIDIdleTime"\s*=\s*(\d+)/.exec(ioreg ?? '')
  return m ? Math.floor(Number(m[1]) / 1e9) : 0
}

/** Domaine d'une URL, sans chemin ni paramètres (rien d'autre n'est gardé). */
export function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

/** Masque ce qui n'a pas à quitter le Mac : adresses, numéros, IP, URL, jetons (texte long gardé). */
export function maskText(text) {
  return (text ?? '')
    .replace(/https?:\/\/[^\s]+/g, u => `[${domainOf(u) || 'lien'}]`)
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '[ip]')
    .replace(/\+?\d[\d .-]{7,}\d/g, '[numéro]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[jeton]')
}

/** Un titre de fenêtre masqué, sur une ligne, 160 caractères au plus. */
export function redact(title) {
  return maskText(title).replace(/\s+/g, ' ').trim().slice(0, 160)
}

/** Un échantillon tel qu'il est écrit dans le journal. */
export function makeRecord({ now = new Date(), app = '', title = '', url = '', idle = 0, crashes = [], online = true, boot = null }, cfg) {
  if (cfg.ignorer_apps.includes(app)) return null
  const hidden = cfg.masquer_titre_apps.includes(app)
  const rec = {
    t: now.toISOString(),
    app,
    titre: hidden ? '' : redact(title),
    domaine: hidden ? '' : domainOf(url),
    inactif: idle >= cfg.inactif_apres_secondes,
    // Secondes depuis la dernière action clavier ou souris : distingue le travail soutenu
    // (quelques secondes) de la lecture ou de l'hésitation (une minute ou plus).
    idle_s: idle,
  }
  if (crashes.length) rec.plantages = crashes
  if (!online) rec.hors_ligne = true
  if (boot) rec.demarrage = boot
  return rec
}

/** Nom de l'application d'un rapport de plantage macOS (« Microsoft Teams-2026-11-19-101203.ips »). */
export function crashApp(file) {
  const m = /^(.+?)[-_]\d{4}-\d{2}-\d{2}-\d{6}.*\.(ips|crash|hang|diag)$/.exec(file)
  return m ? m[1].replace(/_/g, ' ') : null
}

/** Catégorie d'un échantillon : domaine d'abord (un onglet Gmail est un email), puis application. */
export function categorize(rec, cfg) {
  if (rec.domaine) {
    const byDomain = cfg.categories.find(c => c.domaines.some(d => rec.domaine.includes(d)))
    if (byDomain) return byDomain.nom
  }
  const byApp = cfg.categories.find(c => c.apps.includes(rec.app))
  return byApp ? byApp.nom : 'Autres'
}

/**
 * Vrai si le module est le script lancé (node chemin/analyse.mjs). Compare les chemins réels :
 * une URL de module encode les espaces (« observateur%202 ») et les liens symboliques, pas argv.
 */
export function isMain(metaUrl) {
  if (!process.argv[1]) return false
  try { return realpathSync(fileURLToPath(metaUrl)) === realpathSync(process.argv[1]) } catch { return false }
}

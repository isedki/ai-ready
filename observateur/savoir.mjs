// Observateur · savoir cumulé. Ce qui est appris jour après jour, gardé au-delà de l'effacement du
// journal brut (dossier_savoir) :
//   jours.jsonl     un résumé par jour (rythme, concentration, ralentissements, plantages, mails)
//   constats.json   ce que l'agent a compris de ton comportement, de ton environnement, de ton style
//                   de mail et de tes erreurs, avec le nombre de fois où c'est revenu et des preuves
//   notes.jsonl     ce que tu lui dis toi-même (« j'étais fatigué », « Teams a planté ») : fait foi
//   profil.md       le portrait écrit chaque vendredi à partir de tout cela
//   conversations/  ce que l'assistant (Claude) a retenu de vos échanges du jour : tâches, priorités,
//                   préférences, corrections, frictions (déposé chaque soir dans Drive)
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir }                                                        from 'node:os'
import { join }                                                           from 'node:path'
import { expand }                                                         from './lib.mjs'

const file = (cfg, name) => { mkdirSync(cfg.dossier_savoir, { recursive: true, mode: 0o700 }); return join(cfg.dossier_savoir, name) }
const lines = f => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).flatMap(l => { try { return [JSON.parse(l)] } catch { return [] } }) : [])

export function readDays(cfg) { return lines(file(cfg, 'jours.jsonl')) }

/** Ajoute ou remplace le résumé d'un jour (une analyse relancée ne crée pas de doublon). */
export function saveDay(cfg, summary) {
  const f = file(cfg, 'jours.jsonl')
  const kept = lines(f).filter(d => d.jour !== summary.jour)
  writeFileSync(f, [...kept, summary].sort((a, b) => a.jour.localeCompare(b.jour)).map(d => JSON.stringify(d)).join('\n') + '\n', { mode: 0o600 })
}

export function readNotes(cfg, sinceDay = '') { return lines(file(cfg, 'notes.jsonl')).filter(n => n.t.slice(0, 10) >= sinceDay) }

export function addNote(cfg, text, now = new Date()) {
  const note = { t: now.toISOString(), texte: text.trim() }
  appendFileSync(file(cfg, 'notes.jsonl'), JSON.stringify(note) + '\n', { mode: 0o600 })
  return note
}

export function readConstats(cfg) {
  const f = file(cfg, 'constats.json')
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {}
}

const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

/** Fusionne les constats du jour : un constat déjà connu gagne une occurrence et une preuve. */
export function mergeConstats(existing, today, day) {
  const out = { ...existing }
  const touched = []
  for (const c of today) {
    const id = slug(c.id || c.texte)
    if (!id) continue
    const prev = out[id]
    if (prev) {
      if (prev.derniere !== day) prev.occurrences++
      prev.derniere = day
      prev.texte = c.texte || prev.texte
      if (c.preuve) prev.preuves = [{ jour: day, preuve: c.preuve }, ...prev.preuves.filter(p => p.jour !== day)].slice(0, 5)
      touched.push({ id, nouveau: false, ...prev })
    } else {
      out[id] = { type: c.type, texte: c.texte, premiere: day, derniere: day, occurrences: 1, preuves: c.preuve ? [{ jour: day, preuve: c.preuve }] : [] }
      touched.push({ id, nouveau: true, ...out[id] })
    }
  }
  return { constats: out, touched }
}

export function saveConstats(cfg, constats) {
  writeFileSync(file(cfg, 'constats.json'), JSON.stringify(constats, null, 1), { mode: 0o600 })
}

/** Les plus solides d'abord : revenus le plus souvent, puis les plus récents. */
export function topConstats(constats, n = 40) {
  return Object.entries(constats)
    .sort((a, b) => b[1].occurrences - a[1].occurrences || b[1].derniere.localeCompare(a[1].derniere))
    .slice(0, n)
    .map(([id, c]) => ({ id, type: c.type, texte: c.texte, occurrences: c.occurrences, depuis: c.premiere }))
}

const median = xs => { const v = xs.filter(x => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null }
const toMin = hhmm => (hhmm ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) : null)
const toHHMM = m => (m == null ? null : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)

/** Tes repères habituels, sur les 20 derniers jours travaillés (et le même jour de la semaine). */
export function baseline(days, weekday) {
  const recent = days.filter(d => d.actif_minutes > 30).slice(-20)
  const same = recent.filter(d => d.jour_semaine === weekday)
  const pack = ds => ds.length ? {
    jours: ds.length,
    debut: toHHMM(median(ds.map(d => toMin(d.debut)))),
    fin: toHHMM(median(ds.map(d => toMin(d.fin)))),
    actif_minutes: median(ds.map(d => d.actif_minutes)),
    devant_pc_minutes: median(ds.map(d => d.devant_pc_minutes)),
    concentration_minutes: median(ds.map(d => d.concentration_minutes)),
    changements_par_heure: median(ds.map(d => d.changements_par_heure)),
  } : null
  return { habituel: pack(recent), meme_jour: pack(same) }
}

export function writeProfile(cfg, md) { writeFileSync(file(cfg, 'profil.md'), md + '\n', { mode: 0o600 }) }
export function readProfile(cfg) { const f = file(cfg, 'profil.md'); return existsSync(f) ? readFileSync(f, 'utf8') : '' }

/**
 * Dossier où l'assistant dépose chaque soir le résumé de vos conversations (AAAA-MM-JJ.json).
 * « auto » : le dossier Drive « Observateur · conversations » synchronisé par Google Drive pour
 * ordinateur, sinon ~/.observateur/conversations (fichier déposé à la main).
 */
/** Racines « Mon Drive » de Google Drive pour ordinateur (macOS), la plus probable d'abord. */
export function driveRoots(home = homedir()) {
  const cloud = join(home, 'Library', 'CloudStorage')
  if (!existsSync(cloud)) return []
  const roots = []
  for (const d of readdirSync(cloud).filter(n => n.startsWith('GoogleDrive-')))
    for (const sub of ['My Drive', 'Mon Drive']) { const p = join(cloud, d, sub); if (existsSync(p)) roots.push(p) }
  return roots
}

export function conversationsDir(cfg, home = homedir()) {
  const want = cfg.conversations?.dossier ?? 'auto'
  if (want !== 'auto') return expand(want)
  for (const r of driveRoots(home)) { const p = join(r, 'Observateur · conversations'); if (existsSync(p)) return p }
  return join(home, '.observateur', 'conversations')
}

/**
 * Copie un rapport (jour, semaine, équipe, portrait) dans le dossier Drive « Observateur · rapports »,
 * pour que l'agent Profil (en ligne) le lise. Le dossier est placé à côté de « Observateur · conversations »
 * s'il existe, sinon à la racine du premier Drive trouvé. Désactivable : "rapports_drive": false.
 * Renvoie le chemin copié, ou null (pas de Drive, désactivé, erreur : le rapport local reste la source).
 */
export function publishToDrive(cfg, file, home = homedir(), name, issues = []) {
  if (cfg.rapports_drive === false || !existsSync(file)) return null
  try {
    const roots = driveRoots(home)
    const root = roots.find(r => existsSync(join(r, 'Observateur · conversations'))) ?? roots[0]
    if (!root) { issues.push({ etape: 'drive', raison: 'Google Drive pour ordinateur introuvable (dossier ~/Library/CloudStorage/GoogleDrive-* absent : application fermée ou déconnectée)' }); return null }
    const dir = join(root, 'Observateur · rapports')
    mkdirSync(dir, { recursive: true })
    const dest = join(dir, name ?? file.split('/').pop())
    // Un rapport « Aucune activité » (journal brut purgé) ne remplace jamais un vrai rapport déjà sur Drive.
    if (existsSync(dest) && isStub(file) && statSync(dest).size > statSync(file).size) {
      issues.push({ etape: 'drive', raison: `${dest.split('/').pop()} : rapport vide non copié, le rapport existant sur Drive est conservé` })
      return null
    }
    if (!keepFile(file, dest)) { issues.push({ etape: 'drive', raison: `${dest.split('/').pop()} : copie impossible (Drive occupé ou fichier verrouillé)` }); return null }
    if (statSync(dest).size !== statSync(file).size) issues.push({ etape: 'drive', raison: `${dest.split('/').pop()} : taille différente après copie, synchronisation Drive à vérifier` })
    return dest
  } catch (e) { issues.push({ etape: 'drive', raison: String(e.message ?? e).slice(0, 200) }); return null }
}

/** Un rapport sans activité : quelques dizaines d'octets, « Aucune activité enregistrée ». */
export function isStub(file) { try { return statSync(file).size < 300 && /Aucune activité/.test(readFileSync(file, 'utf8')) } catch { return false } }

/**
 * État du relais : chaque rapport local (jour-*, semaine-*, equipe-*) comparé à sa copie Drive, et les jours
 * ouvrés récents sans résumé de conversation. { absents, differents, vides_proteges, conversations_manquantes }.
 */
export function relaisEtat(cfg, home = homedir(), { depuis, jusqu = localDayStr(new Date()) } = {}) {
  const roots = driveRoots(home)
  const root = roots.find(r => existsSync(join(r, 'Observateur · conversations'))) ?? roots[0]
  const etat = { drive: !!root, absents: [], differents: [], vides_proteges: [], conversations_manquantes: [] }
  if (!root) return etat
  const dir = join(root, 'Observateur · rapports')
  for (const f of existsSync(cfg.dossier_rapports) ? readdirSync(cfg.dossier_rapports).filter(n => /^(jour|semaine|equipe)-\d{4}-\d{2}-\d{2}\.md$/.test(n)).sort() : []) {
    if (depuis && f.replace(/^\D+-/, '').slice(0, 10) < depuis) continue
    const local = join(cfg.dossier_rapports, f), dest = join(dir, f)
    if (!existsSync(dest)) { (isStub(local) ? etat.vides_proteges : etat.absents).push(f); continue }
    if (statSync(dest).size !== statSync(local).size) (isStub(local) && statSync(dest).size > statSync(local).size ? etat.vides_proteges : etat.differents).push(f)
  }
  const conv = join(root, 'Observateur · conversations')
  const have = new Set(existsSync(conv) ? readdirSync(conv).filter(n => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).map(n => n.slice(0, 10)) : [])
  for (const d of readDays(cfg)) if ((!depuis || d.jour >= depuis) && d.jour <= jusqu && d.actif_minutes > 0 && !have.has(d.jour)) etat.conversations_manquantes.push(d.jour)
  return etat
}
const localDayStr = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Recopie les rapports absents ou différents (jamais un rapport vide par-dessus un vrai). */
export function relaisReparer(cfg, home = homedir(), opts = {}) {
  const avant = relaisEtat(cfg, home, opts), copies = [], issues = []
  for (const f of [...avant.absents, ...avant.differents]) { const r = publishToDrive(cfg, join(cfg.dossier_rapports, f), home, undefined, issues); if (r) copies.push(f) }
  return { avant, copies, issues, apres: relaisEtat(cfg, home, opts) }
}

/**
 * Garde une copie de `src` dans `dst`. Un fichier Drive pas encore téléchargé fait échouer copyFileSync
 * (erreur système -11, EAGAIN) : on relit alors normalement (readFileSync) puis on écrit la copie.
 * Renvoie false si le fichier reste illisible ; ne lève jamais.
 */
export function keepFile(src, dst, copy = copyFileSync) {
  try { copy(src, dst); return true } catch { /* relecture normale ci-dessous */ }
  try { writeFileSync(dst, readFileSync(src)); return true } catch { return false }
}

/**
 * Résumés de conversation des jours [from, to] (AAAA-MM-JJ). Chaque fichier trouvé est copié dans le
 * savoir (conversations/), qui reste la source si Drive n'est plus disponible : le savoir s'accumule.
 * Ne lève jamais : un fichier illisible ou un dossier absent est ignoré et ajouté à `issues`
 * ({ etape, raison }) pour figurer au rapport (« non lu : raison »).
 */
export function readConversations(cfg, from, to = from, dir = conversationsDir(cfg), issues = []) {
  try {
    const kept = join(cfg.dossier_savoir, 'conversations')
    mkdirSync(kept, { recursive: true, mode: 0o700 })
    if (existsSync(dir)) {
      for (const f of readdirSync(dir).filter(n => /^\d{4}-\d{2}-\d{2}\.json$/.test(n))) {
        const day = f.slice(0, 10)
        if (day >= from && day <= to && !keepFile(join(dir, f), join(kept, f)))
          issues.push({ etape: 'drive', raison: `${f} illisible (ignoré)` })
      }
    }
    return readdirSync(kept).filter(n => /^\d{4}-\d{2}-\d{2}\.json$/.test(n) && n.slice(0, 10) >= from && n.slice(0, 10) <= to).sort()
      .flatMap(f => { try { return [JSON.parse(readFileSync(join(kept, f), 'utf8'))] } catch { return [] } })
  } catch (e) {
    issues.push({ etape: 'conversations', raison: String(e.message ?? e).slice(0, 200) })
    return []
  }
}

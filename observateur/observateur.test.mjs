import { strict as assert }                       from 'node:assert'
import { mkdtempSync, writeFileSync }             from 'node:fs'
import { tmpdir }                                 from 'node:os'
import { join }                                   from 'node:path'
import { test }                                   from 'node:test'
import { askClaude, dayStats, environment, mailChecks, readDay, renderDay, renderWeek, slowWindows } from './analyse.mjs'
import { categorize, crashApp, domainOf, loadConfig, makeRecord, parseIdle, redact } from './lib.mjs'
import { daysBack, ownText, parseSent }           from './mails.mjs'
import { addNote, baseline, mergeConstats, readConstats, readDays, readNotes, saveConstats, saveDay, topConstats } from './savoir.mjs'

const cfg = loadConfig('/nonexistent/config.json')
const tmp = () => mkdtempSync(join(tmpdir(), 'obs-'))

test('titles lose addresses, numbers, IPs, links and tokens before anything is stored', () => {
  const t = redact('RE: flux 10.104.12.158 · issam.sedki@waroom.ma · +212 6 61 23 45 67 · https://drive.google.com/file/d/abc · ' + 'a'.repeat(40))
  assert.doesNotMatch(t, /10\.104|waroom|61 23|file\/d|aaaa/)
  assert.match(t, /\[ip\].*\[email\].*\[numéro\].*\[drive\.google\.com\].*\[jeton\]/)
  assert.equal(redact('A-043 MGEN3963 INC4660323 · 19/11 08:00'), 'A-043 MGEN3963 INC4660323 · 19/11 08:00')
})

test('browser tabs keep only their domain; idle time comes from HIDIdleTime', () => {
  assert.equal(domainOf('https://www.mail.google.com/mail/u/0/#inbox/123'), 'mail.google.com')
  assert.equal(domainOf('pas une url'), '')
  assert.equal(parseIdle('| | "HIDIdleTime" = 125000000000\n'), 125)
  assert.equal(parseIdle(''), 0)
})

test('records: ignored apps dropped, sensitive apps without title, environment kept', () => {
  assert.equal(makeRecord({ app: 'loginwindow' }, cfg), null)
  const r = makeRecord({ app: '1Password', title: 'Banque', url: 'https://x.com', idle: 0 }, cfg)
  assert.equal(r.titre, ''); assert.equal(r.domaine, '')
  const e = makeRecord({ app: 'Mail', idle: 300, crashes: ['Microsoft Teams'], online: false }, cfg)
  assert.equal(e.inactif, true); assert.equal(e.idle_s, 300)
  assert.deepEqual(e.plantages, ['Microsoft Teams']); assert.equal(e.hors_ligne, true)
  assert.equal(crashApp('Microsoft Teams-2026-11-19-101203.ips'), 'Microsoft Teams')
  assert.equal(crashApp('notes.txt'), null)
})

test('categories: a Gmail tab is email, Teams a meeting, unknown apps other', () => {
  assert.equal(categorize({ app: 'Google Chrome', domaine: 'mail.google.com' }, cfg), 'Emails')
  assert.equal(categorize({ app: 'Microsoft Teams', domaine: '' }, cfg), 'Réunions')
  assert.equal(categorize({ app: 'Inconnue', domaine: '' }, cfg), 'Autres')
})

/** [app, titre, minutes, inactif?, extra?] in sequence from `start`, one record every 30 s. */
function day(samples, start = '2026-11-19T09:00:00') {
  const out = []; let t = new Date(start)
  for (const [app, titre, min, inactif = false, extra = {}] of samples) {
    for (let i = 0; i < min * 2; i++) { out.push({ t: t.toISOString(), app, titre, domaine: '', inactif, idle_s: inactif ? 200 : 5, ...extra }); t = new Date(t.getTime() + 30_000) }
  }
  return out
}

test('day statistics: rhythm, focus, switches, email visits, time in front of the PC', () => {
  const s = dayStats(day([
    ['Microsoft Word', 'Matrice CreditSet v5', 40],
    ['Mail', 'RE: DR BillCompare', 5],
    ['Microsoft Excel', 'Suivi', 10],
    ['Mail', 'RE: CreditSet', 5],
    ['Mail', '', 30, true],
    ['Microsoft Teams', 'Point suivi dépendances', 30, true],   // in a meeting without typing: still in front of the PC
  ]), cfg)
  assert.equal(s.actif_minutes, 60)
  assert.equal(s.devant_pc_minutes, 90)
  assert.equal(s.concentration.blocs, 1)
  assert.equal(s.concentration.minutes, 40)
  assert.equal(s.emails.visites, 2)
  assert.equal(s.changements_par_heure, 3)
  assert.equal(s.sujets[0].sujet, 'Documents · Matrice CreditSet v5')
  assert.ok(s.par_categorie.some(c => c.nom === 'Réunions' && c.minutes === 30), 'a meeting without typing counts')
})

test('one crash reported on several nearby samples counts once', () => {
  const recs = day([['Microsoft Excel', '', 5, true, { plantages: ['Microsoft Excel'] }], ['Microsoft Word', 'x', 15], ['Microsoft Excel', '', 1, true, { plantages: ['Microsoft Excel'] }]])
  assert.deepEqual(environment(recs).plantages.map(p => p.heure), ['09:00', '09:20'])
})

test('slowdowns are found outside meetings, each with a first cause from its signals', () => {
  const recs = day([
    ['Microsoft Word', 'DAT', 30],
    ['Mail', '', 15, true, { plantages: ['Microsoft Excel'] }],     // crash nearby → plantage
    ['Microsoft Word', 'DAT', 30],
    ['Microsoft Teams', 'Réunion', 30, true],                      // meeting: not a slowdown
    ['Microsoft Word', 'DAT', 15],
    ['Mail', '', 15, true],                                        // nothing else → pause
    ['Microsoft Word', 'DAT', 5],
  ], '2026-11-19T09:00:00')
  const tagged = recs.map(r => ({ ...r, cat: categorize(r, cfg), d: new Date(r.t) }))
  const w = slowWindows(tagged, cfg, 30)
  assert.equal(w[0].debut, '09:30'); assert.equal(w[0].cause_regle, 'plantage'); assert.deepEqual(w[0].signaux.plantages, ['Microsoft Excel'])
  assert.ok(!w.some(x => x.debut === '10:15'), 'meeting window flagged')
  assert.equal(w.at(-1).cause_regle, 'pause')

  const dispersed = []
  for (let i = 0; i < 10; i++) dispersed.push(['Mail', 'RE: CreditSet', 0.5], ['WhatsApp', 'Hicham', 0.5], ['Mail', '', 2, true])
  const t2 = day([['Microsoft Word', 'x', 20], ...dispersed, ['Microsoft Word', 'x', 20]], '2026-11-19T10:00:00').map(r => ({ ...r, cat: categorize(r, cfg), d: new Date(r.t) }))
  assert.equal(slowWindows(t2, cfg, 30).find(x => x.debut === '10:30')?.cause_regle, 'manque_de_visibilite')
})

test('sent mails: own text without quoted history, masked, checked by code', () => {
  assert.equal(ownText('Salam Hicham,\nOK.\nMerci,\nIssam\n\nDe : Hicham\nEnvoyé : …'), 'Salam Hicham,\nOK.\nMerci,\nIssam')
  const RS = String.fromCharCode(30), US = String.fromCharCode(31)
  const raw = ['RE: flux', '2026-11-19T19:10:00', 'a@inwi.ma,b@atos.ai,', 'issam.sedki@waroom.ma,', '0',
    'Bonjour,\nCi-joint la matrice. Appelle-moi au +212 6 61 23 45 67.\nPeux-tu valider ?\nCordialement'].join(US) + RS
  const [m] = parseSent(raw, ['issam.sedki@waroom.ma'])
  assert.deepEqual(m.domaines, ['inwi.ma', 'atos.ai', 'waroom.ma'])
  assert.equal(m.moi_en_copie, true)
  assert.match(m.texte, /\[numéro\]/)
  const c = mailChecks([m, { ...m, moi_en_copie: false, texte: 'ok on relance demain ?' }], cfg)
  assert.equal(c.envoyes, 2)
  assert.ok(c.detail[0].flags.includes('pièce jointe annoncée mais absente'))
  assert.ok(c.detail[0].flags.includes('envoyé après les heures'))
  assert.ok(c.detail[1].flags.includes('sans salutation'))
  assert.ok(c.detail[1].flags.includes('toi pas en copie'))
  assert.ok(c.detail[1].flags.includes('mot à éviter : « relance »'))
  assert.equal(c.alertes['sans salutation'], 1)
})

test('knowledge accumulates: findings counted across days, notes kept, habits from past days', () => {
  const c = { ...cfg, dossier_savoir: tmp() }
  let k = mergeConstats({}, [{ id: 'Creux après déjeuner', type: 'comportement', texte: 'creux 14h-15h', preuve: '20 % actif' }], '2026-11-18')
  k = mergeConstats(k.constats, [{ id: 'creux-apres-dejeuner', type: 'comportement', texte: 'creux 14h-15h', preuve: '25 % actif' }], '2026-11-19')
  assert.equal(k.touched[0].nouveau, false)
  saveConstats(c, k.constats)
  const back = readConstats(c)
  assert.equal(back['creux-apres-dejeuner'].occurrences, 2)
  assert.equal(back['creux-apres-dejeuner'].preuves.length, 2)
  assert.equal(topConstats(back)[0].id, 'creux-apres-dejeuner')

  for (const [jour, debut, actif] of [['2026-11-17', '08:10', 400], ['2026-11-18', '08:30', 420], ['2026-11-18', '08:20', 410], ['2026-11-19', '09:00', 300]]) {
    saveDay(c, { jour, jour_semaine: new Date(jour).getDay(), debut, fin: '18:00', actif_minutes: actif, devant_pc_minutes: actif + 30, concentration_minutes: 60, changements_par_heure: 20 })
  }
  assert.equal(readDays(c).length, 3, 'a re-run replaces the day')
  const b = baseline(readDays(c), 3)
  assert.equal(b.habituel.jours, 3)
  assert.equal(b.habituel.debut, '08:20')

  addNote(c, '  14h30 : Teams a planté  ')
  assert.equal(readNotes(c)[0].texte, '14h30 : Teams a planté')
})

test('reports render with and without Claude, and for an empty day', () => {
  const s = dayStats(day([['Microsoft Word', 'DAT', 40], ['Mail', '', 20, true], ['Microsoft Word', 'DAT', 10]]), cfg)
  const md = renderDay('2026-11-19', s, cfg, { base: { habituel: { debut: '08:20', actif_minutes: 400 } } })
  assert.match(md, /Début 09:00 \(habituel 08:20\)/)
  assert.match(md, /hypothèse par règle/)
  const withAi = renderDay('2026-11-19', s, cfg, { ai: { ralentissements: [{ debut: '09:40', fin: '09:55', cause: 'fatigue', confiance: 'moyenne', explication: 'après 3 nuits courtes (note)' }],
    mails: { style: 'court', erreurs: [] }, conseils: ['a', 'b', 'c'], bien: 'bloc du matin' }, learned: [{ nouveau: true, type: 'comportement', texte: 'commence par les mails' }] })
  assert.match(withAi, /\| 09:40–09:55 \| fatigue \| moyenne \|/)
  assert.match(withAi, /Nouveau · comportement : commence par les mails/)
  const empty = dayStats([], cfg)
  assert.match(renderDay('2026-11-20', empty, cfg), /Aucune activité/)
  assert.match(renderWeek('x', [{ day: '2026-11-20', s: empty }]), /\| 2026-11-20 \| – \| – \| 0 min \|/)
})

test('the journal is read line by line, broken lines skipped', () => {
  const dir = tmp()
  writeFileSync(join(dir, '2026-11-19.jsonl'), '{"t":"2026-11-19T09:00:00Z","app":"Mail"}\nnot json\n')
  assert.equal(readDay(dir, '2026-11-19').length, 1)
  assert.deepEqual(readDay(dir, '2026-11-18'), [])
})

// ── Observation continue et équipe d'agents ─────────────────────────────────────────────────────
import { effect, issueBody, mergeBacklog, setStatus } from './equipe.mjs'
import { eveningQuestion, frustration, repetitions, topicKeys, workThreads } from './signaux.mjs'

test('topics come from references first, then meaningful words', () => {
  assert.deepEqual(topicKeys('RE: CreditSet flux A-043 · Outlook').slice(0, 3), ['A-043', 'creditset', 'flux'])
  assert.deepEqual(topicKeys('Microsoft Teams'), [])
})

test('work threads: time, restarts and tools per file', () => {
  const recs = day([['Microsoft Excel', 'Matrice CreditSet v5', 20], ['Mail', 'RE: CreditSet flux', 10], ['Microsoft Excel', 'Matrice CreditSet v5', 10], ['Mail', 'RE: Wallix PROD', 10]])
  const t = workThreads(recs, cfg)
  assert.equal(t[0].sujet, 'creditset')
  assert.equal(t[0].minutes, 40)
  assert.equal(t[0].reprises, 1)
  assert.deepEqual(t[0].apps.sort(), ['Mail', 'Microsoft Excel'])
  assert.ok(t.some(x => x.sujet === 'wallix' && x.minutes === 10))
})

test('repeated three-app sequences are found', () => {
  const seq = []
  for (let i = 0; i < 5; i++) seq.push(['Microsoft Excel', 'x', 1], ['Mail', 'y', 1], ['Microsoft Teams', 'z', 1])
  const r = repetitions(day(seq))
  assert.equal(r[0].enchainement, 'Microsoft Excel → Mail → Microsoft Teams')
  assert.ok(r[0].fois >= 4)
})

test('frustration: back-and-forth, reopening, stop after a crash', () => {
  const toggles = []
  for (let i = 0; i < 5; i++) toggles.push(['Mail', 'RE: accès', 0.5], ['WhatsApp', 'Hicham', 0.5])
  const f1 = frustration(day([['Microsoft Word', 'x', 5], ...toggles]), cfg)
  assert.ok(f1.some(f => f.type === 'va-et-vient' && /Mail ↔ WhatsApp|WhatsApp ↔ Mail/.test(f.detail)))
  const reopen = []
  for (let i = 0; i < 5; i++) reopen.push(['Microsoft Excel', 'Matrice v5', 1], ['Mail', 'autre', 1])
  assert.ok(frustration(day(reopen), cfg).some(f => f.type === 'réouverture'))
  const crash = frustration(day([['Microsoft Excel', 'x', 1, false, { plantages: ['Microsoft Excel'] }], ['Microsoft Excel', '', 8, true]]), cfg)
  assert.equal(crash.length, 1, 'one crash on two nearby samples counts once')
  assert.equal(crash[0].type, 'arrêt après plantage')
})

test('the evening question is short and about the most notable moment', () => {
  assert.match(eveningQuestion({ frictions: [{ type: 'arrêt après plantage', heure: '14:20', detail: 'Microsoft Excel a planté, 8 min d\'inactivité ensuite' }] }), /^À 14:20 : Microsoft Excel a planté.*Qu'est-ce qui se passait \?$/)
  assert.match(eveningQuestion({ slowdowns: [{ debut: '15:00', fin: '15:30', cause_regle: 'fatigue', signaux: { activite_pct: 20, sujet_principal: 'DAT' } }] }), /Entre 15:00 et 15:30.*20 %.*« DAT ».*Pourquoi \?/)
  assert.match(eveningQuestion({}), /ralenti ou agacé/)
})

test('backlog: proposals keep their status, weekly measures close the loop', () => {
  const crit = { opportunites: [{ friction_id: 'attente-acces', titre: 'Attente des accès', nature: 'outil_existant', recommandation: 'Règle Outlook + suivi', gain_minutes_semaine: 60,
    effort: 'heure', cout: 'gratuit', score: 6, confidentialite_ok: true, remarque: '' }], top: ['attente-acces'] }
  let b = mergeBacklog({}, crit, [{ id: 'attente-acces', minutes_perdues_semaine: 120 }], '2026-11-20')
  assert.equal(b['attente-acces'].statut, 'proposee'); assert.equal(b['attente-acces'].mesure_depart, 120); assert.equal(b['attente-acces'].top, true)
  b = setStatus(b, 'attente-acces', 'installee', 'règle créée', '2026-11-21')
  b = mergeBacklog(b, crit, [{ id: 'attente-acces', minutes_perdues_semaine: 40 }], '2026-11-27')
  assert.equal(b['attente-acces'].statut, 'installee', 'status kept')
  assert.deepEqual(effect(b['attente-acces']), { avant: 120, apres: 40, gain: 80, semaines: 1 })
  assert.throws(() => setStatus(b, 'inconnue', 'acceptee'), /inconnue/)
  assert.throws(() => setStatus(b, 'attente-acces', 'fait'), /Statut inconnu/)
})

test('issues carry an anonymised summary and the spec, never raw titles', () => {
  const o = { id: 'x', titre: 'Pièces jointes oubliées', nature: 'add_on', gain_minutes_semaine: 15, effort: 'jour', cout: 'gratuit', mesure_depart: 20, proposee_le: '2026-11-20', recommandation: 'Vérifier avant envoi', remarque: '' }
  const body = issueBody(o, '# Spec\n\nProblème…')
  assert.match(body, /add-on à développer/)
  assert.match(body, /### Spécification/)
  assert.match(body, /observateur-id: x$/)
})

test('GitHub: top proposals become issues once; a public repository is refused', async () => {
  const { publish } = await import('./equipe.mjs')
  const specs = tmp()
  const calls = []
  const realFetch = globalThis.fetch
  const prevToken = process.env.GITHUB_TOKEN
  process.env.GITHUB_TOKEN = 'test'
  const make = isPrivate => async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET', body: init.body })
    if (!init.method) return { ok: true, json: async () => ({ full_name: 'o/r', private: isPrivate }) }
    return { ok: true, json: async () => ({ html_url: `https://github.com/o/r/issues/${calls.length}` }) }
  }
  const c = { ...cfg, equipe: { ...cfg.equipe, github: { publier: true, depot: 'o/r', label: 'observateur', depot_public_autorise: false } } }
  const backlog = () => ({
    a: { id: 'a', titre: 'A', nature: 'add_on', top: true, statut: 'proposee', confidentialite_ok: true, gain_minutes_semaine: 1, effort: 'jour', cout: '0', recommandation: 'r', issue: null },
    b: { id: 'b', titre: 'B', nature: 'outil_existant', top: false, statut: 'proposee', confidentialite_ok: true, issue: null },
    c: { id: 'c', titre: 'C', nature: 'add_on', top: true, statut: 'proposee', confidentialite_ok: false, issue: null },
  })
  try {
    globalThis.fetch = make(true)
    const b = backlog()
    assert.deepEqual(await publish(c, b, specs), { publiees: 1 })
    assert.match(b.a.issue, /issues\/2$/)
    assert.equal(b.b.issue, null); assert.equal(b.c.issue, null, 'privacy flag blocks publication')
    assert.deepEqual(JSON.parse(calls[1].body).labels, ['observateur', 'add-on'])
    assert.deepEqual(await publish(c, b, specs), { publiees: 0 }, 'already published')
    globalThis.fetch = make(false)
    const r = await publish(c, backlog(), specs)
    assert.equal(r.publiees, 0); assert.match(r.raison, /public/)
  } finally {
    globalThis.fetch = realFetch
    if (prevToken === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = prevToken
  }
})

test('the scripts run from a folder whose name has a space (« observateur 2 »)', async () => {
  const { cpSync, existsSync: exists } = await import('node:fs')
  const { execFileSync } = await import('node:child_process')
  const { fileURLToPath } = await import('node:url')
  const { dirname } = await import('node:path')
  const here = dirname(fileURLToPath(import.meta.url))
  const root = tmp()
  const dir = join(root, 'observateur 2')
  cpSync(here, dir, { recursive: true })
  const conf = join(root, 'config.json')
  writeFileSync(conf, JSON.stringify({ dossier_donnees: join(root, 'journal'), dossier_rapports: join(root, 'rapports'), dossier_savoir: join(root, 'savoir') }))
  const out = execFileSync(process.execPath, [join(dir, 'analyse.mjs'), 'jour', '2026-11-19', '--sans-claude', '--sans-mails'], { encoding: 'utf8', env: { ...process.env, OBSERVATEUR_CONFIG: conf } })
  assert.match(out, /jour-2026-11-19\.md/)
  assert.ok(exists(join(root, 'rapports', 'jour-2026-11-19.md')))
})

test('les résumés de conversation sont lus depuis Drive et gardés dans le savoir', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { conversationsDir, readConversations } = await import('./savoir.mjs')
  const home = mkdtempSync(join(tmpdir(), 'obs-conv-'))
  const drive = join(home, 'Library', 'CloudStorage', 'GoogleDrive-x@y.z', 'My Drive', 'Observateur · conversations')
  mkdirSync(drive, { recursive: true })
  writeFileSync(join(drive, '2026-11-19.json'), JSON.stringify({ jour: '2026-11-19', frictions: [{ quoi: 'PST' }] }))
  writeFileSync(join(drive, '2026-11-10.json'), JSON.stringify({ jour: '2026-11-10' }))
  const cfg = { conversations: { dossier: 'auto' }, dossier_savoir: join(home, 'savoir') }
  assert.equal(conversationsDir(cfg, home), drive)
  const got = readConversations(cfg, '2026-11-19', '2026-11-19', conversationsDir(cfg, home))
  assert.deepEqual(got.map(c => c.jour), ['2026-11-19'])
  rmSync(drive, { recursive: true })
  assert.equal(readConversations(cfg, '2026-11-19', '2026-11-19', join(home, 'absent'))[0].frictions[0].quoi, 'PST')
  rmSync(home, { recursive: true })
})

test('sent mails: a past day is located by its distance from today', () => {
  assert.equal(daysBack('2026-11-19', '2026-11-20'), 1)
  assert.equal(daysBack('2026-11-20', '2026-11-20'), 0)
  assert.equal(daysBack('2026-10-31', '2026-11-02'), 2)
})

test('askClaude says why Claude did not answer (expired login) instead of failing silently', async () => {
  const dir = tmp(), bin = join(dir, 'claude')
  writeFileSync(bin, `#!/bin/sh
[ "$1" = "--version" ] && { echo 2.1; exit 0; }
cat >/dev/null
echo '{"is_error":true,"result":"Failed to authenticate: OAuth session expired"}'
exit 1
`, { mode: 0o755 })
  const errors = [], orig = console.error
  console.error = m => errors.push(String(m))
  process.env.OBSERVATEUR_CLAUDE_BIN = bin
  try { assert.equal(await askClaude('m', 's', 'u'), null) }
  finally { console.error = orig; delete process.env.OBSERVATEUR_CLAUDE_BIN }
  assert.match(errors.join('\n'), /OAuth session expired/)
})

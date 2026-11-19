import { strict as assert }                       from 'node:assert'
import { mkdtempSync, writeFileSync }             from 'node:fs'
import { tmpdir }                                 from 'node:os'
import { join }                                   from 'node:path'
import { test }                                   from 'node:test'
import { dayStats, environment, mailChecks, readDay, renderDay, renderWeek, slowWindows } from './analyse.mjs'
import { categorize, crashApp, domainOf, loadConfig, makeRecord, parseIdle, redact } from './lib.mjs'
import { ownText, parseSent }                     from './mails.mjs'
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

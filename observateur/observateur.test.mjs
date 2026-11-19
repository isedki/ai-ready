import { strict as assert }                       from 'node:assert'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir }                                 from 'node:os'
import { join }                                   from 'node:path'
import { test }                                   from 'node:test'
import { dayStats, readDay, renderDay, renderWeek } from './analyse.mjs'
import { categorize, domainOf, loadConfig, makeRecord, parseIdle, redact } from './lib.mjs'

const cfg = loadConfig('/nonexistent/config.json')

test('titles lose addresses, numbers, IPs, links and tokens before anything is stored', () => {
  const t = redact('RE: flux 10.104.12.158 · issam.sedki@waroom.ma · +212 6 61 23 45 67 · https://drive.google.com/file/d/abc · ' + 'a'.repeat(40))
  assert.doesNotMatch(t, /10\.104|waroom|61 23|file\/d|aaaa/)
  assert.match(t, /\[ip\].*\[email\].*\[numéro\].*\[drive\.google\.com\].*\[jeton\]/)
  assert.equal(redact('A-043 MGEN3963 INC4660323 · 19/11 08:00'), 'A-043 MGEN3963 INC4660323 · 19/11 08:00')
})

test('only the domain of a browser tab is kept', () => {
  assert.equal(domainOf('https://www.mail.google.com/mail/u/0/#inbox/123'), 'mail.google.com')
  assert.equal(domainOf('pas une url'), '')
})

test('idle time comes from HIDIdleTime in nanoseconds', () => {
  assert.equal(parseIdle('| | "HIDIdleTime" = 125000000000\n'), 125)
  assert.equal(parseIdle(''), 0)
})

test('ignored apps are dropped and sensitive apps keep no title', () => {
  assert.equal(makeRecord({ app: 'loginwindow' }, cfg), null)
  const r = makeRecord({ app: '1Password', title: 'Banque', url: 'https://x.com', idle: 0 }, cfg)
  assert.equal(r.titre, ''); assert.equal(r.domaine, '')
  assert.equal(makeRecord({ app: 'Mail', idle: 300 }, cfg).inactif, true)
})

test('a Gmail tab counts as email, Teams as a meeting, unknown apps as other', () => {
  assert.equal(categorize({ app: 'Google Chrome', domaine: 'mail.google.com' }, cfg), 'Emails')
  assert.equal(categorize({ app: 'Microsoft Teams', domaine: '' }, cfg), 'Réunions')
  assert.equal(categorize({ app: 'Inconnue', domaine: '' }, cfg), 'Autres')
})

function day(samples) {
  // samples: [app, titre, minutes] in sequence from 09:00, one record every 30 s
  const out = []; let t = new Date('2026-11-19T09:00:00')
  for (const [app, titre, min, inactif = false] of samples) {
    for (let i = 0; i < min * 2; i++) { out.push({ t: t.toISOString(), app, titre, domaine: '', inactif }); t = new Date(t.getTime() + 30_000) }
  }
  return out
}

test('day statistics: focus blocks, switches, email visits, idle excluded', () => {
  const recs = day([
    ['Microsoft Word', 'Matrice CreditSet v5', 40],
    ['Mail', 'RE: DR BillCompare', 5],
    ['Microsoft Excel', 'Suivi', 10],
    ['Mail', 'RE: CreditSet', 5],
    ['Mail', '', 30, true],
    ['Microsoft Teams', 'Point suivi dépendances', 30],
  ])
  const s = dayStats(recs, cfg)
  assert.equal(s.actif_minutes, 90)
  assert.equal(s.concentration.blocs, 1)
  assert.equal(s.concentration.minutes, 40)
  assert.equal(s.emails.visites, 2)
  assert.equal(s.emails.minutes, 10)
  assert.equal(s.par_categorie[0].nom, 'Documents')
  assert.equal(s.changements_par_heure, 3) // 4 changes over 1.5 active hours
  assert.equal(s.sujets[0].sujet, 'Documents · Matrice CreditSet v5')
  const md = renderDay('2026-11-19', s, cfg)
  assert.match(md, /Actif 1 h 30/)
  assert.match(md, /Blocs de concentration .* : 1, 40 min/)
})

test('an empty day and a week render without error', () => {
  const s = dayStats([], cfg)
  assert.match(renderDay('2026-11-20', s, cfg), /Aucune activité/)
  assert.match(renderWeek('x', [{ day: '2026-11-20', s }]), /\| 2026-11-20 \| 0 min \|/)
})

test('the journal is read line by line, broken lines skipped', () => {
  const dir = mkdtempSync(join(tmpdir(), 'obs-'))
  writeFileSync(join(dir, '2026-11-19.jsonl'), '{"t":"2026-11-19T09:00:00Z","app":"Mail"}\nnot json\n')
  assert.equal(readDay(dir, '2026-11-19').length, 1)
  assert.deepEqual(readDay(dir, '2026-11-18'), [])
  assert.ok(readFileSync(join(dir, '2026-11-19.jsonl'), 'utf8'))
})

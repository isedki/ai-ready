import { strict as assert } from 'node:assert'
import { test }             from 'node:test'
import { fingerprint, logLine, parseDrafts, toCopy } from './lib.mjs'

const cfg = { compte_gmail: 'Google', adresse_waroom: 'issam.sedki@waroom.ma' }
const d = (o = {}) => ({ id: 'a', account: 'Google', subject: 'S', content: 'C', to: ['x@inwi.ma'], cc: ['Issam.Sedki@waroom.ma'], ...o })

test('recopie seulement les brouillons Gmail préparés pour Issam (lui en copie)', () => {
  const list = [d(), d({ id: 'b', cc: [] }), d({ id: 'c', account: 'waroom' })]
  assert.deepEqual(toCopy(list, { copies: {} }, cfg).map(x => x.id), ['a'])
})

test('ne recopie pas deux fois, sauf si le brouillon a changé', () => {
  const state = { copies: { a: fingerprint(d()) } }
  assert.equal(toCopy([d()], state, cfg).length, 0)
  assert.equal(toCopy([d({ content: 'C2' })], state, cfg).length, 1)
})

test('journal lisible', () => {
  assert.match(logLine(new Date('2026-11-19T15:00:00Z'), d(), true), /copié « S » → x@inwi\.ma/)
})

test('lit la sortie AppleScript (séparateurs ASCII 30/31)', () => {
  const out = 'id1\x1fSujet\x1fa@inwi.ma,\x1fissam.sedki@waroom.ma,\x1fLigne 1\nLigne 2\x1e'
  assert.deepEqual([...parseDrafts(out, 'Google')], [{ id: 'id1', account: 'Google', subject: 'Sujet', to: ['a@inwi.ma'], cc: ['issam.sedki@waroom.ma'], content: 'Ligne 1\nLigne 2' }])
  assert.match(parseDrafts('ERREUR\x1fINBOX, Sent, ', 'Google').erreur, /introuvable dans Google : INBOX/)
  assert.deepEqual([...parseDrafts('', 'Google')], [])
})

test('lit le compteur de brouillons récents placé en tête', () => {
  const got = parseDrafts('COMPTE\x1f7\x1eid1\x1fS\x1fa@inwi.ma,\x1fissam.sedki@waroom.ma,\x1fT\x1e', 'Google')
  assert.equal(got.recent, 7)
  assert.equal(got.length, 1)
  assert.equal(parseDrafts('COMPTE\x1f0\x1e', 'Google').recent, 0)
})

// Tests du contrôle critique du profil (US-14). Cas d'échec d'abord. Données factices ZZ-TEST.
import test from 'node:test';
import assert from 'node:assert/strict';
import { challenger } from './challenge.mjs';
import { toKbChunks } from './profil-core.mjs';

const TODAY = '2026-11-25';
const S = (ref, date = '2026-11-22', extra = {}) => ({ type: 'regle', ref, date, doc: ref, ...extra });
const ob = (o = {}) => ({ id: 'ob-1', categorie: 'fond', objectif: 'ZZ-TEST trait', hypothese: true, date: '2026-11-24', statut: 'a_confirmer', sources: [S('rg-1'), S('rg-2')], confiance: 'faible', refutation: 'ZZ-TEST', question: 'ZZ-TEST ?', ...o });
const verdict = (o, ctx = {}) => challenger({ objectifs: [o] }, { today: TODAY, ...ctx }).traits[0];
const jour = (d, v) => ({ jour: d, actif_minutes: 300, concentration_minutes: v });

test('trait sans source : sans_preuve, non repris', () => {
  const r = challenger({ objectifs: [ob({ sources: [] })] }, { today: TODAY });
  assert.equal(r.traits[0].verdict, 'sans_preuve'); assert.deepEqual(r.reprenables, []); assert.deepEqual(r.ecartes, ['ob-1']);
});
test('source sans date ou sans pointeur doc : ne compte pas comme preuve', () => {
  assert.equal(verdict(ob({ sources: [S('rg-1'), { type: 'mail', ref: 'm1', doc: 'x' }] })).verdict, 'sans_preuve');
  const t = verdict(ob({ sources: [S('rg-1'), S('rg-2', '2026-11-22', { doc: '' })] }));
  assert.equal(t.verdict, 'sans_preuve'); assert.match(t.raisons.join(' '), /pointeur doc manquant/);
});
test('deux sources identiques = une seule preuve', () => {
  assert.equal(verdict(ob({ sources: [S('rg-1'), S('rg-1', '2026-11-23')] })).verdict, 'sans_preuve');
});
test('source Observateur dont le constat n\'existe plus : preuve refusée', () => {
  const o = ob({ sources: [S('rg-1'), { type: 'observateur', ref: 'c', date: '2026-11-22', doc: 'observateur#zero-concentration' }] });
  assert.equal(verdict(o, { constats: {} }).verdict, 'sans_preuve');
  assert.equal(verdict(o, { constats: { 'zero-concentration': {} } }).verdict, 'retenu');
});
test('contre-exemple : source qui contredit datée dans les 7 derniers jours', () => {
  const o = ob({ sources: [S('rg-1'), S('rg-2'), S('rg-3', '2026-11-23', { sens: 'contredit' })] });
  const t = verdict(o); assert.equal(t.verdict, 'contredit'); assert.equal(t.contre_exemples[0].date, '2026-11-23');
});
test('contradiction plus vieille que la fenêtre : ne contredit pas', () => {
  assert.equal(verdict(ob({ sources: [S('rg-1'), S('rg-2'), S('rg-3', '2026-11-10', { sens: 'contredit' })] })).verdict, 'retenu');
});
test('fait de la fenêtre qui désigne le trait : contredit ; fait hors fenêtre : ignoré', () => {
  assert.equal(verdict(ob(), { faits: [{ date: '2026-11-24', ref: 'retours/2026-11-24', texte: 'ZZ-TEST', contredit: ['ob-1'] }] }).verdict, 'contredit');
  assert.equal(verdict(ob(), { faits: [{ date: '2026-11-10', ref: 'x', contredit: ['ob-1'] }] }).verdict, 'retenu');
  assert.equal(verdict(ob(), { faits: [{ date: '2026-11-24', ref: 'x', contredit: ['ob-9'] }] }).verdict, 'retenu');
});
test('mesure contredite par les jours mesurés : contre-exemples datés avec la valeur', () => {
  const o = ob({ mesure: { metrique: 'concentration_minutes', op: '>=', seuil: 120 } });
  const t = verdict(o, { jours: [jour('2026-11-20', 0), jour('2026-11-23', 0), jour('2026-11-24', 200)] });
  assert.equal(t.verdict, 'contredit'); assert.equal(t.contre_exemples.length, 2); assert.match(t.contre_exemples[0].texte, /concentration_minutes = 0/);
});
test('mesure tenue : retenu ; trop peu de jours : retenu mais dit non évalué', () => {
  const o = ob({ mesure: { metrique: 'concentration_minutes', op: '>=', seuil: 120 } });
  assert.equal(verdict(o, { jours: [jour('2026-11-23', 150), jour('2026-11-24', 200)] }).verdict, 'retenu');
  const t = verdict(o, { jours: [jour('2026-11-24', 0)] }); assert.equal(t.verdict, 'retenu'); assert.match(t.raisons.join(' '), /non évaluée/);
});
test('mesure mal formée : jamais un faux « tenue »', () => {
  const t = verdict(ob({ mesure: { metrique: 'inconnue', op: '>=', seuil: 1 } }), { jours: [jour('2026-11-24', 1), jour('2026-11-23', 1)] });
  assert.match(t.raisons.join(' '), /mesure mal formée/);
});
test('trait ancien non confirmé : a_reviser ; confirmé par Issam : pas a_reviser', () => {
  const vieux = [S('rg-1', '2026-10-01'), S('rg-2', '2026-10-02')];
  assert.equal(verdict(ob({ sources: vieux })).verdict, 'a_reviser');
  assert.equal(verdict(ob({ sources: vieux, statut: 'confirme' })).verdict, 'retenu');
});
test('fenêtre vide : retenu mais dit explicitement « non contesté faute de données »', () => {
  const t = verdict(ob()); assert.equal(t.verdict, 'retenu'); assert.match(t.raisons.join(' '), /non contesté faute de données/);
});
test('un trait confirmé par Issam mais contredit reste marqué (à trancher, non repris)', () => {
  const t = verdict(ob({ statut: 'confirme', retour_issam: { date: '2026-11-20', citation: 'oui' } }), { faits: [{ date: '2026-11-25', ref: 'x', contredit: ['ob-1'] }] });
  assert.equal(t.verdict, 'contredit');
});
test('kb : un trait écarté n\'est pas repris, il figure dans po-ecartes', () => {
  const profil = { objectifs: [ob(), ob({ id: 'ob-2', sources: [] })], contradictions: [] };
  const challenge = challenger(profil, { today: TODAY });
  const ids = toKbChunks({ profil, today: TODAY, challenge }).map((c) => c.id);
  assert.ok(ids.includes('ob-1')); assert.ok(!ids.includes('ob-2')); assert.ok(ids.includes('po-ecartes'));
  assert.ok(toKbChunks({ profil, today: TODAY }).map((c) => c.id).includes('ob-2')); // sans challenge : comportement inchangé
});

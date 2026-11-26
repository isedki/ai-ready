// Tests de la refonte du Suivi : formats réellement écrits par les routines, battement, mesures. Données inventées.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const S = require('./suivi-core.js');
const A = require('../us6-activite/activite-core.js');

const now = Date.parse('2026-11-26T14:50:00Z');
const fiches = { fiches: [
  { id: 'veille-coach', nom: 'Veille et Coach', cles: ['veille'], agents: ['Veille et Coach'] },
  { id: 'bilan-hebdo', nom: 'Bilan hebdomadaire', cles: ['bilan', 'point hebdomadaire'] },
  { id: 'po', nom: 'Terrain et PO', cles: ['terrain'] },
] };
const runs = (routines, at = '2026-11-26T08:20:00Z') => ({ id: 'runs', data: { type: 'runs', at, source: 'test', routines } });
const veille = (nom, cron, dernier) => ({ nom, cron, enabled: true, dernier, prochain: null });

test('question en texte seul, en objet, ou illisible : toujours un texte affichable', () => {
  assert.equal(S.question('Faut-il relancer ? oui / non').q, 'Faut-il relancer ? oui / non');
  assert.equal(S.question({ q: 'A ?', src: 'mail', draft_id: 'r1' }).draft_id, 'r1');
  assert.equal(S.question({ question: 'B ?' }).q, 'B ?');
  assert.match(S.question({}).q, /sans texte/);
  assert.deepEqual(S.questions(undefined), []);
});
test('périmé en texte seul : un identifiant stable, pour que la case cochée reste cochée', () => {
  const a = S.perime('Brouillon du 25/11 à Contact A'), b = S.perime('Brouillon du 25/11 à Contact A');
  assert.equal(a.id, b.id); assert.equal(a.objet, 'Brouillon du 25/11 à Contact A');
  assert.equal(S.perime({ id: 'r9', objet: 'X' }).id, 'r9');
});
test('brouillon : les deux formats, et « remplacé » est rangé comme traité', () => {
  const v = S.brouillon({ id: 'r1', obj: 'Flux', dest: 'Contact B', statut: 'non_envoye' });
  assert.equal(v.objet, 'Flux'); assert.equal(v.a, 'Contact B'); assert.equal(v.traite, false);
  const r = S.brouillon({ id: 'r2', objet: 'O', a: 'X', etat: 'remplace' });
  assert.equal(r.traite, true); assert.match(r.etatTexte, /Remplacé/);
});
test('contexte du coach : texte ou liste', () => {
  assert.deepEqual(S.contexte('une raison'), ['une raison']);
  assert.deepEqual(S.contexte(['a', '', 'b']), ['a', 'b']);
  assert.deepEqual(S.contexte(null), []);
});
test('mesures : périmée dès un jour ouvré, et une valeur « — » garde sa raison', () => {
  const m = S.mesures({ date: '2026-11-24', mesures: [{ nom: 'a', valeur: '3', source: 's' }, { nom: 'b', valeur: '—', source: 'pas d\'accès' }, { nom: 'c', valeur: '', source: '—' }] }, now);
  assert.equal(m.perime, true); assert.equal(m.age, 2); assert.equal(m.mesurees.length, 1);
  assert.equal(m.nonMesurees[0].raison, 'pas d\'accès'); assert.match(m.nonMesurees[1].raison, /non écrite/);
  assert.equal(S.mesures(null, now), null);
});
test('photo avec « — » : aucune fausse anomalie', () => {
  const d = A.buildDirect({ agents: [runs([{ nom: 'Phénix · Agent Veille', cron: '10 8 * * 1-5', enabled: true, dernier: { at: '—', statut: '—' }, prochain: '—' }])], livrables: [], jour: null, fiches, now });
  assert.deepEqual(d.anomalies.filter((x) => /Veille/.test(JSON.stringify(x))), []);
});
test('« succès » déclaré sans rien d\'écrit : pas prouvé, et signalé', () => {
  const hb = S.heartbeat({ now, fiches, livrables: [], jours: [], plans: [],
    agents: [runs([veille('Phénix · Agent Veille', '10 8 * * 1-5', { at: '2026-11-26T08:10:00Z', statut: 'succès' })]),
      { id: 'jr-1', data: { type: 'journal', agent: 'Veille et Coach', at: '2026-11-25T15:12:00Z', quoi: 'hier' } }] });
  assert.equal(hb.agents[0].etat, 'sanstrace'); assert.equal(hb.alertes, 1);
});
test('créneau d\'une photo ancienne, mais trace plus tardive du même agent : note, pas d\'alerte', () => {
  const hb = S.heartbeat({ now, fiches, livrables: [], plans: [],
    agents: [runs([veille('Phénix · Agent Veille 8h10', '10 8 * * 1-5', { at: '2026-11-26T08:10:00Z', statut: 'succès' }), veille('Phénix · Agent Veille 11h40', '40 11 * * 1-5', null)])],
    jours: [{ id: '2026-11-26', data: { passages: [{ tache: 'veille-coach', heure: '08:20', fait: 'a' }, { tache: 'veille-coach', heure: '13:45', fait: 'b' }] } }] });
  assert.equal(hb.agents[0].etat, 'prouve'); assert.equal(hb.alertes, 0);
  assert.ok(hb.agents[0].pourquoi.some((p) => /rien d'écrit au créneau de 26\/11 11:40/.test(p)));
  assert.match(hb.photoDepassee, /13:45/);
});
test('les anciens passages « bilan » et « matin » ne sont prêtés à personne', () => {
  const t = S.traces({ now, agents: [], livrables: [], plans: [], jours: [{ id: '2026-11-24', data: { passages: [{ tache: 'bilan', heure: '16:50', fait: 'x' }, { tache: 'matin', heure: '08:10', fait: 'y' }] } }] }, fiches.fiches, null);
  assert.deepEqual(Object.keys(t), []);
});
test('questions et périmés du jour deviennent des gestes ; ceux déjà traités disparaissent', () => {
  const hb = S.heartbeat({ now, fiches, livrables: [], jours: [], plans: [], agents: [runs([veille('Phénix · Agent Veille', '10 8 * * 1-5', { at: '2026-11-26T08:10:00Z', statut: 'succès' })])],
    jourToday: { id: '2026-11-26', data: { questions: ['a ?', 'b ?'], perimes: [{ id: 'p1', objet: 'o' }], brouillons: [{ id: 'r', etat: 'remplace' }] } }, retourToday: { questions: { 0: { reponse: 'oui' } }, perimes: { p1: { heure: '9' } } } });
  assert.deepEqual(hb.agents[0].faire.filter((f) => f.cible).map((f) => f.t), ['répondre à 1 question']);
});

// La page assemblée doit garder tous les identifiants et les écritures de la page publiée (anti-régression).
const pub = process.env.PAGE_PUBLIEE, neuve = process.env.PAGE_REFONTE;
test('page refondue : identifiants et écritures de la page publiée conservés', { skip: !(pub && neuve) && 'définir PAGE_PUBLIEE et PAGE_REFONTE' }, () => {
  const a = readFileSync(pub, 'utf8'), b = readFileSync(neuve, 'utf8');
  const ids = (h) => new Set([...h.split('<script')[0].matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const voulus = ['viewC', 'tabC', 'jQ', 'jQN', 'cUT'];
  assert.deepEqual([...ids(a)].filter((i) => !ids(b).has(i) && !voulus.includes(i)), []);
  const ecritures = (h) => [...h.matchAll(/(?:collection\("[a-z_]+"\)|\.doc\([^)]*\))\s*\.(set|update|delete|add)\(/g)].map((m) => m[0]).sort();
  assert.deepEqual(ecritures(b), ecritures(a));
});

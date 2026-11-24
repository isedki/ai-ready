// Tests US-14. Les cas d'échec passent en premier. Données factices uniquement (préfixe ZZ-TEST), rien n'est écrit dans le suivi.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from './profil-core.mjs';

const TODAY = '2026-11-24';
const src2 = () => [{ type: 'regle', ref: 'rg-26', date: '2026-11-22' }, { type: 'regle', ref: 'rg-20', date: '2026-11-22' }];
const ob = (o = {}) => ({ id: 'ob-1', categorie: 'fond', objectif: 'ZZ-TEST objectif factice', hypothese: true, date: '2026-11-24', statut: 'a_confirmer', sources: src2(), confiance: 'faible', refutation: 'ZZ-TEST si Issam refuse ceci', question: 'ZZ-TEST est-ce vrai ? oui / non', ...o });
const prof = (...obs) => ({ objectifs: obs, contradictions: [] });

// ---- échecs d'abord
test('profil vide : refusé, rien à écrire', () => {
  for (const p of [null, undefined, {}, { objectifs: [] }, { objectifs: 'x' }, 42]) {
    const r = P.validateProfil(p, { today: TODAY });
    assert.equal(r.ok, false); assert.match(r.errors.join('\n'), /profil vide/);
  }
});
test('source manquante : l\'inférence n\'est pas écrite', () => {
  for (const s of [undefined, [], [{}], [{ type: 'regle' }], [{ type: 'regle', ref: ' ' }], [{ type: 'rumeur', ref: 'x' }], 'rg-26', src2().slice(0, 1)]) {
    const r = P.validateProfil(prof(ob({ sources: s })), { today: TODAY });
    assert.equal(r.ok, false, JSON.stringify(s)); assert.match(r.errors.join('\n'), /ob-1.*source/);
  }
});
test('mail sans date : refusé ; date impossible : refusée', () => {
  assert.equal(P.validateProfil(prof(ob({ sources: [...src2(), { type: 'mail', ref: 'retours/2026-11-23' }] })), { today: TODAY }).ok, false);
  assert.equal(P.validateProfil(prof(ob({ sources: [...src2(), { type: 'mail', ref: 'x', date: '2026-02-30' }] })), { today: TODAY }).ok, false);
});
test('hypothèse sans date, date invalide ou future : refusée', () => {
  for (const d of [undefined, '', 'hier', '2026-13-01', '2026-02-30', '24/11/2026', '2026-12-01', 5]) {
    const r = P.validateProfil(prof(ob({ date: d })), { today: TODAY });
    assert.equal(r.ok, false, String(d)); assert.match(r.errors.join('\n'), /ob-1.*date/);
  }
});
test('hypothèse non marquée ou statut inconnu : refusé', () => {
  assert.equal(P.validateProfil(prof(ob({ hypothese: false })), { today: TODAY }).ok, false);
  assert.equal(P.validateProfil(prof(ob({ hypothese: undefined })), { today: TODAY }).ok, false);
  assert.equal(P.validateProfil(prof(ob({ statut: 'valide' })), { today: TODAY }).ok, false);
});
test('« confirmé » ou « corrigé » sans retour daté d\'Issam : refusé (l\'agent ne confirme pas seul)', () => {
  for (const st of ['confirme', 'corrige']) {
    assert.equal(P.validateProfil(prof(ob({ statut: st })), { today: TODAY }).ok, false, st);
    assert.equal(P.validateProfil(prof(ob({ statut: st, retour_issam: { date: '2026-11-24' } })), { today: TODAY }).ok, false, st);
    assert.equal(P.validateProfil(prof(ob({ statut: st, corrections: [{ date: '2026-11-24', ancien: 'ZZ-TEST avant', citation: 'ZZ-TEST non' }], retour_issam: { date: '2026-11-24', citation: 'ZZ-TEST oui' } })), { today: TODAY }).ok, true, st);
  }
});
test('un seul objectif invalide bloque tout le profil (tout ou rien) et les identifiants doivent être uniques', () => {
  const r = P.validateProfil(prof(ob(), ob({ id: 'ob-2', sources: [] })), { today: TODAY });
  assert.equal(r.ok, false); assert.match(r.errors.join('\n'), /ob-2/); assert.doesNotMatch(r.errors.join('\n'), /ob-1:/);
  assert.equal(P.validateProfil(prof(ob(), ob()), { today: TODAY }).ok, false);
});
test('donnée personnelle de tiers : adresse mail, IP, téléphone, nom de la liste noire', () => {
  const noms = ['Prénomfactice Nomfactice'];
  for (const t of ['écrit à zz@example.com', 'serveur 10.1.2.3', 'appelle +212 6 12 34 56 78', 'avec Prénomfactice Nomfactice']) {
    const r = P.validateProfil(prof(ob({ objectif: t })), { today: TODAY, noms });
    assert.equal(r.ok, false, t); assert.match(r.errors.join('\n'), /donnée personnelle/);
  }
  assert.equal(P.validateProfil(prof(ob({ sources: [...src2(), { type: 'regle', ref: 'rg-26 ; 10.1.2.3', date: '2026-11-22' }] })), { today: TODAY }).ok, false);
});
test('écriture refusée ou relecture différente : constaté, jamais présenté comme réussi', async () => {
  const doc = prof(ob());
  const refus = await P.ecrireSecurise({ doc, today: TODAY, validate: P.validateProfil, write: async () => { throw new Error('permission-denied'); }, read: async () => null });
  assert.equal(refus.ok, false); assert.equal(refus.etape, 'ecriture'); assert.match(refus.cause, /permission-denied/);
  const autre = await P.ecrireSecurise({ doc, today: TODAY, validate: P.validateProfil, write: async () => ({}), read: async () => ({ objectifs: [] }) });
  assert.equal(autre.ok, false); assert.equal(autre.etape, 'relecture');
  let appels = 0;
  const invalide = await P.ecrireSecurise({ doc: prof(), today: TODAY, validate: P.validateProfil, write: async () => { appels++; }, read: async () => null });
  assert.equal(invalide.ok, false); assert.equal(invalide.etape, 'validation'); assert.equal(appels, 0, 'rien n\'est écrit si invalide');
  let stock; const bon = await P.ecrireSecurise({ doc, today: TODAY, validate: P.validateProfil, write: async (d) => { stock = JSON.parse(JSON.stringify(d)); }, read: async () => stock });
  assert.equal(bon.ok, true); assert.equal(bon.verifie, true);
});

// ---- autonomie
const aut = () => ({
  faits_seuls: [{ action: 'ZZ-TEST action A', source: 'rg-34', valide_le: '2026-11-23', citation: 'ZZ-TEST pas de limite' }],
  a_valider: [{ action: 'ZZ-TEST action B', raison: 'ZZ-TEST coûteuse', source: 'rg-19' }],
  historique: [],
});
test('autonomie : une action « faite seule » sans validation datée et citée est refusée', () => {
  for (const bad of [{ valide_le: undefined }, { valide_le: 'hier' }, { citation: '' }, { source: '' }]) {
    const a = aut(); Object.assign(a.faits_seuls[0], bad);
    assert.equal(P.validateAutonomie(a).ok, false, JSON.stringify(bad));
  }
  assert.equal(P.validateAutonomie({ faits_seuls: [], a_valider: [] }).ok, false, 'tableau vide');
  const a = aut(); a.a_valider.push({ action: 'ZZ-TEST action A', raison: 'x', source: 'rg-1' });
  assert.match(P.validateAutonomie(a).errors.join('\n'), /à la fois/);
});
test('élargir sans validation explicite : refusé, tableau inchangé', () => {
  const a = aut(); const avant = JSON.stringify(a);
  for (const v of [undefined, {}, { explicite: false, date: TODAY, citation: 'oui' }, { explicite: true, date: 'x', citation: 'oui' }, { explicite: true, date: TODAY, citation: '' }, { explicite: 'oui', date: TODAY, citation: 'oui' }]) {
    assert.equal(P.elargir(a, 'ZZ-TEST action B', v, TODAY).ok, false, JSON.stringify(v));
  }
  assert.equal(P.elargir(a, 'inconnue', { explicite: true, date: TODAY, citation: 'oui' }, TODAY).ok, false);
  assert.equal(P.elargir(a, 'ZZ-TEST action B', { explicite: true, date: TODAY, citation: 'oui' }, TODAY).ok, false, 'source de validation absente');
  assert.equal(JSON.stringify(a), avant);
});
test('élargir avec validation explicite : l\'action passe en « faite seule », trace dans l\'historique, original intact', () => {
  const a = aut(); const r = P.elargir(a, 'ZZ-TEST action B', { explicite: true, date: TODAY, citation: 'ZZ-TEST oui vas-y', source: 'ZZ-TEST retours/2026-11-24' }, TODAY);
  assert.equal(r.ok, true); assert.equal(r.table.a_valider.length, 0); assert.equal(r.table.faits_seuls.length, 2);
  assert.equal(r.table.historique.length, 1); assert.equal(a.a_valider.length, 1);
  assert.equal(P.validateAutonomie(r.table).ok, true);
});
test('restreindre est toujours permis (retrait de confiance sans condition)', () => {
  const r = P.restreindre(aut(), 'ZZ-TEST action A', 'ZZ-TEST erreur constatée', TODAY);
  assert.equal(r.ok, true); assert.equal(r.table.faits_seuls.length, 0); assert.equal(r.table.a_valider.length, 2);
});

// ---- simplifications
test('simplifications : 0 ou plus de 3, sans chiffre ou sans source : refusées', () => {
  const s = (o = {}) => ({ texte: 'ZZ-TEST simplification', chiffre: '3 occurrences', source: 'frictions/fr-20261124', ...o });
  assert.equal(P.validateSimplifs([]).ok, false);
  assert.equal(P.validateSimplifs([s(), s(), s(), s()]).ok, false);
  assert.equal(P.validateSimplifs([s({ chiffre: 'beaucoup' })]).ok, false);
  assert.equal(P.validateSimplifs([s({ source: '' })]).ok, false);
  assert.equal(P.validateSimplifs([s({ texte: 'écrire à zz@example.com' })]).ok, false);
  assert.equal(P.validateSimplifs([s(), s()]).ok, true);
});
test('sortie kb : un chunk par objectif, format {date,id,kind,source,text}, texte lisible avec sources', () => {
  const ch = P.toKbChunks({ profil: prof(ob()), autonomie: aut(), today: TODAY });
  assert.ok(ch.length >= 3);
  for (const c of ch) { assert.deepEqual(Object.keys(c).sort(), ['date', 'id', 'kind', 'source', 'text', 'title']); assert.equal(c.kind, 'profil'); }
  assert.match(ch.find((c) => c.id === 'ob-1').text, /HYPOTHÈSE.*rg-26/s);
});

// ---- durcissement (consigne d'Issam 24/11 : précis et très inférant, sans rien inventer)
test('une seule source, ou deux sources qui citent la même référence : refusé (au moins 2 sources distinctes)', () => {
  assert.match(P.validateProfil(prof(ob({ sources: src2().slice(0, 1) })), { today: TODAY }).errors.join('\n'), /au moins 2 sources/);
  const double = [{ type: 'regle', ref: 'rg-26', date: '2026-11-22' }, { type: 'regle', ref: 'rg-26', date: '2026-11-23' }];
  assert.match(P.validateProfil(prof(ob({ sources: double })), { today: TODAY }).errors.join('\n'), /au moins 2 sources/);
});
test('toute source doit être datée, y compris règle, outil et friction', () => {
  for (const t of ['regle', 'outil', 'friction']) {
    const r = P.validateProfil(prof(ob({ sources: [src2()[0], { type: t, ref: 'x' }] })), { today: TODAY });
    assert.equal(r.ok, false, t); assert.match(r.errors.join('\n'), /date/);
  }
});
test('catégorie inconnue, question absente ou sans « ? », réfutation absente : refusé', () => {
  for (const bad of [{ categorie: 'envie' }, { categorie: undefined }, { question: '' }, { question: 'dis-moi' }, { refutation: '' }]) {
    assert.equal(P.validateProfil(prof(ob(bad)), { today: TODAY }).ok, false, JSON.stringify(bad));
  }
});
test('niveau de confiance : calculé par le nombre de sources distinctes, jamais déclaré au-dessus', () => {
  const n = (k) => Array.from({ length: k }, (_, i) => ({ type: 'regle', ref: 'rg-' + (20 + i), date: '2026-11-22' }));
  assert.deepEqual([2, 3, 4, 7].map((k) => P.niveauConfiance(n(k))), ['faible', 'moyen', 'eleve', 'eleve']);
  assert.equal(P.validateProfil(prof(ob({ sources: n(2), confiance: 'moyen' })), { today: TODAY }).ok, false);
  assert.equal(P.validateProfil(prof(ob({ sources: n(3), confiance: 'moyen' })), { today: TODAY }).ok, true);
  assert.equal(P.validateProfil(prof(ob({ sources: n(4), confiance: 'faible' })), { today: TODAY }).ok, false, 'confiance inférieure au calcul : refusée aussi (valeur exacte exigée)');
  assert.equal(P.validateProfil(prof(ob({ confiance: 'eleve' })), { today: TODAY }).ok, false);
});
test('source contradictoire : abaisse la confiance d\'un niveau et exige une contradiction déclarée', () => {
  const srcs = [...[1, 2, 3, 4].map((i) => ({ type: 'regle', ref: 'rg-' + (30 + i), date: '2026-11-23' })), { type: 'retour', ref: 'retours/2026-11-23 q3', date: '2026-11-23', sens: 'contredit' }];
  assert.equal(P.niveauConfiance(srcs), 'moyen');
  const sans = P.validateProfil(prof(ob({ sources: srcs, confiance: 'moyen' })), { today: TODAY });
  assert.equal(sans.ok, false); assert.match(sans.errors.join('\n'), /contradiction/);
  const p = { objectifs: [ob({ sources: srcs, confiance: 'moyen' }), ob({ id: 'ob-2' })], contradictions: [{ a: 'ob-1', b: 'ob-2', nature: 'ZZ-TEST tension', question: 'ZZ-TEST lequel prime ?' }] };
  assert.equal(P.validateProfil(p, { today: TODAY }).ok, true);
});
test('contradictions entre hypothèses : ids inconnus, auto-référence, doublon, sans question : refusés', () => {
  const two = [ob(), ob({ id: 'ob-2' })];
  const c = (x) => ({ objectifs: two, contradictions: [{ a: 'ob-1', b: 'ob-2', nature: 'n', question: 'q ?', ...x }] });
  for (const bad of [{ b: 'ob-9' }, { b: 'ob-1' }, { nature: '' }, { question: 'sans point' }]) assert.equal(P.validateProfil(c(bad), { today: TODAY }).ok, false, JSON.stringify(bad));
  const dup = { objectifs: two, contradictions: [c().contradictions[0], { a: 'ob-2', b: 'ob-1', nature: 'n', question: 'q ?' }] };
  assert.match(P.validateProfil(dup, { today: TODAY }).errors.join('\n'), /en double/);
});
test('correction par Issam : remplace l\'hypothèse, garde l\'ancien texte et la citation ; refusée sans retour daté et cité', () => {
  const p = prof(ob());
  for (const r of [undefined, {}, { date: TODAY }, { date: 'x', citation: 'non' }, { date: TODAY, citation: '' }]) assert.equal(P.corriger(p, 'ob-1', 'ZZ-TEST nouveau texte', r, TODAY).ok, false, JSON.stringify(r));
  assert.equal(P.corriger(p, 'ob-9', 'x', { date: TODAY, citation: 'non' }, TODAY).ok, false);
  const r = P.corriger(p, 'ob-1', 'ZZ-TEST nouveau texte', { date: TODAY, citation: 'ZZ-TEST pas tout à fait' }, TODAY);
  assert.equal(r.ok, true);
  const o = r.profil.objectifs[0];
  assert.equal(o.objectif, 'ZZ-TEST nouveau texte'); assert.equal(o.statut, 'corrige'); assert.equal(o.corrections.length, 1);
  assert.equal(o.corrections[0].ancien, 'ZZ-TEST objectif factice'); assert.equal(p.objectifs[0].objectif, 'ZZ-TEST objectif factice', 'original intact');
  assert.equal(P.validateProfil(r.profil, { today: TODAY }).ok, true);
  const c2 = P.corriger(r.profil, 'ob-1', 'ZZ-TEST encore', { date: TODAY, citation: 'ZZ-TEST bis' }, TODAY);
  assert.equal(c2.profil.objectifs[0].corrections.length, 2, 'la trace s\'accumule');
  const noTrace = JSON.parse(JSON.stringify(r.profil)); delete noTrace.objectifs[0].corrections;
  assert.equal(P.validateProfil(noTrace, { today: TODAY }).ok, false, '« corrigé » sans trace de correction refusé');
});
test('confirmation par Issam : statut confirmé seulement avec retour daté et cité', () => {
  const p = prof(ob());
  assert.equal(P.confirmer(p, 'ob-1', undefined, TODAY).ok, false);
  const r = P.confirmer(p, 'ob-1', { date: TODAY, citation: 'ZZ-TEST oui' }, TODAY);
  assert.equal(r.ok, true); assert.equal(r.profil.objectifs[0].statut, 'confirme'); assert.equal(p.objectifs[0].statut, 'a_confirmer');
});
test('vérification des sources contre les données réelles : règle inconnue, date différente, document absent', () => {
  const regles = { chunks: [{ id: 'rg-26', date: '2026-11-22' }, { id: 'rg-20', date: '2026-11-22' }] };
  const mk = (srcs) => prof(ob({ sources: srcs }));
  const ok = P.verifierSources(mk([{ type: 'regle', ref: 'x', date: '2026-11-22', doc: 'rg-26' }, { type: 'regle', ref: 'y', date: '2026-11-22', doc: 'rg-20' }]), { regles, docs: {} });
  assert.deepEqual(ok, []);
  const bad = P.verifierSources(mk([{ type: 'regle', ref: 'x', date: '2026-11-21', doc: 'rg-26' }, { type: 'regle', ref: 'y', date: '2026-11-22', doc: 'rg-99' }, { type: 'retour', ref: 'z', date: '2026-11-22', doc: 'retours/2026-11-22' }, { type: 'outil', ref: 'w', date: '2026-11-22' }]), { regles, docs: {} });
  const t = bad.join('\n'); assert.match(t, /rg-26.*date/); assert.match(t, /rg-99.*introuvable/); assert.match(t, /retours\/2026-11-22.*introuvable/); assert.match(t, /sans pointeur doc/);
});

// ---- apprentissage continu (précision d'Issam 24/11 : à partir d'aujourd'hui, en continu)
const J1 = '2026-11-24T20:00:00Z', J2 = '2026-11-25T20:00:00Z';
const base = () => ({ ...prof(ob(), ob({ id: 'ob-2', categorie: 'contrainte' })), curseur: '2026-11-24T10:00:00Z' });
const ap = (o = {}) => ({ id: 'ob-1', vu_le: '2026-11-24T16:00:00Z', source: { type: 'retour', ref: 'ZZ-TEST retours/2026-11-24 q1', date: '2026-11-24' }, ...o });
test('aucune nouveauté depuis le curseur : rien n\'est écrit, curseur inchangé', () => {
  const p = base();
  for (const apports of [[], undefined, [ap({ vu_le: '2026-11-24T09:00:00Z' })], [ap({ vu_le: '2026-11-24T10:00:00Z' })], [{ id: 'ob-1' }], [ap({ id: 'ob-9' })]]) {
    const r = P.fusionner(p, apports, { now: J1 }); assert.equal(r.ok, true); assert.equal(r.ecrit, false, JSON.stringify(apports)); assert.equal(r.profil.curseur, '2026-11-24T10:00:00Z'); assert.equal(r.profil, p);
  }
  assert.equal(P.fusionner(p, [ap()], { now: 'hier' }).ok, false);
});
test('nouvelle source : enrichit sans dupliquer, trace dans l\'historique, confiance recalculée, curseur avancé', () => {
  const r = P.fusionner(base(), [ap()], { now: J1 });
  assert.equal(r.ecrit, true); const o = r.profil.objectifs[0];
  assert.equal(o.sources.length, 3); assert.equal(o.confiance, 'moyen'); assert.equal(r.profil.curseur, J1);
  assert.deepEqual(o.historique.map((h) => h.evenement), ['source_ajoutee', 'confiance']); assert.match(o.historique[1].detail, /faible → moyen/);
  assert.equal(r.profil.objectifs.length, 2, 'aucun objectif dupliqué');
});
test('idempotence : rejouer le même passage, ou le même apport sous un autre curseur, ne change rien', () => {
  const r1 = P.fusionner(base(), [ap()], { now: J1 });
  const r2 = P.fusionner(r1.profil, [ap()], { now: J1 }); assert.equal(r2.ecrit, false);
  const r3 = P.fusionner(r1.profil, [ap({ vu_le: '2026-11-25T08:00:00Z' })], { now: J2 }); // même source revue le lendemain
  assert.equal(r3.ecrit, false); assert.match(r3.journal.join(' '), /doublon/);
  assert.deepEqual(r3.profil, r1.profil);
});
test('deuxième passage le lendemain avec de nouvelles données : la fiche s\'enrichit, l\'historique de la veille est conservé', () => {
  const r1 = P.fusionner(base(), [ap()], { now: J1 });
  const nouvel = { id: 'ob-3', categorie: 'anti_objectif', objectif: 'ZZ-TEST nouvelle hypothèse', hypothese: true, date: '2026-11-25', statut: 'a_confirmer', sources: src2(), confiance: 'faible', refutation: 'ZZ-TEST r', question: 'ZZ-TEST q ?' };
  const r2 = P.fusionner(r1.profil, [ap({ vu_le: '2026-11-25T09:00:00Z', source: { type: 'regle', ref: 'rg-99', date: '2026-11-25' } }), { nouvel, vu_le: '2026-11-25T09:30:00Z' }, { nouvel, vu_le: '2026-11-25T09:31:00Z' }], { now: J2 });
  assert.equal(r2.ecrit, true); assert.equal(r2.profil.objectifs.length, 3); assert.equal(r2.profil.curseur, J2);
  const o1 = r2.profil.objectifs[0]; assert.equal(o1.sources.length, 4); assert.equal(o1.confiance, 'eleve');
  assert.deepEqual(o1.historique.map((h) => h.evenement), ['source_ajoutee', 'confiance', 'source_ajoutee', 'confiance']);
  assert.equal(r2.profil.objectifs[2].historique[0].evenement, 'cree');
  assert.equal(P.fusionner(r2.profil, [], { now: '2026-11-25T21:00:00Z' }).ecrit, false);
});
test('hypothèse jamais confirmée et sans source depuis plus de 14 jours : « à réviser », pas supprimée ; une nouvelle source lève la marque', () => {
  const vieux = { ...base(), objectifs: [ob({ date: '2026-11-01', sources: [{ type: 'regle', ref: 'a', date: '2026-11-01' }, { type: 'regle', ref: 'b', date: '2026-11-02' }] }), ob({ id: 'ob-2', date: '2026-11-01', statut: 'confirme', retour_issam: { date: '2026-11-03', citation: 'ZZ-TEST oui' }, sources: [{ type: 'regle', ref: 'a', date: '2026-11-01' }, { type: 'regle', ref: 'b', date: '2026-11-02' }] })] };
  const r = P.fusionner(vieux, [], { now: J1 });
  assert.equal(r.ecrit, true); assert.equal(r.profil.objectifs.length, 2);
  assert.equal(r.profil.objectifs[0].a_reviser, true); assert.equal(r.profil.objectifs[1].a_reviser, undefined, 'une hypothèse confirmée n\'est jamais à réviser');
  assert.equal(P.fusionner(r.profil, [], { now: '2026-11-24T21:00:00Z' }).ecrit, false, 'marque posée une seule fois');
  const l = P.fusionner(r.profil, [ap({ vu_le: '2026-11-24T21:00:00Z' })], { now: '2026-11-24T22:00:00Z' });
  assert.equal(l.profil.objectifs[0].a_reviser, undefined); assert.ok(l.profil.objectifs[0].historique.some((h) => h.evenement === 'revise'));
});
test('un apport qui rendrait le profil invalide est refusé en bloc (rien de partiel)', () => {
  const r = P.fusionner(base(), [ap(), { nouvel: { id: 'ob-3', objectif: 'ZZ-TEST sans source' }, vu_le: '2026-11-24T16:00:00Z' }], { now: J1 });
  assert.equal(r.ok, false); assert.match(r.cause, /ob-3/);
});
test('proposition d\'outil ou de développement : doit citer le problème terrain, l\'objectif et la mesure', () => {
  const p = { titre: 'ZZ-TEST outil', probleme: { type: 'friction', ref: 'frictions/fr-20261124 F-x', date: '2026-11-24' }, objectif: 'ob-3', mesure: 'ZZ-TEST minutes gagnées' };
  assert.equal(P.validateProposition(p).ok, true);
  for (const bad of [{ probleme: undefined }, { probleme: { type: 'idée', ref: 'x', date: '2026-11-24' } }, { probleme: { type: 'friction', ref: '', date: '2026-11-24' } }, { objectif: 'x' }, { mesure: '' }, { valide_par_issam: { date: 'x' } }]) assert.equal(P.validateProposition({ ...p, ...bad }).ok, false, JSON.stringify(bad));
});

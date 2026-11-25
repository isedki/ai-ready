// Tests US-15. Les cas d'échec passent en premier. Données factices uniquement (ZZ-TEST, adresses example.test) ; rien n'est écrit ni envoyé.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const PLAN = createRequire(import.meta.url)('./plan-core.js');
const SELF = 'moi@example.test';
const DAY = '2026-11-25';
const NOW = Date.parse('2026-11-25T08:05:00Z'); // mercredi
const src = (o = {}) => ({ type: 'mail', ref: 'ZZ-TEST fil 1', date: '2026-11-24T15:07:00Z', ...o });
const prio = (n, o = {}) => ({ id: 'P' + n, titre: 'ZZ-TEST priorité ' + n, raison: 'ZZ-TEST raison', action: 'ZZ-TEST geste ' + n, sources: [src()], ...o });
const plan = (o = {}) => ({ jour: DAY, priorites: [prio(1), prio(2), prio(3)], attend: [], bloque: [], non_lu: [], ...o });
const send = (o = {}) => ({ to: [SELF], cc: [], bcc: [], subject: 'Plan du jour ' + DAY, day: DAY, self: SELF, sent: [], ...o });

/* ---------- 1. destinataire : refus ---------- */
test('destinataire différent de lui-même : refus, rien n\'est envoyé', () => {
  const r = PLAN.checkSend(send({ to: ['autre@example.test'] }));
  assert.equal(r.ok, false); assert.equal(r.code, 'dest_different'); assert.match(r.why, /autre@example\.test/);
});
test('destinataire en plus de lui-même, Cc ou Cci : refus', () => {
  assert.equal(PLAN.checkSend(send({ to: [SELF, 'autre@example.test'] })).code, 'dest_different');
  assert.equal(PLAN.checkSend(send({ cc: ['autre@example.test'] })).code, 'cc_bcc');
  assert.equal(PLAN.checkSend(send({ bcc: [SELF] })).code, 'cc_bcc');
});
test('adresse propre non configurée ou destinataire absent : refus (jamais une valeur devinée)', () => {
  assert.equal(PLAN.checkSend(send({ self: '' })).code, 'self_absent');
  assert.equal(PLAN.checkSend(send({ self: undefined })).code, 'self_absent');
  assert.equal(PLAN.checkSend(send({ to: [] })).code, 'dest_different');
  assert.equal(PLAN.checkSend(send({ to: undefined })).code, 'dest_different');
  assert.equal(PLAN.checkSend(send({ to: 'x' })).code, 'dest_different');
});
test('même adresse écrite autrement (casse, nom affiché) : acceptée ; sous-domaine ou suffixe : refusée', () => {
  assert.equal(PLAN.checkSend(send({ to: ['Moi <MOI@Example.test>'] })).ok, true);
  assert.equal(PLAN.checkSend(send({ to: ['moi@example.test.evil.net'] })).code, 'dest_different');
  assert.equal(PLAN.checkSend(send({ to: ['xmoi@example.test'] })).code, 'dest_different');
  assert.equal(PLAN.checkSend(send({ to: ['moi@example.test, autre@example.test'] })).code, 'dest_different');
});
test('objet imposé « Plan du jour AAAA-MM-JJ » ; jour invalide refusé', () => {
  assert.equal(PLAN.checkSend(send({ subject: 'Plan du jour 2026-11-24' })).code, 'objet');
  assert.equal(PLAN.checkSend(send({ subject: 'Urgent' })).code, 'objet');
  assert.equal(PLAN.checkSend(send({ day: '25/11/2026', subject: 'Plan du jour 25/11/2026' })).code, 'jour_invalide');
});

/* ---------- 2. plan déjà envoyé : rien de nouveau ---------- */
test('plan déjà envoyé aujourd\'hui : refus « deja_envoye », rien de nouveau', () => {
  const r = PLAN.checkSend(send({ sent: [{ subject: 'Plan du jour ' + DAY, to: [SELF], date: '2026-11-25T08:01:00Z' }] }));
  assert.equal(r.ok, false); assert.equal(r.code, 'deja_envoye'); assert.match(r.why, /08:01/);
});
test('envoyés d\'un autre jour ou d\'un autre objet : ne bloquent pas', () => {
  const sent = [{ subject: 'Plan du jour 2026-11-24', to: [SELF], date: '2026-11-24T08:01:00Z' }, { subject: 'Autre chose', to: [SELF], date: '2026-11-25T07:00:00Z' }];
  assert.equal(PLAN.checkSend(send({ sent })).ok, true);
});
test('envoyés illisibles (liste absente) : refus, car l\'unicité ne peut pas être prouvée', () => {
  assert.equal(PLAN.checkSend(send({ sent: undefined })).code, 'envoyes_illisibles');
  assert.equal(PLAN.checkSend(send({ sent: null })).code, 'envoyes_illisibles');
  assert.equal(PLAN.checkSend(send({ sent: 'erreur' })).code, 'envoyes_illisibles');
});
test('même objet envoyé à quelqu\'un d\'autre le même jour : ne compte pas comme plan, mais le destinataire reste contrôlé', () => {
  const sent = [{ subject: 'Plan du jour ' + DAY, to: ['autre@example.test'], date: '2026-11-25T08:01:00Z' }];
  assert.equal(PLAN.checkSend(send({ sent })).ok, true);
});

/* ---------- 3. plan : jamais de priorité sans source ---------- */
test('priorité sans source : plan refusé avec la priorité nommée', () => {
  const r = PLAN.validatePlan(plan({ priorites: [prio(1), prio(2, { sources: [] }), prio(3)] }), DAY);
  assert.equal(r.ok, false); assert.match(r.errors.join('\n'), /P2.*aucune source/);
  assert.match(PLAN.validatePlan(plan({ priorites: [prio(1), prio(2, { sources: undefined }), prio(3)] }), DAY).errors.join(), /P2.*aucune source/);
});
test('source mal formée : type inconnu, référence vide, date invalide sans cause', () => {
  const e = (s) => PLAN.validatePlan(plan({ priorites: [prio(1, { sources: [s] }), prio(2), prio(3)] }), DAY).errors.join('\n');
  assert.match(e(src({ type: 'rumeur' })), /P1.*type de source inconnu/);
  assert.match(e(src({ ref: '' })), /P1.*référence manquante/);
  assert.match(e(src({ date: 'hier' })), /P1.*date invalide/);
  assert.match(e(src({ date: undefined })), /P1.*date manquante/);
  assert.match(e('texte'), /P1.*source mal formée/);
});
test('date de source inconnue : acceptée seulement écrite « — » avec sa raison', () => {
  const okp = (s) => PLAN.validatePlan(plan({ priorites: [prio(1, { sources: [s] }), prio(2), prio(3)] }), DAY);
  assert.equal(okp(src({ date: '—', date_raison: 'échéance non écrite dans l\'action' })).ok, true);
  assert.equal(okp(src({ date: '—' })).ok, false);
});
test('moins de 3 ou plus de 5 priorités : refusé ; moins de 3 admis avec la raison écrite', () => {
  assert.match(PLAN.validatePlan(plan({ priorites: [prio(1), prio(2)] }), DAY).errors.join(), /3 à 5 priorités/);
  assert.match(PLAN.validatePlan(plan({ priorites: [1, 2, 3, 4, 5, 6].map((n) => prio(n)) }), DAY).errors.join(), /3 à 5 priorités/);
  assert.equal(PLAN.validatePlan(plan({ priorites: [prio(1), prio(2)], moins_de_3_raison: 'seules 2 sources lisibles : Gmail non lu' }), DAY).ok, true);
  assert.equal(PLAN.validatePlan(plan({ priorites: [], moins_de_3_raison: 'rien' }), DAY).ok, false);
});
test('priorité sans titre ou sans raison, identifiants en double, jour différent : refusés', () => {
  assert.match(PLAN.validatePlan(plan({ priorites: [prio(1, { titre: '' }), prio(2), prio(3)] }), DAY).errors.join(), /P1.*titre manquant/);
  assert.match(PLAN.validatePlan(plan({ priorites: [prio(1, { raison: ' ' }), prio(2), prio(3)] }), DAY).errors.join(), /P1.*raison manquante/);
  assert.match(PLAN.validatePlan(plan({ priorites: [prio(1), prio(1), prio(3)] }), DAY).errors.join(), /identifiant P1 en double/);
  assert.match(PLAN.validatePlan(plan({ jour: '2026-11-24' }), DAY).errors.join(), /jour du plan/);
  assert.equal(PLAN.validatePlan(null, DAY).ok, false); assert.equal(PLAN.validatePlan('x', DAY).ok, false);
});
test('source illisible : « non lu : raison » dans le plan, sans le faire échouer ; sans raison, refusé', () => {
  const p = plan({ non_lu: [{ source: 'Gmail', raison: 'connecteur indisponible (ZZ-TEST)' }, { source: 'Suivi', raison: 'lecture refusée (ZZ-TEST)' }] });
  assert.equal(PLAN.validatePlan(p, DAY).ok, true);
  const txt = PLAN.renderMail(p, NOW).text;
  assert.match(txt, /non lu : Gmail — connecteur indisponible \(ZZ-TEST\)/); assert.match(txt, /non lu : Suivi — lecture refusée/);
  assert.match(PLAN.validatePlan(plan({ non_lu: [{ source: 'Gmail' }] }), DAY).errors.join(), /non lu.*raison manquante/);
});
test('Gmail et Suivi illisibles ensemble : le plan reste valide s\'il garde 3 priorités sourcées (profil) et le dit', () => {
  const p = plan({ priorites: [prio(1, { sources: [{ type: 'profil', ref: 'ob-1', date: '2026-11-24T21:43:00Z' }] }), prio(2, { sources: [{ type: 'profil', ref: 'ob-2', date: '2026-11-24T21:43:00Z' }] }), prio(3, { sources: [{ type: 'profil', ref: 'ob-3', date: '2026-11-24T21:43:00Z' }] })], non_lu: [{ source: 'Gmail', raison: 'timeout' }, { source: 'Suivi', raison: 'permission-denied' }] });
  assert.equal(PLAN.validatePlan(p, DAY).ok, true);
});
test('date sans heure : affichée comme telle, jamais 00:00 inventé', () => {
  const p = plan({ priorites: [prio(1, { sources: [{ type: 'action', ref: 'A-1', date: '2026-11-23' }] }), prio(2), prio(3)] });
  assert.equal(PLAN.validatePlan(p, DAY).ok, true);
  assert.match(PLAN.renderMail(p, NOW).text, /action A-1 · 2026-11-23 \(heure non écrite\) \(il y a 2 j\)/); assert.doesNotMatch(PLAN.renderMail(p, NOW).text, /2026-11-23 00:00/);
});
test('jour sans mail : plan valide à partir du Suivi ; le « zéro mail » est un fait lu, pas un « non lu »', () => {
  const p = plan({ priorites: [1, 2, 3].map((n) => prio(n, { sources: [{ type: 'action', ref: 'A-0' + n, date: '2026-11-23T10:00:00Z' }] })), mails: { lus: 0, depuis: '2026-11-24T15:05:00Z', source: 'Gmail search_threads' } });
  assert.equal(PLAN.validatePlan(p, DAY).ok, true);
  const t = PLAN.renderMail(p, NOW).text;
  assert.match(t, /0 fil Gmail lu depuis 2026-11-24 15:05 UTC \(source : Gmail search_threads\)/); assert.doesNotMatch(t, /non lu/);
});

/* ---------- 4. rendu du mail ---------- */
test('mail : objet imposé, chaque priorité avec raison, source et âge ; consigne de verdict ; sans URL de secret', () => {
  const m = PLAN.renderMail(plan({ attend: [{ titre: 'ZZ-TEST réponse attendue', source: src() }], bloque: [{ titre: 'ZZ-TEST bloqué', raison: 'en attente d\'un accès', source: src({ type: 'action', ref: 'A-033' }) }] }), NOW);
  assert.equal(m.subject, 'Plan du jour ' + DAY);
  assert.match(m.text, /P1 · ZZ-TEST priorité 1/); assert.match(m.text, /Pourquoi : ZZ-TEST raison/);
  assert.match(m.text, /mail ZZ-TEST fil 1 · 2026-11-24 15:07 UTC \(il y a 16 h 58\)/);
  assert.match(m.text, /Attend ta réponse/); assert.match(m.text, /Bloqué/);
  assert.match(m.text, /P1 bonne/); assert.match(m.text, /mauvaise : /); assert.match(m.text, /manquante : /);
});
test('âge d\'une source future ou illisible : « — » avec la raison, jamais un chiffre inventé', () => {
  assert.equal(PLAN.ageLabel('2026-11-26T10:00:00Z', NOW).startsWith('—'), true);
  assert.match(PLAN.ageLabel('n\'importe quoi', NOW), /^— \(date illisible\)/);
  assert.match(PLAN.ageLabel('—', NOW), /^— \(date inconnue\)/);
  assert.equal(PLAN.ageLabel('2026-11-25T08:00:00Z', NOW), 'il y a 5 min');
  assert.equal(PLAN.ageLabel('2026-11-23T08:05:00Z', NOW), 'il y a 2 j');
});

/* ---------- 5. verdict ---------- */
const V = (o = {}) => ({ jour: DAY, priorite: 'P1', verdict: 'bonne', phrase: 'ZZ-TEST bien vu', voie: 'page', at: '2026-11-25T08:30:00Z', ...o });
test('verdict sans phrase pour « mauvaise » ou « manquante » : refusé, rien n\'est enregistré comme valide', () => {
  for (const v of ['mauvaise', 'manquante']) { const r = PLAN.verdictDoc(V({ verdict: v, phrase: '' })); assert.equal(r.ok, false); assert.match(r.why, /phrase/); }
  assert.equal(PLAN.verdictDoc(V({ verdict: 'mauvaise', phrase: '   ' })).ok, false);
  assert.equal(PLAN.verdictDoc(V({ verdict: 'mauvaise', phrase: undefined })).ok, false);
});
test('verdict « bonne » sans phrase : accepté (phrase « — »)', () => {
  const r = PLAN.verdictDoc(V({ phrase: '' })); assert.equal(r.ok, true); assert.equal(r.data.phrase, '—');
});
test('verdict inconnu, priorité absente du plan, jour ou voie invalides : refusés', () => {
  assert.equal(PLAN.verdictDoc(V({ verdict: 'moyenne' })).ok, false);
  assert.equal(PLAN.verdictDoc(V({ priorite: 'X' })).ok, false);
  assert.equal(PLAN.verdictDoc(V({ jour: 'demain' })).ok, false);
  assert.equal(PLAN.verdictDoc(V({ voie: 'sms' })).ok, false);
  assert.equal(PLAN.verdictDoc(V({ at: 'x' })).ok, false);
  assert.equal(PLAN.verdictDoc(null).ok, false);
});
test('verdict enregistré mot pour mot : accents, majuscules, ponctuation conservés ; id stable par voie', () => {
  const phrase = '  Ça manquait l\'accès PAYX — voir A-033 !  ';
  const r = PLAN.verdictDoc(V({ verdict: 'manquante', priorite: 'M1', phrase })); assert.equal(r.ok, true);
  assert.equal(r.data.phrase, phrase); assert.equal(r.data.verdict, 'manquante');
  assert.equal(PLAN.verdictDoc(V({ messageId: 'abc123' })).id, PLAN.verdictDoc(V({ messageId: 'abc123' })).id);
  assert.notEqual(PLAN.verdictDoc(V({ voie: 'mail', messageId: 'abc123' })).id, PLAN.verdictDoc(V()).id);
  assert.match(PLAN.verdictDoc(V()).id, /^vd-20261125-P1-page-/);
});
test('verdict par page : un second clic le même jour met à jour, ne duplique pas ; l\'ancien est gardé dans historique', () => {
  const a = PLAN.verdictDoc(V()); const b = PLAN.verdictDoc(V({ verdict: 'mauvaise', phrase: 'ZZ-TEST revu', at: '2026-11-25T09:00:00Z' }), a.data);
  assert.equal(b.id, a.id); assert.equal(b.data.verdict, 'mauvaise'); assert.equal(b.data.historique.length, 1); assert.equal(b.data.historique[0].verdict, 'bonne'); assert.equal(b.data.historique[0].phrase, 'ZZ-TEST bien vu');
});

/* ---------- 6. réponse au mail ---------- */
test('réponse au mail : lignes « P1 bonne », « P2 mauvaise : … », « manquante : … » ; citations ignorées ; texte brut gardé', () => {
  const rep = 'P1 bonne\nP2 mauvaise : ce n\'est plus d\'actualité\nmanquante : Mustapha, accès PAYX\n\n> P3 bonne (citation du plan, ignorée)\nOn se parle à midi.';
  const r = PLAN.parseReply(rep, plan());
  assert.deepEqual(r.verdicts.map((v) => [v.priorite, v.verdict, v.ok]), [['P1', 'bonne', true], ['P2', 'mauvaise', true], ['M1', 'manquante', true]]);
  assert.equal(r.verdicts[1].phrase, 'ce n\'est plus d\'actualité'); assert.equal(r.verdicts[2].phrase, 'Mustapha, accès PAYX');
  assert.equal(r.verdicts[0].brut, 'P1 bonne');
  assert.equal(r.ignorees.length >= 1, true);
});
test('réponse au mail : « mauvaise » sans phrase = incomplet, gardé mot pour mot et signalé ; priorité inconnue = refusée', () => {
  const r = PLAN.parseReply('P2 mauvaise\nP9 bonne\nP3 moyenne', plan());
  assert.equal(r.verdicts[0].ok, false); assert.equal(r.verdicts[0].brut, 'P2 mauvaise'); assert.match(r.verdicts[0].why, /phrase/);
  assert.equal(r.verdicts[1].ok, false); assert.match(r.verdicts[1].why, /P9.*absente du plan/);
  assert.equal(r.verdicts.length, 2); assert.match(r.ignorees.join('\n'), /P3 moyenne/);
});
test('réponse vide, sans verdict ou illisible : aucun verdict, aucune invention', () => {
  for (const t of ['', '   ', 'Merci !', null, undefined, 42]) assert.deepEqual(PLAN.parseReply(t, plan()).verdicts, []);
});
test('réponse en HTML ou signature : seules les lignes de verdict comptent', () => {
  const r = PLAN.parseReply('P1 Bonne.\r\n-- \r\nIssam\r\nEnvoyé de mon iPhone', plan()); assert.equal(r.verdicts.length, 1); assert.equal(r.verdicts[0].verdict, 'bonne');
});

/* ---------- 7. bilan du soir ---------- */
const B = (o = {}) => PLAN.bilan({ plan: plan(), verdicts: [], traitement: [], brouillons: null, ajoutees: null, faux: null, ...o });
test('bilan sans aucune donnée : chaque chiffre « — » avec sa raison, jamais 0 inventé', () => {
  const b = B();
  assert.match(b.lignes.traitees, /^— \(/); assert.match(b.lignes.brouillons, /^— \(/); assert.match(b.lignes.ajoutees, /^— \(/); assert.match(b.lignes.faux, /^— \(/); assert.match(b.lignes.bonnes, /^— \(aucun verdict/);
  assert.equal(b.chiffres.traitees, null); assert.equal(b.chiffres.bonnes, null);
});
test('bilan sans plan du jour : « — » et raison, pas d\'erreur', () => {
  const b = PLAN.bilan({ plan: null, verdicts: [] }); assert.match(b.lignes.traitees, /^— \(aucun plan/); assert.equal(b.chiffres.annoncees, null);
});
test('bilan : priorités traitées sur annoncées, avec preuve ; une priorité sans preuve n\'est pas comptée traitée', () => {
  const b = B({ traitement: [{ id: 'P1', traitee: true, preuve: 'envoi 11:02' }, { id: 'P2', traitee: true }, { id: 'P3', traitee: false }] });
  assert.equal(b.chiffres.traitees, 1); assert.equal(b.chiffres.annoncees, 3); assert.match(b.lignes.traitees, /1 sur 3/); assert.match(b.lignes.traitees, /P2 sans preuve/);
});
test('bilan : brouillons tels quels / modifiés / non envoyés, chacun avec sa source ; état inconnu = —', () => {
  const b = B({ brouillons: [{ id: 'd1', etat: 'tel_quel', source: 'envoyés 25/11 11:02' }, { id: 'd2', etat: 'modifie', source: 'envoyés 25/11 12:10' }, { id: 'd3', etat: 'non_envoye', source: 'brouillon encore présent 17:00' }, { id: 'd4', etat: null, source: 'fil illisible' }] });
  assert.deepEqual(b.chiffres.brouillons, { tel_quel: 1, modifie: 1, non_envoye: 1, inconnu: 1, total: 4 });
  assert.match(b.lignes.brouillons, /1 tel quel · 1 modifié · 1 non envoyé · 1 —/);
});
test('bilan : priorités ajoutées à la main et faits faux corrigés ; un fait faux non corrigé est nommé', () => {
  const b = B({ ajoutees: [{ titre: 'ZZ-TEST ajout', source: 'verdict manquante M1' }], faux: [{ fait: 'ZZ-TEST fait', corrige: true }, { fait: 'ZZ-TEST autre', corrige: false, depuis: '2026-11-10' }] });
  assert.equal(b.chiffres.ajoutees, 1); assert.deepEqual(b.chiffres.faux, { corriges: 1, non_corriges: 1 }); assert.match(b.lignes.faux, /1 corrigé/); assert.match(b.lignes.faux, /1 non corrigé.*depuis 2026-11-10/);
});
test('bilan : part de priorités jugées bonnes, sur les seuls verdicts valides', () => {
  const v = [PLAN.verdictDoc(V()).data, PLAN.verdictDoc(V({ priorite: 'P2', verdict: 'mauvaise', phrase: 'x' })).data, PLAN.verdictDoc(V({ priorite: 'P3', verdict: 'bonne' })).data];
  const b = B({ verdicts: v }); assert.equal(b.chiffres.bonnes.n, 2); assert.equal(b.chiffres.bonnes.sur, 3); assert.match(b.lignes.bonnes, /2 sur 3 jugées bonnes/); assert.match(b.lignes.bonnes, /manquantes : 0/);
});
test('bilan : verdicts d\'un autre jour ou « manquante » ne comptent pas dans le dénominateur des priorités annoncées', () => {
  const v = [PLAN.verdictDoc(V({ jour: '2026-11-24' })).data, PLAN.verdictDoc(V({ priorite: 'M1', verdict: 'manquante', phrase: 'oubli' })).data];
  const b = B({ verdicts: v }); assert.match(b.lignes.bonnes, /^— \(aucun verdict/); assert.equal(b.chiffres.manquantes, 1);
});

/* ---------- 8. arrêt (critères de l'agent) ---------- */
test('arrêt : moins de 50 % de bonnes sur 3 semaines', () => {
  const mk = (j, p, verdict) => PLAN.verdictDoc({ jour: j, priorite: p, verdict, phrase: 'x', voie: 'page', at: j + 'T10:00:00Z' }).data;
  const bad = [mk('2026-11-09', 'P1', 'bonne'), mk('2026-11-11', 'P1', 'mauvaise'), mk('2026-11-12', 'P1', 'mauvaise')];
  const r = PLAN.arret({ verdicts: bad, faux: [], now: Date.parse('2026-11-30T08:00:00Z') });
  assert.equal(r.arret, true); assert.match(r.raisons.join(), /1 sur 3.*moins de 50/);
});
test('arrêt : pas de décision sur moins de 3 semaines de recul ou trop peu de verdicts : « — » et raison', () => {
  const r = PLAN.arret({ verdicts: [], faux: [], now: NOW }); assert.equal(r.arret, false); assert.match(r.etat, /^— \(/);
  const mk = (j) => PLAN.verdictDoc({ jour: j, priorite: 'P1', verdict: 'mauvaise', phrase: 'x', voie: 'page', at: j + 'T10:00:00Z' }).data;
  const r2 = PLAN.arret({ verdicts: [mk('2026-11-24'), mk('2026-11-25')], faux: [], now: NOW }); assert.equal(r2.arret, false); assert.match(r2.etat, /recul/);
});
test('arrêt : un fait faux non corrigé depuis 14 jours ou plus', () => {
  const r = PLAN.arret({ verdicts: [], faux: [{ fait: 'ZZ-TEST', corrige: false, depuis: '2026-11-10' }], now: NOW });
  assert.equal(r.arret, true); assert.match(r.raisons.join(), /fait faux non corrigé depuis 15 jours/);
  assert.equal(PLAN.arret({ verdicts: [], faux: [{ fait: 'ZZ-TEST', corrige: false, depuis: '2026-11-20' }], now: NOW }).arret, false);
  assert.equal(PLAN.arret({ verdicts: [], faux: [{ fait: 'ZZ-TEST', corrige: false, depuis: 'bof' }], now: NOW }).arret, false);
});

/* ---------- 9. visibilité : ligne d'activité, passage manqué ---------- */
test('ligne d\'activité : début, fin, lu, produit, échec ; id stable ; sans donnée de tiers dans etape', () => {
  const r = PLAN.activityDoc({ passage: 'plan', debut: '2026-11-25T08:00:10Z', fin: '2026-11-25T08:04:30Z', lu: ['Gmail 14 fils', 'Suivi 76 actions'], produit: ['plans/pl-2026-11-25', 'mail Plan du jour'], echec: null });
  assert.equal(r.ok, true); assert.equal(r.id, 'jr-20261125-0800-coach-plan'); assert.equal(r.data.agent, 'Coach'); assert.equal(r.data.phase, 'fin'); assert.equal(r.data.at, '2026-11-25T08:04:30Z');
  assert.deepEqual(r.data.lu, ['Gmail 14 fils', 'Suivi 76 actions']); assert.equal(r.data.echec, null); assert.ok(r.data.etape.length <= 120); assert.equal(r.data.type, 'journal');
});
test('ligne d\'activité en échec : phase « fin » avec la cause dans echec et etape ; sans fin : phase « debut »', () => {
  const e = PLAN.activityDoc({ passage: 'plan', debut: '2026-11-25T08:00:10Z', fin: '2026-11-25T08:01:00Z', lu: [], produit: [], echec: 'Gmail indisponible' });
  assert.equal(e.data.phase, 'fin'); assert.match(e.data.etape, /échec : Gmail indisponible/); assert.equal(e.data.echec, 'Gmail indisponible');
  const d = PLAN.activityDoc({ passage: 'bilan', debut: '2026-11-25T16:30:00Z' }); assert.equal(d.data.phase, 'debut'); assert.equal(d.data.at, '2026-11-25T16:30:00Z');
});
test('ligne d\'activité invalide : passage inconnu, début absent ou illisible, fin avant début', () => {
  assert.equal(PLAN.activityDoc({ passage: 'sieste', debut: '2026-11-25T08:00:00Z' }).ok, false);
  assert.equal(PLAN.activityDoc({ passage: 'plan' }).ok, false);
  assert.equal(PLAN.activityDoc({ passage: 'plan', debut: 'x' }).ok, false);
  assert.match(PLAN.activityDoc({ passage: 'plan', debut: '2026-11-25T08:10:00Z', fin: '2026-11-25T08:00:00Z' }).why, /fin avant le début/);
});
test('veille de 9h05 et bilan : mêmes lignes, passage « veille » ou « bilan »', () => {
  assert.equal(PLAN.activityDoc({ passage: 'veille', debut: '2026-11-25T09:05:00Z', fin: '2026-11-25T09:08:00Z' }).id, 'jr-20261125-0905-coach-veille');
  assert.equal(PLAN.activityDoc({ passage: 'bilan', debut: '2026-11-25T16:30:00Z', fin: '2026-11-25T16:40:00Z' }).id, 'jr-20261125-1630-coach-bilan');
});
const journal = (...slots) => slots.map(([passage, debut]) => PLAN.activityDoc({ passage, debut, fin: debut }).data);
test('passage manqué : le plan de 8h absent à 8h35 est signalé ; avant 8h30 pas encore', () => {
  const at = (h) => Date.parse('2026-11-25T' + h + ':00Z');
  assert.deepEqual(PLAN.missedRuns({ now: at('08:20'), day: DAY, journal: [] }).manques, []);
  const m = PLAN.missedRuns({ now: at('08:35'), day: DAY, journal: [] });
  assert.equal(m.manques.length, 1); assert.match(m.manques[0].texte, /plan prévu à 08:00 UTC : aucun passage enregistré/); assert.equal(m.manques[0].passage, 'plan');
});
test('passage manqué : plan présent = rien ; veilles de 9h05 à 15h05 comptées une à une ; samedi et dimanche : aucun passage attendu', () => {
  const j = journal(['plan', '2026-11-25T08:00:10Z'], ['veille', '2026-11-25T09:05:20Z']);
  const m = PLAN.missedRuns({ now: Date.parse('2026-11-25T11:40:00Z'), day: DAY, journal: j });
  assert.deepEqual(m.manques.map((x) => x.attendu), ['10:05', '11:05']);
  assert.deepEqual(PLAN.missedRuns({ now: Date.parse('2026-11-28T10:00:00Z'), day: '2026-11-28', journal: [] }).manques, []);
});
test('passage manqué : un début sans fin depuis plus de 30 min est signalé « interrompu »', () => {
  const d = PLAN.activityDoc({ passage: 'plan', debut: '2026-11-25T08:00:00Z' }).data;
  const m = PLAN.missedRuns({ now: Date.parse('2026-11-25T08:50:00Z'), day: DAY, journal: [d] });
  assert.match(m.manques.map((x) => x.texte).join(), /plan commencé à 08:00 UTC sans fin/);
});
test('journal illisible : « — » et cause, pas de faux « manqué »', () => {
  const m = PLAN.missedRuns({ now: Date.parse('2026-11-25T11:20:00Z'), day: DAY, journal: null });
  assert.deepEqual(m.manques, []); assert.match(m.etat, /^— \(journal illisible/);
});

/* ---------- 10. modèle de la page ---------- */
test('page : plan du jour absent = message clair ; plan présent = priorités, verdicts rattachés, âge, passages manqués', () => {
  const vm0 = PLAN.viewModel({ plans: [], verdicts: [], journal: [], now: NOW, day: DAY });
  assert.equal(vm0.plan, null); assert.match(vm0.message, /Pas encore de plan/);
  const p = plan({ envoi: { statut: 'envoye', at: '2026-11-25T08:02:00Z', fil: 'ZZ-TEST' } });
  const vd = PLAN.verdictDoc(V()).data;
  const vm = PLAN.viewModel({ plans: [{ id: 'pl-' + DAY, data: p }], verdicts: [{ id: 'x', data: vd }], journal: [], now: Date.parse('2026-11-25T08:40:00Z'), day: DAY });
  assert.equal(vm.plan.priorites.length, 3); assert.equal(vm.plan.priorites[0].verdict.verdict, 'bonne'); assert.equal(vm.plan.priorites[1].verdict, null);
  assert.equal(vm.manques.length, 1); assert.match(vm.envoi, /envoyé à 08:02 UTC/);
});
test('page : plan mal formé listé en anomalie, jamais affiché à moitié', () => {
  const vm = PLAN.viewModel({ plans: [{ id: 'pl-' + DAY, data: { jour: DAY, priorites: [prio(1, { sources: [] })] } }], verdicts: [], journal: [], now: NOW, day: DAY });
  assert.equal(vm.plan, null); assert.match(vm.anomalies.join('\n'), /plans\/pl-2026-11-25.*aucune source/);
});

/* ---------- mail : le haut niveau d'abord, actionnable ---------- */
test('mail : « À faire ce matin » (priorité → geste) avant le détail ; version HTML formatée ; texte brut conservé', () => {
  const m = PLAN.renderMail(plan({ attend: [{ titre: 'ZZ-TEST a', source: src() }], bloque: [] }), NOW);
  assert.ok(m.text.indexOf('À FAIRE CE MATIN') < m.text.indexOf('DÉTAIL PAR PRIORITÉ'));
  assert.match(m.text, /P1 → ZZ-TEST priorité 1\n {5}Geste : ZZ-TEST geste 1/);
  assert.match(m.text, /EN ATTENTE : 1 réponse attendue · 0 blocage/);
  assert.ok(m.html.indexOf('À faire ce matin') < m.html.indexOf('Détail par priorité'));
  assert.match(m.html, /→ ZZ-TEST geste 2/); assert.match(m.html, /<ol/);
});
test('mail HTML : le texte venu des sources est échappé (aucune balise injectée)', () => {
  const m = PLAN.renderMail(plan({ priorites: [prio(1, { titre: '<script>x</script>', action: 'a & b' }), prio(2), prio(3)] }), NOW);
  assert.doesNotMatch(m.html, /<script>/); assert.match(m.html, /&lt;script&gt;/); assert.match(m.html, /a &amp; b/);
});
test('priorité sans geste (action) ou geste trop long : plan refusé', () => {
  assert.match(PLAN.validatePlan(plan({ priorites: [prio(1, { action: undefined }), prio(2), prio(3)] }), DAY).errors.join(), /P1 : geste à faire manquant/);
  assert.match(PLAN.validatePlan(plan({ priorites: [prio(1, { action: 'x'.repeat(201) }), prio(2), prio(3)] }), DAY).errors.join(), /action trop longue/);
});
test('titre court facultatif (court) utilisé dans le haut niveau, titre complet dans le détail', () => {
  const m = PLAN.renderMail(plan({ priorites: [prio(1, { court: 'ZZ-TEST court' }), prio(2), prio(3)] }), NOW);
  assert.match(m.text, /P1 → ZZ-TEST court/); assert.match(m.text, /P1 · ZZ-TEST priorité 1/);
});

// Tests US-6. Les cas d'échec passent en premier. Données factices uniquement (préfixe ZZ-TEST), rien n'est écrit dans le suivi.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const ACT = createRequire(import.meta.url)('./activite-core.js');
const NOW = Date.parse('2026-11-24T15:00:00Z'); // mardi
const M = (o) => ACT.buildModel({ now: NOW, day: '2026-11-24', ...o });
const good = (id, extra = {}) => ({ id, data: { agent: 'Coach', type: 'brouillon', titre: 'ZZ-TEST brouillon', url: 'https://mail.example.com/x', heure: '2026-11-24T10:10:00Z', jour: '2026-11-24', source: 'ZZ-TEST', ...extra } });

test('collection vide : ni plantage ni donnée inventée', () => {
  const m = M({ agents: [], livrables: [] });
  assert.equal(m.agents.length, 0); assert.equal(m.nLivrablesJour, 0); assert.deepEqual(m.anomalies, []); assert.deepEqual(m.stories, []);
  assert.deepEqual(M({}).agents, []); // entrées non fournies
  assert.deepEqual(M({ agents: null, livrables: 'x' }).agents, []);
});
test('document mal formé : listé en anomalie avec sa cause, jamais masqué', () => {
  const m = M({ livrables: [{ id: 'a1', data: 'texte' }, { id: 'a2', data: null }, { id: 'a3', data: [1] }, null, 42, good('ok1')], agents: [{ id: 'j1', data: 5 }, 'x'] });
  const causes = m.anomalies.map((a) => a.where + ' ' + a.cause).join('\n');
  assert.match(causes, /livrables\/a1 .*mal formé/); assert.match(causes, /livrables\/a2/); assert.match(causes, /livrables\/a3/); assert.match(causes, /agents\/j1/);
  assert.equal(m.nLivrablesJour, 1);
});
test('champs manquants : rejet net (agent, type, titre, jour) et cause en clair', () => {
  const cas = [['agent', /agent manquant/], ['titre', /titre manquant/], ['jour', /jour invalide/], ['type', /type inconnu/]];
  for (const [champ, re] of cas) { const d = good('x').data; delete d[champ]; const r = ACT.normLivrable('x', d); assert.equal(r.ok, false, champ); assert.match(r.cause, re); }
  assert.match(ACT.normLivrable('x', { ...good('x').data, type: 'poème' }).cause, /type inconnu.*poème/);
});
test('dates invalides : 30 février, mois 13, texte, heure 25h', () => {
  for (const v of ['2026-02-30', '2026-13-01', 'hier', '2026-11-24T25:00:00Z', '24/11/2026', '', null, 12]) assert.equal(ACT.parseWhen(v).ok, false, String(v));
  assert.equal(ACT.parseWhen('2026-11-24T10:10:00Z').ok, true);
  const m = M({ livrables: [good('d1', { jour: '2026-02-30' })] });
  assert.match(m.anomalies[0].cause, /jour invalide.*impossible/);
  const m2 = M({ livrables: [good('d2', { heure: 'pas une date' })] });
  assert.equal(m2.nLivrablesJour, 1); assert.equal(m2.agents[0].livrables[0].heure, null); assert.match(m2.anomalies[0].cause, /heure invalide/);
});
test('jour différent de la date de l\'heure : signalé, donnée gardée', () => {
  const m = M({ livrables: [good('d3', { jour: '2026-11-24', heure: '2026-11-23T22:00:00Z' })] });
  assert.match(m.anomalies[0].cause, /différent de la date/);
});
test('lien cassé : pas de lien cliquable, signalé', () => {
  for (const u of ['javascript:alert(1)', 'http://x.com', 'https://', 'pas un lien', 'https://nopoint']) { const r = ACT.normLivrable('l', good('l').data && { ...good('l').data, url: u }); assert.equal(r.item.url, null, u); assert.equal(r.item.lienCasse, true, u); }
  assert.equal(ACT.normLivrable('l', good('l').data).item.url, 'https://mail.example.com/x');
});
test('source absente : « — » et anomalie douce', () => {
  const d = good('s').data; delete d.source; const m = M({ livrables: [{ id: 's', data: d }] });
  assert.equal(m.agents[0].livrables[0].source, null); assert.match(m.anomalies[0].cause, /source manquante/);
});
test('doublon : affiché une seule fois, les deux ids cités', () => {
  const m = M({ livrables: [good('a'), good('b', { heure: '2026-11-24T11:00:00Z' })] });
  assert.equal(m.agents[0].livrables.length, 1); assert.equal(m.agents[0].livrables[0].doublons, 2); assert.match(m.anomalies[0].cause, /doublon/);
  assert.equal(m.agents[0].livrables[0].id, 'b'); // garde la plus récente
});
test('agent sans passage : « aucun passage enregistré », jamais une heure inventée', () => {
  const m = M({ agents: [{ id: 'ag-dev', data: { type: 'agent', nom: 'Développeurs', dernier: '', focus: 'En attente' } }] });
  assert.equal(m.agents[0].pass, null); assert.match(m.agents[0].inactif, /aucun passage/);
});
test('inactif au-delà de 36 h ouvrées ; le week-end ne compte pas', () => {
  // le week-end ne compte pas : ven 20/11 20:00 -> lun 23/11 02:00 = 4 h + 2 h
  assert.equal(ACT.ouvreesHours(Date.parse('2026-11-20T20:00:00Z'), Date.parse('2026-11-23T02:00:00Z')), 6);
  // lun 23/11 09:00 -> mar 24/11 15:00 = 15 + 15 = 30 h ouvrées : actif
  assert.equal(ACT.ouvreesHours(Date.parse('2026-11-23T09:00:00Z'), NOW), 30);
  const actif = M({ agents: [{ id: 'j', data: { type: 'journal', at: '2026-11-23T09:00:00Z', agent: 'Coach', quoi: 'x' } }] });
  assert.equal(actif.agents[0].inactif, null);
  // ven 20/11 17:00 -> mar 24/11 15:00 = 7 + 24 + 15 = 46 h ouvrées : inactif
  const vieux = M({ agents: [{ id: 'j', data: { type: 'journal', at: '2026-11-20T17:00:00Z', agent: 'Coach', quoi: 'x' } }] });
  assert.equal(vieux.agents[0].inactif, 'inactif depuis 20/11 17:00');
  assert.equal(ACT.ouvreesHours(NOW, NOW - 1), 0);
});
test('agent doc : champ dernier invalide signalé, journal prioritaire à égalité', () => {
  const m = M({ agents: [{ id: 'ag-coach', data: { type: 'agent', nom: 'Coach', dernier: 'bientôt' } }, { id: 'j1', data: { type: 'journal', at: '2026-11-24T12:20:00Z', agent: 'Coach', quoi: 'fait X' } }] });
  assert.match(m.anomalies[0].cause, /dernier invalide/); assert.equal(m.agents[0].pass.quoi, 'fait X'); assert.equal(m.agents[0].pass.source, 'agents/j1');
});
test('champ dernier réel : « date : texte », date seule, texte sans date', () => {
  assert.equal(ACT.parseDernier('2026-11-23T15:45:00Z : sprint-02 proposé').ms, Date.parse('2026-11-23T15:45:00Z'));
  const j = ACT.parseDernier('2026-11-22 : fiche créée'); assert.equal(j.hm, null); assert.equal(j.day, '2026-11-22');
  assert.equal(ACT.parseDernier('bientôt : x').ok, false);
  const m = M({ agents: [{ id: 'ag-profil', data: { type: 'agent', nom: 'Profil', dernier: '2026-11-22 : fiche créée' } }, { id: 'ag-x', data: { type: 'agent', nom: 'X', dernier: 'jamais : si' } }] });
  const p = m.agents.find((a) => a.name === 'Profil'); assert.equal(p.pass.label, '22/11 (heure —)'); assert.equal(p.inactif, 'inactif depuis 22/11 (heure —)');
  assert.match(m.anomalies[0].cause, /dernier invalide.*ignoré/);
});
test('heure dans le futur : âge 0 et anomalie', () => {
  const m = M({ agents: [{ id: 'f', data: { type: 'journal', at: '2026-11-25T08:00:00Z', agent: 'Coach', quoi: 'x' } }] });
  assert.equal(m.agents[0].pass.futur, true); assert.match(m.anomalies[0].cause, /futur/);
});
test('battement sans fin : fait signalé sans interprétation', () => {
  const m = M({ agents: [{ id: 'b1', data: { type: 'journal', at: '2026-11-24T08:00:00Z', agent: 'Coach', phase: 'debut', etape: 'lecture Gmail' } }] });
  assert.match(m.agents[0].hbOuvert, /aucun battement « fin » depuis le début de 24\/11 08:00/);
  const fin = M({ agents: [{ id: 'b1', data: { type: 'journal', at: '2026-11-24T08:00:00Z', agent: 'Coach', phase: 'debut' } }, { id: 'b2', data: { type: 'journal', at: '2026-11-24T08:40:00Z', agent: 'Coach', phase: 'fin', etape: 'terminé' } }] });
  assert.equal(fin.agents[0].hbOuvert, null); assert.equal(fin.agents[0].hb.phase, 'fin');
  const bad = M({ agents: [{ id: 'b3', data: { type: 'journal', at: '2026-11-24T08:00:00Z', agent: 'Coach', phase: 'dormir' } }] });
  assert.equal(bad.agents[0].hb, null); assert.match(bad.anomalies.map((a) => a.cause).join(), /phase inconnue/);
});
test('journal sans at ou sans agent : rejeté et listé', () => {
  const m = M({ agents: [{ id: 'j1', data: { type: 'journal', agent: 'Coach' } }, { id: 'j2', data: { type: 'journal', at: '2026-11-24T08:00:00Z' } }] });
  assert.equal(m.anomalies.length, 2); assert.equal(m.agents.length, 0);
});
test('progres mal formé : étape « — » et anomalie, pas de plantage', () => {
  const m = M({ agents: [{ id: 'story-us-9', data: { type: 'story', statut: 'encours', ref: 'US-9', titre: 'T', progres: { etapes: 'oops' } } }, { id: 'story-us-10', data: { type: 'story', statut: 'encours', ref: 'US-10' } }] });
  assert.equal(m.stories.length, 2); assert.equal(m.stories[0].etape, null); assert.match(m.stories[1].inactif, /aucun passage/); assert.ok(m.anomalies.length >= 1);
});
test('histoire : étape en cours = première non faite ; a_valider ne passe pas pour inactive', () => {
  const m = M({ agents: [{ id: 'story-us-6', data: { type: 'story', statut: 'encours', ref: 'US-6', titre: 'T', progres: { at: '2026-11-24T14:20:00Z', etapes: [{ t: 'A', fait: true }, { t: 'B', fait: false }] } } }, { id: 'story-us-4', data: { type: 'story', statut: 'encours', ref: 'US-4', progres: { at: '2026-11-17T10:00:00Z', a_valider: true, etapes: [{ t: 'A', fait: true }] } } }] });
  const s6 = m.stories.find((s) => s.ref === 'US-6'), s4 = m.stories.find((s) => s.ref === 'US-4');
  assert.equal(s6.etape, 'B'); assert.equal(s6.compte, '1 sur 2'); assert.equal(s6.inactif, null);
  assert.equal(s4.aValider, true); assert.equal(s4.inactif, null); assert.equal(s4.etape, 'toutes les étapes sont cochées');
});
test('filtre agent et jour', () => {
  const liv = [good('a'), good('b', { agent: 'Terrain', titre: 'ZZ-TEST autre' }), good('c', { jour: '2026-11-23', heure: '2026-11-23T10:00:00Z', titre: 'ZZ-TEST hier' })];
  assert.equal(M({ livrables: liv }).nLivrablesJour, 2);
  assert.equal(M({ livrables: liv, agent: 'terrain' }).agents.length, 1);
  assert.equal(M({ livrables: liv, day: '2026-11-23' }).nLivrablesJour, 1);
  assert.equal(M({ livrables: liv, day: '1999-01-01' }).day, '2026-11-24'); // jour inconnu : retombe sur aujourd'hui
});
test('index : adresses internes et mails retirés, ordre stable, idempotent à l\'octet', () => {
  const ag = [{ id: 'jr1', data: { type: 'journal', at: '2026-11-24T10:10:00Z', agent: 'Coach', quoi: 'Brouillon VM 10.30.152.3 pour a.b@exemple.ma' } }];
  const liv = [good('z', { titre: 'Objet avec 10.104.12.158 [x]' }), good('y', { agent: 'Terrain', type: 'kpi', titre: 'KPI', url: undefined, fil: undefined })];
  const a = ACT.buildIndex({ day: '2026-11-24', agents: ag, livrables: liv }), b = ACT.buildIndex({ day: '2026-11-24', agents: ag, livrables: liv.slice().reverse() });
  assert.equal(a, b); assert.ok(!/10\.\d+\.\d+\.\d+/.test(a)); assert.ok(!/@/.test(a)); assert.ok(!/Brouillon VM/.test(a.split('Journal')[1]), 'texte libre du journal exclu'); assert.match(a, /\(adresse interne\)/);
  assert.match(a, /## Coach[\s\S]*### Brouillons Gmail \(1\)/); assert.match(a, /Journal d'activité \(1\)/);
});
test('index : jour invalide refusé, jour vide produit un fichier explicite', () => {
  assert.throws(() => ACT.buildIndex({ day: '2026-02-30', agents: [], livrables: [] }), /jour invalide/);
  assert.match(ACT.buildIndex({ day: '2026-11-24', agents: [], livrables: [] }), /Aucun livrable ni entrée de journal/);
});

// ---- US-18 : vue en direct ----
const VIEW = createRequire(import.meta.url)('./activite-view.js');
function fakeDoc() {
  const mk = (tag) => ({ tag, className: '', children: [], attrs: {}, listeners: {}, _t: '', set textContent(v) { this._t = String(v); this.children = []; }, get textContent() { return this._t + this.children.map((c) => c.textContent).join(''); }, appendChild(c) { this.children.push(c); return c; }, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(e, f) { this.listeners[e] = f; }, set innerHTML(v) { throw new Error('innerHTML interdit'); } });
  return { createElement: mk, createTextNode: (t) => ({ textContent: String(t), children: [] }) };
}
import { readFileSync } from 'node:fs';
const FICHES = JSON.parse(readFileSync(new URL('./routines-fiches.json', import.meta.url), 'utf8'));
const TZ = 'CRON_TZ=Africa/Casablanca ';
const WED = Date.parse('2026-11-25T14:30:00Z'); // mercredi
const D = (o) => ACT.buildDirect({ now: WED, fiches: FICHES, ...o });
const run = (nom, cron, dernier, extra = {}) => ({ id: 'trig_' + nom, nom, cron: cron && TZ + cron, enabled: true, modele: 'm', dernier, ...extra });
const runsDoc = (routines, at = '2026-11-25T12:10:00Z') => ({ id: 'runs', data: { at, par: 'veille-coach', routines } });
const row = (d, nom) => d.routines.find((r) => r.nom === nom);

test('photo absente : la page le dit, ne plante pas, aucun état inventé', () => {
  const d = D({ agents: [], livrables: [] });
  assert.equal(d.photo.etat, 'absente');
  assert.ok(d.routines.length >= 10);
  assert.ok(d.routines.filter((r) => !r.local).every((r) => r.etat === 'photo-absente' && r.dernier === null && r.prochain === null));
  const doc = fakeDoc(), mount = doc.createElement('div');
  VIEW.renderDirect(doc, mount, d, { sources: [], fiches: FICHES.fiches });
  assert.match(mount.textContent, /Photo des routines absente : la Veille ne l'a pas encore écrite/);
});
test('photo mal formée ou en erreur : cause affichée, anomalie, pas d\'exception', () => {
  assert.equal(D({ agents: [{ id: 'runs', data: 'texte' }] }).photo.etat, 'illisible');
  assert.equal(D({ agents: [{ id: 'runs', data: { at: 'hier', routines: [] } }] }).photo.etat, 'illisible');
  assert.equal(D({ agents: [{ id: 'runs', data: { routines: [] } }] }).photo.etat, 'illisible');
  const e = D({ agents: [{ id: 'runs', data: { at: '2026-11-25T12:00:00Z', erreur: 'list_triggers indisponible' } }] });
  assert.equal(e.photo.etat, 'erreur'); assert.equal(e.photo.erreur, 'list_triggers indisponible');
  const mal = D({ agents: [runsDoc([{ cron: 'x' }, null, run('Phénix · Formateur', '0 9 * * 1', { at: 'bof', statut: 'OK' })])] });
  assert.match(mal.anomalies.map((a) => a.cause).join('\n'), /routine sans nom/); assert.match(mal.anomalies.map((a) => a.cause).join('\n'), /dernier\.at invalide/);
});
test('cron : lecture, fuseau Maroc = UTC, fuseau inconnu refusé, cron illisible refusé', () => {
  assert.equal(ACT.parseCron(TZ + '0 8 * * 1-5').ok, true);
  assert.equal(ACT.parseCron('CRON_TZ=Europe/Paris 0 8 * * 1-5').ok, false);
  for (const bad of ['', null, '0 8 * *', '61 8 * * *', '0 25 * * *', 'a b c d e', '*/0 * * * *']) assert.equal(ACT.parseCron(bad).ok, false, String(bad));
  assert.deepEqual(ACT.cronFires(ACT.parseCron('0 8 * * 1-5'), Date.parse('2026-11-20T00:00:00Z'), Date.parse('2026-11-24T23:00:00Z')).map((t) => new Date(t).toISOString().slice(0, 13)), ['2026-11-20T08', '2026-11-23T08', '2026-11-24T08']);
});
test('seuil propre à chaque routine, déduit du cron (jamais 36 h pour tous)', () => {
  const h = (e) => ACT.seuilMs(ACT.parseCron(e), WED) / 3600000;
  assert.equal(h('0 8 * * 1-5'), 72.5);        // vendredi 8h -> lundi 8h + 30 min
  assert.ok(h('5 12,15 * * 1-5') > 60 && h('5 12,15 * * 1-5') < 72.5); // vendredi 15h05 -> lundi 12h05 = 69 h + 30 min
  assert.equal(h('0 10 * * 5'), 168.5);        // hebdomadaire
  assert.equal(h('0 9 * * *'), 24.5);          // quotidien tous les jours
  assert.ok(h('0 9 1 * *') > 28 * 24 && h('0 9 1 * *') < 32 * 24); // mensuel
  const d = D({ agents: [runsDoc([run('Phénix · Bilan hebdomadaire', '20 16 * * 5', { at: '2026-11-20T16:25:00Z', statut: 'SUCCEEDED' })], '2026-11-25T14:20:00Z')] });
  const r = row(d, 'Phénix · Bilan hebdomadaire');
  assert.equal(r.inactif, null); assert.equal(r.etat, 'ok'); assert.match(r.seuilTxt, /7 j/);
  // l'ancien seuil unique de 36 h ouvrées aurait déclaré ce même agent inactif :
  assert.ok(ACT.ouvreesHours(Date.parse('2026-11-20T16:25:00Z'), WED) > ACT.STALE_H);
});
test('routine hebdomadaire réellement silencieuse : inactive au-delà de son propre seuil', () => {
  const d = D({ now: Date.parse('2026-12-02T14:30:00Z'), agents: [runsDoc([run('Phénix · Contrôle qualité', '0 10 * * 5', { at: '2026-11-13T10:00:00Z', statut: 'SUCCEEDED' })], '2026-12-02T14:20:00Z')] });
  const r = row(d, 'Phénix · Contrôle qualité'); assert.match(r.inactif, /inactif depuis 13\/11 10:00 \(seuil 7 j\)/); assert.equal(r.etat, 'absent'); // le passage du 27/11 manque aussi
});
test('passage attendu et absent : rouge, avec l\'heure attendue ; la tolérance de 30 min est respectée', () => {
  const photo = (dernier) => D({ agents: [runsDoc([run('Phénix · Terrain et PO', '0 9 * * 3', dernier)])] });
  const abs = row(photo({ at: '2026-11-18T09:03:00Z', statut: 'SUCCEEDED' }), 'Phénix · Terrain et PO');
  assert.equal(abs.etat, 'absent'); assert.match(abs.absent, /attendu à 25\/11 09:00, dernier passage connu 18\/11 09:03/);
  assert.equal(row(photo({ at: '2026-11-25T09:04:00Z', statut: 'SUCCEEDED' }), 'Phénix · Terrain et PO').etat, 'ok');
  assert.equal(row(photo({ at: '2026-11-25T08:55:00Z', statut: 'SUCCEEDED' }), 'Phénix · Terrain et PO').etat, 'ok'); // commencé 5 min avant
  // la photo date de 08:40 : le passage de 09:00 n'est pas encore attendu, pas de faux rouge
  const tot = D({ agents: [runsDoc([run('Phénix · Terrain et PO', '0 9 * * 3', { at: '2026-11-18T09:03:00Z', statut: 'SUCCEEDED' })], '2026-11-25T08:40:00Z')] });
  assert.notEqual(row(tot, 'Phénix · Terrain et PO').etat, 'absent');
  const jamais = row(photo(null), 'Phénix · Terrain et PO'); assert.equal(jamais.etat, 'attente'); assert.equal(jamais.absent, null); assert.match(jamais.notes.join(), /aucun passage connu/); // pas de faux rouge sur une routine neuve
  const off = row(D({ agents: [runsDoc([run('Phénix · Terrain et PO', '0 9 * * 3', null, { enabled: false })])] }), 'Phénix · Terrain et PO'); assert.equal(off.etat, 'desactivee'); assert.equal(off.absent, null);
  const wk = D({ now: Date.parse('2026-11-28T14:30:00Z'), agents: [runsDoc([run('Phénix · Coach plan du jour', '0 8 * * 1-5', { at: '2026-11-27T08:05:00Z', statut: 'SUCCEEDED' })], '2026-11-28T14:20:00Z')] });
  assert.equal(row(wk, 'Phénix · Coach plan du jour').etat, 'ok'); // samedi : rien n'est attendu
});
test('routine en échec : rouge avec le statut brut, listée dans « À faire par toi »', () => {
  const d = D({ agents: [runsDoc([run('Phénix · Formateur', '30 8 * * 1,3', { at: '2026-11-25T08:41:00Z', statut: 'FAILED' }), run('Phénix · Veille et Coach', '5 12,15 * * 1-5', { at: '2026-11-25T12:06:00Z', statut: 'SUCCEEDED' })])] });
  const f = row(d, 'Phénix · Formateur'); assert.equal(f.etat, 'echec'); assert.equal(f.statutBrut, 'FAILED');
  assert.equal(row(d, 'Phénix · Veille et Coach').etat, 'ok');
  assert.ok(d.afaire.some((a) => a.kind === 'observer' && /Formateur.*FAILED/.test(a.texte) && a.source === 'agents/runs'));
});
test('étiquettes et sessions de développement : jamais affichées comme agents', () => {
  const ag = [
    { id: 'j1', data: { type: 'journal', at: '2026-11-25T10:00:00Z', agent: 'Équipe', quoi: 'x' } },
    { id: 'j2', data: { type: 'journal', at: '2026-11-25T10:01:00Z', agent: 'Principal', quoi: 'x' } },
    { id: 'j3', data: { type: 'journal', at: '2026-11-25T10:02:00Z', agent: 'Agent principal', quoi: 'x' } },
    { id: 'j4', data: { type: 'journal', at: '2026-11-25T10:03:00Z', agent: 'Développeur US-14', quoi: 'x' } },
    { id: 'j5', data: { type: 'journal', at: '2026-11-25T10:04:00Z', agent: 'Développeur US-6', quoi: 'x' } },
    { id: 'j6', data: { type: 'journal', at: '2026-11-25T10:05:00Z', agent: '—', quoi: 'x' } }];
  const d = D({ agents: ag });
  const noms = d.routines.map((r) => r.nom);
  for (const n of ['Équipe', 'Principal', 'Agent principal', 'Développeur US-14', 'Développeur US-6', 'Agent non indiqué', '—']) assert.ok(!noms.includes(n), n);
  assert.ok(d.ecartes.some((e) => e.nom === 'Développeur US-14' && /session de développement/.test(e.motif)));
  assert.ok(d.ecartes.some((e) => e.nom === 'Équipe' && /étiquette/.test(e.motif)));
  // même si la photo contient un tel nom, il n'est pas une ligne
  assert.ok(!D({ agents: [runsDoc([run('Développeur US-9', '0 9 * * 1', null)])] }).routines.some((r) => r.nom === 'Développeur US-9'));
  assert.ok(noms.includes('Développeurs')); // la vraie routine Développeurs reste
});
test('anomalie « champ agent manquant » : plus masquée, rattachée à la Veille et Coach si l\'id contient coach-veille', () => {
  const ag = [{ id: 'jr-20261125-1114-coach-veille', data: { type: 'journal', at: '2026-11-25T11:14:00Z', contenu: 'Veille 11h : rien de nouveau' } },
    { id: 'jr-orphelin', data: { type: 'journal', at: '2026-11-25T11:30:00Z', quoi: 'passage sans agent' } }];
  const d = D({ agents: ag });
  const v = row(d, 'Veille et Coach'); assert.match(v.quoi, /Veille 11h/); assert.equal(v.quoiSrc, 'agents/jr-20261125-1114-coach-veille');
  const causes = d.anomalies.map((a) => a.where + ' ' + a.cause).join('\n');
  assert.match(causes, /coach-veille.*rattaché à « Veille et Coach »/); assert.match(causes, /jr-orphelin champ agent manquant/);
  assert.equal(d.sansAgent.length, 1); assert.equal(d.sansAgent[0].id, 'jr-orphelin'); assert.match(d.sansAgent[0].quoi, /passage sans agent/);
  const doc = fakeDoc(), mount = doc.createElement('div'); VIEW.renderDirect(doc, mount, d, { sources: [], fiches: FICHES.fiches });
  assert.match(mount.textContent, /1 passage sans champ agent/);
});
test('tâches locales : « non lisible » ; routine absente de la photo signalée comme telle', () => {
  const d = D({ agents: [runsDoc([run('Phénix · Veille et Coach', '5 12,15 * * 1-5', { at: '2026-11-25T12:06:00Z', statut: 'SUCCEEDED' })])] });
  for (const n of ['Observateur (Mac)', 'US-14 Profil (Mac)', 'Contrôle des coûts (Mac)']) { const r = row(d, n); assert.equal(r.etat, 'non-lisible', n); assert.equal(r.local, true); }
  assert.equal(row(d, 'Rapport mensuel').etat, 'absente-photo');
});
test('photo ancienne : signalée (la Veille n\'a pas écrit depuis)', () => {
  const d = D({ agents: [runsDoc([], '2026-11-23T08:00:00Z')] });
  assert.equal(d.photo.stale, true); assert.ok(d.afaire.some((a) => /Photo des routines ancienne/.test(a.texte)));
  assert.equal(D({ agents: [runsDoc([], '2026-11-25T12:10:00Z')] }).photo.stale, false);
});
test('« À faire par toi » : US à valider, périmés, prompts, passages à observer, chacun avec sa source', () => {
  const ag = [
    { id: 'story-us-4', data: { type: 'story', statut: 'encours', ref: 'US-4', titre: 'Conseil', progres: { at: '2026-11-23T17:10:00Z', a_valider: true, etapes: [{ t: 'a', fait: true }] } } },
    { id: 'story-us-6', data: { type: 'story', statut: 'encours', ref: 'US-6', titre: 'Autre', progres: { at: '2026-11-24T14:20:00Z', etapes: [{ t: 'a', fait: false }] } } },
    { id: 'prompt-veille-v2', data: { type: 'prompt', statut: 'a_coller', titre: 'Veille v2', pour: 'Veille et Coach' } },
    { id: 'prompt-deja', data: { type: 'prompt', statut: 'colle', titre: 'Déjà collé' } },
    runsDoc([run('Phénix · Formateur', '30 8 * * 1,3', { at: '2026-11-25T08:41:00Z', statut: 'FAILED' })])];
  const jour = { id: '2026-11-25', data: { perimes: ['r-1 : à supprimer', { id: 'r-2', objet: 'RE: sujet', raison: 'envoyé par Issam' }, { id: 'r-3' }] } };
  const d = D({ agents: ag, jour });
  const byKind = (k) => d.afaire.filter((a) => a.kind === k);
  assert.equal(byKind('valider').length, 1); assert.match(byKind('valider')[0].texte, /US-4 « Conseil » : à valider/); assert.equal(byKind('valider')[0].source, 'agents/story-us-4 (progres)');
  assert.equal(byKind('perime').length, 2); assert.ok(byKind('perime').every((a) => a.source === 'jour/2026-11-25.perimes'));
  assert.match(byKind('perime')[1].texte, /RE: sujet : envoyé par Issam/);
  assert.equal(byKind('prompt').length, 1); assert.equal(byKind('prompt')[0].source, 'agents/prompt-veille-v2');
  assert.equal(byKind('observer').length, 1);
  assert.ok(d.afaire.every((a) => a.source), 'chaque ligne porte sa source');
  assert.ok(d.anomalies.some((a) => /jour\/2026-11-25\.perimes élément sans libellé/.test(a.where + ' ' + a.cause)));
  assert.deepEqual(d.afaire.map((a) => a.kind), ['valider', 'perime', 'perime', 'prompt', 'observer']); // l'ordre : valider, décider, coller, observer
});
test('« À faire par toi » vide ou jour absent : dit pourquoi, sans inventer', () => {
  const d = D({ agents: [] }); assert.equal(d.afaire.length, 0); assert.equal(d.jourLu, false);
  const doc = fakeDoc(), mount = doc.createElement('div'); VIEW.renderDirect(doc, mount, d, { sources: [], fiches: FICHES.fiches });
  assert.match(mount.textContent, /Rien à faire/); assert.match(mount.textContent, /jour\/2026-11-25 non lu ou absent/);
  assert.equal(D({ agents: [], jour: { id: '2026-11-25', data: 'x' } }).jourLu, false);
});
test('fiches : chaque routine Phénix a une fiche complète ; clic = fiche (lit, produit, garde-fou, modèle) sans innerHTML', () => {
  const noms = ['Coach plan du jour', 'Veille et Coach', 'Terrain et PO', 'Formateur', 'Contrôle qualité', 'Observateur et Profil', 'Bilan hebdomadaire', 'Recherche d\'emploi', 'Développeurs', 'Rapport mensuel'];
  for (const n of noms) { const f = FICHES.fiches.find((x) => x.nom === n); assert.ok(f, n); for (const k of ['lit', 'produit', 'garde_fou', 'source']) assert.ok(typeof f[k] === 'string' && f[k].length > 3, n + ' ' + k); }
  assert.ok(!/(sk-|api[_-]?key|password|secret)/i.test(JSON.stringify(FICHES)), 'aucun secret dans les fiches');
  const d = D({ agents: [runsDoc([run('Phénix · Terrain et PO', '0 9 * * 3', { at: '2026-11-25T09:03:00Z', statut: 'SUCCEEDED' }, { modele: 'claude-sonnet-5-5' })])] });
  const doc = fakeDoc(), mount = doc.createElement('div'); VIEW.renderDirect(doc, mount, d, { sources: [], fiches: FICHES.fiches });
  const find = (n, f) => (f(n) ? [n] : []).concat(...n.children.map((c) => find(c, f)));
  const fiche = find(mount, (n) => n.tag === 'tr' && n.className === 'ac-fiche' && /Terrain et PO|Patterns terrain/.test(n.textContent))[0];
  assert.equal(fiche.hidden, true); assert.match(fiche.textContent, /garde-fou/i); assert.match(fiche.textContent, /claude-sonnet-5-5/); assert.match(fiche.textContent, /Patterns terrain/);
  const btn = find(mount, (n) => n.tag === 'button' && n.textContent === 'Phénix · Terrain et PO')[0];
  btn.listeners.click(); assert.equal(fiche.hidden, false); assert.equal(btn.attrs['aria-expanded'], 'true');
  btn.listeners.click(); assert.equal(fiche.hidden, true);
});
test('rendu : valeurs hostiles en texte, jamais de HTML ; état ouvert d\'une fiche conservé au rafraîchissement', () => {
  const d = D({ agents: [runsDoc([run('<img src=x onerror=alert(1)>', '0 9 * * 3', { at: '2026-11-25T09:03:00Z', statut: '<b>OK</b>' })]), { id: 'story-us-9', data: { type: 'story', statut: 'encours', ref: 'US-9', titre: '<script>alert(1)</script>', progres: { a_valider: true, etapes: [{ t: 'a', fait: true }] } } }] });
  const doc = fakeDoc(), mount = doc.createElement('div'); VIEW.renderDirect(doc, mount, d, { sources: [], fiches: FICHES.fiches });
  assert.match(mount.textContent, /<img src=x/); assert.match(mount.textContent, /<script>alert\(1\)/);
  const d2 = D({ agents: [runsDoc([run('Phénix · Formateur', '30 8 * * 1,3', { at: '2026-11-25T08:41:00Z', statut: 'SUCCEEDED' })])] });
  const m2 = doc.createElement('div'); VIEW.renderDirect(doc, m2, d2, { sources: [], fiches: FICHES.fiches, open: { formateur: true } });
  const find = (n, f) => (f(n) ? [n] : []).concat(...n.children.map((c) => find(c, f)));
  assert.equal(find(m2, (n) => n.className === 'ac-fiche' && /Deux capsules/.test(n.textContent))[0].hidden, false);
});
test('rattachement aux fiches : mots entiers, « po » ne capte pas « rapport »', () => {
  const f = (n) => (ACT.ficheFor(FICHES.fiches, n) || {}).id;
  assert.equal(f('Phénix · Terrain et PO'), 'terrain-po'); assert.equal(f('Rapport mensuel'), 'rapport-mensuel'); assert.equal(f('Phénix · Veille et Coach'), 'veille-coach');
  assert.equal(f('Coach plan du jour'), 'coach-plan'); assert.equal(f('Job search · Recherche d\'emploi'), 'recherche-emploi'); assert.equal(f('Équipe'), undefined);
});
test('build-page : si une ancre manque, le script refuse et n\'écrit rien', async () => {
  const { execFileSync } = await import('node:child_process'); const { mkdtempSync, writeFileSync, mkdirSync } = await import('node:fs'); const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'us18-')), here = new URL('.', import.meta.url).pathname;
  // page publiée factice : mêmes ancres que la vraie page, assez pour exécuter le câblage
  const base = '<style>x</style><style id="us6-css">old</style>\n<section id="viewL" role="tabpanel" hidden>old</section>\n  <section id="viewS" role="tabpanel"></section><script id="us6-core">old</script>\n<script id="us6-view">old</script>\n<script>\n(function(){\n  const $=id=>document.getElementById(id);const pad=n=>(n<10?"0":"")+n;let jour=null;const logUsage=()=>{},toast=()=>{};\n  /* ---------- US-6 : onglet Activité old */\n  old();\n  /* ---------- US-15 : bloc « Plan du jour » */\n  jour=null;renderActivite();\n  db.x=1; jour=d?Object.assign({date:d.id},d.data()||{}):null;renderJ();renderConseil()}\n})();\n</script>';
  writeFileSync(join(dir, 'pub.html'), base);
  let r; try { execFileSync('node', [here + 'build-page.mjs', join(dir, 'pub.html'), join(dir, 'out.html')], { stdio: 'pipe' }); r = 'ok'; } catch (e) { r = String(e.stderr); }
  assert.match(r, /ok|ancre/); // la page factice n'a pas toutes les ancres : le script doit refuser net, jamais écrire à moitié
  if (r !== 'ok') assert.ok(!(() => { try { readFileSync(join(dir, 'out.html')); return true; } catch (e) { return false; } })(), 'rien n\'est écrit si une ancre manque');
});
test('format réel écrit par la Veille (25/11 15h13) : fuseau en suffixe, jamais lancé, en cours, désactivée, photo partielle', () => {
  assert.equal(ACT.parseCron('0 15 * * * (Africa/Casablanca)').ok, true);
  assert.equal(ACT.parseCron('0 15 * * * (Europe/Paris)').ok, false);
  const r = (nom, cron, at, statut, extra = {}) => ({ id: 't', nom, cron: cron + ' (Africa/Casablanca)', enabled: true, modele: 'm', dernier: { at, statut }, ...extra });
  const d = D({ now: Date.parse('2026-11-25T15:20:00Z'), agents: [{ id: 'runs', data: { at: '2026-11-25T15:13:00Z', par: 'veille-coach', erreur: 'list_triggers : 3e page non lue', routines: [
    r('Phénix · Agent Veille et Coach 15h00', '0 15 * * *', '2026-11-25T15:09:32Z', 'en cours'),
    r('Phénix · Agent Veille et Coach 11h40', '40 11 * * *', null, 'jamais lancé'),
    r('Phénix · Matin (objectifs et brouillons, 8h00)', '0 8 * * 1-5', '2026-11-25T08:15:14Z', 'SUCCEEDED', { enabled: false, prochain: 'désactivée' }),
    r('Phénix · Point hebdomadaire SI (vendredi)', '20 14 * * 5', null, 'jamais lancé')] } }] });
  assert.equal(row(d, 'Phénix · Agent Veille et Coach 15h00').etat, 'encours');
  assert.match(row(d, 'Phénix · Agent Veille et Coach 15h00').seuilTxt, /déduit du cron/);
  assert.equal(row(d, 'Phénix · Agent Veille et Coach 11h40').etat, 'attente');
  assert.equal(row(d, 'Phénix · Matin (objectifs et brouillons, 8h00)').etat, 'desactivee');
  assert.equal(row(d, 'Phénix · Matin (objectifs et brouillons, 8h00)').prochain, null);
  assert.equal(row(d, 'Phénix · Point hebdomadaire SI (vendredi)').fiche, 'bilan-hebdo');
  assert.equal(d.anomalies.length, 0);
  assert.match(row(d, 'Formateur').notes.join(), /photo partielle/);
  assert.ok(d.afaire.some((a) => /incomplète/.test(a.texte) && a.source === 'agents/runs.erreur'));
});
test('journal au format réel de la Veille (date + heure, titre) : lu, avec anomalie douce', () => {
  const d = D({ agents: [{ id: 'jr-20261125-1513-veille-coach', data: { type: 'journal', agent: 'Veille et Coach', date: '2026-11-25', heure: '15:13', titre: 'ZZ-TEST passage 15h05', texte: 'détail' } }] });
  assert.match(row(d, 'Veille et Coach').quoi, /ZZ-TEST passage 15h05/); assert.match(d.anomalies[0].cause, /champ at absent/); assert.equal(d.anomalies[0].soft, true);
});

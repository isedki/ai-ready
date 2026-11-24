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

// ---- rendu avec un DOM minimal : données vides, mal formées, réelles, valeurs hostiles ----
const VIEW = createRequire(import.meta.url)('./activite-view.js');
function fakeDoc() {
  const mk = (tag) => ({ tag, className: '', children: [], attrs: {}, listeners: {}, _t: '', set textContent(v) { this._t = String(v); this.children = []; }, get textContent() { return this._t + this.children.map((c) => c.textContent).join(''); }, appendChild(c) { this.children.push(c); return c; }, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(e, f) { this.listeners[e] = f; }, set innerHTML(v) { throw new Error('innerHTML interdit'); } });
  return { createElement: mk, createTextNode: (t) => ({ textContent: String(t), children: [] }) };
}
const ctx = { sources: [{ coll: 'agents', ok: true, n: 3, at: '15:00:00' }, { coll: 'livrables', ok: false, err: 'permission-denied' }], drive: null, typeLabel: ACT.TYPE_LABEL, onIndex() {} };
const count = (n, f) => (f(n) ? 1 : 0) + n.children.reduce((s, c) => s + count(c, f), 0);
test('rendu : vide, anomalies, erreur de lecture en clair, aucune exception', () => {
  const d = fakeDoc(), mount = d.createElement('div');
  VIEW.renderActivite(d, mount, M({ agents: [], livrables: [] }), ctx);
  assert.match(mount.textContent, /livrables : lecture en échec \(permission-denied\)/); assert.match(mount.textContent, /Aucun agent à afficher/); assert.match(mount.textContent, /Aucune histoire/);
  VIEW.renderActivite(d, mount, M({ agents: [{ id: 'x', data: 7 }], livrables: [{ id: 'y', data: { agent: 'A' } }] }), ctx);
  assert.match(mount.textContent, /2 anomalies/); assert.match(mount.textContent, /livrables\/y : champ type|livrables\/y : type inconnu/);
});
test('rendu : valeurs hostiles passent en texte, lien non https jamais cliquable', () => {
  const d = fakeDoc(), mount = d.createElement('div');
  const liv = [good('h', { titre: '<img src=x onerror=alert(1)>', url: 'javascript:alert(1)' }), good('h2', { titre: 'ok', url: 'https://claude.ai/artifact/abc' })];
  VIEW.renderActivite(d, mount, M({ livrables: liv }), ctx);
  assert.match(mount.textContent, /<img src=x/); // affiché comme texte
  const liens = count(mount, (n) => n.tag === 'a'); assert.equal(liens, 1);
  assert.match(mount.textContent, /lien cassé/);
});
test('rendu : jeu de données réaliste (agent inactif, battement sans fin, histoire à valider)', () => {
  const d = fakeDoc(), mount = d.createElement('div');
  const agents = [
    { id: 'ag-coach', data: { type: 'agent', nom: 'Coach', quand: 'à chaque veille', dernier: '2026-11-24T12:20:00Z', focus: 'F' } },
    { id: 'ag-dev', data: { type: 'agent', nom: 'Développeurs', dernier: '' } },
    { id: 'jr1', data: { type: 'journal', at: '2026-11-18T10:00:00Z', agent: 'Terrain', quoi: 'ancien' } },
    { id: 'hb1', data: { type: 'journal', at: '2026-11-24T09:00:00Z', agent: 'Coach', phase: 'debut', etape: 'lecture Gmail' } },
    { id: 'story-us-4', data: { type: 'story', statut: 'encours', ref: 'US-4', titre: 'Conseil', progres: { at: '2026-11-23T17:10:00Z', a_valider: true, etapes: [{ t: 'a', fait: true }] } } }];
  VIEW.renderActivite(d, mount, M({ agents, livrables: [good('l1')] }), ctx);
  const t = mount.textContent;
  assert.match(t, /inactif depuis 18\/11 10:00/); assert.match(t, /aucun passage enregistré/); assert.match(t, /aucun battement « fin » depuis le début de 24\/11 09:00/);
  assert.match(t, /à valider par Issam/); assert.match(t, /Coach/); assert.match(t, /source : agents\/ag-coach/);
});
test('rendu : sélecteurs peuplés, valeur absente retombe sur le premier choix', () => {
  const d = fakeDoc(), sel = d.createElement('select');
  VIEW.fillOptions(d, sel, [['', 'Tous'], ['Coach', 'Coach']], 'Fantôme'); assert.equal(sel.value, '');
  VIEW.fillOptions(d, sel, [['', 'Tous'], ['Coach', 'Coach']], 'Coach'); assert.equal(sel.value, 'Coach');
});

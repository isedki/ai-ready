/* US-6 : logique pure de l'onglet Activité et de l'index Drive.
   Aucune dépendance, aucun DOM : le même fichier tourne dans la page (global ACT) et dans Node (tests, script d'index).
   Règle de fond : rien n'est déduit. Une donnée absente ou invalide devient « — » et une anomalie nommée (document + cause). */
(function (root) {
  'use strict';
  var TYPES = ['artefact', 'brouillon', 'message', 'fichier', 'session', 'kpi', 'frictions', 'ecarts'];
  var TYPE_LABEL = { artefact: 'Artefacts publiés', brouillon: 'Brouillons Gmail', message: 'Messages entre agents', fichier: 'Fichiers', session: 'Sessions de développement', kpi: 'KPI', frictions: 'Frictions', ecarts: 'Écarts brouillon / envoyé' };
  var PHASES = ['debut', 'etape', 'fin'];
  var STALE_H = 36;      // heures ouvrées (hors samedi et dimanche, UTC) au-delà desquelles une donnée est « inactive »
  var OPEN_H = 3;        // heures sans battement « fin » après un « début » ou une « étape »
  var UNKNOWN_AGENT = '—';

  function isStr(x) { return typeof x === 'string' && x.trim() !== ''; }
  function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
  function cut(s, n) { s = String(s); n = n || 60; return s.length > n ? s.slice(0, n) + '…' : s; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function nkey(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }

  /* Date stricte. Retourne {ok, ms, day, hm|null} ou {ok:false, why}. Les heures sont lues en UTC, comme le reste de la page. */
  function parseWhen(v) {
    if (!isStr(v)) return { ok: false, why: 'valeur absente' };
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(v.trim());
    if (!m) return { ok: false, why: 'format de date non reconnu : « ' + cut(v, 40) + ' »' };
    var y = +m[1], mo = +m[2], d = +m[3], h = m[4] ? +m[4] : 0, mi = m[5] ? +m[5] : 0, s = m[6] ? +m[6] : 0;
    var t = Date.UTC(y, mo - 1, d, h, mi, s), dt = new Date(t);
    if (h > 23 || mi > 59 || s > 59 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return { ok: false, why: 'date impossible : « ' + cut(v, 40) + ' »' };
    var off = 0;
    if (m[7] && m[7] !== 'Z') { var o = /([+-])(\d{2}):?(\d{2})/.exec(m[7]); off = (o[1] === '-' ? -1 : 1) * (+o[2] * 60 + +o[3]) * 60000; }
    var ms = t - off, iso = new Date(ms).toISOString();
    return { ok: true, ms: ms, day: iso.slice(0, 10), hm: m[4] ? iso.slice(11, 16) : null };
  }
  /* Le champ dernier des agents peut contenir « 2026-11-23T15:45:00Z : texte » ou « 2026-11-22 : texte » : on lit la date écrite, jamais plus.
     Une date sans heure vaut la fin de ce jour (pour ne jamais déclarer inactif à tort) et s'affiche « (heure —) ». */
  function parseDernier(v) {
    var p = parseWhen(v);
    if (!p.ok && isStr(v)) { var m = /^(\S+)\s+:\s/.exec(v.trim()); if (m) p = parseWhen(m[1]); }
    if (!p.ok) return p;
    if (p.hm === null) p = { ok: true, ms: p.ms + 86399000, day: p.day, hm: null };
    return p;
  }
  function lab(p) { return p.hm === null ? p.day.slice(8, 10) + '/' + p.day.slice(5, 7) + ' (heure —)' : fmtDM(p.ms); }
  function dayOnly(v) { var p = parseWhen(v); return p.ok && p.hm === null ? p : { ok: false, why: p.ok ? 'jour attendu au format AAAA-MM-JJ, reçu « ' + cut(v, 40) + ' »' : p.why }; }

  /* Heures ouvrées écoulées entre deux instants : le temps passé un samedi ou un dimanche (UTC) ne compte pas. */
  function ouvreesHours(fromMs, toMs) {
    if (!(toMs > fromMs)) return 0;
    var total = 0, t = fromMs;
    while (t < toMs) {
      var d = new Date(t), nextDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
      var end = Math.min(nextDay, toMs), wd = d.getUTCDay();
      if (wd !== 0 && wd !== 6) total += (end - t) / 3600000;
      t = end;
    }
    return total;
  }
  function fmtDM(ms) { var iso = new Date(ms).toISOString(); return iso.slice(8, 10) + '/' + iso.slice(5, 7) + ' ' + iso.slice(11, 16); }
  function fmtAge(fromMs, nowMs) {
    var mn = Math.max(0, Math.round((nowMs - fromMs) / 60000));
    if (mn < 60) return 'il y a ' + mn + ' min';
    var h = Math.floor(mn / 60);
    if (h < 48) return 'il y a ' + h + ' h ' + pad(mn % 60);
    return 'il y a ' + Math.floor(h / 24) + ' j ' + (h % 24) + ' h';
  }
  var IPV4 = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g, MAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  function sanitize(s) { return String(s == null ? '' : s).replace(MAIL, '(adresse mail)').replace(IPV4, '(adresse interne)'); }
  function httpsUrl(u) {
    if (!isStr(u) || !/^https:\/\//i.test(u.trim())) return false;
    try { if (typeof URL === 'function') { var x = new URL(u.trim()); return !!x.hostname && x.hostname.indexOf('.') > 0; } } catch (e) { return false; }
    return /^https:\/\/[^\s/]+\.[^\s/]+/i.test(u.trim());
  }

  /* ---- documents de la collection livrables ---- */
  function normLivrable(id, raw) {
    var soft = [];
    if (!isObj(raw)) return { ok: false, id: id, cause: 'document mal formé (ce n\'est pas un objet)' };
    if (!isStr(raw.agent)) return { ok: false, id: id, cause: 'champ agent manquant' };
    if (!isStr(raw.type) || TYPES.indexOf(raw.type) < 0) return { ok: false, id: id, cause: 'type inconnu ou absent : « ' + cut(raw.type == null ? '' : raw.type, 30) + ' » (attendu : ' + TYPES.join(', ') + ')' };
    if (!isStr(raw.titre)) return { ok: false, id: id, cause: 'champ titre manquant' };
    var j = dayOnly(raw.jour);
    if (!j.ok) return { ok: false, id: id, cause: 'champ jour invalide : ' + j.why };
    var h = null;
    if (raw.heure !== undefined && raw.heure !== null && raw.heure !== '') {
      var ph = parseWhen(raw.heure);
      if (!ph.ok || ph.hm === null) soft.push('heure invalide (« ' + cut(raw.heure, 40) + ' ») : affichée « — »');
      else { h = ph; if (ph.day !== j.day) soft.push('jour ' + j.day + ' différent de la date de l\'heure ' + ph.day); }
    }
    var lien = null, lienCasse = false;
    if (raw.url !== undefined && raw.url !== null && raw.url !== '') {
      if (httpsUrl(raw.url)) lien = raw.url.trim(); else { lienCasse = true; soft.push('lien cassé ou non https : « ' + cut(raw.url, 50) + ' »'); }
    }
    if (!isStr(raw.source)) soft.push('source manquante : affichée « — »');
    return { ok: true, soft: soft, item: { id: id, agent: raw.agent.trim(), type: raw.type, titre: raw.titre.trim(), jour: j.day, heure: h, url: lien, lienCasse: lienCasse, fil: isStr(raw.fil) ? raw.fil.trim() : null, histoire: isStr(raw.histoire) ? raw.histoire.trim() : null, branche: isStr(raw.branche) ? raw.branche.trim() : null, detail: isStr(raw.detail) ? raw.detail.trim() : null, source: isStr(raw.source) ? raw.source.trim() : null } };
  }

  /* ---- journal : entrées type « journal » de la collection agents (rg-24 §3 + battement rg-40) ---- */
  function normJournal(id, raw) {
    var soft = [];
    if (!isObj(raw)) return { ok: false, id: id, cause: 'document mal formé (ce n\'est pas un objet)' };
    var p = parseWhen(raw.at);
    if (!p.ok || p.hm === null) return { ok: false, id: id, cause: 'champ at invalide : ' + (p.ok ? 'heure absente' : p.why) };
    if (!isStr(raw.agent)) return { ok: false, id: id, cause: 'champ agent manquant' };
    var phase = null;
    if (raw.phase !== undefined && raw.phase !== null && raw.phase !== '') { if (PHASES.indexOf(raw.phase) >= 0) phase = raw.phase; else soft.push('phase inconnue « ' + cut(raw.phase, 20) + ' » (attendu : debut, etape, fin) : ignorée'); }
    if (!isStr(raw.quoi) && !isStr(raw.etape)) soft.push('ni « quoi » ni « etape » : affiché « — »');
    return { ok: true, soft: soft, item: { id: id, agent: raw.agent.trim(), at: p, quoi: isStr(raw.quoi) ? raw.quoi.trim() : null, etape: isStr(raw.etape) ? raw.etape.trim() : null, phase: phase, source: isStr(raw.source) ? raw.source.trim() : null } };
  }

  function normStory(id, raw) {
    var soft = [], prog = null;
    if (raw.progres !== undefined && raw.progres !== null) {
      var pr = raw.progres;
      if (!isObj(pr) || !Array.isArray(pr.etapes)) soft.push('progres mal formé (etapes absent ou pas une liste) : étape affichée « — »');
      else {
        var at = pr.at ? parseWhen(pr.at) : { ok: false };
        if (pr.at && !at.ok) soft.push('progres.at invalide : ' + at.why);
        var en = null, nd = 0, n = 0;
        pr.etapes.forEach(function (e) { if (!isObj(e) || !isStr(e.t)) { soft.push('une étape de progres est mal formée'); return; } n++; if (e.fait) nd++; else if (!en) en = e.t; });
        prog = { at: at.ok ? at : null, en: en, nd: nd, n: n, aValider: pr.a_valider === true };
      }
    }
    return { id: id, ref: isStr(raw.ref) ? raw.ref : id, titre: isStr(raw.titre) ? raw.titre : null, statut: raw.statut, prog: prog, soft: soft };
  }

  /* ---- modèle de la vue ---- */
  /* in : {agents:[{id,...champs}], livrables:[{id,...champs}], now:ms, day:'AAAA-MM-JJ'|'', agent:''}
     Les documents qui ne sont pas des objets sont comptés en anomalie, jamais ignorés en silence. */
  function buildModel(inp) {
    var now = inp.now, anomalies = [], todayD = new Date(now).toISOString().slice(0, 10);
    var agentsIn = Array.isArray(inp.agents) ? inp.agents : [], livIn = Array.isArray(inp.livrables) ? inp.livrables : [];
    var team = [], journal = [], stories = [], by = {};
    function row(name) { var k = nkey(name); if (!by[k]) by[k] = { name: name, key: k, doc: null, journal: [], livrables: [] }; return by[k]; }
    function note(coll, id, cause, soft) { anomalies.push({ where: coll + '/' + id, cause: cause, soft: !!soft }); }

    agentsIn.forEach(function (d) {
      var id = d && d.id != null ? String(d.id) : '(sans id)', raw = d && d.data !== undefined ? d.data : d;
      if (!isObj(raw)) { note('agents', id, 'document mal formé (ce n\'est pas un objet)'); return; }
      if (raw.type === 'agent') {
        if (!isStr(raw.nom)) { note('agents', id, 'agent sans champ nom : ignoré'); return; }
        var dn = null;
        if (raw.dernier) { var pd = parseDernier(raw.dernier); if (pd.ok) dn = pd; else note('agents', id, 'champ dernier invalide : ' + pd.why + ' : ignoré', true); }
        team.push({ id: id, nom: raw.nom.trim(), quand: isStr(raw.quand) ? raw.quand : null, focus: isStr(raw.focus) ? raw.focus : null, dernier: dn });
      } else if (raw.type === 'journal') {
        var r = normJournal(id, raw);
        if (!r.ok) { note('agents', id, r.cause); return; }
        r.soft.forEach(function (c) { note('agents', id, c, true); });
        journal.push(r.item);
      } else if (raw.type === 'story' && (raw.statut === 'go' || raw.statut === 'encours')) {
        var s = normStory(id, raw); s.soft.forEach(function (c) { note('agents', id, c, true); }); stories.push(s);
      }
    });
    team.forEach(function (t) { row(t.nom).doc = t; });
    journal.forEach(function (j) { row(j.agent).journal.push(j); });

    var livOk = [], seen = {};
    livIn.forEach(function (d) {
      var id = d && d.id != null ? String(d.id) : '(sans id)', raw = d && d.data !== undefined ? d.data : d;
      var r = normLivrable(id, raw);
      if (!r.ok) { note('livrables', id, r.cause); return; }
      r.soft.forEach(function (c) { note('livrables', id, c, true); });
      var k = [nkey(r.item.agent), r.item.type, nkey(r.item.titre), r.item.jour].join('|');
      if (seen[k]) {
        var prev = seen[k], keepNew = (r.item.heure ? r.item.heure.ms : -1) > (prev.heure ? prev.heure.ms : -1);
        note('livrables', id, 'doublon de ' + (keepNew ? prev.id : id) + ' (même agent, type, titre et jour) : affiché une seule fois', true);
        if (keepNew) { livOk[livOk.indexOf(prev)] = r.item; r.item.doublons = (prev.doublons || 1) + 1; seen[k] = r.item; } else prev.doublons = (prev.doublons || 1) + 1;
        return;
      }
      seen[k] = r.item; livOk.push(r.item);
    });
    livOk.forEach(function (l) { row(l.agent).livrables.push(l); });

    var daysSet = {}; daysSet[todayD] = 1;
    livOk.forEach(function (l) { daysSet[l.jour] = 1; });
    journal.forEach(function (j) { daysSet[j.at.day] = 1; });
    var days = Object.keys(daysSet).sort().reverse();
    var day = inp.day && daysSet[inp.day] ? inp.day : todayD;

    var rows = Object.keys(by).map(function (k) {
      var a = by[k], best = null, src = null, quoi = null;
      a.journal.forEach(function (j) { if (!best || j.at.ms > best.ms) { best = j.at; src = 'agents/' + j.id; quoi = j.quoi || j.etape || null; } });
      if (a.doc && a.doc.dernier && (!best || a.doc.dernier.ms > best.ms)) { best = a.doc.dernier; best.label = lab(best); src = 'agents/' + a.doc.id + ' (champ dernier)'; quoi = a.doc.focus ? 'focus : ' + a.doc.focus : null; }
      var out = { name: a.name === UNKNOWN_AGENT ? 'Agent non indiqué' : a.name, raw: a.name, key: a.key, docId: a.doc ? a.doc.id : null, quand: a.doc ? a.doc.quand : null, pass: null, inactif: null, hb: null, hbOuvert: null, livrables: [], livrablesTous: a.livrables.length };
      if (best) {
        var oh = ouvreesHours(best.ms, now);
        out.pass = { ms: best.ms, label: best.label || lab(best), age: fmtAge(best.ms, now), quoi: quoi, source: src, futur: best.ms > now + 300000 };
        if (out.pass.futur) note('agents', src.replace(/^agents\//, ''), 'heure dans le futur (' + out.pass.label + ') : âge affiché à 0', true);
        if (oh > STALE_H) out.inactif = 'inactif depuis ' + (best.label || lab(best));
      } else out.inactif = 'aucun passage enregistré (—)';
      var hbs = a.journal.filter(function (j) { return j.phase; }).sort(function (x, y) { return y.at.ms - x.at.ms; });
      if (hbs.length) {
        var h0 = hbs[0]; out.hb = { phase: h0.phase, etape: h0.etape || h0.quoi || null, label: fmtDM(h0.at.ms), age: fmtAge(h0.at.ms, now), source: 'agents/' + h0.id };
        if (h0.phase !== 'fin' && ouvreesHours(h0.at.ms, now) > OPEN_H) out.hbOuvert = 'aucun battement « fin » depuis le ' + (h0.phase === 'debut' ? 'début' : 'dernier battement') + ' de ' + fmtDM(h0.at.ms);
      }
      out.livrables = a.livrables.filter(function (l) { return l.jour === day; }).sort(function (x, y) { return (x.heure ? x.heure.ms : Infinity) - (y.heure ? y.heure.ms : Infinity) || x.titre.localeCompare(y.titre); });
      return out;
    }).sort(function (x, y) { return x.name.localeCompare(y.name, 'fr'); });
    if (inp.agent) rows = rows.filter(function (r) { return r.key === nkey(inp.agent); });

    var st = stories.map(function (s) {
      var o = { ref: s.ref, titre: s.titre, statut: s.statut, etape: s.prog && s.prog.en ? s.prog.en : (s.prog && s.prog.n && s.prog.nd === s.prog.n ? 'toutes les étapes sont cochées' : null), compte: s.prog && s.prog.n ? s.prog.nd + ' sur ' + s.prog.n : null, at: s.prog && s.prog.at ? { label: fmtDM(s.prog.at.ms), age: fmtAge(s.prog.at.ms, now) } : null, aValider: !!(s.prog && s.prog.aValider), inactif: null, source: 'agents/' + s.id + ' (progres)' };
      if (s.statut === 'encours' && !o.aValider) { if (!s.prog || !s.prog.at) o.inactif = 'aucun passage enregistré (—)'; else if (ouvreesHours(s.prog.at.ms, now) > STALE_H) o.inactif = 'inactif depuis ' + fmtDM(s.prog.at.ms); }
      return o;
    }).sort(function (a, b) { return String(a.ref).localeCompare(String(b.ref), 'fr', { numeric: true }); });

    return { today: todayD, day: day, days: days, agents: rows, stories: st, anomalies: anomalies, agentNames: Object.keys(by).map(function (k) { return by[k].name; }).sort(), nLivrablesJour: livOk.filter(function (l) { return l.jour === day; }).length, nLivrables: livOk.length, nJournal: journal.length };
  }

  /* ---- index.md du jour (déterministe : aucune heure de génération, donc deux exécutions sur les mêmes données donnent le même fichier) ---- */
  function esc(s) { return sanitize(s).replace(/\s+/g, ' ').replace(/([\[\]|])/g, '\\$1').trim(); }
  function buildIndex(inp) {
    var day = inp.day, dd = dayOnly(day);
    if (!dd.ok) throw new Error('jour invalide pour l\'index : ' + dd.why);
    var m = buildModel({ agents: inp.agents, livrables: inp.livrables, now: Date.parse(day + 'T23:59:59Z'), day: day });
    var jr = (Array.isArray(inp.agents) ? inp.agents : []).map(function (d) { return d && d.id != null ? normJournal(String(d.id), d.data !== undefined ? d.data : d) : { ok: false }; }).filter(function (r) { return r.ok && r.item.at.day === day; }).map(function (r) { return r.item; });
    var lines = [], last = 0;
    var all = []; m.agents.forEach(function (a) { a.livrables.forEach(function (l) { all.push([a, l]); if (l.heure && l.heure.ms > last) last = l.heure.ms; }); });
    jr.forEach(function (j) { if (j.at.ms > last) last = j.at.ms; });
    lines.push('# Livrables des agents · ' + day);
    lines.push('');
    lines.push('Sources : collection `livrables` du suivi Phénix (' + all.length + ' livrable' + (all.length > 1 ? 's' : '') + ' ce jour) et journal de la collection `agents` (' + jr.length + ' entrée' + (jr.length > 1 ? 's' : '') + ').');
    lines.push('Dernière écriture lue pour ce jour : ' + (last ? fmtDM(last) + ' UTC' : '—') + '. Heures en UTC, telles qu\'écrites. « — » = inconnu, jamais deviné.');
    var names = {}; all.forEach(function (p) { names[p[0].name] = 1; }); jr.forEach(function (j) { names[j.agent === UNKNOWN_AGENT ? 'Agent non indiqué' : j.agent] = 1; });
    Object.keys(names).sort(function (a, b) { return a.localeCompare(b, 'fr'); }).forEach(function (n) {
      lines.push(''); lines.push('## ' + esc(n));
      var mine = all.filter(function (p) { return p[0].name === n; }).map(function (p) { return p[1]; });
      TYPES.forEach(function (t) {
        var L = mine.filter(function (l) { return l.type === t; }); if (!L.length) return;
        lines.push(''); lines.push('### ' + TYPE_LABEL[t] + ' (' + L.length + ')');
        L.forEach(function (l) {
          var head = l.url ? '[' + esc(l.titre) + '](' + l.url + ')' : esc(l.titre);
          var bits = [];
          if (l.fil) bits.push('fil `' + esc(l.fil) + '`');
          if (l.histoire) bits.push('histoire ' + esc(l.histoire));
          if (l.branche) bits.push('branche `' + esc(l.branche) + '`');
          if (l.detail) bits.push(esc(l.detail));
          if (l.lienCasse) bits.push('lien invalide dans le suivi');
          if (l.doublons) bits.push('enregistré ' + l.doublons + ' fois');
          bits.push('source : ' + (l.source ? esc(l.source) : '—') + ' (livrables/' + esc(l.id) + ')');
          lines.push('- ' + (l.heure ? l.heure.hm : '—') + ' · ' + head + (bits.length ? ' — ' + bits.join(' · ') : ''));
        });
      });
      var J = jr.filter(function (j) { return (j.agent === UNKNOWN_AGENT ? 'Agent non indiqué' : j.agent) === n; }).sort(function (a, b) { return a.at.ms - b.at.ms; });
      if (J.length) { lines.push(''); lines.push('### Journal d\'activité (' + J.length + ')'); J.forEach(function (j) { /* le texte libre du journal peut citer des tiers : il reste dans le suivi. L'index ne reprend que les battements (rg-40 : sans donnée personnelle). */ lines.push('- ' + j.at.hm + ' · ' + (j.phase ? '[' + j.phase + '] ' + esc(j.etape || '—') : 'entrée de journal (texte dans le suivi)') + ' — source : agents/' + esc(j.id)); }); }
    });
    if (!Object.keys(names).length) { lines.push(''); lines.push('Aucun livrable ni entrée de journal pour ce jour dans le suivi (collections vides ou illisibles).'); }
    var an = m.anomalies.filter(function (a) { return /^livrables\//.test(a.where) || true; });
    if (an.length) { lines.push(''); lines.push('## Anomalies de données (' + an.length + ')'); an.forEach(function (a) { lines.push('- ' + esc(a.where) + ' : ' + esc(a.cause)); }); }
    return lines.join('\n') + '\n';
  }

  var api = { TYPES: TYPES, TYPE_LABEL: TYPE_LABEL, PHASES: PHASES, STALE_H: STALE_H, OPEN_H: OPEN_H, parseWhen: parseWhen, parseDernier: parseDernier, dayOnly: dayOnly, ouvreesHours: ouvreesHours, fmtDM: fmtDM, fmtAge: fmtAge, sanitize: sanitize, httpsUrl: httpsUrl, normLivrable: normLivrable, normJournal: normJournal, buildModel: buildModel, buildIndex: buildIndex };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ACT = api;
})(typeof window !== 'undefined' ? window : this);

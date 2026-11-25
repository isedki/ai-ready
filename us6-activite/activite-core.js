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
    var quand = raw.at;
    if (!quand && isStr(raw.date) && /^\d{2}:\d{2}$/.test(raw.heure || '')) { quand = raw.date + 'T' + raw.heure + ':00Z'; soft.push('champ at absent : heure lue de « date » et « heure »'); }
    var p = parseWhen(quand);
    if (!p.ok || p.hm === null) return { ok: false, id: id, cause: 'champ at invalide : ' + (p.ok ? 'heure absente' : p.why) };
    var texte = [raw.quoi, raw.contenu, raw.titre, raw.texte].filter(isStr)[0];
    texte = texte ? texte.trim() : null;
    var agent = isStr(raw.agent) ? raw.agent.trim() : null;
    if (!agent) {
      /* US-18 : un passage sans champ agent n'est plus masqué. Rattaché à la Veille et Coach quand l'id le dit, sinon listé à part. */
      if (/coach-veille/i.test(id)) { agent = 'Veille et Coach'; soft.push('champ agent manquant : rattaché à « Veille et Coach » (l\'id contient coach-veille)'); }
      else return { ok: false, id: id, cause: 'champ agent manquant', orphan: { id: id, at: p, quoi: texte || (isStr(raw.etape) ? raw.etape.trim() : null) } };
    }
    /* « Coach » signe deux routines différentes : ses passages plan et bilan appartiennent au Coach plan du jour, pas à la Veille. */
    if (nkey(agent) === 'coach' && (/^(plan|bilan)$/.test(nkey(raw.passage || '')) || /coach-(plan|bilan)/i.test(id))) agent = 'Coach plan du jour';
    var phase = null;
    if (raw.phase !== undefined && raw.phase !== null && raw.phase !== '') { if (PHASES.indexOf(raw.phase) >= 0) phase = raw.phase; else soft.push('phase inconnue « ' + cut(raw.phase, 20) + ' » (attendu : debut, etape, fin) : ignorée'); }
    if (!texte && !isStr(raw.etape)) soft.push('ni « quoi » ni « etape » : affiché « — »');
    return { ok: true, soft: soft, item: { id: id, agent: agent, at: p, quoi: texte, etape: isStr(raw.etape) ? raw.etape.trim() : null, phase: phase, echec: isStr(raw.echec) && !/^(aucune?|non|none|null|-|—)$/i.test(raw.echec.trim()) ? raw.echec.trim() : null, source: isStr(raw.source) ? raw.source.trim() : null } };
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
    var team = [], journal = [], stories = [], by = {}, orphans = [], runsDoc = null, prompts = [];
    function row(name) { var k = nkey(name); if (!by[k]) by[k] = { name: name, key: k, doc: null, journal: [], livrables: [] }; return by[k]; }
    function note(coll, id, cause, soft) { anomalies.push({ where: coll + '/' + id, cause: cause, soft: !!soft }); }

    agentsIn.forEach(function (d) {
      var id = d && d.id != null ? String(d.id) : '(sans id)', raw = d && d.data !== undefined ? d.data : d;
      if (id === 'runs') { runsDoc = raw === undefined ? null : raw; return; } // la photo des routines (US-18) est lue par normRuns, qui dit elle-même ce qui ne va pas
      if (!isObj(raw)) { note('agents', id, 'document mal formé (ce n\'est pas un objet)'); return; }
      if (raw.type === 'agent') {
        if (!isStr(raw.nom)) { note('agents', id, 'agent sans champ nom : ignoré'); return; }
        var dn = null;
        if (raw.dernier) { var pd = parseDernier(raw.dernier); if (pd.ok) dn = pd; else note('agents', id, 'champ dernier invalide : ' + pd.why + ' : ignoré', true); }
        team.push({ id: id, nom: raw.nom.trim(), quand: isStr(raw.quand) ? raw.quand : null, focus: isStr(raw.focus) ? raw.focus : null, dernier: dn });
      } else if (raw.type === 'journal') {
        var r = normJournal(id, raw);
        if (!r.ok) { note('agents', id, r.cause + (r.orphan ? ' : affiché dans « passages sans agent »' : '')); if (r.orphan) orphans.push(r.orphan); return; }
        r.soft.forEach(function (c) { note('agents', id, c, true); });
        journal.push(r.item);
      } else if (raw.type === 'prompt' && raw.statut === 'a_coller') {
        if (isStr(raw.titre)) prompts.push({ id: id, titre: raw.titre.trim(), pour: isStr(raw.pour) ? raw.pour.trim() : null }); else note('agents', id, 'prompt à coller sans titre : ignoré');
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

    return { today: todayD, day: day, days: days, agents: rows, stories: st, anomalies: anomalies, journal: journal, livrablesOk: livOk, orphans: orphans, runsDoc: runsDoc, prompts: prompts, agentNames: Object.keys(by).map(function (k) { return by[k].name; }).sort(), nLivrablesJour: livOk.filter(function (l) { return l.jour === day; }).length, nLivrables: livOk.length, nJournal: journal.length };
  }

  /* ================= US-18 : vue en direct des routines ================= */
  var GRACE_MIN = 30;            // tolérance après l'heure du cron avant de déclarer un passage absent
  var EARLY_MIN = 10;            // un passage commencé jusqu'à 10 min avant l'heure du cron compte
  var PHOTO_STALE_H = 18;        // heures ouvrées sans nouvelle photo (3 passages par jour : l'écart normal maximal est 17 h, du vendredi 15h05 au lundi 7h50)
  var DAY = 86400000;
  var PROD_AVANT = 15 * 60000, PROD_APRES = 90 * 60000; // fenêtre d'écriture au journal autour d'un passage
  var TZ_UTC = { 'africa/casablanca': 1, 'utc': 1, 'gmt': 1, 'etc/utc': 1, 'etc/gmt': 1 };

  function parseField(f, lo, hi, dow) {
    var set = {}, parts = String(f).split(',');
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], step = 1, ms = /^(.+)\/(\d+)$/.exec(p);
      if (ms) { p = ms[1]; step = +ms[2]; if (step < 1) return null; }
      var a, b, mr;
      if (p === '*' || p === '?') { a = lo; b = hi; }
      else if ((mr = /^(\d+)-(\d+)$/.exec(p))) { a = +mr[1]; b = +mr[2]; }
      else if (/^\d+$/.test(p)) { a = +p; b = ms ? hi : a; }
      else return null;
      if (a < lo || b > hi || a > b) return null;
      for (var v = a; v <= b; v += step) set[dow && v === 7 ? 0 : v] = 1;
    }
    return { set: set, star: parts.length === 1 && /^[*?]/.test(String(f)) };
  }
  /* Cron à 5 champs, avec un éventuel préfixe CRON_TZ=. Fuseau : Maroc = UTC (décision d'Issam, 25/11). Un autre fuseau n'est pas deviné. */
  function parseCron(expr) {
    if (!isStr(expr)) return { ok: false, why: 'cron absent' };
    var t = expr.trim(), tz = null, m = /^(?:CRON_)?TZ=(\S+)\s+(.*)$/.exec(t);
    if (m) { tz = m[1]; t = m[2]; }
    else if ((m = /^(.*?)\s*\(([A-Za-z_\/+0-9-]+)\)$/.exec(t))) { t = m[1]; tz = m[2]; } // forme écrite par la Veille : « 0 15 * * * (Africa/Casablanca) »
    if (tz && !TZ_UTC[tz.toLowerCase()]) return { ok: false, why: 'fuseau « ' + cut(tz, 30) + ' » non géré' };
    var f = t.split(/\s+/);
    if (f.length !== 5) return { ok: false, why: 'cron à 5 champs attendu, reçu « ' + cut(expr, 40) + ' »' };
    var mi = parseField(f[0], 0, 59), h = parseField(f[1], 0, 23), dm = parseField(f[2], 1, 31), mo = parseField(f[3], 1, 12), dw = parseField(f[4], 0, 7, true);
    if (!mi || !h || !dm || !mo || !dw) return { ok: false, why: 'cron illisible : « ' + cut(expr, 40) + ' »' };
    return { ok: true, tz: tz, min: Object.keys(mi.set).map(Number), hour: Object.keys(h.set).map(Number), dom: dm, mon: mo.set, dow: dw, expr: expr };
  }
  function dayMatches(c, d) {
    if (!c.mon[d.getUTCMonth() + 1]) return false;
    var okD = !!c.dom.set[d.getUTCDate()], okW = !!c.dow.set[d.getUTCDay()];
    if (c.dom.star && c.dow.star) return true;
    if (c.dom.star) return okW;
    if (c.dow.star) return okD;
    return okD || okW;
  }
  /* Passages du cron dans ]from, to], triés. Au plus 5000 : au-delà le cron est « trop fréquent pour être suivi ». */
  function cronFires(c, from, to) {
    var out = [], day = Math.floor(from / DAY) * DAY;
    for (; day <= to; day += DAY) {
      if (!dayMatches(c, new Date(day))) continue;
      for (var i = 0; i < c.hour.length; i++) for (var j = 0; j < c.min.length; j++) {
        var t = day + c.hour[i] * 3600000 + c.min[j] * 60000;
        if (t > from && t <= to) { out.push(t); if (out.length > 5000) return null; }
      }
    }
    return out.sort(function (a, b) { return a - b; });
  }
  function lastFire(c, ref) { var f = cronFires(c, ref - 62 * DAY, ref); return f && f.length ? f[f.length - 1] : null; }
  function nextFire(c, ref) { var f = cronFires(c, ref, ref + 62 * DAY); return f && f.length ? f[0] : null; }
  /* Seuil d'inactivité d'une routine : le plus long intervalle entre deux passages du cron (sur 62 jours de part et d'autre) + la tolérance.
     Un agent quotidien lun-ven a donc 72 h + 30 min (vendredi → lundi), un hebdomadaire 7 j + 30 min, jamais un 36 h unique. */
  function seuilMs(c, ref) {
    var f = cronFires(c, ref - 62 * DAY, ref + 62 * DAY);
    if (!f || f.length < 2) return null;
    var g = 0; for (var i = 1; i < f.length; i++) g = Math.max(g, f[i] - f[i - 1]);
    return g + GRACE_MIN * 60000;
  }
  function fmtDur(ms) { var h = Math.round(ms / 3600000); return h >= 48 ? Math.round(h / 24) + ' j' : h + ' h'; }

  function statutNorm(s) {
    var k = nkey(s);
    if (/en cours|running|in.progress|pending/.test(k)) return 'encours';
    if (/^(succeeded|success|ok|reussi|reussie|termine|completed|done)$/.test(k) || /succe|reussi/.test(k)) return 'ok';
    if (/fail|echec|error|erreur|cancel|timeout|ko/.test(k)) return 'ko';
    return 'inconnu';
  }
  function hasKey(name, key) { return new RegExp('(^|[^a-z0-9])' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)').test(name); }
  /* Rattache un nom (routine de la photo ou agent du journal) à une fiche : nom ou alias exact, sinon la plus longue clé présente comme mots entiers. */
  function ficheFor(fiches, name) {
    var k = nkey(name), best = null, bl = 0;
    for (var i = 0; i < fiches.length; i++) {
      var f = fiches[i], names = [f.nom].concat(f.agents || []);
      for (var j = 0; j < names.length; j++) if (nkey(names[j]) === k) return f;
    }
    for (var a = 0; a < fiches.length; a++) (fiches[a].cles || []).forEach(function (c) { var ck = nkey(c); if (ck.length > bl && hasKey(k, ck)) { best = fiches[a]; bl = ck.length; } });
    return best;
  }
  function ecarte(cfg, name) {
    var k = nkey(name), et = (cfg && cfg.etiquettes) || [];
    for (var i = 0; i < et.length; i++) if (nkey(et[i]) === k) return 'étiquette';
    if (cfg && cfg.motif_session_dev) { try { if (new RegExp(cfg.motif_session_dev, 'i').test(String(name).normalize('NFC'))) return 'session de développement'; } catch (e) { /* motif invalide : rien n'est écarté à tort */ } }
    return null;
  }

  function normRuns(doc, anomalies, now) {
    if (!doc) return { etat: 'absente', source: 'agents/runs' };
    if (!isObj(doc)) { anomalies.push({ where: 'agents/runs', cause: 'document mal formé (ce n\'est pas un objet)', soft: false }); return { etat: 'illisible', source: 'agents/runs', cause: 'document mal formé' }; }
    var at = parseWhen(doc.at);
    var out = { etat: 'ok', source: 'agents/runs', erreur: isStr(doc.erreur) ? doc.erreur.trim() : null, par: isStr(doc.par) ? doc.par.trim() : null, at: null, routines: [] };
    if (!at.ok || at.hm === null) {
      anomalies.push({ where: 'agents/runs', cause: 'champ at invalide : ' + (at.ok ? 'heure absente' : at.why), soft: false });
      out.etat = 'illisible'; out.cause = 'champ at invalide'; return out;
    }
    out.at = at; out.age = fmtAge(at.ms, now); out.label = fmtDM(at.ms);
    out.stale = ouvreesHours(at.ms, now) > PHOTO_STALE_H;
    if (!Array.isArray(doc.routines)) {
      if (!out.erreur) { anomalies.push({ where: 'agents/runs', cause: 'routines absent ou pas une liste', soft: false }); out.etat = 'illisible'; out.cause = 'routines absent ou pas une liste'; }
      else out.etat = 'erreur';
      return out;
    }
    doc.routines.forEach(function (r, i) {
      var w = 'agents/runs routines[' + i + ']';
      if (!isObj(r) || !isStr(r.nom)) { anomalies.push({ where: w, cause: 'routine sans nom : ignorée', soft: false }); return; }
      var d = null, st = null;
      if (isObj(r.dernier) && (r.dernier.at === null || r.dernier.at === undefined)) st = r.dernier.statut; // « jamais lancé », « pas de trace »
      else if (r.dernier !== undefined && r.dernier !== null) {
        var pd = isObj(r.dernier) ? parseWhen(r.dernier.at) : { ok: false, why: 'dernier n\'est pas un objet' };
        if (pd.ok && pd.hm !== null) { d = pd; st = r.dernier.statut; } else anomalies.push({ where: w + ' (' + r.nom + ')', cause: 'dernier.at invalide : ' + (pd.ok ? 'heure absente' : pd.why) + ' : traité comme « aucun passage connu »', soft: true });
      }
      var pr = null;
      if (isStr(r.prochain) && !/^d[ée]sactiv/i.test(r.prochain.trim())) { var pp = parseWhen(r.prochain); if (pp.ok && pp.hm !== null) pr = pp; else anomalies.push({ where: w + ' (' + r.nom + ')', cause: 'prochain invalide : ' + (pp.ok ? 'heure absente' : pp.why) + ' : calculé du cron', soft: true }); }
      out.routines.push({ id: isStr(r.id) ? r.id.trim() : null, nom: r.nom.trim(), cron: isStr(r.cron) ? r.cron.trim() : null, enabled: r.enabled === false ? false : true, modele: isStr(r.modele) ? r.modele.trim() : null, dernier: d, statutBrut: isStr(st) ? st.trim() : null, statut: isStr(st) ? statutNorm(st) : null, prochain: pr });
    });
    return out;
  }

  function jourItems(d, day, anomalies) {
    var res = { perimes: [], lu: false };
    if (!d) return res;
    var raw = d && d.data !== undefined ? d.data : d;
    if (!isObj(raw)) { anomalies.push({ where: 'jour/' + day, cause: 'document mal formé (ce n\'est pas un objet)', soft: false }); return res; }
    res.lu = true;
    var P = raw.perimes;
    if (P === undefined || P === null) return res;
    if (!Array.isArray(P)) { anomalies.push({ where: 'jour/' + day + '.perimes', cause: 'pas une liste : ignoré', soft: false }); return res; }
    P.forEach(function (x) {
      if (isStr(x)) res.perimes.push(cut(x, 200));
      else if (isObj(x) && (isStr(x.objet) || isStr(x.titre))) res.perimes.push(cut((x.objet || x.titre) + (isStr(x.raison) ? ' : ' + x.raison : ''), 200));
      else anomalies.push({ where: 'jour/' + day + '.perimes', cause: 'élément sans libellé : ignoré', soft: true });
    });
    return res;
  }

  /* in : {agents, livrables, jour:{id,data}|null, fiches:{fiches:[...], ecartes:{...}}, now}
     Une ligne par routine de la photo agents/runs, puis les routines connues des fiches mais absentes de la photo (tâches locales : « non lisible »). */
  function buildDirect(inp) {
    var now = inp.now, today = new Date(now).toISOString().slice(0, 10);
    var cfg = inp.fiches || { fiches: [] }, fiches = Array.isArray(cfg.fiches) ? cfg.fiches : [];
    var m = buildModel({ agents: inp.agents, livrables: inp.livrables, now: now, day: today });
    var anomalies = m.anomalies;
    var photo = normRuns(m.runsDoc, anomalies, now);
    var jr = jourItems(inp.jour, today, anomalies);

    /* ce que chaque routine a produit : dernière entrée de journal ou livrable du jour rattachée à sa fiche */
    var prod = {}, offres = {}, partage = {}, ecartes = {};
    function offer(name, ms, txt, src, lbl, echec) {
      var why = ecarte(cfg.ecartes, name), f = why ? null : ficheFor(fiches, name); // étiquettes et sessions de développement d'abord : « Développeur US-14 » ne doit pas devenir la fiche US-14
      if (!f) { ecartes[nkey(name)] = { nom: name === UNKNOWN_AGENT ? 'Agent non indiqué' : name, motif: why || 'pas une routine connue' }; return; }
      var of = { ms: ms, txt: txt ? cut(String(txt).replace(/\s+/g, ' '), 160) : null, src: src, lbl: lbl || fmtDM(ms) + ' UTC', echec: echec || null };
      (offres[f.id] = offres[f.id] || []).push(of);
      if (!prod[f.id] || ms > prod[f.id].ms) prod[f.id] = of;
    }
    m.journal.forEach(function (j) { offer(j.agent, j.at.ms, j.quoi || j.etape, 'agents/' + j.id, null, j.echec); });
    m.livrablesOk.forEach(function (l) { offer(l.agent, l.heure ? l.heure.ms : Date.parse(l.jour + 'T00:00:00Z'), l.type + ' : ' + l.titre, 'livrables/' + l.id, l.heure ? null : l.jour.slice(8, 10) + '/' + l.jour.slice(5, 7) + ' (heure —)'); });
    m.agents.forEach(function (a) { var w = ecarte(cfg.ecartes, a.name); if ((w || !ficheFor(fiches, a.name)) && !ecartes[nkey(a.name)]) ecartes[nkey(a.name)] = { nom: a.name, motif: w || 'pas une routine connue' }; });

    var used = {}, rows = [];
    (photo.routines || []).forEach(function (r) { if (r.enabled && !ecarte(cfg.ecartes, r.nom)) { var f = ficheFor(fiches, r.nom); if (f) partage[f.id] = (partage[f.id] || 0) + 1; } });
    /* un journal nettement plus récent que le passage connu de la photo (ou sans passage connu) : la photo a vieilli, on le dit */
    function vuAuJournal(o, f, c, ref) {
      var j = null;
      if (f) (offres[f.id] || []).forEach(function (x) { if (/^agents\//.test(x.src) && (!j || x.ms > j.ms)) j = x; });
      if (!j || (o.dernier && j.ms <= o.dernier.ms + PROD_APRES) || j.ms > now + 300000) return;
      o.dernier = { ms: j.ms, label: fmtDM(j.ms), age: fmtAge(j.ms, now), duJournal: true };
      o.quoi = j.txt; o.quoiSrc = j.src; o.quoiAt = j.lbl; o.inactif = null; o.echec = !!j.echec;
      /* le journal n'efface l'alerte que s'il couvre le dernier passage attendu */
      var F = c && c.ok ? lastFire(c, ref - GRACE_MIN * 60000) : null;
      o.absent = F && j.ms < F - EARLY_MIN * 60000 ? 'attendu à ' + fmtDM(F) + ', dernière trace au journal ' + fmtDM(j.ms) : null;
      if (j.echec) o.notes.push('échec écrit au journal : ' + cut(j.echec, 160));
      o.etat = o.absent ? 'absent' : j.echec ? 'echec' : 'journal';
      /* un « prochain passage » antérieur à la dernière trace est périmé : recalculé */
      if (o.prochain && o.prochain.ms <= j.ms) { var t = c && c.ok ? nextFire(c, now) : null; o.prochain = t ? { ms: t, label: fmtDM(t) } : null; o.prochainSrc = t ? 'calculé du cron' : null; }
      o.notes.push('dernier passage lu dans le journal (' + j.src + ') : la photo des routines ne le montre pas');
    }
    function build(r, f) {
      var o = { nom: r.nom, id: r.id, fiche: f ? f.id : null, ficheNom: f ? f.nom : null, local: !!(f && f.local), cron: r.cron, enabled: r.enabled, modele: r.modele, statutBrut: r.statutBrut, statut: r.statut, dernier: null, prochain: null, prochainSrc: null, seuil: null, seuilTxt: null, absent: null, echec: false, inactif: null, notes: [], etat: 'ok', source: 'agents/runs', quoi: null, quoiSrc: null };
      if (r.dernier) o.dernier = { ms: r.dernier.ms, label: fmtDM(r.dernier.ms), age: fmtAge(r.dernier.ms, now) };
      var c = r.cron ? parseCron(r.cron) : { ok: false, why: 'cron absent de la photo' };
      var ref = photo.at ? Math.min(photo.at.ms, now) : now;
      if (c.ok) {
        var sm = seuilMs(c, now); if (sm) { o.seuil = sm; o.seuilTxt = fmtDur(sm) + ' (déduit du cron)'; } else o.notes.push('seuil non calculable : un seul passage dans la fenêtre du cron');
        var nx = r.prochain || (function () { var t = nextFire(c, now); return t ? { ms: t } : null; })();
        if (nx) { o.prochain = { ms: nx.ms, label: fmtDM(nx.ms) }; o.prochainSrc = r.prochain ? 'photo' : 'calculé du cron'; }
        var F = lastFire(c, ref - GRACE_MIN * 60000);
        if (r.enabled && F && r.dernier && r.dernier.ms < F - EARLY_MIN * 60000) o.absent = 'attendu à ' + fmtDM(F) + ', dernier passage connu ' + fmtDM(r.dernier.ms);
        if (r.enabled && r.dernier && o.seuil && ref - r.dernier.ms > o.seuil) o.inactif = 'inactif depuis ' + fmtDM(r.dernier.ms) + ' (seuil ' + fmtDur(o.seuil) + ')';
      } else {
        o.seuilTxt = '— (' + c.why + ')';
        if (r.prochain) { o.prochain = { ms: r.prochain.ms, label: fmtDM(r.prochain.ms) }; o.prochainSrc = 'photo'; }
        o.notes.push('seuil et passage attendu non calculables : ' + c.why);
      }
      if (r.statut === 'ko') o.echec = true;
      if (r.enabled && !r.dernier) o.notes.push('aucun passage connu : la photo ne donne pas la date de création, la page ne peut pas dire si un passage a manqué');
      var p = null;
      if (f && partage[f.id] > 1) {
        /* plusieurs routines, une seule fiche : on n'attribue que ce qui a été écrit autour du passage de CETTE routine */
        if (r.dernier) (offres[f.id] || []).forEach(function (x) { if (x.ms >= r.dernier.ms - PROD_AVANT && x.ms <= r.dernier.ms + PROD_APRES && (!p || x.ms > p.ms)) p = x; });
        if (!p) o.notes.push('plusieurs routines partagent la fiche « ' + f.nom + ' » : rien d\'écrit au journal autour du passage de celle-ci');
      } else if (f) p = prod[f.id] || null;
      if (p) { o.quoi = p.txt; o.quoiSrc = p.src; o.quoiAt = p.lbl; }
      /* la routine qui écrit la photo s'y voit forcément « en cours » : un journal écrit ensuite prouve que le passage a abouti */
      if (r.statut === 'encours' && f && photo.par && nkey(photo.par) === nkey(f.id) && r.dernier && p && /^agents\//.test(p.src) && p.ms >= r.dernier.ms) {
        r = Object.assign({}, r, { statut: 'ok' }); o.statut = 'ok'; o.statutBrut = 'terminé, journal écrit à ' + fmtDM(p.ms) + ' (la photo a été prise pendant le passage)';
      }
      o.etat = !r.enabled ? 'desactivee' : o.absent ? 'absent' : o.echec ? 'echec' : o.inactif ? 'inactif' : !r.dernier ? 'attente' : r.statut === 'encours' ? 'encours' : 'ok';
      if (!r.enabled) { o.prochain = null; o.prochainSrc = null; } // une routine désactivée n'a pas de prochain passage
      else if (!(f && partage[f.id] > 1)) vuAuJournal(o, f, c, ref);
      if (p && p.echec && o.etat === 'ok') { o.echec = true; o.etat = 'echec'; o.notes.push('échec écrit au journal : ' + cut(p.echec, 160)); }
      return o;
    }
    photo.routines && photo.routines.forEach(function (r) {
      if (ecarte(cfg.ecartes, r.nom)) { ecartes[nkey(r.nom)] = { nom: r.nom, motif: ecarte(cfg.ecartes, r.nom) }; return; }
      var f = ficheFor(fiches, r.nom); if (f) used[f.id] = 1;
      rows.push(build(r, f));
    });
    fiches.forEach(function (f) {
      if (used[f.id]) return;
      var o = { nom: f.nom, id: null, fiche: f.id, ficheNom: f.nom, local: !!f.local, cron: null, enabled: null, modele: f.modele || null, statutBrut: null, statut: null, dernier: null, prochain: null, prochainSrc: null, seuil: null, seuilTxt: null, absent: null, echec: false, inactif: null, notes: [], source: f.local ? 'tâche locale' : 'agents/runs', quoi: null, quoiSrc: null };
      if (prod[f.id]) { o.quoi = prod[f.id].txt; o.quoiSrc = prod[f.id].src; o.quoiAt = prod[f.id].lbl; }
      if (f.local) { o.etat = 'non-lisible'; o.notes.push('tâche locale (launchd ou scheduled-tasks) : non lisible depuis claude.ai'); }
      else if (photo.etat === 'ok') { o.etat = 'absente-photo'; o.notes.push(photo.erreur ? 'photo partielle (' + photo.erreur + ') : cette routine peut être dans la partie non lue' : 'la photo ne contient pas cette routine'); }
      else { o.etat = 'photo-absente'; }
      if (!f.local) vuAuJournal(o, f);
      rows.push(o);
    });

    var afaire = [];
    m.stories.filter(function (s) { return s.aValider; }).forEach(function (s) { afaire.push({ kind: 'valider', texte: s.ref + (s.titre ? ' « ' + cut(s.titre, 90) + ' »' : '') + ' : à valider', source: s.source }); });
    jr.perimes.forEach(function (t) { afaire.push({ kind: 'perime', texte: 'À décider (brouillon ou livrable obsolète) : ' + t, source: 'jour/' + today + '.perimes' }); });
    m.prompts.forEach(function (p) { afaire.push({ kind: 'prompt', texte: 'Prompt prêt à coller : ' + cut(p.titre, 100) + (p.pour ? ' (pour ' + p.pour + ')' : ''), source: 'agents/' + p.id }); });
    rows.forEach(function (r) {
      if (r.etat === 'absent') afaire.push({ kind: 'observer', texte: 'Passage à observer : ' + r.nom + ' ' + r.absent, source: 'agents/runs' });
      else if (r.etat === 'echec') afaire.push({ kind: 'observer', texte: 'Passage en échec à regarder : ' + r.nom + ' (' + (r.statutBrut || '—') + ', ' + (r.dernier ? r.dernier.label : '—') + ')', source: 'agents/runs' });
      else if (r.etat === 'inactif') afaire.push({ kind: 'observer', texte: 'Passage à observer : ' + r.nom + ' ' + r.inactif, source: 'agents/runs' });
    });
    if (photo.etat === 'ok' && photo.stale) afaire.push({ kind: 'observer', texte: 'Photo des routines ancienne (' + photo.label + ', ' + photo.age + ') : vérifier que la Veille tourne', source: 'agents/runs' });

    if (photo.etat === 'ok' && photo.erreur) afaire.push({ kind: 'observer', texte: 'Photo des routines incomplète : ' + cut(photo.erreur, 120), source: 'agents/runs.erreur' });

    return { today: today, now: now, photo: photo, routines: rows, afaire: afaire, jourLu: jr.lu, ecartes: Object.keys(ecartes).map(function (k) { return ecartes[k]; }).sort(function (a, b) { return a.nom.localeCompare(b.nom, 'fr'); }), sansAgent: m.orphans.slice().sort(function (a, b) { return b.at.ms - a.at.ms; }).map(function (o) { return { id: o.id, label: fmtDM(o.at.ms), quoi: o.quoi, source: 'agents/' + o.id }; }), anomalies: anomalies, stories: m.stories };
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

  var api = { TYPES: TYPES, TYPE_LABEL: TYPE_LABEL, PHASES: PHASES, STALE_H: STALE_H, OPEN_H: OPEN_H, parseWhen: parseWhen, parseDernier: parseDernier, dayOnly: dayOnly, ouvreesHours: ouvreesHours, fmtDM: fmtDM, fmtAge: fmtAge, sanitize: sanitize, httpsUrl: httpsUrl, normLivrable: normLivrable, normJournal: normJournal, buildModel: buildModel, buildIndex: buildIndex, buildDirect: buildDirect, parseCron: parseCron, cronFires: cronFires, lastFire: lastFire, nextFire: nextFire, seuilMs: seuilMs, ficheFor: ficheFor, GRACE_MIN: GRACE_MIN, PHOTO_STALE_H: PHOTO_STALE_H };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ACT = api;
})(typeof window !== 'undefined' ? window : this);

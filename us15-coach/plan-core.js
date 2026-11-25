/* US-15 : logique pure du plan du matin, du verdict, du bilan du soir et de la visibilité du Coach.
   Aucune dépendance, aucun DOM, aucun réseau : le même fichier tourne dans la page (global PLAN), dans Node (tests, CLI)
   et dans la tâche planifiée (copie lue dans kb/us15-code). Règle de fond : rien n'est déduit ; inconnu = « — » + raison. */
(function (root) {
  'use strict';
  var SRC_TYPES = ['mail', 'action', 'echeance', 'profil', 'observateur', 'agenda'];
  var SRC_LABEL = { mail: 'mail', action: 'action', echeance: 'échéance', profil: 'profil', observateur: 'Observateur', agenda: 'agenda' };
  var VERDICTS = ['bonne', 'mauvaise', 'manquante'];
  var VOIES = ['mail', 'page'];
  var PASSAGES = ['plan', 'veille', 'bilan'];
  var GRACE_MIN = 30, RECUL_JOURS = 21, MIN_VERDICTS = 3, FAUX_JOURS = 14, SEUIL_BONNES = 0.5;
  var SCHEDULE = { plan: ['08:00'], veille: ['09:05', '10:05', '11:05', '12:05', '13:05', '14:05', '15:05'], bilan: ['18:15'] };
  var PRET = { plan: 'prévu', veille: 'prévue', bilan: 'prévu' };

  function isStr(x) { return typeof x === 'string' && x.trim() !== ''; }
  function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function cut(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function isDay(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v + 'T00:00:00Z')); }
  /* date ISO stricte → ms, sinon null */
  function ms(v) {
    if (!isStr(v)) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(v.trim());
    if (!m) return null;
    var t = Date.parse(m[1] + '-' + m[2] + '-' + m[3] + 'T' + (m[4] ? m[4] + ':' + m[5] + ':' + (m[6] || '00') : '00:00:00') + (m[7] ? (m[7] === 'Z' ? 'Z' : m[7].length === 5 ? m[7].slice(0, 3) + ':' + m[7].slice(3) : m[7]) : 'Z'));
    return isNaN(t) ? null : t;
  }
  function hm(t) { var d = new Date(t); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); }
  function dayOf(t) { return new Date(t).toISOString().slice(0, 10); }
  function stamp(t) { return dayOf(t) + ' ' + hm(t) + ' UTC'; }

  function ageLabel(v, now) {
    if (v === '—') return '— (date inconnue)';
    var t = ms(v); if (t === null) return '— (date illisible)';
    var dm = Math.floor((now - t) / 60000);
    if (dm < 0) return '— (date postérieure à l\'heure de lecture)';
    if (dm < 60) return 'il y a ' + dm + ' min';
    if (dm < 1440) return 'il y a ' + Math.floor(dm / 60) + ' h ' + pad(dm % 60);
    return 'il y a ' + Math.floor(dm / 1440) + ' j';
  }

  /* ---------- envoi : le seul mail que le Coach envoie ---------- */
  function addr(x) {
    if (typeof x !== 'string') return null;
    var m = /<([^<>]+)>\s*$/.exec(x.trim()); var a = (m ? m[1] : x).trim().toLowerCase();
    return /^[^\s@,;<>]+@[^\s@,;<>]+$/.test(a) ? a : null;
  }
  function checkSend(o) {
    o = isObj(o) ? o : {};
    var no = function (code, why) { return { ok: false, code: code, why: why }; };
    var self = addr(o.self);
    if (!self) return no('self_absent', 'adresse d\'Issam non configurée (reglages/coach-plan.self_email) : aucun envoi');
    if (!isDay(o.day)) return no('jour_invalide', 'jour invalide « ' + cut(o.day, 20) + ' » (attendu AAAA-MM-JJ)');
    var to = Array.isArray(o.to) ? o.to : null;
    if (!to || to.length !== 1 || addr(to[0]) !== self) return no('dest_different', 'destinataire refusé : « ' + (Array.isArray(o.to) ? o.to.join(', ') : String(o.to)) + ' » n\'est pas exactement le compte d\'Issam');
    if ((Array.isArray(o.cc) && o.cc.length) || (Array.isArray(o.bcc) && o.bcc.length)) return no('cc_bcc', 'Cc et Cci interdits : le plan n\'a qu\'un destinataire, Issam');
    var subj = 'Plan du jour ' + o.day;
    if (o.subject !== subj) return no('objet', 'objet attendu « ' + subj + ' », reçu « ' + cut(o.subject, 60) + ' »');
    if (!Array.isArray(o.sent)) return no('envoyes_illisibles', 'mails envoyés du jour illisibles : l\'unicité du plan ne peut pas être prouvée, aucun envoi');
    for (var i = 0; i < o.sent.length; i++) {
      var s = o.sent[i]; if (!isObj(s) || s.subject !== subj) continue;
      var tos = Array.isArray(s.to) ? s.to.map(addr) : [];
      if (tos.indexOf(self) < 0) continue;
      var t = ms(s.date);
      return no('deja_envoye', 'un « ' + subj + ' » est déjà parti à Issam' + (t === null ? ' (heure illisible)' : ' à ' + hm(t) + ' UTC') + ' : rien de nouveau');
    }
    return { ok: true, subject: subj, to: [self] };
  }

  /* ---------- plan ---------- */
  function checkSource(s, label, errs) {
    if (!isObj(s)) { errs.push(label + ' : source mal formée'); return; }
    if (SRC_TYPES.indexOf(s.type) < 0) errs.push(label + ' : type de source inconnu « ' + cut(s.type, 20) + ' »');
    if (!isStr(s.ref)) errs.push(label + ' : référence manquante');
    if (s.date === undefined || s.date === null || s.date === '') errs.push(label + ' : date manquante (écrire « — » avec date_raison si inconnue)');
    else if (s.date === '—') { if (!isStr(s.date_raison)) errs.push(label + ' : date « — » sans raison'); }
    else if (ms(s.date) === null) errs.push(label + ' : date invalide « ' + cut(s.date, 30) + ' »');
  }
  function validatePlan(p, day) {
    var errs = [];
    if (!isObj(p)) return { ok: false, errors: ['plan absent ou mal formé'] };
    if (day && p.jour !== day) errs.push('jour du plan « ' + cut(p.jour, 12) + ' » différent de ' + day);
    var pr = Array.isArray(p.priorites) ? p.priorites : [];
    var n = pr.length;
    if (!(n >= 3 && n <= 5) && !(n >= 1 && n < 3 && isStr(p.moins_de_3_raison))) errs.push('3 à 5 priorités attendues, reçu ' + n + (n >= 1 && n < 3 ? ' (moins de 3 : écrire moins_de_3_raison)' : ''));
    var seen = {};
    pr.forEach(function (x, i) {
      var id = isObj(x) && isStr(x.id) ? x.id : null, L = id || 'priorité n°' + (i + 1);
      if (!isObj(x)) { errs.push(L + ' : mal formée'); return; }
      if (!id) errs.push(L + ' : identifiant manquant'); else if (seen[id]) errs.push('identifiant ' + id + ' en double'); else seen[id] = 1;
      if (!isStr(x.titre)) errs.push(L + ' : titre manquant');
      if (!isStr(x.raison)) errs.push(L + ' : raison manquante');
      if (!isStr(x.action)) errs.push(L + ' : geste à faire manquant (champ action : une phrase, le premier geste concret)'); else if (x.action.length > 200) errs.push(L + ' : action trop longue (200 caractères au plus)');
      if (!Array.isArray(x.sources) || !x.sources.length) errs.push(L + ' : aucune source (jamais de priorité sans source)');
      else x.sources.forEach(function (s) { checkSource(s, L, errs); });
    });
    ['attend', 'bloque'].forEach(function (k) {
      if (p[k] === undefined) return;
      if (!Array.isArray(p[k])) { errs.push(k + ' : liste attendue'); return; }
      p[k].forEach(function (x, i) { var L = k + '[' + i + ']'; if (!isObj(x) || !isStr(x.titre)) { errs.push(L + ' : titre manquant'); return; } checkSource(x.source, L, errs); });
    });
    (Array.isArray(p.non_lu) ? p.non_lu : []).forEach(function (x) { if (!isObj(x) || !isStr(x.source)) errs.push('non lu : source manquante'); else if (!isStr(x.raison)) errs.push('non lu « ' + x.source + ' » : raison manquante'); });
    return { ok: errs.length === 0, errors: errs };
  }
  function srcLine(s, now) {
    var dayOnly = typeof s.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.date);
    var d = s.date === '—' ? '— (' + (s.date_raison || 'date inconnue') + ')' : (ms(s.date) === null ? '—' : dayOnly ? s.date + ' (heure non écrite)' : stamp(ms(s.date))) + ' (' + ageLabel(s.date, now) + ')';
    return (SRC_LABEL[s.type] || s.type) + ' ' + s.ref + ' · ' + d;
  }
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function renderMail(p, now) {
    var pr = p.priorites || [], at = Array.isArray(p.attend) ? p.attend : [], bl = Array.isArray(p.bloque) ? p.bloque : [], nl = Array.isArray(p.non_lu) ? p.non_lu : [];
    var court = function (x) { return isStr(x.court) ? x.court : x.titre; };
    var head = 'Plan du jour ' + p.jour + ' (heure du Maroc = GMT, généré à ' + hm(now) + ' UTC)';
    var mailsLine = null;
    if (isObj(p.mails) && typeof p.mails.lus === 'number') mailsLine = p.mails.lus + ' ' + (p.mails.lus <= 1 ? 'fil Gmail lu' : 'fils Gmail lus') + ' depuis ' + (ms(p.mails.depuis) === null ? '—' : stamp(ms(p.mails.depuis))) + ' (source : ' + (p.mails.source || '—') + ')';
    var vois = ['P1 bonne', 'P2 mauvaise : ta phrase', 'manquante : ce qui manquait'];
    /* texte */
    var L = [head, '', 'À FAIRE CE MATIN', '================'];
    pr.forEach(function (x) { L.push(x.id + ' → ' + court(x)); L.push('     Geste : ' + (x.action || '—')); });
    if (isStr(p.moins_de_3_raison)) L.push('(moins de 3 priorités : ' + p.moins_de_3_raison + ')');
    L.push('', 'EN ATTENTE : ' + at.length + ' réponse' + (at.length > 1 ? 's' : '') + ' attendue' + (at.length > 1 ? 's' : '') + ' · ' + bl.length + ' blocage' + (bl.length > 1 ? 's' : ''));
    L.push('', 'DÉTAIL PAR PRIORITÉ', '===================');
    pr.forEach(function (x) { L.push(x.id + ' · ' + x.titre); L.push('  Pourquoi : ' + x.raison); L.push('  Sources : ' + (x.sources || []).map(function (s) { return srcLine(s, now); }).join(' ; ')); L.push(''); });
    L.push('Attend ta réponse');
    if (at.length) at.forEach(function (x) { L.push('- ' + x.titre + ' — ' + srcLine(x.source, now)); }); else L.push('- — (rien trouvé dans les sources lues)');
    L.push('', 'Bloqué');
    if (bl.length) bl.forEach(function (x) { L.push('- ' + x.titre + (x.raison ? ' : ' + x.raison : '') + ' — ' + srcLine(x.source, now)); }); else L.push('- — (rien trouvé dans les sources lues)');
    if (mailsLine) { L.push('', mailsLine); }
    if (nl.length) { L.push(''); nl.forEach(function (x) { L.push('non lu : ' + x.source + ' — ' + x.raison); }); }
    L.push('', 'TON VERDICT : réponds à ce mail, une ligne par priorité (enregistré tel quel) :');
    vois.forEach(function (v) { L.push(v); });
    L.push('Ou sur la page du Suivi, onglet Aujourd\'hui, bloc « Plan du jour ».');
    /* html */
    var H = ['<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.45;color:#1a1a1a;max-width:640px">',
      '<h2 style="margin:0 0 2px">Plan du jour ' + esc(p.jour) + '</h2><div style="color:#666;font-size:12px;margin-bottom:14px">heure du Maroc = GMT · généré à ' + hm(now) + ' UTC</div>',
      '<div style="background:#f3f6fb;border-left:4px solid #2f6fdb;padding:10px 14px;border-radius:4px"><b>À faire ce matin</b><ol style="margin:8px 0 0 18px;padding:0">'];
    pr.forEach(function (x) { H.push('<li style="margin-bottom:8px"><b>' + esc(x.id) + ' · ' + esc(court(x)) + '</b><br><span style="color:#2f6fdb">→ ' + esc(x.action || '—') + '</span></li>'); });
    H.push('</ol></div>');
    if (isStr(p.moins_de_3_raison)) H.push('<p style="color:#666">Moins de 3 priorités : ' + esc(p.moins_de_3_raison) + '</p>');
    H.push('<p style="margin:12px 0"><b>' + at.length + '</b> réponse' + (at.length > 1 ? 's' : '') + ' attendue' + (at.length > 1 ? 's' : '') + ' · <b>' + bl.length + '</b> blocage' + (bl.length > 1 ? 's' : '') + ' (détail plus bas)</p>');
    H.push('<h3 style="border-bottom:1px solid #ddd;padding-bottom:3px;margin-top:22px">Détail par priorité</h3>');
    pr.forEach(function (x) { H.push('<div style="margin:12px 0"><b>' + esc(x.id) + ' · ' + esc(x.titre) + '</b><div><i>Pourquoi :</i> ' + esc(x.raison) + '</div><div style="color:#666;font-size:12px">Sources : ' + (x.sources || []).map(function (s) { return esc(srcLine(s, now)); }).join(' ; ') + '</div></div>'); });
    H.push('<h3 style="border-bottom:1px solid #ddd;padding-bottom:3px">Attend ta réponse</h3><ul style="margin-top:4px">');
    if (at.length) at.forEach(function (x) { H.push('<li>' + esc(x.titre) + '<br><span style="color:#666;font-size:12px">' + esc(srcLine(x.source, now)) + '</span></li>'); }); else H.push('<li>— (rien trouvé dans les sources lues)</li>');
    H.push('</ul><h3 style="border-bottom:1px solid #ddd;padding-bottom:3px">Bloqué</h3><ul style="margin-top:4px">');
    if (bl.length) bl.forEach(function (x) { H.push('<li>' + esc(x.titre) + (x.raison ? ' : ' + esc(x.raison) : '') + '<br><span style="color:#666;font-size:12px">' + esc(srcLine(x.source, now)) + '</span></li>'); }); else H.push('<li>— (rien trouvé dans les sources lues)</li>');
    H.push('</ul>');
    if (mailsLine || nl.length) { H.push('<div style="color:#666;font-size:12px;margin-top:14px">'); if (mailsLine) H.push(esc(mailsLine) + '<br>'); nl.forEach(function (x) { H.push('non lu : ' + esc(x.source) + ' — ' + esc(x.raison) + '<br>'); }); H.push('</div>'); }
    H.push('<div style="background:#fff8e6;border-left:4px solid #e0a800;padding:10px 14px;border-radius:4px;margin-top:18px"><b>Ton verdict</b> : réponds à ce mail, une ligne par priorité (enregistré tel quel)<br>' + vois.map(esc).join('<br>') + '<br><span style="color:#666;font-size:12px">Ou sur la page du Suivi, onglet Aujourd\'hui, bloc « Plan du jour ».</span></div></div>');
    return { subject: 'Plan du jour ' + p.jour, text: L.join('\n'), html: H.join('\n') };
  }

  /* ---------- verdict ---------- */
  function verdictDoc(v, prev) {
    var no = function (why) { return { ok: false, why: why }; };
    if (!isObj(v)) return no('verdict absent ou mal formé');
    if (VERDICTS.indexOf(v.verdict) < 0) return no('verdict inconnu « ' + cut(v.verdict, 20) + ' » (bonne, mauvaise ou manquante)');
    if (!isDay(v.jour)) return no('jour invalide');
    if (!/^[PM]\d{1,2}$/.test(v.priorite || '')) return no('priorité invalide « ' + cut(v.priorite, 12) + ' »');
    if (VOIES.indexOf(v.voie) < 0) return no('voie inconnue « ' + cut(v.voie, 12) + ' »');
    if (ms(v.at) === null) return no('heure invalide');
    var vide = typeof v.phrase !== 'string' || v.phrase.trim() === '';
    if (vide && v.verdict !== 'bonne') return no('phrase obligatoire pour « ' + v.verdict + ' » (« ' + v.priorite + ' ' + v.verdict + ' » sans phrase refusé)');
    var suffix = v.voie === 'mail' ? String(v.messageId || 'sans-id').replace(/[^A-Za-z0-9]/g, '').slice(0, 24) + '-' + v.priorite : 'issam';
    var id = 'vd-' + v.jour.replace(/-/g, '') + '-' + v.priorite + '-' + v.voie + '-' + (v.voie === 'mail' ? suffix : suffix);
    var data = { jour: v.jour, priorite: v.priorite, verdict: v.verdict, phrase: vide ? '—' : v.phrase, voie: v.voie, at: v.at, statut: 'valide' };
    if (v.messageId) data.message_id = String(v.messageId);
    if (typeof v.brut === 'string') data.brut = v.brut;
    if (isStr(v.titre_priorite)) data.titre_priorite = v.titre_priorite;
    var h = prev && isObj(prev) ? (Array.isArray(prev.historique) ? prev.historique.slice() : []) : null;
    if (h && prev.verdict) { h.push({ verdict: prev.verdict, phrase: prev.phrase, at: prev.at }); data.historique = h; }
    return { ok: true, id: id, data: data };
  }
  function parseReply(text, p) {
    var out = { verdicts: [], ignorees: [] };
    if (typeof text !== 'string') return out;
    var ids = {}; ((p && p.priorites) || []).forEach(function (x) { if (x && x.id) ids[String(x.id).toUpperCase()] = 1; });
    var re = /^\s*(?:(P\d{1,2})\s*[:\-–]?\s*)?(bonne|mauvaise|manquante)\b\.?\s*(?:[:\-–—]\s*(.*))?$/i;
    var m = 0;
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      if (/^--\s*$/.test(ln)) break;
      if (/^\s*>/.test(ln)) { if (/\b(bonne|mauvaise|manquante)\b/i.test(ln)) out.ignorees.push(ln.trim()); continue; }
      var r = re.exec(ln);
      if (!r) { if (/^\s*P\d{1,2}\b/i.test(ln)) out.ignorees.push(ln.trim()); continue; }
      var verdict = r[2].toLowerCase(), phrase = r[3] === undefined ? '' : r[3], pid = r[1] ? r[1].toUpperCase() : null, brut = ln.trim();
      if (verdict === 'manquante') { pid = 'M' + (++m); }
      else if (!pid) { out.ignorees.push(brut); continue; }
      var e = { priorite: pid, verdict: verdict, phrase: phrase, brut: brut, ok: true };
      if (pid[0] === 'P' && !ids[pid]) { e.ok = false; e.why = pid + ' absente du plan'; }
      else if (verdict !== 'bonne' && phrase.trim() === '') { e.ok = false; e.why = 'phrase manquante (obligatoire pour ' + verdict + ')'; }
      out.verdicts.push(e);
    }
    return out;
  }

  /* ---------- bilan ---------- */
  function validVerdicts(vs, jour) {
    return (Array.isArray(vs) ? vs : []).map(function (x) { return x && x.data !== undefined && x.id !== undefined && !x.verdict ? x.data : x; }).filter(function (x) { return isObj(x) && x.statut === 'valide' && VERDICTS.indexOf(x.verdict) >= 0 && (!jour || x.jour === jour); });
  }
  function bilan(i) {
    i = isObj(i) ? i : {}; var p = isObj(i.plan) ? i.plan : null;
    var jour = p ? p.jour : i.jour;
    var c = { annoncees: null, traitees: null, brouillons: null, ajoutees: null, faux: null, bonnes: null, manquantes: null };
    var l = {};
    var ann = p && Array.isArray(p.priorites) ? p.priorites.length : null; c.annoncees = ann;
    if (ann === null) l.traitees = '— (aucun plan du jour lu)';
    else if (!Array.isArray(i.traitement) || !i.traitement.length) l.traitees = '— (traitement non évalué : aucune preuve fournie)';
    else {
      var ok = 0, sans = [];
      i.traitement.forEach(function (t) { if (t && t.traitee === true) { if (isStr(t.preuve)) ok++; else sans.push(t.id + ' sans preuve'); } });
      c.traitees = ok; l.traitees = ok + ' sur ' + ann + ' traitées' + (sans.length ? ' (' + sans.join(', ') + ' : non comptée)' : '');
    }
    if (!Array.isArray(i.brouillons)) l.brouillons = '— (comparaison brouillons / envoyés non faite)';
    else {
      var b = { tel_quel: 0, modifie: 0, non_envoye: 0, inconnu: 0, total: i.brouillons.length };
      i.brouillons.forEach(function (d) { var e = d && d.etat; if (e === 'tel_quel' || e === 'modifie' || e === 'non_envoye') b[e]++; else b.inconnu++; });
      c.brouillons = b;
      l.brouillons = b.total ? b.tel_quel + ' tel quel · ' + b.modifie + ' modifié · ' + b.non_envoye + ' non envoyé · ' + b.inconnu + ' — (' + b.total + ' brouillons)' : 'aucun brouillon du jour à comparer';
    }
    if (!Array.isArray(i.ajoutees)) l.ajoutees = '— (priorités ajoutées à la main non relevées)';
    else { c.ajoutees = i.ajoutees.length; l.ajoutees = String(i.ajoutees.length) + (i.ajoutees.length ? ' : ' + i.ajoutees.map(function (a) { return a.titre; }).join(' ; ') : ''); }
    if (!Array.isArray(i.faux)) l.faux = '— (faits faux non relevés)';
    else {
      var co = i.faux.filter(function (f) { return f && f.corrige === true; }).length, nc = i.faux.filter(function (f) { return f && f.corrige !== true; });
      c.faux = { corriges: co, non_corriges: nc.length };
      l.faux = co + ' corrigé' + (co > 1 ? 's' : '') + ' · ' + nc.length + ' non corrigé' + (nc.length > 1 ? 's' : '') + (nc.length ? ' (' + nc.map(function (f) { return f.fait + (f.depuis ? ', depuis ' + f.depuis : ''); }).join(' ; ') + ')' : '');
    }
    var vs = validVerdicts(i.verdicts, jour);
    var pv = vs.filter(function (x) { return x.priorite[0] === 'P' && x.verdict !== 'manquante'; });
    var mq = vs.filter(function (x) { return x.verdict === 'manquante'; });
    c.manquantes = mq.length;
    if (!pv.length) l.bonnes = '— (aucun verdict d\'Issam sur les priorités du ' + (jour || '—') + ')' + (mq.length ? ' · manquantes : ' + mq.length : '');
    else { var n = pv.filter(function (x) { return x.verdict === 'bonne'; }).length; c.bonnes = { n: n, sur: pv.length }; l.bonnes = n + ' sur ' + pv.length + ' jugées bonnes · manquantes : ' + mq.length; }
    var t = ['Priorités traitées : ' + l.traitees, 'Brouillons : ' + l.brouillons, 'Priorités ajoutées à la main : ' + l.ajoutees, 'Faits faux : ' + l.faux, 'Verdicts : ' + l.bonnes];
    return { chiffres: c, lignes: l, texte: t.join('\n') };
  }
  function arret(i) {
    i = isObj(i) ? i : {}; var now = i.now, raisons = [], etat;
    var vs = validVerdicts(i.verdicts).filter(function (x) { return x.priorite[0] === 'P' && x.verdict !== 'manquante'; });
    if (!vs.length) etat = '— (aucun verdict enregistré : critère « bonnes » non évaluable)';
    else {
      var first = Math.min.apply(null, vs.map(function (x) { return ms(x.jour); }));
      var recul = Math.floor((now - first) / 86400000);
      if (recul < RECUL_JOURS) etat = '— (recul insuffisant : ' + recul + ' jours sur ' + RECUL_JOURS + ')';
      else {
        var w = vs.filter(function (x) { return ms(x.jour) >= ms(dayOf(now)) - RECUL_JOURS * 86400000; });
        if (w.length < MIN_VERDICTS) etat = '— (' + w.length + ' verdicts sur ' + MIN_VERDICTS + ' minimum)';
        else {
          var n = w.filter(function (x) { return x.verdict === 'bonne'; }).length;
          etat = n + ' sur ' + w.length + ' priorités bonnes (' + Math.round(100 * n / w.length) + ' %) sur ' + RECUL_JOURS + ' jours';
          if (n / w.length < SEUIL_BONNES) raisons.push('part de priorités bonnes : ' + n + ' sur ' + w.length + ' (' + Math.round(100 * n / w.length) + ' %), moins de 50 % sur ' + RECUL_JOURS + ' jours');
        }
      }
    }
    (Array.isArray(i.faux) ? i.faux : []).forEach(function (f) {
      var t = f && f.corrige !== true ? ms(f.depuis) : null; if (t === null) return;
      var d = Math.floor((now - t) / 86400000);
      if (d >= FAUX_JOURS) raisons.push('fait faux non corrigé depuis ' + d + ' jours : ' + f.fait);
    });
    return { arret: raisons.length > 0, raisons: raisons, etat: etat };
  }

  /* ---------- visibilité ---------- */
  function activityDoc(i) {
    var no = function (why) { return { ok: false, why: why }; };
    if (!isObj(i)) return no('passage absent');
    if (PASSAGES.indexOf(i.passage) < 0) return no('passage inconnu « ' + cut(i.passage, 12) + ' »');
    var d = ms(i.debut); if (d === null) return no('début absent ou illisible');
    var f = i.fin === undefined || i.fin === null ? null : ms(i.fin);
    if (i.fin !== undefined && i.fin !== null && f === null) return no('fin illisible');
    if (f !== null && f < d) return no('fin avant le début');
    var id = 'jr-' + dayOf(d).replace(/-/g, '') + '-' + hm(d).replace(':', '') + '-coach-' + i.passage;
    var echec = isStr(i.echec) ? i.echec : null, lu = Array.isArray(i.lu) ? i.lu : [], pr = Array.isArray(i.produit) ? i.produit : [];
    var etape = f === null ? 'passage ' + i.passage + ' commencé' : echec ? 'échec : ' + echec : 'passage ' + i.passage + ' terminé';
    var data = { agent: 'Coach', passage: i.passage, type: 'journal', phase: f === null ? 'debut' : 'fin', debut: new Date(d).toISOString().slice(0, 19) + 'Z', at: new Date(f === null ? d : f).toISOString().slice(0, 19) + 'Z', etape: cut(etape, 120),
      quoi: 'Passage ' + i.passage + (f === null ? ' en cours' : echec ? ' en échec' : ' terminé') + ' · lu : ' + (lu.length ? lu.join(' ; ') : '—') + ' · produit : ' + (pr.length ? pr.join(' ; ') : '—'),
      lu: lu, produit: pr, echec: echec, source: 'agents/' + id };
    if (f !== null) data.fin = data.at;
    return { ok: true, id: id, data: data };
  }
  function normJ(x) { return isObj(x) && isObj(x.data) ? x.data : x; }
  function missedRuns(i) {
    i = isObj(i) ? i : {}; var now = i.now, day = i.day;
    if (!Array.isArray(i.journal)) return { manques: [], etat: '— (journal illisible : liste absente)' };
    var wd = new Date(day + 'T00:00:00Z').getUTCDay(); var out = [];
    if (wd === 0 || wd === 6) return { manques: [], etat: 'week-end : aucun passage attendu' };
    var J = i.journal.map(normJ).filter(function (x) { return isObj(x) && x.agent === 'Coach'; }).map(function (x) { return { passage: x.passage || (x.passage === undefined ? 'veille' : null), debut: ms(x.debut || x.at), phase: x.phase, at: ms(x.at) }; }).filter(function (x) { return x.debut !== null && dayOf(x.debut) === day; });
    PASSAGES.forEach(function (ps) {
      SCHEDULE[ps].forEach(function (slot) {
        var s = ms(day + 'T' + slot + ':00Z'), wide = ps !== 'veille';
        var hit = J.filter(function (x) { return x.passage === ps && x.debut >= s - 15 * 60000 && x.debut <= s + (wide ? 6 * 3600000 : 45 * 60000); });
        if (now <= s + GRACE_MIN * 60000) return;
        if (!hit.length) { out.push({ passage: ps, attendu: slot, texte: ps + ' ' + PRET[ps] + ' à ' + slot + ' UTC : aucun passage enregistré' }); return; }
        hit.forEach(function (h) {
          if (h.phase !== 'fin' && now > h.debut + GRACE_MIN * 60000) out.push({ passage: ps, attendu: slot, texte: ps + ' commencé à ' + hm(h.debut) + ' UTC sans fin enregistrée' });
          else if (wide && h.debut > s + GRACE_MIN * 60000) out.push({ passage: ps, attendu: slot, retard: true, texte: ps + ' ' + PRET[ps] + ' à ' + slot + ' UTC, commencé à ' + hm(h.debut) + ' UTC (en retard)' });
        });
      });
    });
    return { manques: out, etat: out.length ? out.length + ' passage(s) à signaler' : 'aucun passage manqué' };
  }

  /* ---------- page ---------- */
  function viewModel(i) {
    var now = i.now, day = i.day, anomalies = [], plan = null;
    var d = (Array.isArray(i.plans) ? i.plans : []).filter(function (x) { return x && (x.id === 'pl-' + day || (isObj(x.data) && x.data.jour === day)); })[0];
    if (d) {
      var v = validatePlan(d.data, day);
      if (!v.ok) anomalies.push('plans/' + d.id + ' : ' + v.errors.join(' ; '));
      else plan = d.data;
    }
    var vs = validVerdicts(i.verdicts, day).sort(function (a, b) { return ms(a.at) - ms(b.at); });
    var out = { plan: null, message: null, anomalies: anomalies, manques: [], envoi: null, manquantes: vs.filter(function (x) { return x.verdict === 'manquante'; }), etatJournal: null, non_lu: [] };
    var mr = missedRuns({ now: now, day: day, journal: Array.isArray(i.journal) ? i.journal : null });
    out.manques = mr.manques; out.etatJournal = mr.etat;
    if (!plan) { out.message = anomalies.length ? 'Plan du jour illisible : voir l\'anomalie.' : 'Pas encore de plan pour ce jour : la tâche de 8h (heure du Maroc) le crée.'; return out; }
    out.plan = { jour: plan.jour, attend: plan.attend || [], bloque: plan.bloque || [], mails: plan.mails || null, moins_de_3_raison: plan.moins_de_3_raison || null,
      priorites: plan.priorites.map(function (x) {
        var vd = vs.filter(function (y) { return y.priorite === x.id; }).pop() || null;
        return { id: x.id, titre: x.titre, raison: x.raison, sources: x.sources.map(function (s) { return srcLine(s, now); }), verdict: vd ? { verdict: vd.verdict, phrase: vd.phrase, voie: vd.voie, at: vd.at } : null };
      }) };
    out.non_lu = Array.isArray(plan.non_lu) ? plan.non_lu : [];
    var e = plan.envoi;
    out.envoi = !isObj(e) ? '— (envoi non enregistré)' : e.statut === 'envoye' ? 'mail envoyé à ' + (ms(e.at) === null ? '—' : hm(ms(e.at)) + ' UTC') : 'non envoyé : ' + (e.raison || '— (raison non écrite)');
    return out;
  }

  var api = { SRC_TYPES: SRC_TYPES, VERDICTS: VERDICTS, PASSAGES: PASSAGES, SCHEDULE: SCHEDULE, GRACE_MIN: GRACE_MIN, ms: ms, hm: hm, stamp: stamp, ageLabel: ageLabel, checkSend: checkSend, validatePlan: validatePlan, renderMail: renderMail, verdictDoc: verdictDoc, parseReply: parseReply, bilan: bilan, arret: arret, activityDoc: activityDoc, missedRuns: missedRuns, viewModel: viewModel, isDay: isDay };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PLAN = api;
})(typeof window !== 'undefined' ? window : this);

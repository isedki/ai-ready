/* Refonte du Suivi : logique pure (global SUIVI dans la page, require() dans les tests).
   Deux choses : (1) lire les formats réellement écrits par les routines (aucun schéma changé, on accepte les deux),
   (2) le battement : pour chaque agent, ce qui est prouvé par une donnée datée, ce qui est seulement déclaré, ce qui n'est pas mesurable. */
(function (root) {
  'use strict';
  var A = (typeof module !== 'undefined' && module.exports) ? require('../us6-activite/activite-core.js') : root.ACT;
  var MIN = 60000, H = 3600000, DAY = 86400000;
  var GRACE = 30 * MIN, EARLY = 15 * MIN, COUVRE_RETARD = 90 * MIN;

  function isStr(x) { return typeof x === 'string' && x.trim() !== ''; }
  function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
  function txt(x) { return isStr(x) ? x.trim() : ''; }
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return 's' + (h >>> 0).toString(36); }

  /* ---------- formats réels de jour/<date> ---------- */
  /* Depuis le 25/11, des questions arrivent en texte seul (et non {q}) : la page affichait « 1. » sans texte. */
  function question(q) {
    if (isStr(q)) return { q: q.trim() };
    if (!isObj(q)) return { q: '(question illisible dans jour.questions)', illisible: true };
    var o = Object.assign({}, q);
    o.q = txt(q.q) || txt(q.question) || txt(q.texte) || '(question sans texte dans jour.questions)';
    return o;
  }
  function questions(list) { return (Array.isArray(list) ? list : []).map(question); }
  function perime(p) {
    if (isStr(p)) return { id: hash(p), objet: p.trim() };
    if (!isObj(p)) return { id: hash(String(p)), objet: '(élément illisible)' };
    var objet = txt(p.objet) || txt(p.obj) || txt(p.titre);
    return Object.assign({}, p, { id: txt(p.id) || hash(objet + txt(p.raison)), objet: objet });
  }
  function perimes(list) { return (Array.isArray(list) ? list : []).map(perime); }
  var BR_ETAT = { tel_quel: 'Envoyé tel quel', modifie: 'Envoyé modifié', remplace: 'Remplacé par ton envoi', non_envoye: 'Pas encore envoyé', inconnu: 'Envoi non comparable' };
  var BR_TRAITE = { tel_quel: 1, modifie: 1, remplace: 1 };
  function brouillon(x) {
    if (!isObj(x)) return { id: hash(String(x)), objet: String(x), a: '' };
    var o = Object.assign({}, x);
    o.objet = txt(x.objet) || txt(x.obj);
    o.a = txt(x.a) || txt(x.dest);
    o.etatLu = txt(x.etat) || txt(x.statut);
    o.etatTexte = BR_ETAT[o.etatLu] || o.etatLu;
    o.traite = !!BR_TRAITE[o.etatLu];
    return o;
  }
  function brouillons(list) { return (Array.isArray(list) ? list : []).map(brouillon); }
  function contexte(c) { return Array.isArray(c) ? c.filter(isStr) : (isStr(c) ? [c.trim()] : []); }

  /* ---------- mesures ---------- */
  function ouvresDepuis(day, now) {
    var a = Date.parse(day + 'T12:00:00Z'), b = Date.parse(new Date(now).toISOString().slice(0, 10) + 'T12:00:00Z'), n = 0;
    if (isNaN(a)) return null;
    for (var t = a + DAY; t <= b; t += DAY) { var w = new Date(t).getUTCDay(); if (w !== 0 && w !== 6) n++; }
    return n;
  }
  function vide(v) { return v === undefined || v === null || /^\s*(—|-)?\s*$/.test(String(v)); }
  function mesures(kpiDoc, now) {
    if (!kpiDoc) return null;
    var day = String(kpiDoc.date || '').slice(0, 10), age = ouvresDepuis(day, now);
    var all = (Array.isArray(kpiDoc.mesures) ? kpiDoc.mesures : []).filter(isObj);
    return {
      day: day, age: age, perime: age === null || age >= 1,
      mesurees: all.filter(function (m) { return !vide(m.valeur); }),
      nonMesurees: all.filter(function (m) { return vide(m.valeur); }).map(function (m) { return { nom: m.nom, raison: vide(m.source) ? 'raison non écrite par l\'agent' : String(m.source), avant: vide(m.avant) ? null : String(m.avant), cible: vide(m.cible) ? null : String(m.cible) }; })
    };
  }

  /* ---------- battement ---------- */
  var ETATS = {
    echec: { n: 0, ton: 'rouge', lab: 'Échec' },
    absent: { n: 1, ton: 'rouge', lab: 'Passage absent' },
    sanstrace: { n: 2, ton: 'orange', lab: 'Réussi déclaré, rien d\'écrit' },
    retard: { n: 3, ton: 'orange', lab: 'En retard ? aucune trace' },
    inactif: { n: 4, ton: 'orange', lab: 'Inactif' },
    encours: { n: 5, ton: 'gris', lab: 'En cours à la photo' },
    declare: { n: 6, ton: 'gris', lab: 'Déclaré, résultat non prouvé' },
    prouve: { n: 7, ton: 'vert', lab: 'Trace écrite' },
    attente: { n: 8, ton: 'gris', lab: 'Aucun passage connu' },
    inconnu: { n: 9, ton: 'gris', lab: '— état non lisible' },
    local: { n: 10, ton: 'gris', lab: 'Non mesurable d\'ici' }
  };

  function docs(list) { return (Array.isArray(list) ? list : []).filter(function (d) { return d && isObj(d.data); }); }
  function when(v) { var p = A.parseWhen(v); return p.ok && p.hm !== null ? p.ms : null; }
  function strList(v) { return Array.isArray(v) ? v.filter(isStr) : (isStr(v) ? [v] : []); }

  /* Toutes les traces écrites, rangées par fiche. Une trace = une donnée datée du Suivi, jamais un statut de session. */
  function traces(inp, fiches, ecartes) {
    var by = {};
    function add(fid, t) { if (!fid) return; (by[fid] = by[fid] || []).push(t); }
    function fid(name) {
      if (ecartes && (ecartes.etiquettes || []).indexOf(name) >= 0) return null;
      if (ecartes && ecartes.motif_session_dev && new RegExp(ecartes.motif_session_dev, 'i').test(name)) return null;
      var f = A.ficheFor(fiches, name); return f ? f.id : null;
    }
    var raw = {}; docs(inp.agents).forEach(function (d) { raw[d.id] = d.data; });
    var model = A.buildModel({ agents: inp.agents, livrables: inp.livrables, now: inp.now, day: '' });
    model.journal.forEach(function (j) {
      var r = raw[j.id] || {};
      add(fid(j.agent), { ms: j.at.ms, source: 'agents/' + j.id, quoi: j.quoi || j.etape || '', lu: strList(r.lu), produit: strList(r.produit), nonFait: '', pourquoi: txt(r.source), echec: j.echec || '' });
    });
    model.livrablesOk.forEach(function (l) {
      add(fid(l.agent), { ms: l.heure ? l.heure.ms : Date.parse(l.jour + 'T00:00:00Z'), jourSeul: !l.heure, source: 'livrables/' + l.id, quoi: l.type + ' : ' + l.titre, lu: [], produit: [l.type + ' : ' + l.titre], nonFait: '', echec: '' });
    });
    docs(inp.jours).forEach(function (d) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.id)) return;
      (Array.isArray(d.data.passages) ? d.data.passages : []).forEach(function (p) {
        if (!isObj(p) || !isStr(p.tache)) return;
        /* « matin » et « bilan » tout court sont les anciennes routines quotidiennes, désactivées : ne pas les prêter au bilan hebdomadaire */
        if (/^(matin|bilan)$/i.test(p.tache.trim())) return;
        var id = /veille/i.test(p.tache) ? 'veille-coach' : /bilan-hebdo/i.test(p.tache) ? 'bilan-hebdo' : fid(p.tache);
        var hm = /^(\d{1,2})[:h](\d{2})/.exec(txt(p.heure));
        var ms = hm ? Date.parse(d.id + 'T00:00:00Z') + (+hm[1]) * H + (+hm[2]) * MIN : Date.parse(d.id + 'T00:00:00Z');
        add(id, { ms: ms, jourSeul: !hm, passage: true, source: 'jour/' + d.id + '.passages', quoi: txt(p.fait), lu: [], produit: typeof p.brouillons_crees === 'number' ? [p.brouillons_crees + ' brouillon(s) créé(s)'] : [], fait: txt(p.fait), nonFait: txt(p.non_fait), cout: txt(p.cout), echec: '' });
      });
      if (isStr(d.data.tram)) add('formateur', { ms: Date.parse(d.id + 'T00:00:00Z'), jourSeul: true, source: 'jour/' + d.id + '.tram', quoi: 'capsules écrites', lu: [], produit: ['capsules de formation du ' + d.id.slice(8) + '/' + d.id.slice(5, 7)], nonFait: '', echec: '', texte: d.data.tram });
    });
    docs(inp.plans).forEach(function (d) {
      var e = d.data.envoi, ms = isObj(e) ? when(e.at) : null; if (ms === null) ms = when(d.data.cree_a);
      var day = txt(d.data.jour) || d.id.replace(/^pl-/, '');
      add('coach-plan', { ms: ms !== null ? ms : Date.parse(day + 'T00:00:00Z'), jourSeul: ms === null, source: 'plans/' + d.id, quoi: 'plan du jour écrit' + (isObj(e) && e.statut ? ' (' + e.statut + ')' : ''), lu: [], produit: ['plan du ' + day.slice(8) + '/' + day.slice(5, 7)], nonFait: '', echec: '' });
    });
    /* tâches locales : on ne les voit pas tourner, on voit seulement ce qu'elles laissent dans le Suivi */
    docs(inp.agents).forEach(function (d) {
      if (d.data.type === 'kpi' && /^kpi-\d{4}-\d{2}-\d{2}$/.test(d.id)) add('controle-couts', { ms: Date.parse(d.id.slice(4) + 'T00:00:00Z'), jourSeul: true, source: 'agents/' + d.id, quoi: 'mesures du jour écrites (le bilan du vendredi peut aussi écrire ce document)', lu: [], produit: ['mesures d\'efficacité'], nonFait: '', echec: '' });
    });
    [['profil', /^profil-(\d{4}-\d{2}-\d{2})$/, 'profil écrit'], ['frictions', /^fr-(\d{4})(\d{2})(\d{2})$/, 'journal des frictions écrit']].forEach(function (c) {
      docs(inp[c[0]]).forEach(function (d) {
        var m = c[1].exec(d.id); if (!m) return; var day = m.length > 2 ? m[1] + '-' + m[2] + '-' + m[3] : m[1];
        add('us14-profil', { ms: Date.parse(day + 'T00:00:00Z'), jourSeul: true, source: c[0] + '/' + d.id, quoi: c[2], lu: [], produit: [c[2]], nonFait: '', echec: '' });
      });
    });
    Object.keys(by).forEach(function (k) { by[k].sort(function (a, b) { return b.ms - a.ms; }); });
    return by;
  }
  function sameDay(a, b) { return new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10); }
  /* une trace couvre un passage si elle est écrite entre 15 min avant son début et la fin de la fenêtre */
  function couvre(t, run, fenetre) { return t.jourSeul ? sameDay(t.ms, run) : (t.ms >= run - EARLY && t.ms <= run + fenetre); }
  function label(ms, jourSeul) { return jourSeul ? new Date(ms).toISOString().slice(8, 10) + '/' + new Date(ms).toISOString().slice(5, 7) + ' (heure —)' : A.fmtDM(ms); }

  function heartbeat(inp) {
    var now = inp.now, cfg = inp.fiches || { fiches: [] }, fiches = cfg.fiches || [];
    var direct = A.buildDirect({ agents: inp.agents, livrables: inp.livrables, jour: inp.jourToday || null, fiches: cfg, now: now });
    var T = traces(inp, fiches, cfg.ecartes);
    var photoMs = direct.photo.at ? direct.photo.at.ms : null;
    var groups = {}, order = [], off = [];
    direct.routines.forEach(function (r) {
      if (r.enabled === false) { off.push(r); return; }
      var k = r.fiche || r.nom;
      if (!groups[k]) { groups[k] = { cle: k, fiche: r.fiche, rows: [] }; order.push(k); }
      groups[k].rows.push(r);
    });
    var agents = order.map(function (k) {
      var g = groups[k], f = fiches.filter(function (x) { return x.id === g.fiche; })[0] || null;
      var tr = (g.fiche && T[g.fiche]) || [];
      var local = !!(f && f.local);
      var nom = f ? f.nom : g.rows[0].nom.replace(/^Phénix · /, '');
      var o = { cle: k, nom: nom, local: local, fiche: f, rows: g.rows, trace: tr[0] || null, tracesJour: tr.filter(function (t) { return sameDay(t.ms, now); }), declare: null, prochain: null, etat: null, pourquoi: [], faire: [] };
      var declared = null;
      g.rows.forEach(function (r) {
        if (r.dernier && !r.dernier.duJournal && (!declared || r.dernier.ms > declared.ms)) declared = { ms: r.dernier.ms, statut: r.statutBrut, routine: r.nom, statutNorm: r.statut };
        if (r.prochain && r.prochain.ms > now && (!o.prochain || r.prochain.ms < o.prochain.ms)) o.prochain = { ms: r.prochain.ms, label: r.prochain.label, src: r.prochainSrc };
      });
      /* après une photo ancienne, le « prochain » peut être passé : recalcul du cron, dit comme tel */
      if (!o.prochain) g.rows.forEach(function (r) { var c = r.cron ? A.parseCron(r.cron) : { ok: false }; if (!c.ok) return; var n = A.nextFire(c, now); if (n && (!o.prochain || n < o.prochain.ms)) o.prochain = { ms: n, label: A.fmtDM(n), src: 'calculé du cron' }; });
      if (declared) o.declare = { ms: declared.ms, label: A.fmtDM(declared.ms), age: A.fmtAge(declared.ms, now), statut: declared.statut, routine: declared.routine };
      if (o.trace) { o.trace = Object.assign({}, o.trace, { label: label(o.trace.ms, o.trace.jourSeul), age: o.trace.jourSeul ? null : A.fmtAge(o.trace.ms, now) }); }

      var cand = [];
      function flag(etat, why) { cand.push(etat); if (why) o.pourquoi.push(why); }
      if (local) {
        flag('local', 'tâche du Mac : son exécution n\'est pas lisible depuis claude.ai. Seules ses écritures dans le Suivi sont visibles.');
        if (!o.trace) o.pourquoi.push('aucune écriture lisible depuis cette page');
      } else if (direct.photo.etat !== 'ok' && !declared && !o.trace) flag('inconnu', 'photo des routines non lisible et aucune trace');
      else {
        g.rows.forEach(function (r) {
          if (r.etat === 'echec') flag('echec', r.nom + ' : statut « ' + (r.statutBrut || '—') + ' »');
          if (r.etat === 'absent') flag('absent', r.nom + ' : ' + r.absent);
          if (r.etat === 'inactif') flag('inactif', r.nom + ' : ' + r.inactif);
          /* retard : un passage attendu APRÈS la photo, dont rien d'écrit ne parle */
          var c = r.cron ? A.parseCron(r.cron) : { ok: false };
          if (c.ok && photoMs !== null) {
            var F = A.lastFire(c, now - GRACE);
            if (F && F > photoMs && !(r.dernier && r.dernier.ms >= F - EARLY) && !tr.some(function (t) { return couvre(t, F, COUVRE_RETARD); })) {
              /* le même agent a écrit plus tard : pas d'alerte, mais on dit que ce créneau précis n'est pas prouvé */
              var apres = tr.filter(function (t) { return !t.jourSeul && t.ms > F; })[0];
              if (apres) o.pourquoi.push(r.nom + ' : rien d\'écrit au créneau de ' + A.fmtDM(F) + ' (horaire lu dans la photo du ' + direct.photo.label + ') ; l\'agent a écrit à ' + A.fmtDM(apres.ms) + '.');
              else flag('retard', r.nom + ' : attendu à ' + A.fmtDM(F) + ', aucune trace écrite depuis. La photo date de ' + direct.photo.label + ' : elle ne peut ni le confirmer ni l\'infirmer.');
            }
          }
        });
        if (o.trace && o.trace.echec) flag('echec', 'échec écrit au journal : ' + o.trace.echec);
        if (declared) {
          var proof = tr.some(function (t) { return couvre(t, declared.ms, DAY / 2) || t.ms >= declared.ms - EARLY; });
          if (proof) flag(o.trace && o.trace.echec ? 'echec' : 'prouve');
          else if (declared.statutNorm === 'encours') flag('encours', 'la photo a été prise pendant ce passage ; aucune trace écrite ensuite');
          else if (tr.length) flag('sanstrace', 'rien d\'écrit dans le Suivi pour le passage du ' + A.fmtDM(declared.ms) + ' (dernière trace : ' + label(tr[0].ms, tr[0].jourSeul) + ')');
          else flag('declare', 'cette routine n\'écrit rien que la page sache lire : son résultat n\'est pas prouvé ici');
        } else if (o.trace) flag('prouve');
        else flag('attente', 'jamais passée ou sans trace : la photo ne permet pas de trancher');
      }
      cand.sort(function (a, b) { return ETATS[a].n - ETATS[b].n; });
      o.etat = cand[0]; o.ton = ETATS[o.etat].ton; o.etatTexte = ETATS[o.etat].lab;
      return o;
    });

    /* ce qu'Issam doit faire, rattaché à l'agent qui le demande */
    var byKey = {}; agents.forEach(function (a) { byKey[a.cle] = a; });
    var j = inp.jourToday && inp.jourToday.data, ret = inp.retourToday || {};
    if (j && byKey['veille-coach']) {
      var nq = questions(j.questions).filter(function (q, i) { return !(q.reponse || (ret.questions || {})[i]); }).length;
      var nb = brouillons(j.brouillons).filter(function (b) { return !b.traite && !(ret.brouillons || {})[b.id]; }).length;
      var np = perimes(j.perimes).filter(function (p) { return !(ret.perimes || {})[p.id]; }).length;
      if (nq) byKey['veille-coach'].faire.push({ t: 'répondre à ' + nq + ' question' + (nq > 1 ? 's' : ''), cible: 'questions' });
      if (nb) byKey['veille-coach'].faire.push({ t: 'relire ' + nb + ' brouillon' + (nb > 1 ? 's' : ''), cible: 'brouillons' });
      if (np) byKey['veille-coach'].faire.push({ t: 'supprimer ' + np + ' brouillon' + (np > 1 ? 's' : '') + ' périmé' + (np > 1 ? 's' : ''), cible: 'perimes' });
    }
    var av = direct.afaire.filter(function (x) { return x.kind === 'valider'; }).length;
    if (av && byKey.developpeurs) byKey.developpeurs.faire.push({ t: 'valider ' + av + ' histoire' + (av > 1 ? 's' : ''), cible: 'sprint' });
    agents.forEach(function (a) {
      if (a.ton === 'rouge') a.faire.push({ t: 'regarder ce passage', cible: null });
      else if (a.etat === 'sanstrace' || a.etat === 'retard') a.faire.push({ t: 'vérifier que le passage a eu lieu', cible: null });
    });
    agents.sort(function (a, b) { return (a.local - b.local) || (ETATS[a.etat].n - ETATS[b.etat].n) || a.nom.localeCompare(b.nom, 'fr'); });

    var alertes = agents.filter(function (a) { return a.ton === 'rouge' || a.ton === 'orange'; }).length;
    /* la photo peut être « récente » et déjà dépassée par un passage plus tardif de la Veille */
    var depassee = null;
    if (photoMs !== null) (T['veille-coach'] || []).some(function (t) { if (!t.jourSeul && t.ms > photoMs + COUVRE_RETARD) { depassee = 'la Veille est repassée le ' + A.fmtDM(t.ms) + ' sans réécrire la photo'; return true; } return false; });
    return { direct: direct, agents: agents, desactivees: off, alertes: alertes, photoDepassee: depassee };
  }

  var api = { question: question, questions: questions, perime: perime, perimes: perimes, brouillon: brouillon, brouillons: brouillons, contexte: contexte, mesures: mesures, ouvresDepuis: ouvresDepuis, heartbeat: heartbeat, traces: traces, ETATS: ETATS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SUIVI = api;
})(typeof window !== 'undefined' ? window : this);

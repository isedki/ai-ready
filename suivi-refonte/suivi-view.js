/* Refonte du Suivi : rendu du battement. Toute valeur du suivi passe par textContent. */
(function (root) {
  'use strict';
  function h(doc, tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function cut(s, n) { s = String(s || '').replace(/\s+/g, ' '); return s.length > n ? s.slice(0, n) + '…' : s; }
  function quand(a) {
    if (a.trace) return 'trace ' + a.trace.label;
    if (a.declare) return 'déclaré ' + a.declare.label;
    return '—';
  }

  /* bandeau d'« Aujourd'hui » : un coup d'œil, un clic mène à la fiche */
  function renderPulse(doc, mount, hb, onOpen) {
    mount.textContent = '';
    var p = hb.direct.photo;
    var head = h(doc, 'div', 'sv-ph');
    head.appendChild(h(doc, 'strong', '', 'Agents'));
    head.appendChild(h(doc, 'span', 'sv-pill ' + (hb.alertes ? 'orange' : 'gris'), hb.alertes ? hb.alertes + ' à regarder' : 'aucune alerte lisible'));
    head.appendChild(h(doc, 'span', 'sv-meta', p.etat === 'ok' ? 'photo des routines : ' + p.label + ' (' + p.age + ')' + (hb.photoDepassee ? ' · dépassée' : p.stale ? ' · ancienne' : '') : 'photo des routines : — (' + p.etat + ')'));
    mount.appendChild(head);
    var row = h(doc, 'div', 'sv-chips');
    hb.agents.forEach(function (a) {
      var b = h(doc, 'button', 'sv-chip ' + a.ton); b.type = 'button';
      b.appendChild(h(doc, 'span', 'sv-dot'));
      b.appendChild(h(doc, 'span', 'sv-cn', a.nom));
      b.appendChild(h(doc, 'span', 'sv-cq', quand(a).replace(/^(trace|déclaré) /, '')));
      b.title = a.etatTexte + ' · ' + quand(a);
      b.setAttribute('aria-label', a.nom + ' : ' + a.etatTexte + ', ' + quand(a));
      b.addEventListener('click', function () { onOpen(a.cle); });
      row.appendChild(b);
    });
    mount.appendChild(row);
  }

  function line(doc, box, k, v, cls) {
    var d = h(doc, 'div', 'sv-l' + (cls ? ' ' + cls : '')); d.appendChild(h(doc, 'span', 'sv-k', k)); d.appendChild(h(doc, 'span', 'sv-v', v)); box.appendChild(d); return d;
  }

  function card(doc, a, ctx) {
    var c = h(doc, 'article', 'sv-card ' + a.ton); c.id = 'sv-' + a.cle;
    var top = h(doc, 'div', 'sv-top'); top.appendChild(h(doc, 'h3', '', a.nom)); top.appendChild(h(doc, 'span', 'sv-pill ' + a.ton, a.etatTexte)); c.appendChild(top);
    line(doc, c, 'Prouvé', a.trace ? a.trace.label + (a.trace.age ? ' · ' + a.trace.age : '') : '— (aucune trace écrite lisible)');
    if (!a.local) line(doc, c, 'Déclaré', a.declare ? a.declare.label + ' « ' + (a.declare.statut || '—') + ' »' : '— (la photo ne donne pas de dernier passage)', 'sv-sec');
    line(doc, c, 'Prochain', a.prochain ? a.prochain.label + (a.prochain.src === 'photo' ? '' : ' (' + a.prochain.src + ')') : a.local ? '— (horaire du Mac non lisible d\'ici)' : '—');
    if (a.pourquoi.length && a.ton !== 'vert') c.appendChild(h(doc, 'div', 'sv-why ' + a.ton, a.pourquoi[0]));
    if (a.trace && a.trace.quoi) c.appendChild(h(doc, 'div', 'sv-quoi', cut(a.trace.quoi, 150)));
    if (a.faire.length) {
      var f = h(doc, 'div', 'sv-faire'); f.appendChild(h(doc, 'span', 'sv-k', 'À toi'));
      a.faire.forEach(function (x) {
        if (x.cible && ctx.onGo) { var b = h(doc, 'button', 'sv-go', x.t + ' →'); b.type = 'button'; b.addEventListener('click', function () { ctx.onGo(x.cible); }); f.appendChild(b); }
        else f.appendChild(h(doc, 'span', 'sv-v', x.t));
      });
      c.appendChild(f);
    }
    var det = h(doc, 'details', 'sv-det'); det.appendChild(h(doc, 'summary', '', 'Lu, produit, pas fait, fiche'));
    if (ctx.open && ctx.open[a.cle]) det.setAttribute('open', '');
    det.addEventListener('toggle', function () { if (ctx.onToggle) ctx.onToggle(a.cle, det.open); });
    var list = a.tracesJour.length ? a.tracesJour : (a.trace ? [a.trace] : []);
    if (!list.length) det.appendChild(h(doc, 'div', 'sv-meta', 'Aucune trace à détailler.'));
    else det.appendChild(h(doc, 'div', 'sv-k', a.tracesJour.length ? 'Constaté aujourd\'hui (' + list.length + ')' : 'Dernière trace (pas d\'aujourd\'hui)'));
    list.slice(0, 6).forEach(function (t) {
      var b = h(doc, 'div', 'sv-trace');
      b.appendChild(h(doc, 'div', 'sv-meta', (t.label || new Date(t.ms).toISOString().slice(8, 10) + '/' + new Date(t.ms).toISOString().slice(5, 7) + (t.jourSeul ? ' (heure —)' : ' ' + new Date(t.ms).toISOString().slice(11, 16))) + ' · source : ' + t.source));
      if (t.quoi) line(doc, b, t.passage ? 'Fait' : 'Écrit', t.quoi);
      line(doc, b, 'Lu', t.lu && t.lu.length ? t.lu.join(' ; ') : (t.passage ? 'voir « Fait » : pas de champ « lu » séparé' : '— (non écrit)'));
      line(doc, b, 'Produit', t.produit && t.produit.length ? t.produit.join(' ; ') : '— (non écrit)');
      if (t.nonFait) line(doc, b, 'Pas fait', t.nonFait, 'sv-nf');
      if (t.cout) line(doc, b, 'Coût dit', t.cout);
      if (t.echec) line(doc, b, 'Échec', t.echec, 'sv-nf');
      if (t.texte) { var tx = h(doc, 'details', 'sv-det'); tx.appendChild(h(doc, 'summary', '', 'Lire les capsules')); tx.appendChild(h(doc, 'div', 'sv-text', t.texte)); b.appendChild(tx); }
      det.appendChild(b);
    });
    a.pourquoi.slice(a.ton === 'vert' ? 0 : 1).forEach(function (w) { line(doc, det, 'Aussi', w); });
    if (a.fiche) { line(doc, det, 'Doit lire', (a.fiche.lit || '—') + ' (prévu par la fiche, pas constaté)'); line(doc, det, 'Doit produire', a.fiche.produit || '—'); line(doc, det, 'Garde-fou', a.fiche.garde_fou || '—'); line(doc, det, 'Source fiche', a.fiche.source || '—'); }
    a.rows.forEach(function (r) { if (r.cron) line(doc, det, 'Routine', r.nom + ' · ' + r.cron + ' · modèle ' + (r.modele || '—') + ' · seuil ' + (r.seuilTxt || '—')); });
    c.appendChild(det);
    return c;
  }

  function renderBeat(doc, mount, hb, ctx) {
    mount.textContent = '';
    var p = hb.direct.photo;
    var ok = p.etat === 'ok' && !p.stale && !p.erreur && !hb.photoDepassee;
    var ban = h(doc, 'div', 'sv-banner ' + (ok ? 'gris' : 'orange'));
    ban.textContent = p.etat === 'ok' ? 'Photo des routines du ' + p.label + ' (' + p.age + ')' + (hb.photoDepassee ? ' · dépassée : ' + hb.photoDepassee : p.stale ? ' · ancienne' : '') + '. « Déclaré » vient de cette photo ; « Prouvé » vient d\'une donnée écrite dans le Suivi. Heures UTC = Maroc.'
      : 'Photo des routines ' + p.etat + (p.erreur || p.cause ? ' : ' + (p.erreur || p.cause) : '') + '. Les passages « déclarés » restent « — ».';
    mount.appendChild(ban);
    var cloud = hb.agents.filter(function (a) { return !a.local; }), local = hb.agents.filter(function (a) { return a.local; });
    var grid = h(doc, 'div', 'sv-grid'); cloud.forEach(function (a) { grid.appendChild(card(doc, a, ctx)); }); mount.appendChild(grid);
    if (local.length) {
      mount.appendChild(h(doc, 'h2', 'gs-sec', 'Tâches du Mac'));
      var g2 = h(doc, 'div', 'sv-grid'); local.forEach(function (a) { g2.appendChild(card(doc, a, ctx)); }); mount.appendChild(g2);
    }
    if (hb.desactivees.length) {
      var d = h(doc, 'details', 'sv-det sv-off'); d.appendChild(h(doc, 'summary', '', hb.desactivees.length + ' routines désactivées'));
      var ul = h(doc, 'ul'); hb.desactivees.forEach(function (r) { ul.appendChild(h(doc, 'li', '', r.nom + (r.dernier ? ' · dernier passage ' + r.dernier.label : ''))); }); d.appendChild(ul); mount.appendChild(d);
    }
  }

  var api = { renderPulse: renderPulse, renderBeat: renderBeat };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SUIVIV = api;
})(typeof window !== 'undefined' ? window : this);

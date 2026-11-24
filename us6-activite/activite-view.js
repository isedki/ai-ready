/* US-6 : rendu de l'onglet Activité. N'utilise que createElement / appendChild / textContent / setAttribute / addEventListener,
   donc testable avec un DOM minimal. Toute valeur du suivi passe par textContent, jamais par innerHTML. */
(function (root) {
  'use strict';
  function h(doc, tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function dm(day) { return day.slice(8, 10) + '/' + day.slice(5, 7); }
  function line(doc, parent, label, value, cls) { var r = h(doc, 'div', 'ac-l' + (cls ? ' ' + cls : '')); r.appendChild(h(doc, 'span', 'ac-k', label)); r.appendChild(h(doc, 'span', 'ac-v', value)); parent.appendChild(r); return r; }

  /* mount : conteneur à vider ; model : sortie de ACT.buildModel ; ctx : {sources:[{coll,ok,n,at,err}], drive:{url,nom}|null, onIndex:fn, typeLabel:{}} */
  function renderActivite(doc, mount, model, ctx) {
    mount.textContent = '';
    var src = h(doc, 'div', 'ac-src'); src.setAttribute('role', 'status');
    (ctx.sources || []).forEach(function (s) {
      var t = s.ok ? s.coll + ' : ' + s.n + ' document' + (s.n > 1 ? 's' : '') + ', lu à ' + s.at : s.coll + ' : ' + (s.err ? 'lecture en échec (' + s.err + ')' : 'pas encore lu');
      src.appendChild(h(doc, 'span', 'ac-pill ' + (s.ok ? 'ok' : 'ko'), t));
    });
    mount.appendChild(src);

    if (model.anomalies.length) {
      var det = h(doc, 'details', 'ac-anom'); det.setAttribute('open', '');
      det.appendChild(h(doc, 'summary', '', model.anomalies.length + ' anomalie' + (model.anomalies.length > 1 ? 's' : '') + ' dans les données (document et cause)'));
      var ul = h(doc, 'ul'); model.anomalies.forEach(function (a) { ul.appendChild(h(doc, 'li', '', a.where + ' : ' + a.cause + (a.soft ? ' (affiché malgré tout)' : ' (non affiché)'))); });
      det.appendChild(ul); mount.appendChild(det);
    }

    var head = h(doc, 'div', 'ac-head');
    head.appendChild(h(doc, 'div', 'ac-day', 'Jour affiché : ' + dm(model.day) + ' · ' + model.nLivrablesJour + ' livrable' + (model.nLivrablesJour > 1 ? 's' : '') + ' (source : livrables)'));
    var dr = h(doc, 'div', 'ac-drive');
    if (ctx.drive && ctx.drive.url) { var a = h(doc, 'a', '', ctx.drive.nom || 'Dossier Drive'); a.href = ctx.drive.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; dr.appendChild(a); dr.appendChild(h(doc, 'span', 'ac-src1', ' (source : reglages/drive-livrables)')); }
    else dr.appendChild(h(doc, 'span', 'ac-src1', 'Dossier Drive : — (reglages/drive-livrables absent)'));
    var b = h(doc, 'button', 'btn small', 'Refaire l\'index du jour'); b.type = 'button'; b.addEventListener('click', function () { if (ctx.onIndex) ctx.onIndex(model.day); });
    dr.appendChild(b); head.appendChild(dr); mount.appendChild(head);

    if (!model.agents.length) {
      var e = h(doc, 'div', 'ac-empty'); e.appendChild(h(doc, 'strong', '', 'Aucun agent à afficher'));
      e.appendChild(doc.createTextNode('Ni la collection agents ni la collection livrables ne contient de donnée lisible' + (model.anomalies.length ? ' (voir les anomalies ci-dessus).' : ' pour ce filtre.')));
      mount.appendChild(e);
    }
    var grid = h(doc, 'div', 'ac-grid');
    model.agents.forEach(function (ag) {
      var c = h(doc, 'article', 'ac-card'), t = h(doc, 'h3', '', ag.name); c.appendChild(t);
      line(doc, c, 'Planification', ag.quand ? ag.quand + ' · source : agents/' + ag.docId : '— (aucun document agent) ');
      line(doc, c, 'Exécution réelle', '— (non lisible depuis le suivi : les tâches planifiées vivent dans l\'app et claude.ai)');
      if (ag.pass) {
        var p = line(doc, c, 'Dernier passage', ag.pass.label + ' UTC · ' + ag.pass.age + ' · ' + (ag.pass.quoi || '—') + ' · source : ' + ag.pass.source);
        if (ag.inactif) { p.appendChild(h(doc, 'span', 'ac-pill ko', ag.inactif)); }
      } else line(doc, c, 'Dernier passage', '—').appendChild(h(doc, 'span', 'ac-pill ko', ag.inactif || 'aucun passage enregistré (—)'));
      if (ag.hb) { var hb = line(doc, c, 'Battement', ag.hb.phase + ' · ' + (ag.hb.etape || '—') + ' · ' + ag.hb.label + ' UTC · ' + ag.hb.age + ' · source : ' + ag.hb.source); if (ag.hbOuvert) hb.appendChild(h(doc, 'span', 'ac-pill ko', ag.hbOuvert)); }
      else line(doc, c, 'Battement', '— (aucun début / étape / fin écrit dans le journal)');
      var ls = h(doc, 'div', 'ac-liv'); ls.appendChild(h(doc, 'div', 'ac-k', 'Livrables du ' + dm(model.day) + ' (' + ag.livrables.length + ')'));
      if (!ag.livrables.length) ls.appendChild(h(doc, 'div', 'ac-none', 'Aucun livrable enregistré ce jour dans livrables' + (ag.livrablesTous ? ' (' + ag.livrablesTous + ' sur d\'autres jours)' : '') + '.'));
      ag.livrables.forEach(function (l) {
        var r = h(doc, 'div', 'ac-item'); r.appendChild(h(doc, 'span', 'ac-type', (ctx.typeLabel && ctx.typeLabel[l.type]) || l.type));
        if (l.url) { var k = h(doc, 'a', '', l.titre); k.href = l.url; k.target = '_blank'; k.rel = 'noopener noreferrer'; r.appendChild(k); } else r.appendChild(h(doc, 'span', 'ac-ttl', l.titre));
        var meta = [l.heure ? l.heure.hm + ' UTC' : 'heure —', l.fil ? 'fil ' + l.fil : null, l.histoire ? l.histoire : null, l.branche ? 'branche ' + l.branche : null, l.lienCasse ? 'lien cassé' : null, l.doublons ? 'enregistré ' + l.doublons + ' fois' : null, 'source : ' + (l.source || '—') + ' (livrables/' + l.id + ')'].filter(Boolean);
        r.appendChild(h(doc, 'div', 'ac-meta', meta.join(' · '))); ls.appendChild(r);
      });
      c.appendChild(ls); grid.appendChild(c);
    });
    mount.appendChild(grid);

    mount.appendChild(h(doc, 'h3', 'ac-sec', 'Étape en cours des histoires (go donné)'));
    if (!model.stories.length) mount.appendChild(h(doc, 'div', 'ac-none', 'Aucune histoire au statut go ou encours dans agents.'));
    model.stories.forEach(function (s) {
      var c = h(doc, 'div', 'ac-story'); c.appendChild(h(doc, 'strong', '', s.ref + (s.titre ? ' · ' + s.titre : '')));
      var d = h(doc, 'div', 'ac-meta', 'statut ' + s.statut + ' · étape : ' + (s.etape || '—') + (s.compte ? ' (' + s.compte + ' cochées)' : '') + ' · ' + (s.at ? 'dernier passage ' + s.at.label + ' UTC, ' + s.at.age : 'dernier passage —') + ' · source : ' + s.source);
      c.appendChild(d); if (s.aValider) c.appendChild(h(doc, 'span', 'ac-pill wait', 'à valider par Issam')); if (s.inactif) c.appendChild(h(doc, 'span', 'ac-pill ko', s.inactif));
      mount.appendChild(c);
    });
  }
  function fillOptions(doc, sel, pairs, current) {
    sel.textContent = ''; var found = false;
    pairs.forEach(function (p) { var o = doc.createElement('option'); o.value = p[0]; o.textContent = p[1]; sel.appendChild(o); if (p[0] === current) found = true; });
    sel.value = found ? current : (pairs[0] ? pairs[0][0] : '');
  }
  var api = { renderActivite: renderActivite, fillOptions: fillOptions };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ACTV = api;
})(typeof window !== 'undefined' ? window : this);

/* US-18 : rendu de l'onglet Activité (vue en direct). N'utilise que createElement / appendChild / textContent / setAttribute / addEventListener,
   donc testable avec un DOM minimal. Toute valeur du suivi passe par textContent, jamais par innerHTML. */
(function (root) {
  'use strict';
  function h(doc, tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function td(doc, tr, cls, txt) { var c = h(doc, 'td', cls, txt); tr.appendChild(c); return c; }
  var ETAT = {
    ok: ['ok', 'Réussi'], echec: ['ko', 'Échec'], absent: ['ko', 'Passage absent'], inactif: ['ko', 'Inactif'], attente: ['wait', 'Aucun passage connu'],
    desactivee: ['off', 'Désactivée'], 'non-lisible': ['off', 'Non lisible'], 'absente-photo': ['wait', 'Absente de la photo'], 'photo-absente': ['off', '—']
  };
  var KIND = { valider: 'À valider', perime: 'À décider', prompt: 'À coller', observer: 'À observer' };

  function sourcesBar(doc, ctx) {
    var src = h(doc, 'div', 'ac-src'); src.setAttribute('role', 'status');
    (ctx.sources || []).forEach(function (s) {
      var t = s.ok ? s.coll + ' : ' + s.n + ' document' + (s.n > 1 ? 's' : '') + ', lu à ' + s.at : s.coll + ' : ' + (s.err ? 'lecture en échec (' + s.err + ')' : 'pas encore lu');
      src.appendChild(h(doc, 'span', 'ac-pill ' + (s.ok ? 'ok' : 'ko'), t));
    });
    return src;
  }
  function photoBanner(doc, p) {
    var b = h(doc, 'div', 'ac-photo ' + (p.etat === 'ok' && !p.stale && !p.erreur ? 'ok' : 'ko'));
    b.setAttribute('role', 'status');
    if (p.etat === 'absente') b.textContent = 'Photo des routines absente : la Veille ne l\'a pas encore écrite (source : agents/runs). Les états d\'exécution ci-dessous restent « — ».';
    else if (p.etat === 'illisible') b.textContent = 'Photo des routines illisible (' + (p.cause || 'cause inconnue') + ') : voir les anomalies. Source : agents/runs.';
    else if (p.etat === 'erreur') b.textContent = 'La Veille n\'a pas pu lire les routines à ' + p.label + ' UTC : ' + p.erreur + ' (source : agents/runs.erreur).';
    else {
      b.textContent = 'Photo des routines du ' + p.label + ' UTC (heure du Maroc), ' + p.age + (p.par ? ', écrite par ' + p.par : '') + ' · source : agents/runs. En direct = à jour au dernier passage de la Veille, pas à la seconde.';
      if (p.stale) b.appendChild(h(doc, 'strong', 'ac-pill ko', 'photo ancienne : la Veille n\'a pas écrit depuis'));
      if (p.erreur) b.appendChild(h(doc, 'strong', 'ac-pill ko', 'dernière lecture en erreur : ' + p.erreur));
    }
    return b;
  }
  function afaireBlock(doc, d) {
    var s = h(doc, 'section', 'ac-todo'); s.setAttribute('aria-labelledby', 'acTodoH');
    var t = h(doc, 'h3', 'ac-sec', 'À faire par toi (' + d.afaire.length + ')'); t.id = 'acTodoH'; s.appendChild(t);
    if (!d.afaire.length) s.appendChild(h(doc, 'div', 'ac-none', 'Rien à faire : aucune US à valider, aucun périmé, aucun prompt à coller, aucun passage à observer.'));
    var ul = h(doc, 'ul', 'ac-todol');
    d.afaire.forEach(function (a) {
      var li = h(doc, 'li', 'ac-todoi'); li.appendChild(h(doc, 'span', 'ac-pill ' + (a.kind === 'observer' ? 'ko' : 'wait'), KIND[a.kind] || a.kind));
      li.appendChild(h(doc, 'span', 'ac-ttl', a.texte)); li.appendChild(h(doc, 'span', 'ac-meta', 'source : ' + a.source)); ul.appendChild(li);
    });
    s.appendChild(ul);
    if (!d.jourLu) s.appendChild(h(doc, 'div', 'ac-none', 'jour/' + d.today + ' non lu ou absent : les brouillons et livrables périmés ne sont pas listés.'));
    return s;
  }
  function ficheRow(doc, r, fiche, ncol) {
    var tr = h(doc, 'tr', 'ac-fiche'); tr.hidden = true; var c = h(doc, 'td'); c.setAttribute('colspan', String(ncol)); tr.appendChild(c);
    function l(k, v) { var d = h(doc, 'div', 'ac-l'); d.appendChild(h(doc, 'span', 'ac-k', k)); d.appendChild(h(doc, 'span', 'ac-v', v)); c.appendChild(d); }
    if (fiche) {
      l('Ce qu\'elle lit', fiche.lit || '—'); l('Ce qu\'elle produit', fiche.produit || '—'); l('Garde-fou', fiche.garde_fou || '—');
      l('Modèle', r.modele || fiche.modele || '— (non lu dans la photo)');
      l('Source de la fiche', fiche.source || '—');
    } else l('Fiche', '— (aucune fiche pour cette routine dans routines-fiches.json)');
    l('Cron', r.cron || '—'); l('Seuil d\'inactivité', r.seuilTxt || '—');
    r.notes.forEach(function (n) { l('Note', n); });
    c.appendChild(h(doc, 'div', 'ac-meta', 'Contenu statique de la fiche ; l\'état d\'exécution vient de la photo ' + r.source + '.'));
    return tr;
  }

  /* mount : conteneur à vider ; d : sortie de ACT.buildDirect ; ctx : {sources, drive, onIndex, fiches:[{id,...}]} */
  function renderDirect(doc, mount, d, ctx) {
    mount.textContent = '';
    mount.appendChild(sourcesBar(doc, ctx));
    mount.appendChild(photoBanner(doc, d.photo));
    mount.appendChild(afaireBlock(doc, d));

    mount.appendChild(h(doc, 'h3', 'ac-sec', 'Routines (' + d.routines.length + ') · clique une ligne pour sa fiche'));
    var wrap = h(doc, 'div', 'ac-tw'), tb = h(doc, 'table', 'ac-tab'), thd = h(doc, 'thead'), hr = h(doc, 'tr');
    ['Routine', 'État', 'Dernier passage', 'Prochain passage', 'Seuil', 'Produit'].forEach(function (c) { var th = h(doc, 'th', '', c); th.setAttribute('scope', 'col'); hr.appendChild(th); });
    thd.appendChild(hr); tb.appendChild(thd);
    var tbody = h(doc, 'tbody');
    var byId = {}; (ctx.fiches || []).forEach(function (f) { byId[f.id] = f; });
    d.routines.forEach(function (r) {
      var e = ETAT[r.etat] || ['off', r.etat], tr = h(doc, 'tr', 'ac-row ac-' + r.etat);
      var name = h(doc, 'td', 'ac-nm'), btn = h(doc, 'button', 'ac-nmb', r.nom); btn.type = 'button'; btn.setAttribute('aria-expanded', 'false');
      name.appendChild(btn); if (r.local) name.appendChild(h(doc, 'span', 'ac-meta', ' tâche locale')); tr.appendChild(name);
      var st = td(doc, tr, '', ''); st.appendChild(h(doc, 'span', 'ac-pill ' + e[0], e[1]));
      if (r.absent) st.appendChild(h(doc, 'div', 'ac-why ko', r.absent));
      if (r.echec && r.etat !== 'absent') st.appendChild(h(doc, 'div', 'ac-why ko', 'statut : ' + (r.statutBrut || '—')));
      else if (r.statutBrut && r.etat === 'ok') st.appendChild(h(doc, 'div', 'ac-why', 'statut : ' + r.statutBrut));
      if (r.inactif) st.appendChild(h(doc, 'div', 'ac-why ko', r.inactif));
      td(doc, tr, '', r.dernier ? r.dernier.label + ' UTC · ' + r.dernier.age : '—');
      td(doc, tr, '', r.prochain ? r.prochain.label + ' UTC (' + r.prochainSrc + ')' : '—');
      td(doc, tr, '', r.seuilTxt || '—');
      td(doc, tr, 'ac-prod', r.quoi ? r.quoi + ' · ' + r.quoiAt + ' · source : ' + r.quoiSrc : '— (rien d\'écrit au journal)');
      var fr = ficheRow(doc, r, byId[r.fiche], 6), key = r.fiche || r.nom;
      if (ctx.open && ctx.open[key]) { fr.hidden = false; btn.setAttribute('aria-expanded', 'true'); }
      function toggle() { fr.hidden = !fr.hidden; btn.setAttribute('aria-expanded', fr.hidden ? 'false' : 'true'); if (ctx.onToggle) ctx.onToggle(key, !fr.hidden); }
      btn.addEventListener('click', toggle);
      tr.addEventListener('click', function (ev) { if (ev && ev.target && ev.target === btn) return; toggle(); });
      tbody.appendChild(tr); tbody.appendChild(fr);
    });
    tb.appendChild(tbody); wrap.appendChild(tb); mount.appendChild(wrap);
    if (!d.routines.length) mount.appendChild(h(doc, 'div', 'ac-none', 'Aucune routine à afficher.'));

    if (d.sansAgent.length) {
      var sa = h(doc, 'details', 'ac-anom'); sa.setAttribute('open', '');
      sa.appendChild(h(doc, 'summary', '', d.sansAgent.length + ' passage' + (d.sansAgent.length > 1 ? 's' : '') + ' sans champ agent (non rattachés à une routine)'));
      var ul = h(doc, 'ul'); d.sansAgent.forEach(function (o) { ul.appendChild(h(doc, 'li', '', o.label + ' UTC · ' + (o.quoi || '—') + ' · source : ' + o.source)); }); sa.appendChild(ul); mount.appendChild(sa);
    }
    if (d.anomalies.length) {
      var det = h(doc, 'details', 'ac-anom');
      det.appendChild(h(doc, 'summary', '', d.anomalies.length + ' anomalie' + (d.anomalies.length > 1 ? 's' : '') + ' dans les données (document et cause)'));
      var ul2 = h(doc, 'ul'); d.anomalies.forEach(function (a) { ul2.appendChild(h(doc, 'li', '', a.where + ' : ' + a.cause + (a.soft ? ' (affiché malgré tout)' : ' (non affiché)'))); });
      det.appendChild(ul2); mount.appendChild(det);
    }
    if (d.ecartes.length) {
      var ec = h(doc, 'details', 'ac-ecart');
      ec.appendChild(h(doc, 'summary', '', d.ecartes.length + ' nom' + (d.ecartes.length > 1 ? 's' : '') + ' écarté' + (d.ecartes.length > 1 ? 's' : '') + ' (sessions de développement, étiquettes : ce ne sont pas des agents)'));
      var ul3 = h(doc, 'ul'); d.ecartes.forEach(function (x) { ul3.appendChild(h(doc, 'li', '', x.nom + ' : ' + x.motif)); }); ec.appendChild(ul3); mount.appendChild(ec);
    }

    var dr = h(doc, 'div', 'ac-drive');
    if (ctx.drive && ctx.drive.url) { var a = h(doc, 'a', '', ctx.drive.nom || 'Dossier Drive'); a.href = ctx.drive.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; dr.appendChild(a); dr.appendChild(h(doc, 'span', 'ac-src1', ' (source : reglages/drive-livrables)')); }
    else dr.appendChild(h(doc, 'span', 'ac-src1', 'Dossier Drive : — (reglages/drive-livrables absent)'));
    var b = h(doc, 'button', 'btn small', 'Refaire l\'index du jour'); b.type = 'button'; b.addEventListener('click', function () { if (ctx.onIndex) ctx.onIndex(d.today); });
    dr.appendChild(b); mount.appendChild(dr);
  }
  var api = { renderDirect: renderDirect };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ACTV = api;
})(typeof window !== 'undefined' ? window : this);

// Construit la page du Suivi avec la vue en direct (US-18) à partir de la version publiée (lue avec Artifact read).
// La version publiée contient déjà l'onglet Activité d'US-6 : il est REMPLACÉ (décision d'Issam, 25/11), pas doublé.
// Usage : node us6-activite/build-page.mjs <page-publiee.html> <page-sortie.html>
// Chaque point d'ancrage doit exister exactement une fois, sinon le script s'arrête sans rien écrire.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), rd = (f) => readFileSync(join(here, f), 'utf8');
const [, , inp, out] = process.argv;
if (!inp || !out) { console.error('usage : build-page.mjs <entrée> <sortie>'); process.exit(2); }
let h = readFileSync(inp, 'utf8');
if (!h.includes('id="viewL"')) { console.error('la page publiée ne contient pas l\'onglet Activité (US-6) : rien à remplacer'); process.exit(3); }
const fail = (msg) => { console.error(msg); process.exit(4); };
const count = (s, a) => s.split(a).length - 1;
// remplace ce qui est entre deux ancres (début inclus, fin exclue), chacune présente exactement une fois
const between = (start, end, repl) => {
  if (count(h, start) !== 1) fail('ancre de début trouvée ' + count(h, start) + ' fois (attendu 1) : ' + start.slice(0, 70));
  const i = h.indexOf(start), j = h.indexOf(end, i + start.length);
  if (j < 0 || count(h, end) < 1) fail('ancre de fin introuvable : ' + end.slice(0, 70));
  h = h.slice(0, i) + repl + h.slice(j);
};
const once = (anchor, repl) => { if (count(h, anchor) !== 1) fail('ancre trouvée ' + count(h, anchor) + ' fois (attendu 1) : ' + anchor.slice(0, 70)); h = h.replace(anchor, () => repl); };

between('<style id="us6-css">', '</style>', '<style id="us6-css">\n' + rd('page.css'));
between('  <section id="viewL"', '  <section id="viewS"', `  <section id="viewL" role="tabpanel" aria-labelledby="tabL" hidden>
    <div class="gs-head"><div class="jday">Activité : ce que tu as à faire, puis l'état réel de chaque routine. Chaque ligne porte sa source ; « — » = inconnu, jamais deviné.</div><div class="jday">En direct = à jour au dernier passage de la Veille · heure du Maroc (= UTC)</div></div>
    <div id="acMount" aria-live="polite"><div class="jday">Lecture des données…</div></div>
  </section>

`);
between('<script id="us6-core">', '<script id="us6-view">', '<script id="us6-core">\n' + rd('activite-core.js') + '\n</script>\n');
between('<script id="us6-view">', '<script>\n(function(){', '<script id="us6-view">\n' + rd('activite-view.js') + '\n</script>\n<script id="us18-fiches" type="application/json">\n' + JSON.stringify(JSON.parse(rd('routines-fiches.json'))).replace(/</g, '\\u003c') + '\n</script>\n');
between('  /* ---------- US-6 : onglet Activité', '  /* ---------- US-15 : bloc « Plan du jour »', rd('page-wiring.js'));
once('jour=d?Object.assign({date:d.id},d.data()||{}):null;renderJ();renderConseil()}', 'jour=d?Object.assign({date:d.id},d.data()||{}):null;renderJ();renderConseil();renderActivite()}');
writeFileSync(out, h);
console.log('ok : ' + out + ' (' + h.length + ' octets)');

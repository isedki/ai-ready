// Ajoute le bloc « Plan du jour » (onglet Aujourd'hui) à la version publiée du Suivi (lue avec Artifact read).
// Usage : node us15-coach/build-page.mjs <page-publiee.html> <page-sortie.html>
// Chaque ancre doit exister exactement une fois, sinon rien n'est écrit.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), rd = (f) => readFileSync(join(here, f), 'utf8');
const [, , inp, out] = process.argv;
if (!inp || !out) { console.error('usage : build-page.mjs <entrée> <sortie>'); process.exit(2); }
let h = readFileSync(inp, 'utf8');
if (h.includes('id="plCard"')) { console.error('la page contient déjà le bloc Plan du jour : partir de la version publiée sans ce bloc'); process.exit(3); }
const once = (anchor, repl) => { const n = h.split(anchor).length - 1; if (n !== 1) { console.error('ancre trouvée ' + n + ' fois (attendu 1) : ' + anchor.slice(0, 70)); process.exit(4); } h = h.replace(anchor, () => repl); };
once('</style>\n\n<div class="wrap">', '</style>\n<style id="us15-css">\n' + rd('page.css') + '</style>\n\n<div class="wrap">');
once('      <article class="jcard" id="jObjCard">', `      <article class="jcard" id="plCard" aria-labelledby="plTitle">
        <div class="geste">Geste 0 · 8h (heure du Maroc)</div>
        <h2 id="plTitle">Plan du jour <span class="n" id="plN"></span></h2>
        <div id="plMount" aria-live="polite"><div class="jempty">Lecture du plan…</div></div>
        <div class="note">Écrit par le Coach (US-15), aussi envoyé par mail à toi seul. Ton verdict (bonne, mauvaise, manquante + une phrase) est enregistré tel quel, comme celui de ta réponse au mail.</div>
      </article>
      <article class="jcard" id="jObjCard">`);
once('<script id="us6-core">', '<script id="us15-core">\n' + rd('plan-core.js') + '\n</script>\n<script id="us6-core">');
once('  render();\n  (async()=>{', rd('page-wiring.js') + '  render();\n  (async()=>{');
once('renderConseil();renderActivite()},err=>actFail("agents",err));', 'renderConseil();renderActivite();renderPlan()},err=>actFail("agents",err));\n    db.collection("plans").onSnapshot(snap=>{plPlans=plFrom("plans",snap);renderPlan()},err=>plFail("plans",err));\n    db.collection("verdicts").onSnapshot(snap=>{plVd=plFrom("verdicts",snap);renderPlan()},err=>plFail("verdicts",err));');
writeFileSync(out, h);
console.log('ok : ' + out + ' (' + h.length + ' octets)');

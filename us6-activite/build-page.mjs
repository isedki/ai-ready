// Construit la page du Suivi avec l'onglet Activité à partir de la version publiée (lue avec Artifact read).
// Usage : node us6-activite/build-page.mjs <page-publiee.html> <page-sortie.html>
// Chaque point d'ancrage doit exister exactement une fois, sinon le script s'arrête sans rien écrire.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), rd = (f) => readFileSync(join(here, f), 'utf8');
const [, , inp, out] = process.argv;
if (!inp || !out) { console.error('usage : build-page.mjs <entrée> <sortie>'); process.exit(2); }
let h = readFileSync(inp, 'utf8');
if (h.includes('id="viewL"')) { console.error('la page contient déjà l\'onglet Activité : partir de la version publiée sans cet onglet'); process.exit(3); }
const once = (anchor, repl) => { const n = h.split(anchor).length - 1; if (n !== 1) { console.error('ancre trouvée ' + n + ' fois (attendu 1) : ' + anchor.slice(0, 70)); process.exit(4); } h = h.replace(anchor, () => repl); };
once('</style>\n\n<div class="wrap">', '</style>\n<style id="us6-css">\n' + rd('page.css') + '</style>\n\n<div class="wrap">');
once('id="tabC" aria-controls="viewC" aria-selected="false" type="button">Conseil</button>', 'id="tabC" aria-controls="viewC" aria-selected="false" type="button">Conseil</button>\n    <button class="tab" role="tab" id="tabL" aria-controls="viewL" aria-selected="false" type="button">Activité</button>');
once('  <section id="viewS" role="tabpanel"', `  <section id="viewL" role="tabpanel" aria-labelledby="tabL" hidden>
    <div class="gs-head"><div class="jday">Activité des agents : chaque donnée porte sa source et son âge, « — » = inconnu</div><div class="jday">En direct · âges recalculés chaque minute · heures en UTC</div></div>
    <div class="vfilters ac-filters"><label for="acAgent">Agent</label><select id="acAgent"><option value="">Tous les agents</option></select><label for="acDay">Jour</label><select id="acDay"></select></div>
    <div id="acMount" aria-live="polite"><div class="jday">Lecture des données…</div></div>
  </section>

  <section id="viewS" role="tabpanel"`);
once('<script>\n(function(){', '<script id="us6-core">\n' + rd('activite-core.js') + '\n</script>\n<script id="us6-view">\n' + rd('activite-view.js') + '\n</script>\n<script>\n(function(){');
once('const TABS=["J","A","P","V","S","E","C"];const TABNAME={J:"Aujourd\'hui",A:"Actions",P:"Chemin critique",V:"Vigilance",S:"Statut global",E:"Agents",C:"Conseil"};', 'const TABS=["J","A","P","V","S","E","C","L"];const TABNAME={J:"Aujourd\'hui",A:"Actions",P:"Chemin critique",V:"Vigilance",S:"Statut global",E:"Agents",C:"Conseil",L:"Activité"};');
once('["A","P","V","S","E","C"].includes(s.tab)', '["A","P","V","S","E","C","L"].includes(s.tab)');
once('if(t==="C")renderConseil();if(!silent)', 'if(t==="C")renderConseil();if(t==="L")renderActivite();if(!silent)');
once('"Agents","Conseil"];', '"Agents","Conseil","Activité"];');
once('  render();\n  (async()=>{', rd('page-wiring.js') + '  render();\n  (async()=>{');
once('db.collection("agents").onSnapshot(snap=>{ag=snap.docs.map(d=>Object.assign({id:d.id},d.data()||{}));if(!$("viewE").hidden)renderAgents();renderConseil()},()=>{});',
  'db.collection("agents").onSnapshot(snap=>{ag=snap.docs.map(d=>Object.assign({id:d.id},d.data()||{}));actAg=actFrom("agents",snap);if(!$("viewE").hidden)renderAgents();renderConseil();renderActivite()},err=>actFail("agents",err));\n    db.collection("livrables").onSnapshot(snap=>{actLv=actFrom("livrables",snap);renderActivite()},err=>actFail("livrables",err));');
once('db.collection("reglages").onSnapshot(snap=>{const d=snap.docs.find(x=>x.id==="mode");modeDoc=d?(d.data()||{}):null;renderJ()},()=>{});',
  'db.collection("reglages").onSnapshot(snap=>{const d=snap.docs.find(x=>x.id==="mode");modeDoc=d?(d.data()||{}):null;const dv=snap.docs.find(x=>x.id==="drive-livrables");try{const x=dv?dv.data():null;driveDoc=x&&ACT.httpsUrl(x.url)?{url:x.url,nom:x.nom}:null}catch(e){driveDoc=null}renderJ();renderActivite()},()=>{});');
writeFileSync(out, h);
console.log('ok : ' + out + ' (' + h.length + ' octets)');

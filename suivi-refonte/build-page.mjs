// Construit la page refondue à partir de la version publiée (lue avec Artifact read). N'écrit rien en ligne.
// Usage : node suivi-refonte/build-page.mjs <page-publiee.html> <page-sortie.html>
// Chaque point d'ancrage doit exister exactement une fois : si la page publiée a changé, le script s'arrête sans rien écrire.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), rd = (f) => readFileSync(join(here, f), 'utf8');
const [, , inp, out] = process.argv;
if (!inp || !out) { console.error('usage : build-page.mjs <entrée> <sortie>'); process.exit(2); }
let h = readFileSync(inp, 'utf8');
const fail = (m) => { console.error(m); process.exit(4); };
if (h.includes('id="refonte-css"')) fail('page déjà refondue : repartir de la version publiée avant la refonte');
const count = (a) => h.split(a).length - 1;
const once = (a, r) => { if (count(a) !== 1) fail('ancre trouvée ' + count(a) + ' fois (attendu 1) : ' + a.slice(0, 90)); h = h.replace(a, () => r); };
const between = (start, end, r) => { if (count(start) !== 1) fail('début trouvé ' + count(start) + ' fois : ' + start.slice(0, 90)); const i = h.indexOf(start), j = h.indexOf(end, i + start.length); if (j < 0) fail('fin introuvable : ' + end.slice(0, 90)); h = h.slice(0, i) + r + h.slice(j); };
const cutOut = (start, end) => { const i = h.indexOf(start), j = h.indexOf(end, i); if (count(start) !== 1 || j < 0) fail('bloc introuvable : ' + start.slice(0, 90)); const b = h.slice(i, j); h = h.slice(0, i) + h.slice(j); return b; };
/* Les textes d'exemple des champs citent des personnes et des tickets : ils ne sont pas dans le dépôt, on les reprend de la page publiée. */
const publiee = h;
const reprend = (re, quoi) => { const m = publiee.match(re); if (!m) fail('texte d\'exemple introuvable dans la page publiée : ' + quoi); return m[1]; };
const html = rd('page.html').replace(/\{\{ph:(\w+)\}\}/g, (_, id) => reprend(new RegExp('id="' + id + '"[^>]*?placeholder="([^"]*)"'), id));
const part = (id) => { const m = html.match(new RegExp('<!-- @' + id + ' -->\\n([\\s\\S]*?)<!-- @fin -->')); if (!m) fail('page.html : bloc @' + id + ' absent'); return m[1]; };

/* ---- style et structure ---- */
once('<div class="wrap">', '<style id="refonte-css">\n' + rd('refonte.css') + '</style>\n\n<div class="wrap">');
between('  <div class="tabs" role="tablist" aria-label="Vues">', '  <section id="viewJ"', part('nav'));
between('  <section id="viewJ"', '  <section id="viewA"', part('today'));
between('  <section id="viewE"', '  <section id="viewC"', part('agents'));
cutOut('  <section id="viewC"', '  <section id="viewL"');
between('  <section id="viewL"', '  <section id="viewS"', part('live'));

/* ---- code partagé : le cœur US-18 vient du dépôt (corrigé pour les « — » de la photo), puis la refonte ---- */
between('<script id="us6-core">', '<script id="us6-view">', '<script id="us6-core">\n' + readFileSync(join(here, '../us6-activite/activite-core.js'), 'utf8') + '\n</script>\n');
once('<script id="us18-fiches" type="application/json">', '<script id="suivi-core">\n' + rd('suivi-core.js') + '\n</script>\n<script id="suivi-view">\n' + rd('suivi-view.js') + '\n</script>\n<script id="us18-fiches" type="application/json">');

/* ---- navigation : 3 entrées, les anciens onglets deviennent des sous-vues (mêmes identifiants) ---- */
once('["A","P","V","S","E","C","L"].includes(s.tab))setTab(s.tab,true)', '["J","A","P","V","S","E","C","L"].includes(s.tab))setTab(s.tab==="C"?"J":s.tab,true)');
between('  const TABS=["J","A","P","V","S","E","C","L"];', '  function fillSelect(sel,vals){', rd('wiring-nav.js'));
/* le tableau GROUPES doit exister avant la restauration de l'onglet */
const nav = cutOut('  /* refonte:groupes */', '  /* refonte:fin-groupes */');
once('  let pol=[],rec=[],trk=[];\n', '  let pol=[],rec=[],trk=[];\n' + nav);

/* ---- Aujourd'hui ---- */
once('const bd=((jour&&jour.brouillons)||[]).find(x=>x.id===did);', 'const bd=SUIVI.brouillons(jour&&jour.brouillons).find(x=>x.id===did);');
once('function cnTitle(e){const bd=e.draft_id?((jour&&jour.brouillons)||[]).find(x=>x.id===e.draft_id):null;', 'function cnTitle(e){const bd=e.draft_id?SUIVI.brouillons(jour&&jour.brouillons).find(x=>x.id===e.draft_id):null;');
once('((jour&&jour.brouillons)||[]).forEach(x=>{const o=document.createElement("option");', 'SUIVI.brouillons(jour&&jour.brouillons).forEach(x=>{const o=document.createElement("option");');
once('["jObj","jDr","jQ","jPer"].forEach(id=>{$(id).textContent=""});', '["jObj","jDr","jPer","jObjOk"].forEach(id=>{$(id).textContent=""});["jDrN","jPerN","jObjN"].forEach(id=>{$(id).textContent=""});');
once('if(o.critere)r.appendChild(el("div","c","Fait quand : "+o.critere));', 'if(o.critere)r.appendChild(el("div","c","Fait quand : "+o.critere));\n        const pv=[o.etat?"État au bilan : "+o.etat:"",o.preuve?"Preuve : "+o.preuve:""].filter(Boolean).join(" · ");if(pv)r.appendChild(el("div","c",pv));if(o.source)r.appendChild(mini("obj-"+o.n,"Source",[o.source]));');
between('      /* brouillons */\n', '      /* périmés */\n', rd('wiring-brouillons.js').replace('{{ph:modif}}', () => reprend(/ta\.placeholder="([^"]*)"/, 'modification de brouillon')));
once('const pb=$("jPer");pb.textContent="";const ps=jour.perimes||[];', 'const pb=$("jPer");pb.textContent="";const ps=SUIVI.perimes(jour.perimes);');
once('    /* relances : actions ouvertes dont la date de relance est passée */', '    /* relances : actions ouvertes dont la date de relance est passée */\n    renderConseil();');

/* ---- coach, questions (une seule fois, sur Aujourd'hui) ; usage sur la vue Agents ---- */
between('  function renderConseil(){\n', '    /* coach */\n', rd('wiring-conseil.js'));
once('Le coach en pose un à chaque veille, entre 9h05 et 15h05. Il apparaît ici dès son prochain passage.', 'La Veille en pose un à chacun de ses passages. Il apparaît ici dès le prochain (heure dans « Agents »).');
once('if(Array.isArray(co.contexte)&&co.contexte.length){cb.appendChild(el("div","lab sect","Pourquoi maintenant"));const ul=el("ul","cctx");co.contexte.forEach(x=>ul.appendChild(el("li","",x)));cb.appendChild(ul)}}',
  'const cx=SUIVI.contexte(co.contexte);if(cx.length){const d=mini("coach","Pourquoi maintenant",cx);d.querySelector("summary").addEventListener("click",()=>logUsage("Conseil","clic"));cb.appendChild(d)}}');
once('if(agc&&agc.dernier){const at=String(agc.dernier);cb.appendChild(el("div","src","Dernier passage du coach : "+fmtS(at.slice(0,10))+" "+at.slice(11,16)+(agc.focus?" · focus : "+agc.focus:"")))}',
  'if(agc&&agc.dernier){const at=String(agc.dernier);cb.appendChild(mini("coach-focus","Dernier passage du coach : "+fmtS(at.slice(0,10))+" "+at.slice(11,16),[agc.focus?"focus : "+agc.focus:"focus : — (non écrit)"]))}');
once('const qb=$("cQ");qb.textContent="";const qs=(jour&&jour.questions)||[];const rq=retour.questions||{};', 'const qb=$("cQ");qb.textContent="";const qs=SUIVI.questions(jour&&jour.questions);const rq=retour.questions||{};');
once('    renderCons();\n    /* usage 7 jours */\n', '    renderCons();\n  }\n  function renderUsage(){\n    const root=$("viewE");if(!root||root.hidden)return;\n    /* usage 7 jours */\n');

/* ---- Sprint, mesures, équipe, journal ---- */
once('$("kpiWhen").textContent=k0?"("+(k0.periode||fmt(String(k0.date||"").slice(0,10)))+")":"";', 'renderUsage();renderKpiCards(k0);$("kpiWhen").textContent=k0?"("+(k0.periode||fmt(String(k0.date||"").slice(0,10)))+")":"";');
once('l.appendChild(el("div","m","Problème : "+(s.probleme||"")+(s.source?" ["+s.source+"]":"")));if(s.impact)l.appendChild(el("div","m","Impact : "+s.impact));if(s.fini)l.appendChild(el("div","m","Fini quand : "+s.fini));',
  'const faits=["Problème : "+(s.probleme||"— (non écrit)")+(s.source?" ["+s.source+"]":"")];if(s.impact)faits.push("Impact : "+s.impact);if(s.fini)faits.push("Fini quand : "+s.fini);');
once('const at=String(pg.at||"");box2.appendChild(', 'const at=String(pg.at||"");const pgm=box2.appendChild.bind(box2);pgm(');
/* l'avancement : la barre reste visible, les étapes et notes se replient avec le reste */
once('et.forEach(x=>box2.appendChild(el("div","st1"+(x&&x.fait?" done":""),(x&&x.fait?"✓ ":"○ ")+((x&&x.t)||""))))}', 'et.forEach(x=>faits.push((x&&x.fait?"✓ ":"○ ")+((x&&x.t)||"")))}');
once('          if(pg.preuve)box2.appendChild(el("div","m","Preuve : "+pg.preuve));\n', '          if(pg.preuve)faits.push("Preuve : "+pg.preuve);\n');
once('          l.appendChild(box2)}\n', '          l.appendChild(box2)}\n        l.appendChild(mini("story-"+s.id,"Détail : problème, impact, fini quand, étapes",faits));\n');
once('const tt=$("agTeam");tt.textContent="";team.forEach(a=>{const tr=document.createElement("tr");[a.nom,a.role,a.quand,a.focus,a.dernier?fmt(String(a.dernier).slice(0,10))+" "+String(a.dernier).slice(11,16):"—"].forEach((x,i)=>tr.appendChild(el("td",i===0?"ref":"",x||"")));tt.appendChild(tr)});',
  'const tt=$("agTeam");tt.textContent="";team.forEach(a=>{const tr=document.createElement("tr");const dj=String(a.dernier||"").slice(0,10);const ag_=/^\\d{4}-/.test(dj)?SUIVI.ouvresDepuis(dj,Date.now()):null;const dt=ag_===null?"— (non écrit par l\'agent)":fmt(dj)+" "+String(a.dernier).slice(11,16)+(ag_>=5?" · ancien ("+ag_+" j ouvrés)":"");[a.nom,a.role,a.quand,a.focus,dt].forEach((x,i)=>{const td=el("td",i===0?"ref":"");if(i===1||i===3){const c=el("div","clamp",x||"—");c.title="Toucher pour tout lire";c.addEventListener("click",()=>c.classList.toggle("full"));td.appendChild(c)}else td.textContent=x||"—";tr.appendChild(td)});tt.appendChild(tr)});');

/* ---- vue en direct : battement en tête, tableau US-18 complet replié ---- */
once('      const d=ACT.buildDirect({agents:actAg,livrables:actLv,jour:jour?{id:jour.date,data:jour}:null,fiches:FICHES,now:Date.now()});\n', '      const d=ACT.buildDirect({agents:actAg,livrables:actLv,jour:jour?{id:jour.date,data:jour}:null,fiches:FICHES,now:Date.now()});\n      renderTodo(d);\n');
once('  function renderActivite(){\n    const root=$("viewL");if(!root||root.hidden)return;\n', rd('wiring-beat.js') + '  function renderActivite(){\n    renderBattement();\n    const root=$("viewL");if(!root||root.hidden)return;\n');
once('setInterval(()=>{if(!document.hidden&&!$("viewL").hidden)renderActivite()},60000);', 'setInterval(()=>{if(!document.hidden)renderActivite()},60000);');

/* ---- Plan du jour : les « veille manquée » suivaient l'ancien horaire horaire (9h05 à 15h05) et criaient à tort ---- */
once('vm.manques.forEach(m=>root.appendChild(', 'vm.manques.filter(m=>m.passage!=="veille").forEach(m=>root.appendChild(');
once('      if(!vm.plan){root.appendChild(el("div","jempty",vm.message));$("plN").textContent="";return}', '      if(!vm.plan){root.appendChild(el("div","jempty",vm.message));const nm=vm.manques.filter(m=>m.passage!=="veille").length;$("plN").textContent=nm?"pas de plan · "+nm+" alerte"+(nm>1?"s":""):"pas de plan";return}if(!replis["plan-ouvert"]){replis["plan-ouvert"]=true;$("plCard").open=true}');

/* ---- lectures en plus (lecture seule) : jours précédents, profil, frictions ---- */
once('db.collection("jour").onSnapshot(snap=>{const d=snap.docs.find(x=>x.id===jourId);', 'db.collection("jour").onSnapshot(snap=>{jourAll=snap.docs.map(x=>({id:x.id,data:x.data()||{}}));const d=snap.docs.find(x=>x.id===jourId);');
once('    db.collection("paths").onSnapshot(', '    ["profil","frictions"].forEach(c=>db.collection(c).onSnapshot(snap=>{svExtra[c]=snap.docs.map(d=>({id:d.id,data:d.data()||{}}));renderBattement()},()=>{}));\n    db.collection("paths").onSnapshot(');
once('db.collection("agents").onSnapshot(snap=>{ag=', 'db.collection("agents").onSnapshot(snap=>{svPret=true;ag=');

/* défaut déjà en ligne : la synthèse du tracker du 13/11 est un texte, la page attendait un tableau et laissait le bloc vide */
once('const syn=(t.synthese||[]).filter(r=>r[0]&&r[3]&&r[0]!=="Nom de l’onglet");', 'if(typeof t.synthese==="string"&&t.synthese.trim()){v.appendChild(el("div","lab","Synthèse"));v.appendChild(el("div","txt",t.synthese))}const syn=(Array.isArray(t.synthese)?t.synthese:[]).filter(r=>r[0]&&r[3]&&r[0]!=="Nom de l’onglet");');
/* la longue note des développeurs se replie avec le reste ; la date du dernier passage reste visible */
once('+(pg.note?" · "+pg.note:""):', ':');
once('l.appendChild(mini("story-"+s.id,', 'if(s.progres&&s.progres.at&&s.progres.note)faits.push("Note des développeurs : "+s.progres.note);\n        l.appendChild(mini("story-"+s.id,');

/* relances : les 8 mêmes lignes qu'avant (5 visibles, 3 repliées), et le reste est dit au lieu d'être caché */
once('r.appendChild(el("div","m",[a.owner,"relance prévue le "+fmt(a.followUp),a.reminders?("déjà R"+a.reminders):""].filter(Boolean).join(" · ")));fb.appendChild(r)});',
  'r.appendChild(el("div","m",[a.owner,"relance prévue le "+fmt(a.followUp),a.reminders?("déjà R"+a.reminders):""].filter(Boolean).join(" · ")));if(fb.querySelectorAll(".fu").length<5)fb.appendChild(r);else{let d=fb.querySelector("details.fu-plus");if(!d){d=mini("fu-plus","3 suivantes au plus",[]);d.classList.add("fu-plus");fb.appendChild(d)}d.appendChild(r)}});\n    const dp=fb.querySelector("details.fu-plus");if(dp){const k=dp.querySelectorAll(".fu").length;dp.querySelector("summary").textContent=k>1?k+" suivantes":"1 suivante"}\n    if(fus.length>8){const b=el("button","btn small",(fus.length-8)+" autres : voir dans Actions");b.type="button";b.addEventListener("click",()=>{setTab("A");scrollTo(0,0)});fb.appendChild(b)}');

writeFileSync(out, h);
console.log('ok : ' + out + ' (' + h.length + ' caractères)');

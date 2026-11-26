  /* ---------- refonte : battement des agents (logique SUIVI testée hors page) ---------- */
  var jourAll=[],svExtra={profil:[],frictions:[]},svPret=false;const svOpen={};
  function svScroll(id){setTimeout(()=>{const e=$(id);if(e)e.scrollIntoView({behavior:"smooth",block:"start"})},30)}
  function svGo(cible){
    if(cible==="sprint"){setTab("E");svScroll("agSprint");return}
    setTab("J");if(cible==="perimes")$("foldPer").open=true;svScroll({questions:"cQT",brouillons:"jDrN",perimes:"foldPer"}[cible])}
  function svOuvrir(cle){svOpen[cle]=true;setTab("L");svScroll("sv-"+cle)}
  function renderBattement(){
    if(!svPret)return;
    try{
      const hb=SUIVI.heartbeat({agents:actAg,livrables:actLv,jours:jourAll,jourToday:jour?{id:jour.date,data:jour}:null,retourToday:retour,plans:plPlans,profil:svExtra.profil,frictions:svExtra.frictions,fiches:FICHES,now:Date.now()});
      const bd=$("navBadge");bd.hidden=!hb.alertes;bd.textContent=hb.alertes?String(hb.alertes):"";bd.title=hb.alertes+" agent(s) à regarder";
      if(!$("viewJ").hidden)SUIVIV.renderPulse(document,$("svPulse"),hb,svOuvrir);
      if(!$("viewL").hidden)SUIVIV.renderBeat(document,$("svBeat"),hb,{open:svOpen,onToggle:(k,v)=>{svOpen[k]=v},onGo:svGo});
    }catch(e){const m="Le battement des agents n'a pas pu s'afficher : "+errTxt(e)+". Le reste de la page n'est pas touché.";["svPulse","svBeat"].forEach(i=>{$(i).textContent="";$(i).appendChild(el("div","ac-err",m))})}
  }
  function renderTodo(d){
    const box=$("svTodo");box.textContent="";const s=el("section","ac-todo");s.appendChild(el("h2","gs-sec","À faire par toi ("+d.afaire.length+")"));
    if(!d.afaire.length)s.appendChild(el("div","ac-none","Rien à faire d'après les données lues."));
    const groupes={valider:"Histoires à valider",perime:"Brouillons ou livrables à décider",prompt:"Prompts à coller",observer:"Passages à observer"};
    Object.keys(groupes).forEach(k=>{const l=d.afaire.filter(a=>a.kind===k);if(!l.length)return;const m=mini("todo-"+k,groupes[k]+" ("+l.length+")",[]);if(replis["todo-"+k]===undefined&&k==="observer")m.open=true;l.forEach(a=>{m.appendChild(el("div","",a.texte+" · source : "+a.source))});
      if(k==="valider"){const b=el("button","sv-go","Valider dans le sprint →");b.type="button";b.addEventListener("click",()=>svGo("sprint"));m.appendChild(b)}s.appendChild(m)});
    box.appendChild(s);
  }
  function renderKpiCards(k0){
    const box=$("kpiCards");box.textContent="";const m=SUIVI.mesures(k0,Date.now());
    if(!m){box.appendChild(el("div","jday","Pas encore de mesure."));return}
    if(m.perime)box.appendChild(el("div","stale-tag","Mesure périmée : écrite le "+fmt(m.day)+(m.age===null?"":", il y a "+m.age+" jour"+(m.age>1?"s":"")+" ouvré"+(m.age>1?"s":""))+". Aucune plus récente dans le Suivi."));
    const g=el("div","kp-grid"+(m.perime?" old":""));g.style.marginTop="8px";
    m.mesurees.forEach(x=>{const c=el("div","kp");c.appendChild(el("div","l",x.nom));c.appendChild(el("div","v",String(x.valeur)));c.appendChild(el("div","m",["cible "+(x.cible||"—"),x.tendance&&x.tendance!=="—"?x.tendance:"",x.avant&&x.avant!=="—"?"avant "+x.avant:"","au "+fmtS(m.day)].filter(Boolean).join(" · ")));g.appendChild(c)});
    box.appendChild(g);
    if(m.nonMesurees.length){const d=mini("kpi-vides",m.nonMesurees.length+" mesure"+(m.nonMesurees.length>1?"s":"")+" sans valeur (—), avec la raison",m.nonMesurees.map(x=>x.nom+" : — · "+x.raison+(x.avant?" · dernière valeur "+x.avant:"")));d.style.marginTop="8px";box.appendChild(d)}
  }


  /* refonte:groupes */
  var GROUPES={J:["J"],A:["A","P","V","S"],G:["L","E"]};const dernierDe={J:"J",A:"A",G:"L"};
  const groupeDe=t=>Object.keys(GROUPES).find(g=>GROUPES[g].includes(t))||"J";
  const replis={};
  /* bloc replié dont l'état ouvert survit aux rafraîchissements en direct */
  function mini(cle,titre,lignes){const d=document.createElement("details");d.className="mini";if(replis[cle])d.open=true;d.addEventListener("toggle",()=>{replis[cle]=d.open});const s=document.createElement("summary");s.textContent=titre;d.appendChild(s);lignes.forEach(x=>{const v=document.createElement("div");v.textContent=x;d.appendChild(v)});return d}
  /* refonte:fin-groupes */
  const TABS=["J","A","P","V","S","L","E"];const TABNAME={J:"Aujourd'hui",A:"Actions",P:"Chemin critique",V:"Vigilance",S:"Statut global",E:"Agents",L:"Activité"};
  function setTab(t,silent){if(!TABS.includes(t))t="J";const g=groupeDe(t);dernierDe[g]=t;
    TABS.forEach(x=>{$("tab"+x).setAttribute("aria-selected",x===t?"true":"false");$("tab"+x).hidden=g==="J"||!GROUPES[g].includes(x);$("view"+x).hidden=x!==t});
    ["J","A","G"].forEach(k=>$("nav"+k).setAttribute("aria-current",k===g?"true":"false"));$("subTabs").hidden=g==="J";
    if(!silent){try{const s=JSON.parse(localStorage.getItem("phenix-filters")||"{}");s.tab=t;localStorage.setItem("phenix-filters",JSON.stringify(s))}catch(e){}}
    if(t==="P")renderPaths();if(t==="V")renderVig();if(t==="J"){renderJ();if(!silent)renderBattement()}if(t==="S")renderStatus();if(t==="E")renderAgents();if(t==="L")renderActivite();if(!silent)logUsage(TABNAME[t],"ouvert")}
  ["J","A","G"].forEach(k=>$("nav"+k).addEventListener("click",()=>setTab(dernierDe[k])));
  TABS.forEach(x=>{const b=$("tab"+x);b.addEventListener("click",()=>setTab(x));b.addEventListener("keydown",e=>{if(e.key==="ArrowRight"||e.key==="ArrowLeft"){const l=GROUPES[groupeDe(x)];const o=$("tab"+l[(l.indexOf(x)+(e.key==="ArrowRight"?1:l.length-1))%l.length]);o.focus();o.click()}})});


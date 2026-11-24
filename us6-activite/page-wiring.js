  /* ---------- US-6 : onglet Activité (logique dans ACT, rendu dans ACTV, tous deux testés hors page) ---------- */
  let actAg=[],actLv=[],driveDoc=null,fAgent="",fDay="";const actSrc={agents:{coll:"agents",ok:false},livrables:{coll:"livrables",ok:false}};
  const hmsUtc=()=>{const d=new Date();return pad(d.getUTCHours())+":"+pad(d.getUTCMinutes())+":"+pad(d.getUTCSeconds())+" UTC"};
  const errTxt=e=>cutErr((e&&e.code?e.code+" : ":"")+((e&&e.message)||"cause inconnue"));
  const cutErr=s=>String(s).length>140?String(s).slice(0,140)+"…":String(s);
  function actFrom(coll,snap){actSrc[coll]={coll:coll,ok:true,n:snap.docs.length,at:hmsUtc()};return snap.docs.map(d=>{let data;try{data=d.data()}catch(e){data=null}return{id:d.id,data:data}})}
  function actFail(coll,err){actSrc[coll]={coll:coll,ok:false,err:errTxt(err)};renderActivite()}
  async function actIndex(day){
    const phrase="Refais l'index Drive du jour "+day+" (US-6, docs/us6-activite-agents.md) : relis la collection livrables du suivi et le journal, génère index.md avec la commande de la doc, remplace l'index existant dans le sous-dossier « "+day+" » de « Phénix · Livrables des agents », puis relis le dossier pour vérifier qu'il ne contient qu'un seul index.md.";
    let ok=false;try{await navigator.clipboard.writeText(phrase);ok=true}catch(e){}
    logUsage("Activité","index");toast(ok?"Texte copié : colle-le dans Claude pour refaire l'index":"Copie refusée. Écris dans Claude : "+phrase)}
  function renderActivite(){
    const root=$("viewL");if(!root||root.hidden)return;
    try{
      fAgent=$("acAgent").value;fDay=$("acDay").value;
      const m=ACT.buildModel({agents:actAg,livrables:actLv,now:Date.now(),day:fDay,agent:fAgent});
      ACTV.fillOptions(document,$("acAgent"),[["","Tous les agents"]].concat(m.agentNames.map(n=>[n,n==="—"?"Agent non indiqué":n])),fAgent);
      ACTV.fillOptions(document,$("acDay"),m.days.slice(0,14).map(d=>[d,fmtS(d)+(d===m.today?" (aujourd'hui)":"")]),m.day);
      if($("acDay").value!==m.day)$("acDay").value=m.day;
      ACTV.renderActivite(document,$("acMount"),m,{sources:[actSrc.agents,actSrc.livrables],drive:driveDoc,onIndex:actIndex,typeLabel:ACT.TYPE_LABEL});
    }catch(e){const b=document.createElement("div");b.className="ac-err";b.textContent="L'onglet Activité n'a pas pu s'afficher : "+errTxt(e)+". Les autres onglets ne sont pas touchés.";$("acMount").textContent="";$("acMount").appendChild(b)}
  }
  $("acAgent").addEventListener("change",renderActivite);$("acDay").addEventListener("change",renderActivite);
  setInterval(()=>{if(!document.hidden&&!$("viewL").hidden)renderActivite()},60000);


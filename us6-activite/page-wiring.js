  /* ---------- US-18 : onglet Activité, vue en direct (logique dans ACT.buildDirect, rendu dans ACTV.renderDirect, tous deux testés hors page) ---------- */
  let actAg=[],actLv=[],driveDoc=null;const actSrc={agents:{coll:"agents",ok:false},livrables:{coll:"livrables",ok:false}};const actOpen={};
  const FICHES=(()=>{try{return JSON.parse($("us18-fiches").textContent)}catch(e){return{fiches:[]}}})();
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
      const d=ACT.buildDirect({agents:actAg,livrables:actLv,jour:jour?{id:jour.date,data:jour}:null,fiches:FICHES,now:Date.now()});
      ACTV.renderDirect(document,$("acMount"),d,{sources:[actSrc.agents,actSrc.livrables],drive:driveDoc,onIndex:actIndex,fiches:FICHES.fiches,open:actOpen,onToggle:(k,v)=>{actOpen[k]=v}});
    }catch(e){const b=document.createElement("div");b.className="ac-err";b.textContent="L'onglet Activité n'a pas pu s'afficher : "+errTxt(e)+". Les autres onglets ne sont pas touchés.";$("acMount").textContent="";$("acMount").appendChild(b)}
  }
  setInterval(()=>{if(!document.hidden&&!$("viewL").hidden)renderActivite()},60000);


  /* ---------- US-15 : bloc « Plan du jour » (onglet Aujourd'hui). Logique dans PLAN (testée hors page), rendu ici. ---------- */
  let plPlans=[],plVd=[],plSrc={plans:{ok:false},verdicts:{ok:false}};
  const plErr=e=>String((e&&e.code?e.code+" : ":"")+((e&&e.message)||"cause inconnue")).slice(0,140);
  function plFrom(coll,snap){plSrc[coll]={ok:true,n:snap.docs.length};return snap.docs.map(d=>{let data;try{data=d.data()}catch(e){data=null}return{id:d.id,data:data}})}
  function plFail(coll,err){plSrc[coll]={ok:false,err:plErr(err)};renderPlan()}
  async function plSaveVerdict(prio,verdict,phrase){
    const prev=plVd.filter(x=>x.data&&x.data.jour===jourId&&x.data.priorite===prio&&x.data.voie==="page").map(x=>x.data)[0]||null;
    const r=PLAN.verdictDoc({jour:jourId,priorite:prio,verdict:verdict,phrase:phrase,voie:"page",at:new Date().toISOString().slice(0,19)+"Z"},prev);
    if(!r.ok){toast("Non enregistré : "+r.why);return false}
    try{await db.collection("verdicts").doc(r.id).set(r.data);toast("Verdict enregistré : "+prio+" "+verdict);return true}catch(e){toast("Écriture refusée : "+plErr(e));return false}}
  function plVerdictRow(p,vm){
    const box=el("div","pl-v");
    const cur=p.verdict;
    const ph=el("input","pl-phrase");ph.type="text";ph.placeholder="Une phrase (obligatoire si mauvaise)";ph.setAttribute("aria-label","Phrase du verdict "+p.id);if(cur&&cur.phrase&&cur.phrase!=="—")ph.value=cur.phrase;ph.disabled=!canWrite;
    const err=el("div","pl-err");
    PLAN.VERDICTS.filter(v=>v!=="manquante").forEach(v=>{const b=el("button","btn small"+(cur&&cur.verdict===v?" primary":""),v);b.type="button";b.disabled=!canWrite;
      b.addEventListener("click",async()=>{err.textContent="";if(v==="mauvaise"&&!ph.value.trim()){err.textContent="La phrase est obligatoire pour « mauvaise ».";ph.focus();return}await plSaveVerdict(p.id,v,ph.value)});box.appendChild(b)});
    box.append(ph,err);
    if(cur)box.appendChild(el("div","pl-cur","Ton verdict : "+cur.verdict+(cur.phrase&&cur.phrase!=="—"?" — « "+cur.phrase+" »":"")+" · "+cur.voie+" · "+PLAN.hm(PLAN.ms(cur.at))+" UTC"));
    return box}
  function renderPlan(){
    const root=$("plMount");if(!root)return;
    try{
      const vm=PLAN.viewModel({plans:plPlans,verdicts:plVd,journal:ag,now:Date.now(),day:jourId||today()});
      root.textContent="";
      ["plans","verdicts"].forEach(c=>{if(plSrc[c]&&plSrc[c].err)root.appendChild(el("div","pl-err","Lecture « "+c+" » en échec ("+plSrc[c].err+") : valeurs affichées « — »."))});
      vm.anomalies.forEach(a=>root.appendChild(el("div","pl-err","Anomalie : "+a)));
      vm.manques.forEach(m=>root.appendChild(el("div","pl-warn","⚠ Coach : "+m.texte)));
      if(vm.etatJournal&&vm.etatJournal.indexOf("—")===0)root.appendChild(el("div","jempty","Passages du Coach : "+vm.etatJournal));
      if(!vm.plan){root.appendChild(el("div","jempty",vm.message));$("plN").textContent="";return}
      $("plN").textContent=vm.plan.priorites.length+" priorité"+(vm.plan.priorites.length>1?"s":"");
      root.appendChild(el("div","jday",(vm.envoi||"")));
      vm.plan.priorites.forEach(p=>{const r=el("div","obj");r.appendChild(el("div","num",p.id));r.appendChild(el("div","t",p.titre));r.appendChild(el("div","c","Pourquoi : "+p.raison));r.appendChild(el("div","w","Sources : "+p.sources.join(" ; ")));r.appendChild(plVerdictRow(p,vm));root.appendChild(r)});
      if(vm.plan.moins_de_3_raison)root.appendChild(el("div","jempty","Moins de 3 priorités : "+vm.plan.moins_de_3_raison));
      const sec=(titre,items,fmt)=>{root.appendChild(el("div","sect",titre));if(!items.length)root.appendChild(el("div","jempty","— (rien trouvé dans les sources lues)"));items.forEach(x=>root.appendChild(el("div","w",fmt(x))))};
      sec("Attend ta réponse",vm.plan.attend,x=>x.titre);sec("Bloqué",vm.plan.bloque,x=>x.titre+(x.raison?" : "+x.raison:""));
      vm.non_lu.forEach(x=>root.appendChild(el("div","pl-warn","non lu : "+x.source+" — "+x.raison)));
      /* priorité manquante */
      const mw=el("div","pl-m");const mi=el("input","pl-phrase");mi.type="text";mi.placeholder="Il manquait… (priorité manquante)";mi.setAttribute("aria-label","Priorité manquante");mi.disabled=!canWrite;
      const mb=el("button","btn small","manquante");mb.type="button";mb.disabled=!canWrite;const me=el("div","pl-err");
      mb.addEventListener("click",async()=>{me.textContent="";if(!mi.value.trim()){me.textContent="La phrase est obligatoire pour « manquante ».";mi.focus();return}
        const n=plVd.filter(x=>x.data&&x.data.jour===jourId&&x.data.verdict==="manquante"&&x.data.voie==="page").length+1;if(await plSaveVerdict("M"+n,"manquante",mi.value))mi.value=""});
      mw.append(mi,mb,me);root.appendChild(mw);
      vm.manquantes.forEach(x=>root.appendChild(el("div","pl-cur","Manquante "+x.priorite+" ("+x.voie+", "+PLAN.hm(PLAN.ms(x.at))+" UTC) : « "+x.phrase+" »")));
    }catch(e){root.textContent="";root.appendChild(el("div","pl-err","Le bloc Plan du jour n'a pas pu s'afficher : "+plErr(e)+". Les autres blocs ne sont pas touchés."))}
  }
  setInterval(()=>{if(!document.hidden)renderPlan()},60000);

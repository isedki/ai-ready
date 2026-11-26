      /* brouillons : ceux qu'un envoi d'Issam a déjà traités (bilan de la Veille) sont repliés, avec les mêmes boutons */
      const dr=$("jDr");dr.textContent="";const drs=SUIVI.brouillons(jour.brouillons);const rb=retour.brouillons||{};
      const aPer=new Set(SUIVI.perimes(jour.perimes).map(p=>p.id));
      const aVoir=drs.filter(x=>!x.traite),traites=drs.filter(x=>x.traite);
      $("jDrN").textContent=drs.length?aVoir.filter(x=>!rb[x.id]).length+" sans avis sur "+aVoir.length+(traites.length?" · "+traites.length+" déjà traité"+(traites.length>1?"s":""):""):"";
      if(!drs.length)dr.appendChild(el("div","jempty","Aucun brouillon proposé aujourd'hui."));
      else if(!aVoir.length)dr.appendChild(el("div","jempty","Aucun brouillon à envoyer : les "+traites.length+" du jour sont déjà traités."));
      let plus=null;if(traites.length){plus=document.createElement("details");plus.className="mini";if(replis["dr-traites"])plus.open=true;plus.addEventListener("toggle",()=>{replis["dr-traites"]=plus.open});plus.appendChild(el("summary","","Déjà traités ou remplacés ("+traites.length+")"))}
      aVoir.concat(traites).forEach(x=>{const c=el("div","dr");const st=rb[x.id];
        c.appendChild(el("div","t",(x.objectif?"Objectif "+x.objectif+" · ":"")+(x.objet||x.id)));
        const meta=[x.a?("À : "+x.a):"",x.verifie||"",x.consequence?("Conséquence : "+x.consequence):""].filter(Boolean).join(" · ");if(meta)c.appendChild(el("div","m",meta));
        if(x.etatTexte)c.appendChild(el("div","m","Constat de la Veille : "+x.etatTexte));
        if(aPer.has(x.id))c.appendChild(el("div","stale-tag","aussi listé « à supprimer »"));
        const info=[x.pourquoi?"Pourquoi : "+x.pourquoi:"",x.changement?"Ce qui a changé : "+x.changement:"",x.source?"Source : "+x.source:""].filter(Boolean);if(info.length)c.appendChild(mini("dr-"+x.id,"Pourquoi ce brouillon",info));
        if(st)c.appendChild(el("div","state s-"+st.etat,{ok:"✓ Bon pour envoi",modifie:"✎ Modifié : "+(st.note||""),perime:"Périmé"}[st.etat]+" · "+st.heure));
        const acts=el("div","acts");
        if(x.texte){const cp=el("button","btn small","Copier le texte");cp.type="button";cp.addEventListener("click",()=>copyText(x.texte,cp));acts.appendChild(cp)}
        const mk=(lab,etat)=>{const b=el("button","btn small",lab);b.type="button";b.disabled=!canWrite;b.setAttribute("aria-pressed",st&&st.etat===etat?"true":"false");return b};
        const bOk=mk("OK","ok"),bMod=mk("Modifié…","modifie"),bPer=mk("Périmé","perime");
        const ta=el("textarea");ta.id="mod-"+x.id;ta.placeholder="{{ph:modif}}";ta.hidden=true;ta.value=st&&st.etat==="modifie"?(st.note||""):"";
        const bSend=el("button","btn small primary","Enregistrer la modification");bSend.type="button";bSend.hidden=true;
        bOk.addEventListener("click",()=>saveRetour({brouillons:Object.assign({},rb,{[x.id]:{etat:"ok",heure:nowHM()}})},"Noté : bon pour envoi"));
        bPer.addEventListener("click",()=>saveRetour({brouillons:Object.assign({},rb,{[x.id]:{etat:"perime",heure:nowHM()}})},"Noté : périmé"));
        bMod.addEventListener("click",()=>{ta.hidden=false;bSend.hidden=false;ta.focus()});
        bSend.addEventListener("click",()=>{const n=ta.value.trim();if(!n){ta.focus();toast("Écris ce que tu changes");return}saveRetour({brouillons:Object.assign({},rb,{[x.id]:{etat:"modifie",note:n,heure:nowHM()}})},"Modification notée")});
        acts.append(bOk,bMod,bPer);c.append(acts,ta,bSend);(x.traite?plus:dr).appendChild(c)});
      if(plus)dr.appendChild(plus);

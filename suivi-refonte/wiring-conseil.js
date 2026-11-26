  function renderConseil(){
    const root=$("viewJ");if(!root||root.hidden)return;
    $("cnCount").textContent=Object.keys(retour.consignes||{}).length?"("+Object.keys(retour.consignes).length+" enregistrée"+(Object.keys(retour.consignes).length>1?"s":"")+")":"";
    /* ne pas effacer ce qu'Issam est en train de taper */
    const ae=document.activeElement;if(ae&&(ae.tagName==="TEXTAREA"||ae.tagName==="INPUT")&&($("cQ").contains(ae)||$("cons").contains(ae)))return;
    $("cDay").textContent="Conseil du "+JFR(jourId||today());

// Aperçu local : la page (publiée ou refondue) avec une base SIMULÉE en mémoire, chargée d'une COPIE des données réelles.
// Aucune écriture ne quitte l'onglet. Les écritures sont notées dans window.__ecritures pour vérification.
// Usage : node suivi-refonte/apercu.mjs <page.html> <dossier-copie> <sortie.html>
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const [, , page, dir, out] = process.argv;
if (!page || !dir || !out) { console.error('usage : apercu.mjs <page> <dossier-copie> <sortie>'); process.exit(2); }
const data = {};
for (const c of readdirSync(dir)) {
  if (!statSync(join(dir, c)).isDirectory()) continue;
  data[c] = {};
  for (const f of readdirSync(join(dir, c)).filter((x) => x.endsWith('.json'))) {
    const x = JSON.parse(readFileSync(join(dir, c, f), 'utf8'));
    data[c][f.slice(0, -5)] = x && x.data && 'version' in x ? x.data : x;
  }
}
const mock = `<div style="background:#fdf2dc;color:#7a4d00;padding:6px 12px;font:13px system-ui">Aperçu local, non publié. Copie des données réelles : tes clics restent dans cet onglet et disparaissent au rechargement.</div>
<script>
(function(){
  const DATA=${JSON.stringify(data).replace(/</g, '\\u003c')};
  window.__ecritures=[];window.__erreurs=[];
  addEventListener("error",e=>window.__erreurs.push(String(e.message)));addEventListener("unhandledrejection",e=>window.__erreurs.push(String(e.reason)));
  const subs=[];const clone=x=>JSON.parse(JSON.stringify(x));
  const snap=(c,f)=>{let l=Object.entries(DATA[c]||{}).map(([id,d])=>({id,data:()=>clone(d)}));if(f)l=l.filter(x=>f(x.data()));return{docs:l}};
  const fire=c=>subs.filter(s=>s.c===c).forEach(s=>setTimeout(()=>s.ok(snap(c,s.f)),0));
  const log=(op,c,id,body)=>{window.__ecritures.push({op,c,id,body:body===undefined?null:clone(body)});DATA[c]=DATA[c]||{}};
  const coll=(c,f)=>({
    where:(k,op,v)=>coll(c,d=>op===">="?d[k]>=v:op==="=="?d[k]===v:true),
    onSnapshot:(ok)=>{subs.push({c,f,ok});setTimeout(()=>ok(snap(c,f)),0);return()=>{}},
    add:async b=>{const id="apercu-"+Date.now().toString(36);log("add",c,id,b);DATA[c][id]=clone(b);fire(c);return{id}},
    doc:id=>({set:async b=>{log("set",c,id,b);DATA[c][id]=clone(b);fire(c)},update:async b=>{log("update",c,id,b);DATA[c][id]=Object.assign({},DATA[c][id],clone(b));fire(c)},delete:async()=>{log("delete",c,id);delete DATA[c][id];fire(c)}})
  });
  const sample=async(p,o)=>{const t="(réponse simulée : l'aperçu local n'appelle pas Claude)";if(o&&o.onText)o.onText({text:t});return{text:t}};
  window.claude={use:async n=>n==="db"?{collection:c=>coll(c)}:n==="user"?{can:async()=>true}:n==="sample"?sample:null};
})();
</script>
`;
let h = readFileSync(page, 'utf8');
const i = h.indexOf('<div class="wrap">'); if (i < 0) { console.error('page non reconnue'); process.exit(3); }
h = h.slice(0, i) + mock + h.slice(i);
writeFileSync(out, h);
console.log('écrit : ' + out);

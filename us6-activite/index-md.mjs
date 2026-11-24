// Génère l'index.md du jour à partir d'exports JSON du suivi (ArtifactData avec out_dir : un fichier par document).
// Usage : node us6-activite/index-md.mjs --day AAAA-MM-JJ --data <dossier contenant agents/ et livrables/> [--out index.md]
// Déterministe : mêmes données = même fichier, octet pour octet. Aucune clé, aucun accès réseau.
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ACT = createRequire(import.meta.url)('./activite-core.js');
const a = process.argv.slice(2), opt = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
const day = opt('--day'), data = opt('--data'), out = opt('--out');
if (!day || !data) { console.error('usage : index-md.mjs --day AAAA-MM-JJ --data <dossier> [--out fichier]'); process.exit(2); }
function load(coll) {
  const d = join(data, coll); if (!existsSync(d)) return [];
  return readdirSync(d).filter((f) => f.endsWith('.json')).sort().map((f) => {
    const id = f.slice(0, -5);
    try { const x = JSON.parse(readFileSync(join(d, f), 'utf8')); return { id, data: x && typeof x === 'object' && 'data' in x && 'version' in x ? x.data : x }; }
    catch (e) { return { id, data: null }; } // fichier illisible : devient une anomalie dans l'index, jamais ignoré
  });
}
let md;
try { md = ACT.buildIndex({ day, agents: load('agents'), livrables: load('livrables') }); }
catch (e) { console.error('index non généré : ' + e.message); process.exit(1); }
if (out) { writeFileSync(out, md); console.error('écrit : ' + out + ' (' + Buffer.byteLength(md) + ' octets)'); } else process.stdout.write(md);

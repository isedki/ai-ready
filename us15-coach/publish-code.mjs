// Prépare le document reglages/us15-code (JSON) : les deux fichiers exécutés par les tâches planifiées, avec empreintes.
// Usage : node us15-coach/publish-code.mjs <sortie.json> [version]   (l'écriture dans le Suivi se fait ensuite avec ArtifactData set file_path)
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const [, , out, version] = process.argv;
if (!out) { console.error('usage : publish-code.mjs <sortie.json> [version]'); process.exit(2); }
const files = {};
for (const f of ['plan-core.js', 'plan.mjs']) { const c = readFileSync(join(here, f), 'utf8'); files[f] = { contenu: c, sha256: createHash('sha256').update(c).digest('hex') }; }
writeFileSync(out, JSON.stringify({ version: version || 'sans-version', genere: new Date().toISOString().slice(0, 19) + 'Z', note: 'Généré par us15-coach/publish-code.mjs : ne pas éditer ici, éditer le dépôt puis régénérer.', files }));
console.log('ok : ' + out + ' (' + Object.keys(files).join(', ') + ')');

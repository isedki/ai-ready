// Aperçu local de la vue en direct (US-18) : une page HTML autonome, sans réseau, à ouvrir dans un navigateur.
// Usage : node us6-activite/apercu-demo.mjs <dossier-données avec agents/ livrables/ jour/> <sortie.html> [--sans-photo] [--now AAAA-MM-JJThh:mm:ssZ]
// Données : celles du dossier (export ArtifactData). La photo agents/runs est SIMULÉE (bandeau « EXEMPLE » en tête) tant que la Veille ne l'écrit pas.
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), rd = (f) => readFileSync(join(here, f), 'utf8');
const a = process.argv.slice(2), data = a[0], out = a[1];
if (!data || !out) { console.error('usage : apercu-demo.mjs <dossier-données> <sortie.html> [--sans-photo] [--now ISO]'); process.exit(2); }
const sansPhoto = a.includes('--sans-photo'), ni = a.indexOf('--now'), NOW = ni >= 0 ? a[ni + 1] : '2026-11-25T14:30:00Z';
const load = (coll) => { const d = join(data, coll); if (!existsSync(d)) return []; return readdirSync(d).filter((f) => f.endsWith('.json')).sort().map((f) => { const x = JSON.parse(readFileSync(join(d, f), 'utf8')); return { id: f.slice(0, -5), data: x && typeof x === 'object' && 'data' in x && 'version' in x ? x.data : x }; }); };
const agents = load('agents'), livrables = load('livrables'), jr = load('jour').find((d) => d.id === NOW.slice(0, 10));
const TZ = 'CRON_TZ=Africa/Casablanca ';
const r = (id, nom, cron, dernier, extra = {}) => ({ id, nom, cron: cron && TZ + cron, enabled: true, modele: 'exemple', dernier, ...extra });
if (!sansPhoto) agents.push({ id: 'runs', data: { at: '2026-11-25T12:10:00Z', par: 'veille-coach (EXEMPLE simulé)', routines: [
  r('trig_exemple_1', 'Phénix · Coach plan du jour', '0 8 * * 1-5', { at: '2026-11-25T08:10:00Z', statut: 'SUCCEEDED' }),
  r('trig_exemple_2', 'Phénix · Veille et Coach', '5 12,15 * * 1-5', { at: '2026-11-25T12:06:00Z', statut: 'SUCCEEDED' }),
  r('trig_exemple_3', 'Phénix · Terrain et PO', '0 9 * * 3', { at: '2026-11-18T09:03:00Z', statut: 'SUCCEEDED' }),
  r('trig_exemple_4', 'Phénix · Formateur', '30 8 * * 1,3', { at: '2026-11-25T08:41:00Z', statut: 'FAILED' }),
  r('trig_exemple_5', 'Phénix · Contrôle qualité', '0 10 * * 5', { at: '2026-11-20T10:02:00Z', statut: 'SUCCEEDED' }),
  r('trig_exemple_6', 'Phénix · Observateur et Profil', '0 11 * * 3', { at: '2026-11-18T11:00:00Z', statut: 'SUCCEEDED' }, { enabled: false }),
  r('trig_exemple_7', 'Phénix · Bilan hebdomadaire', '20 16 * * 5', { at: '2026-11-20T16:25:00Z', statut: 'SUCCEEDED' }),
  r('trig_exemple_8', 'Job search · Recherche d\'emploi', '0 17 * * 5', { at: '2026-11-20T17:04:00Z', statut: 'SUCCEEDED' })
] } });
const fiches = JSON.parse(rd('routines-fiches.json'));
const css = rd('page.css'), core = rd('activite-core.js'), view = rd('activite-view.js');
const esc = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aperçu US-18 · vue en direct</title>
<style>:root{--bg:#f5f4f0;--surface:#fff;--fg:#1f2328;--muted:#6b7280;--line:#dcd9d0;--accent:#1f5eff;--accent-soft:#e6edff;--ok:#146c2e;--ok-soft:#e1f4e6;--late:#b42318;--late-soft:#fde8e6;--warn:#8a5a00;--warn-soft:#fdf1d6}
@media (prefers-color-scheme:dark){:root{--bg:#16181c;--surface:#1e2127;--fg:#e6e8eb;--muted:#9aa3ad;--line:#33373e;--accent:#7aa2ff;--accent-soft:#233055;--ok:#6fdc8c;--ok-soft:#173a24;--late:#ff8a80;--late-soft:#4a1f1b;--warn:#f2c45c;--warn-soft:#3d3115}}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif}.wrap{max-width:1180px;margin:0 auto;padding:16px}.btn{padding:4px 10px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--fg)}.jday{font-size:12px;color:var(--muted)}
.exemple{background:var(--warn-soft);color:var(--warn);border-radius:8px;padding:8px 12px;margin-bottom:8px;font-size:13px}</style><style>${css}</style></head><body><div class="wrap">
<div class="exemple">Aperçu local, non publié.${sansPhoto ? ' Photo agents/runs volontairement absente.' : ' La photo agents/runs est SIMULÉE (EXEMPLE) : un passage absent (Terrain et PO), un échec (Formateur), une routine désactivée.'} Heure simulée : ${NOW}. À faire par toi et journal : données réelles du Suivi exportées le 25/11.</div>
<h2>Activité</h2><div id="acMount"></div></div>
<script>${core}</script><script>${view}</script>
<script>const DATA=${esc({ agents, livrables, jour: jr || null, fiches })};
const d=ACT.buildDirect({agents:DATA.agents,livrables:DATA.livrables,jour:DATA.jour,fiches:DATA.fiches,now:Date.parse(${JSON.stringify(NOW)})});
ACTV.renderDirect(document,document.getElementById('acMount'),d,{sources:[{coll:'agents',ok:true,n:DATA.agents.length,at:'export'},{coll:'livrables',ok:true,n:DATA.livrables.length,at:'export'}],drive:null,onIndex(){},fiches:DATA.fiches.fiches,open:{}});</script></body></html>`;
writeFileSync(out, html); console.log('écrit : ' + out + ' (' + html.length + ' octets)');

#!/usr/bin/env node
// US-14 · Chiffres des simplifications du rapport du soir, calculés sur des exports ArtifactData (out_dir). Aucun réseau.
//   node us14-apprentissage/simplifs.mjs <dossier-export> [--regles <p-regles.json>]
// <dossier-export> contient agents/*.json, jour/*.json, retours/*.json (ArtifactData list avec out_dir).
import fs from 'node:fs';
import path from 'node:path';
const dir = process.argv[2];
const ri = process.argv.indexOf('--regles'); const reglesFile = ri > 0 ? process.argv[ri + 1] : undefined;
if (!dir) { console.error('usage : simplifs.mjs <dossier-export> [--regles p-regles.json]'); process.exit(2); }
const lire = (sub) => { const p = path.join(dir, sub); if (!fs.existsSync(p)) return []; return fs.readdirSync(p).filter((f) => f.endsWith('.json')).map((f) => { try { const j = JSON.parse(fs.readFileSync(path.join(p, f), 'utf8')); return { id: f.slice(0, -5), ...(j.data || j) }; } catch { return null; } }).filter(Boolean); };
const out = { constats: [] };
const stories = lire('agents').filter((d) => /^story-us-/.test(d.id));
const attente = stories.filter((d) => d.statut === 'attente');
out.histoires = { total: stories.length, attente: attente.map((d) => `${d.ref || d.id} ${d.titre}`) };
const jours = Object.fromEntries(lire('jour').map((d) => [d.date || d.id, d]));
out.questions = lire('retours').map((r) => {
  const rep = Object.values(r.questions || {}).map((q) => String(q.reponse || '').trim().toLowerCase());
  const posees = (jours[r.date || r.id]?.questions || []).length;
  return { jour: r.date || r.id, posees, repondues: rep.length, non: rep.filter((x) => x === 'non').length };
}).filter((x) => x.posees > 0);
if (reglesFile && fs.existsSync(reglesFile)) { const j = JSON.parse(fs.readFileSync(reglesFile, 'utf8')); const d = j.data || j; out.regles = { chunks: d.chunks.length, octets: fs.statSync(reglesFile).size }; }
console.log(JSON.stringify(out, null, 1));

// CLI US-15 : node us15-coach/plan.mjs <commande> <entrée.json> [--out fichier]
// Commandes : check-send | validate | render | reply | verdict | bilan | arret | activity | missed | view | unpack
// Sortie : JSON sur stdout (ou --out). Code 0 = ok, 3 = refus (ok:false), 2 = usage ou entrée illisible. Aucun réseau, aucune écriture hors --out.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const PLAN = createRequire(import.meta.url)('./plan-core.js');
const [, , cmd, file, ...rest] = process.argv;
const outIdx = rest.indexOf('--out'); const out = outIdx >= 0 ? rest[outIdx + 1] : null;
const die = (m, c = 2) => { console.error(m); process.exit(c); };
if (!cmd || !file) die('usage : plan.mjs <check-send|validate|render|reply|verdict|bilan|arret|activity|missed|view|unpack> <entrée.json> [--out f]');
let inp; try { inp = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { die('entrée illisible : ' + e.message); }
const now = (v) => (v ? PLAN.ms(v) : Date.now());
let res;
switch (cmd) {
  case 'check-send': res = PLAN.checkSend(inp); break;
  case 'validate': res = PLAN.validatePlan(inp.plan, inp.day); break;
  case 'render': { const v = PLAN.validatePlan(inp.plan, inp.plan && inp.plan.jour); res = v.ok ? { ok: true, ...PLAN.renderMail(inp.plan, now(inp.now)) } : { ok: false, errors: v.errors }; break; }
  case 'reply': res = { ok: true, ...PLAN.parseReply(inp.text, inp.plan) }; break;
  case 'verdict': res = PLAN.verdictDoc(inp.verdict, inp.prev); break;
  case 'bilan': res = { ok: true, ...PLAN.bilan(inp) }; break;
  case 'arret': res = { ok: true, ...PLAN.arret({ ...inp, now: now(inp.now) }) }; break;
  case 'activity': res = PLAN.activityDoc(inp); break;
  case 'missed': res = { ok: true, ...PLAN.missedRuns({ ...inp, now: now(inp.now) }) }; break;
  case 'view': res = { ok: true, ...PLAN.viewModel({ ...inp, now: now(inp.now) }) }; break;
  case 'unpack': { // écrit les fichiers d'un document kb/us15-code dans le dossier --out ; vérifie les empreintes
    if (!out) die('unpack : --out <dossier> requis');
    const { createHash } = await import('node:crypto'); const bad = [];
    for (const [name, f] of Object.entries(inp.files || {})) {
      if (!/^[\w.-]+$/.test(name)) { bad.push(name + ' : nom refusé'); continue; }
      if (createHash('sha256').update(f.contenu).digest('hex') !== f.sha256) { bad.push(name + ' : empreinte différente'); continue; }
      mkdirSync(out, { recursive: true }); writeFileSync(join(out, name), f.contenu);
    }
    res = bad.length ? { ok: false, errors: bad } : { ok: true, fichiers: Object.keys(inp.files || {}), version: inp.version || null };
    console.log(JSON.stringify(res)); process.exit(res.ok ? 0 : 3);
  }
  default: die('commande inconnue « ' + cmd + ' »');
}
const txt = JSON.stringify(res, null, 2);
if (out) writeFileSync(out, txt); else console.log(txt);
process.exit(res.ok === false ? 3 : 0);

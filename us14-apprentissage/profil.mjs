#!/usr/bin/env node
// US-14 · Commandes : valider le profil, produire les documents à écrire dans le suivi et dans la kb.
//   node us14-apprentissage/profil.mjs check <profil.json> [--noms <fichier>] [--today AAAA-MM-JJ]
//   node us14-apprentissage/profil.mjs check <profil.json> --regles <p-regles.json> --docs <dossier-export> [--memoire <p-memoire.json>] [--observateur <constats.json>]
//     (vérifie chaque source contre les données réelles : règle et date, documents du suivi, constats)
//   node us14-apprentissage/profil.mjs build <profil.json> --out <dossier> [--noms <fichier>] [--today AAAA-MM-JJ]
// --noms : un nom par ligne, à construire à l'exécution depuis kb/p-memoire §2 (jamais committé).
import fs from 'node:fs';
import path from 'node:path';
import { validateProfil, validateAutonomie, validateSimplifs, toKbChunks, verifierSources } from './profil-core.mjs';

const [cmd, file, ...rest] = process.argv.slice(2);
const opt = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
const today = opt('--today') || new Date().toISOString().slice(0, 10);
const noms = opt('--noms') ? fs.readFileSync(opt('--noms'), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean) : [];
if (!['check', 'build'].includes(cmd) || !file) { console.error('usage : profil.mjs check|build <profil.json> [--out dossier] [--noms fichier] [--today date]'); process.exit(2); }
let src;
try { src = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error('profil illisible :', e.message); process.exit(1); }
const simplifs = src.simplifications;
const checks = [['profil', validateProfil(src.profil, { today, noms })], ['autonomie', validateAutonomie(src.autonomie, { noms })]];
if (simplifs !== undefined) checks.push(['simplifications', validateSimplifs(simplifs, { noms })]);
const regles = opt('--regles') ? JSON.parse(fs.readFileSync(opt('--regles'), 'utf8')) : null;
if (regles || opt('--docs')) {
  const docs = {};
  const rd = (f) => { try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); return j.data || j; } catch { return undefined; } };
  for (const o of src.profil?.objectifs || []) for (const s of o.sources || []) { const d = String(s.doc || '').split('#')[0]; if (!d || /^rg-/.test(d) || docs[d]) continue; docs[d] = d === 'kb/p-memoire' ? (opt('--memoire') && rd(opt('--memoire'))) : d === 'observateur' ? (opt('--observateur') && rd(opt('--observateur'))) : (opt('--docs') && rd(path.join(opt('--docs'), d + '.json'))); }
  const errs = verifierSources(src.profil, { regles: regles && (regles.data || regles), docs });
  checks.push(['sources vérifiées sur les données réelles', { ok: errs.length === 0, errors: errs }]);
}
let bad = 0;
for (const [n, r] of checks) { if (r.ok) console.log(`OK  ${n}`); else { bad++; console.log(`ERR ${n}`); r.errors.forEach((e) => console.log('   - ' + e)); } }
if (noms.length === 0) console.log('avertissement : aucune liste de noms fournie, seuls mails, IP et téléphones sont contrôlés');
if (bad) process.exit(1);
if (cmd === 'build') {
  const out = opt('--out'); if (!out) { console.error('--out requis'); process.exit(2); }
  fs.mkdirSync(out, { recursive: true });
  const chunks = toKbChunks({ profil: src.profil, autonomie: src.autonomie, simplifs, today });
  fs.writeFileSync(path.join(out, 'kb-p-profil-objectifs.json'), JSON.stringify({ chunks, created: today, source: "Profil d'objectifs d'Issam (US-14) : hypothèses inférées, à confirmer ou corriger par Issam", version: today }, null, 1));
  fs.writeFileSync(path.join(out, 'profil-doc.json'), JSON.stringify({ type: 'profil', date: today, ...src.profil, autonomie: src.autonomie, simplifications: simplifs || [] }, null, 1));
  const md = ['# Profil d\'objectifs d\'Issam (' + today + ')', '', 'Tout est une HYPOTHÈSE de l\'agent tant qu\'Issam ne l\'a pas confirmée ou corrigée. Sources citées pour chaque ligne.', ''];
for (const o of src.profil.objectifs) md.push(`## ${o.id} · ${o.categorie} · confiance ${o.confiance} · ${o.statut}${o.a_reviser ? ' · À RÉVISER' : ''}`, o.objectif, '', `Fausse si : ${o.refutation}`, `Question pour toi : ${o.question}`, '', ...o.sources.map((x) => `- ${x.type} : ${x.ref} (${x.date})${x.sens === 'contredit' ? ' [contredit]' : ''}`), '');
if (src.profil.contradictions?.length) md.push('# Contradictions à trancher', '', ...src.profil.contradictions.map((c) => `- ${c.a} / ${c.b} : ${c.nature} Question : ${c.question}`), '');
md.push('# Tableau d\'autonomie', '', '## Faites seules (validées par Issam)', ...src.autonomie.faits_seuls.map((x) => `- ${x.action} · ${x.source}, validé le ${x.valide_le} : « ${x.citation} »`), '', '## À faire valider', ...src.autonomie.a_valider.map((x) => `- ${x.action} · ${x.raison} (${x.source})`), '');
if (simplifs) md.push('# Simplifications chiffrées', '', ...simplifs.map((x, i) => `${i + 1}. ${x.texte} Chiffre : ${x.chiffre}. Source : ${x.source}.`), '');
fs.writeFileSync(path.join(out, 'profil.md'), md.join('\n'));
console.log(`écrit : ${out}/kb-p-profil-objectifs.json (${chunks.length} chunks), ${out}/profil-doc.json`);
}

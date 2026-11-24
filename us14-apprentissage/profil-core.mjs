// US-14 · Cœur de validation du profil d'objectifs d'Issam, du tableau d'autonomie et des simplifications.
// Sans dépendance, sans réseau, sans écriture : les fonctions valident et renvoient une cause en clair.
// Principe : une inférence sans source datée n'est pas écrite ; l'agent ne confirme jamais seul ; l'autonomie ne s'élargit que sur validation explicite.

export const SOURCE_TYPES = ['decision', 'regle', 'mail', 'outil', 'retour', 'friction', 'observateur'];
export const STATUTS = ['a_confirmer', 'confirme', 'corrige'];
 // ces sources sont datées dans leur nature ; règle/outil/friction citent leur référence

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const str = (x) => typeof x === 'string' && x.trim().length > 0;

export function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Données personnelles de tiers : adresses mail, IP, téléphones, et noms d'une liste noire fournie à l'exécution (jamais dans le dépôt). */
export function scanPII(text, { noms = [] } = {}) {
  const t = typeof text === 'string' ? text : JSON.stringify(text ?? '');
  const out = [];
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(t)) out.push('adresse mail');
  if (/\b\d{1,3}(\.\d{1,3}){3}\b/.test(t)) out.push('adresse IP');
  if (/(\+|\b00)\d[\d ().-]{7,}\d/.test(t) || /\b0\d([ .-]?\d{2}){4}\b/.test(t)) out.push('numéro de téléphone');
  const low = t.toLowerCase();
  for (const n of noms) if (str(n) && n.trim().length >= 4 && low.includes(n.trim().toLowerCase())) out.push('nom de personne de la liste noire');
  return out;
}
const piiErr = (where, val, opt) => scanPII(val, opt).map((k) => `${where} : donnée personnelle de tiers (${k})`);

export const CATEGORIES = ['fond', 'sous_objectif', 'contrainte', 'anti_objectif'];
export const CONF = ['faible', 'moyen', 'eleve'];
export const JOURS_REVISION = 14; // une hypothèse jamais confirmée et sans nouvelle source depuis ce délai est marquée « à réviser »
const SENS = [undefined, 'appuie', 'contredit'];
const validIso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/.test(s) && !Number.isNaN(Date.parse(s));
const refs = (sources, contre) => new Set((Array.isArray(sources) ? sources : []).filter((x) => isObj(x) && str(x.ref) && ((x.sens === 'contredit') === contre)).map((x) => x.ref.trim()));

/** Confiance = nombre de sources distinctes qui appuient (2 faible, 3 moyen, 4 et plus élevé), moins un niveau par source distincte qui contredit. */
export function niveauConfiance(sources) {
  const n = refs(sources, false).size, c = refs(sources, true).size;
  const base = n >= 4 ? 2 : n === 3 ? 1 : 0;
  return CONF[Math.max(0, base - c)];
}

export function validateObjectif(o, { today, noms } = {}) {
  const e = [];
  const id = isObj(o) && str(o.id) ? o.id : '(sans id)';
  const W = (m) => e.push(`${id} : ${m}`);
  if (!isObj(o)) return [`${id} : objectif mal formé`];
  if (!/^ob-\d+$/.test(o.id || '')) W('id invalide (attendu ob-<n>)');
  if (!CATEGORIES.includes(o.categorie)) W(`catégorie inconnue (${o.categorie}), attendu ${CATEGORIES.join(' | ')}`);
  if (!str(o.objectif)) W('texte de l\'objectif manquant');
  if (o.hypothese !== true) W('doit être marqué HYPOTHÈSE (hypothese: true)');
  if (!validDate(o.date)) W('date manquante ou invalide (AAAA-MM-JJ)');
  else if (str(today) && o.date > today) W(`date dans le futur (${o.date})`);
  if (!STATUTS.includes(o.statut)) W(`statut inconnu (${o.statut}), attendu ${STATUTS.join(' | ')}`);
  if (!str(o.refutation)) W('réfutation manquante (ce qui prouverait que c\'est faux)');
  if (!str(o.question) || !o.question.includes('?')) W('question exacte à poser à Issam manquante (elle doit se terminer par « ? »)');
  if (!Array.isArray(o.sources) || o.sources.length === 0) W('source manquante : une inférence sans source n\'est pas écrite');
  else {
    o.sources.forEach((s, i) => {
      if (!isObj(s) || !SOURCE_TYPES.includes(s.type)) return W(`source ${i + 1} : type inconnu (attendu ${SOURCE_TYPES.join(' | ')})`);
      if (!str(s.ref)) return W(`source ${i + 1} : référence manquante`);
      if (!validDate(s.date)) W(`source ${i + 1} (${s.type}) : date manquante ou invalide`);
      else if (str(today) && s.date > today) W(`source ${i + 1} : date dans le futur`);
      if (!SENS.includes(s.sens)) W(`source ${i + 1} : sens inconnu (appuie | contredit)`);
    });
    if (refs(o.sources, false).size < 2) W('au moins 2 sources distinctes (références différentes) qui appuient l\'hypothèse');
  }
  if (Array.isArray(o.sources) && o.confiance !== niveauConfiance(o.sources)) W(`confiance « ${o.confiance} » différente de la valeur calculée « ${niveauConfiance(o.sources)} » (${refs(o.sources, false).size} source(s) qui appuient, ${refs(o.sources, true).size} qui contredisent)`);
  if (o.statut === 'confirme' || o.statut === 'corrige') {
    const r = o.retour_issam;
    if (!isObj(r) || !validDate(r.date) || !str(r.citation)) W(`statut ${o.statut} sans retour d'Issam daté et cité (retour_issam: {date, citation})`);
  }
  if (o.statut === 'corrige' && !(Array.isArray(o.corrections) && o.corrections.length && o.corrections.every((c) => isObj(c) && validDate(c.date) && str(c.ancien) && str(c.citation)))) W('statut corrigé sans trace de correction (corrections: [{date, ancien, citation}])');
  if (o.historique !== undefined && !(Array.isArray(o.historique) && o.historique.every((h) => isObj(h) && validDate(h.date) && str(h.evenement)))) W('historique mal formé ([{date, evenement, detail}])');
  e.push(...piiErr(id, o, { noms }));
  return e;
}

export function validateProfil(p, ctx = {}) {
  if (!isObj(p) || !Array.isArray(p.objectifs) || p.objectifs.length === 0) return { ok: false, errors: ['profil vide : aucun objectif, rien à écrire'] };
  const errors = [];
  const seen = new Set();
  for (const o of p.objectifs) {
    errors.push(...validateObjectif(o, ctx));
    if (isObj(o) && str(o.id)) { if (seen.has(o.id)) errors.push(`${o.id} : identifiant en double`); seen.add(o.id); }
  }
  const pairs = new Set(), enCause = new Set();
  (Array.isArray(p.contradictions) ? p.contradictions : []).forEach((c, i) => {
    const w = `contradiction ${i + 1}`;
    if (!isObj(c) || !seen.has(c.a) || !seen.has(c.b)) return errors.push(`${w} : objectif inconnu (a, b doivent être des ids du profil)`);
    if (c.a === c.b) errors.push(`${w} : un objectif ne se contredit pas lui-même`);
    if (!str(c.nature)) errors.push(`${w} : nature manquante`);
    if (!str(c.question) || !c.question.includes('?')) errors.push(`${w} : question à Issam manquante`);
    const k = [c.a, c.b].sort().join('|'); if (pairs.has(k)) errors.push(`${w} : paire ${k} en double`); pairs.add(k);
    enCause.add(c.a); enCause.add(c.b);
  });
  for (const o of p.objectifs) if (isObj(o) && refs(o.sources, true).size > 0 && !enCause.has(o.id)) errors.push(`${o.id} : source contradictoire sans contradiction déclarée (profil.contradictions)`);
  if (p.curseur !== undefined && !validIso(p.curseur)) errors.push('curseur invalide (attendu une heure ISO UTC, ex. 2026-11-24T15:30:00Z)');
  errors.push(...piiErr('contradictions', p.contradictions, ctx));
  return { ok: errors.length === 0, errors };
}

const cloneJ = (x) => JSON.parse(JSON.stringify(x));
function retourOk(r, today) { return isObj(r) && validDate(r.date) && str(r.citation) && (!str(today) || r.date <= today); }
/** Confirmation par Issam : retour daté et cité obligatoire. L'original n'est jamais modifié. */
export function confirmer(profil, id, retour, today) {
  if (!retourOk(retour, today)) return { ok: false, cause: 'retour d\'Issam daté et cité requis' };
  const p = cloneJ(profil); const o = p.objectifs.find((x) => x.id === id);
  if (!o) return { ok: false, cause: `objectif inconnu : ${id}` };
  o.statut = 'confirme'; o.retour_issam = { date: retour.date, citation: retour.citation }; delete o.a_reviser;
  (o.historique ||= []).push({ date: retour.date, evenement: 'confirme', detail: retour.citation });
  return { ok: true, profil: p };
}
/** Correction par Issam : le nouveau texte remplace l'hypothèse, l'ancien reste dans corrections. */
export function corriger(profil, id, nouveauTexte, retour, today) {
  if (!retourOk(retour, today)) return { ok: false, cause: 'retour d\'Issam daté et cité requis' };
  if (!str(nouveauTexte)) return { ok: false, cause: 'nouveau texte manquant' };
  const p = cloneJ(profil); const o = p.objectifs.find((x) => x.id === id);
  if (!o) return { ok: false, cause: `objectif inconnu : ${id}` };
  (o.corrections ||= []).push({ date: retour.date, ancien: o.objectif, citation: retour.citation });
  o.objectif = nouveauTexte; o.statut = 'corrige'; o.retour_issam = { date: retour.date, citation: retour.citation }; delete o.a_reviser;
  (o.historique ||= []).push({ date: retour.date, evenement: 'corrige', detail: retour.citation });
  return { ok: true, profil: p };
}

const dernierMouvement = (o) => [o.date, ...(o.sources || []).map((s) => s.date), ...(o.historique || []).map((h) => h.date), o.retour_issam?.date].filter(validDate).sort().pop();
const joursEntre = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

/** Mise à jour continue et idempotente. apports : [{id, source:{type,ref,date,sens?}, vu_le}] ou [{nouvel: objectif, vu_le}].
 *  Ne retient que ce qui est postérieur au curseur (vu_le), ignore les doublons, trace tout dans l'historique, marque « à réviser ».
 *  Sans nouveauté : renvoie le profil inchangé, curseur compris, ecrit:false. */
export function fusionner(profil, apports, { now, today, noms } = {}) {
  if (!validIso(now)) return { ok: false, cause: 'heure du passage invalide (now, ISO UTC)' };
  const jour = now.slice(0, 10), p = cloneJ(profil), cur = p.curseur || '';
  const log = []; let n = 0;
  for (const a of Array.isArray(apports) ? apports : []) {
    if (!isObj(a) || !validIso(a.vu_le)) { log.push('apport ignoré : vu_le absent ou invalide'); continue; }
    if (cur && a.vu_le <= cur) { log.push(`ignoré (antérieur au curseur) : ${a.id || a.nouvel?.id}`); continue; }
    if (isObj(a.nouvel)) {
      if (p.objectifs.some((x) => x.id === a.nouvel.id)) { log.push(`ignoré (id déjà présent) : ${a.nouvel.id}`); continue; }
      p.objectifs.push({ ...cloneJ(a.nouvel), historique: [{ date: jour, evenement: 'cree', detail: 'créé au passage du ' + jour }] }); n++; log.push('créé : ' + a.nouvel.id); continue;
    }
    const o = p.objectifs.find((x) => x.id === a.id);
    if (!o) { log.push(`ignoré (objectif inconnu) : ${a.id}`); continue; }
    const s = a.source;
    if (!isObj(s)) { log.push('apport sans source ignoré : ' + a.id); continue; }
    if (o.sources.some((x) => x.type === s.type && x.ref === s.ref && x.date === s.date)) { log.push(`doublon ignoré : ${a.id} ${s.ref}`); continue; }
    const avant = o.confiance;
    o.sources.push(cloneJ(s)); (o.historique ||= []).push({ date: jour, evenement: 'source_ajoutee', detail: `${s.type} ${s.ref} (${s.date})${s.sens === 'contredit' ? ' contredit' : ''}` });
    o.confiance = niveauConfiance(o.sources);
    if (o.confiance !== avant) o.historique.push({ date: jour, evenement: 'confiance', detail: `${avant} → ${o.confiance}` });
    if (o.a_reviser) { delete o.a_reviser; o.historique.push({ date: jour, evenement: 'revise', detail: 'nouvelle source' }); }
    n++; log.push(`source ajoutée : ${a.id} ${s.ref}`);
  }
  for (const o of p.objectifs) {
    if (o.statut === 'a_confirmer' && !o.a_reviser && joursEntre(dernierMouvement(o), jour) > JOURS_REVISION) { o.a_reviser = true; (o.historique ||= []).push({ date: jour, evenement: 'a_reviser', detail: `sans confirmation ni nouvelle source depuis le ${dernierMouvement(o)}` }); n++; log.push('à réviser : ' + o.id); }
  }
  if (n === 0) return { ok: true, ecrit: false, profil, journal: log };
  p.curseur = now;
  const v = validateProfil(p, { today: today || jour, noms });
  if (!v.ok) return { ok: false, cause: 'le profil fusionné est invalide : ' + v.errors.join(' ; '), errors: v.errors };
  return { ok: true, ecrit: true, profil: p, journal: log };
}

/** Vérifie chaque source contre les données réelles (règles, documents du suivi, constats de l'Observateur). */
export function verifierSources(profil, { regles, docs = {} } = {}) {
  const errs = [];
  for (const o of profil?.objectifs || []) for (const s of o.sources || []) {
    const w = `${o.id} · ${s.ref?.slice(0, 40)}`;
    if (!str(s.doc)) { errs.push(`${w} : sans pointeur doc, non vérifiable`); continue; }
    let ref = null;
    if (/^rg-/.test(s.doc)) { ref = (regles?.chunks || []).find((c) => c.id === s.doc); if (!ref) { errs.push(`${w} : règle ${s.doc} introuvable`); continue; } if (ref.date !== s.date) errs.push(`${w} : la règle ${s.doc} date du ${ref.date}, la source dit ${s.date} (date différente)`); continue; }
    const [d, frag] = s.doc.split('#'); const doc = docs[d];
    if (!doc) { errs.push(`${w} : document ${d} introuvable`); continue; }
    if (frag) { const c = Array.isArray(doc.chunks) ? doc.chunks.find((x) => x.id === frag) : doc[frag]; if (!c) { errs.push(`${w} : ${d}#${frag} introuvable`); continue; } const dc = c.date || c.derniere; if (dc && dc !== s.date) errs.push(`${w} : ${s.doc} date du ${dc}, la source dit ${s.date} (date différente)`); }
  }
  return errs;
}

/** Une proposition d'outil ou de développement cite le problème terrain d'où elle vient. */
export function validateProposition(p) {
  const e = [];
  if (!isObj(p)) return { ok: false, errors: ['proposition mal formée'] };
  if (!str(p.titre)) e.push('titre manquant');
  const pr = p.probleme;
  if (!isObj(pr) || !['friction', 'ecart', 'constat'].includes(pr.type) || !str(pr.ref) || !validDate(pr.date)) e.push('problème terrain manquant : {type: friction | ecart | constat, ref, date}');
  if (!/^ob-\d+$/.test(p.objectif || '')) e.push('objectif du profil manquant (ob-n)');
  if (!str(p.mesure)) e.push('mesure à l\'usage manquante');
  if (p.valide_par_issam !== undefined && p.valide_par_issam !== false && !(isObj(p.valide_par_issam) && validDate(p.valide_par_issam.date) && str(p.valide_par_issam.citation))) e.push('validation d\'Issam non datée ou non citée');
  return { ok: e.length === 0, errors: e };
}

// ---- autonomie
export function validateAutonomie(a, ctx = {}) {
  const errors = [];
  if (!isObj(a) || !Array.isArray(a.faits_seuls) || !Array.isArray(a.a_valider)) return { ok: false, errors: ['tableau d\'autonomie mal formé'] };
  if (a.faits_seuls.length + a.a_valider.length === 0) return { ok: false, errors: ['tableau d\'autonomie vide'] };
  a.faits_seuls.forEach((x, i) => {
    const w = `faits_seuls[${i}]`;
    if (!isObj(x) || !str(x.action)) return errors.push(`${w} : action manquante`);
    if (!str(x.source)) errors.push(`${w} : source manquante`);
    if (!validDate(x.valide_le)) errors.push(`${w} : validation d'Issam sans date valide`);
    if (!str(x.citation)) errors.push(`${w} : citation d'Issam manquante`);
  });
  a.a_valider.forEach((x, i) => {
    const w = `a_valider[${i}]`;
    if (!isObj(x) || !str(x.action)) return errors.push(`${w} : action manquante`);
    if (!str(x.source)) errors.push(`${w} : source manquante`);
  });
  const names = new Set(a.faits_seuls.map((x) => x?.action));
  for (const x of a.a_valider) if (names.has(x?.action)) errors.push(`« ${x.action} » est à la fois faite seule et à valider`);
  errors.push(...piiErr('autonomie', a, ctx));
  return { ok: errors.length === 0, errors };
}

const clone = (x) => JSON.parse(JSON.stringify(x));

/** Élargir l'autonomie : uniquement sur validation explicite d'Issam, datée et citée. Ne modifie jamais l'original. */
export function elargir(table, action, validation, today) {
  const refus = (cause) => ({ ok: false, cause });
  if (!isObj(validation) || validation.explicite !== true) return refus('validation explicite d\'Issam absente (explicite: true requis)');
  if (!validDate(validation.date) || (str(today) && validation.date > today)) return refus('date de validation invalide');
  if (!str(validation.citation)) return refus('citation d\'Issam manquante');
  if (!str(validation.source)) return refus('source de la validation manquante (document ou message daté)');
  const t = clone(table);
  const i = t.a_valider.findIndex((x) => x.action === action);
  if (i < 0) return refus(`action inconnue dans « à valider » : ${action}`);
  const [x] = t.a_valider.splice(i, 1);
  t.faits_seuls.push({ action: x.action, source: x.source, valide_le: validation.date, citation: validation.citation, source_validation: validation.source });
  (t.historique ||= []).push({ date: validation.date, action: x.action, sens: 'elargi', citation: validation.citation, source: validation.source });
  return { ok: true, table: t };
}

/** Restreindre : toujours permis, sans condition (une erreur constatée suffit). */
export function restreindre(table, action, raison, today) {
  const t = clone(table);
  const i = t.faits_seuls.findIndex((x) => x.action === action);
  if (i < 0) return { ok: false, cause: `action inconnue dans « faites seules » : ${action}` };
  const [x] = t.faits_seuls.splice(i, 1);
  t.a_valider.push({ action: x.action, raison: raison || 'retrait', source: x.source });
  (t.historique ||= []).push({ date: today, action: x.action, sens: 'restreint', raison });
  return { ok: true, table: t };
}

// ---- simplifications du rapport du soir
export function validateSimplifs(list, ctx = {}) {
  if (!Array.isArray(list) || list.length < 1 || list.length > 3) return { ok: false, errors: ['1 à 3 simplifications attendues'] };
  const errors = [];
  list.forEach((s, i) => {
    const w = `simplification ${i + 1}`;
    if (!isObj(s) || !str(s.texte)) return errors.push(`${w} : texte manquant`);
    if (!str(s.chiffre) || !/\d/.test(s.chiffre)) errors.push(`${w} : chiffre manquant (une valeur numérique mesurée est requise)`);
    if (!str(s.source)) errors.push(`${w} : source manquante`);
    errors.push(...piiErr(w, s, ctx));
  });
  return { ok: errors.length === 0, errors };
}

// ---- écriture sûre : valider, écrire, relire, comparer. Jamais de « réussi » sans relecture identique.
export async function ecrireSecurise({ doc, validate, today, noms, write, read }) {
  const v = validate(doc, { today, noms });
  if (!v.ok) return { ok: false, etape: 'validation', errors: v.errors, cause: v.errors.join(' ; ') };
  try { await write(doc); } catch (err) { return { ok: false, etape: 'ecriture', cause: String(err?.message || err) }; }
  let lu;
  try { lu = await read(); } catch (err) { return { ok: false, etape: 'relecture', cause: String(err?.message || err) }; }
  if (JSON.stringify(lu) !== JSON.stringify(doc)) return { ok: false, etape: 'relecture', cause: 'le document relu diffère du document écrit' };
  return { ok: true, verifie: true };
}

// ---- sortie lisible par les agents (kb/p-profil-objectifs, format des autres fiches kb)
const SRC = (s) => `${s.type} ${s.ref}${s.date ? ` (${s.date})` : ''}${s.sens === 'contredit' ? ' [contredit]' : ''}`;
const LAB = { fond: 'objectif de fond', sous_objectif: 'sous-objectif', contrainte: 'contrainte', anti_objectif: 'anti-objectif (ce qu\'il rejette)' };
export function toKbChunks({ profil, autonomie, simplifs, today }) {
  const src = 'Profil d\'objectifs US-14 : inférence de l\'agent depuis les décisions, règles, retours, frictions et constats de l\'Observateur (hypothèses)';
  const chunks = [{
    date: today, id: 'po-0', kind: 'profil', source: src, title: 'Profil d\'objectifs · lire avant de proposer',
    text: `# Profil d'objectifs d'Issam (US-14, mis à jour le ${today}, curseur : ${profil.curseur || 'aucun'})\nTOUT CE QUI SUIT EST UNE HYPOTHÈSE de l'agent, sauf statut « confirmé » ou « corrigé » avec retour d'Issam. À lire avant toute proposition (rg-41) ; cite l'id (ob-n) qui justifie ta proposition. Une proposition d'outil ou de développement cite aussi le problème terrain d'où elle vient (friction, écart, constat de l'Observateur). Mise à jour : lis seulement ce qui est postérieur au curseur. Aucune donnée de tiers ici. Si une proposition contredit un objectif, dis-le.`,
  }];
  for (const o of profil.objectifs) {
    const ret = o.retour_issam ? `\nRetour d'Issam ${o.retour_issam.date} : « ${o.retour_issam.citation} »` : '';
    const cor = (o.corrections || []).map((c) => `\nCorrigé le ${c.date} (ancien texte : « ${c.ancien} ») : « ${c.citation} »`).join('');
    const hist = (o.historique || []).length ? `\nHistorique : ${o.historique.map((h) => `${h.date} ${h.evenement}${h.detail ? ' (' + h.detail + ')' : ''}`).join(' ; ')}` : '';
    chunks.push({
      date: o.date, id: o.id, kind: 'profil', source: o.sources.map(SRC).join(' ; '), title: `Profil · ${o.id} · ${o.objectif.slice(0, 70)}`,
      text: `${o.id} · ${LAB[o.categorie] || o.categorie} · HYPOTHÈSE du ${o.date} · statut : ${o.statut}${o.a_reviser ? ' · À RÉVISER' : ''} · confiance : ${o.confiance} (${o.sources.filter((x) => x.sens !== 'contredit').length} sources qui appuient)\n${o.objectif}\nFausse si : ${o.refutation}\nQuestion pour Issam : ${o.question}\nSources : ${o.sources.map(SRC).join(' ; ')}${ret}${cor}${hist}`,
    });
  }
  if (profil.contradictions?.length) chunks.push({
    date: today, id: 'po-contradictions', kind: 'profil', source: 'Hypothèses du profil', title: 'Profil · contradictions entre hypothèses',
    text: `# Contradictions à trancher par Issam\n${profil.contradictions.map((c) => `- ${c.a} / ${c.b} : ${c.nature} Question : ${c.question}`).join('\n')}`,
  });
  if (autonomie) chunks.push({
    date: today, id: 'po-autonomie', kind: 'profil', source: 'Règles rg-19, rg-24 à rg-40 ; décisions d\'Issam', title: 'Profil · tableau d\'autonomie',
    text: `# Tableau d'autonomie (mis à jour le ${today})\nS'élargit UNIQUEMENT sur validation explicite d'Issam (date, citation et source de la validation enregistrées) ; il peut être restreint sans condition.\n## Faites seules (validées)\n${autonomie.faits_seuls.map((x) => `- ${x.action} · validé ${x.valide_le} (${x.source}${x.source_validation ? ' ; ' + x.source_validation : ''}) : « ${x.citation} »`).join('\n') || '- (aucune)'}\n## À faire valider\n${autonomie.a_valider.map((x) => `- ${x.action} · ${x.raison || ''} (${x.source})`).join('\n') || '- (aucune)'}${autonomie.historique?.length ? '\n## Historique\n' + autonomie.historique.map((h) => `- ${h.date} ${h.sens} : ${h.action}`).join('\n') : ''}`,
  });
  if (simplifs?.length) chunks.push({
    date: today, id: 'po-simplifications', kind: 'profil', source: simplifs.map((s) => s.source).join(' ; '), title: 'Profil · simplifications chiffrées du jour',
    text: `# Simplifications proposées (${today})\n${simplifs.map((s, i) => `${i + 1}. ${s.texte} — ${s.chiffre} (${s.source})`).join('\n')}`,
  });
  return chunks;
}

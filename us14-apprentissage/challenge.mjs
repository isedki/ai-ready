// US-14 · Contrôle critique du profil : preuves datées et citées, contre-exemples des 7 derniers jours.
// Sans dépendance, sans réseau, sans écriture (la CLI de profil.mjs écrit la sortie).
// Un trait « retenu » est repris par les agents ; « sans_preuve », « contredit » et « a_reviser » sont marqués et écartés.
import { validDate, JOURS_REVISION } from './profil-core.mjs';

export const VERDICTS = ['retenu', 'sans_preuve', 'contredit', 'a_reviser'];
export const FENETRE_JOURS = 7;
const OPS = { '>=': (a, b) => a >= b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '<': (a, b) => a < b };
export const METRIQUES = ['concentration_minutes', 'changements_par_heure', 'emails_visites', 'actif_minutes', 'devant_pc_minutes', 'lecture_ou_hesitation_pct'];

const day = (iso) => new Date(iso + 'T00:00:00Z').getTime();
const addDays = (iso, n) => new Date(day(iso) + n * 86_400_000).toISOString().slice(0, 10);
const dansFenetre = (d, du, au) => validDate(d) && d >= du && d <= au;

/** Une source est une preuve si elle a un type, une référence, une date valide et un pointeur `doc` (sauf source de type règle qui cite rg-n). */
export function preuveValide(s, { constats, today } = {}) {
  if (!s || typeof s !== 'object') return 'source mal formée';
  if (s.sens === 'contredit') return null;
  if (!String(s.ref || '').trim()) return 'référence manquante';
  if (!validDate(s.date)) return `${s.ref} : date manquante ou invalide`;
  if (today && s.date > today) return `${s.ref} : date dans le futur`;
  if (!String(s.doc || '').trim()) return `${s.ref} : pointeur doc manquant (preuve non vérifiable)`;
  if (s.type === 'observateur' && constats) {
    const cle = String(s.doc).split('#')[1];
    if (!cle || !(cle in constats)) return `${s.ref} : constat « ${cle || '?'} » absent de l'Observateur`;
  }
  return null;
}

/** Contre-exemples d'un trait dans la fenêtre [du, au] : sources qui contredisent, faits désignant le trait, mesure non tenue. */
export function contreExemples(o, { du, au, faits = [], jours = [] }) {
  const out = [];
  for (const s of o.sources || []) if (s.sens === 'contredit' && dansFenetre(s.date, du, au)) out.push({ date: s.date, ref: s.ref, texte: `source qui contredit (${s.type})` });
  for (const f of faits) if (dansFenetre(f.date, du, au) && Array.isArray(f.contredit) && f.contredit.includes(o.id)) out.push({ date: f.date, ref: f.ref || f.doc || 'fait', texte: f.texte || '' });
  let mesure = null;
  const m = o.mesure;
  if (m) {
    if (!METRIQUES.includes(m.metrique) || !OPS[m.op] || typeof m.seuil !== 'number') mesure = { evaluable: false, raison: 'mesure mal formée' };
    else {
      const j = jours.filter((d) => dansFenetre(d.jour, du, au) && d.actif_minutes > 0 && typeof d[m.metrique] === 'number');
      const faux = j.filter((d) => !OPS[m.op](d[m.metrique], m.seuil));
      if (j.length < 2) mesure = { evaluable: false, raison: `${j.length} jour(s) de données dans la fenêtre (2 minimum)` };
      else {
        mesure = { evaluable: true, jours: j.length, faux: faux.length };
        if (faux.length * 2 > j.length) for (const d of faux) out.push({ date: d.jour, ref: `observateur#jours:${m.metrique}`, texte: `${m.metrique} = ${d[m.metrique]}, la mesure attendue est ${m.op} ${m.seuil}` });
      }
    }
  }
  return { contre: out, mesure };
}

/**
 * Challenge de tous les traits. ctx : { today, constats?, jours?, faits? }.
 * Retourne { date, fenetre, couverture, traits[], reprenables[], ecartes[] }.
 */
export function challenger(profil, ctx = {}) {
  const today = ctx.today, du = addDays(today, -(FENETRE_JOURS - 1));
  const jours = ctx.jours || [], faits = ctx.faits || [];
  const joursAvecDonnees = jours.filter((d) => dansFenetre(d.jour, du, today) && d.actif_minutes > 0).length;
  const faitsLus = faits.filter((f) => dansFenetre(f.date, du, today)).length;
  const traits = [];
  for (const o of profil.objectifs || []) {
    const raisons = [];
    const pour = (o.sources || []).filter((s) => s.sens !== 'contredit');
    const preuves = [], manques = [];
    for (const s of pour) { const m = preuveValide(s, { constats: ctx.constats, today }); if (m) manques.push(m); else preuves.push({ type: s.type, ref: s.ref, date: s.date, doc: s.doc }); }
    const distinctes = new Set(preuves.map((p) => p.ref)).size;
    const { contre, mesure } = contreExemples(o, { du, au: today, faits, jours });
    let verdict = 'retenu';
    if (contre.length) { verdict = 'contredit'; raisons.push(`${contre.length} contre-exemple(s) dans les ${FENETRE_JOURS} derniers jours`); }
    else if (distinctes < 2) { verdict = 'sans_preuve'; raisons.push(`${distinctes} preuve(s) valide(s) distincte(s), 2 minimum`, ...manques); }
    else {
      const derniere = preuves.map((p) => p.date).sort().pop();
      const ancien = (day(today) - day(derniere)) / 86_400_000;
      if (o.statut !== 'confirme' && o.statut !== 'corrige' && (o.a_reviser || ancien > JOURS_REVISION)) { verdict = 'a_reviser'; raisons.push(`aucune preuve depuis ${ancien} jours (limite ${JOURS_REVISION})`); }
    }
    if (verdict === 'contredit' && distinctes < 2) raisons.push(`et seulement ${distinctes} preuve(s) valide(s)`);
    if (verdict === 'retenu') {
      raisons.push(mesure?.evaluable ? `mesure tenue : ${mesure.jours - mesure.faux}/${mesure.jours} jours` : mesure ? `mesure non évaluée : ${mesure.raison}` : 'aucune mesure vérifiable déclarée sur ce trait');
      if (joursAvecDonnees + faitsLus === 0) raisons.push('fenêtre sans aucun fait lu : trait non contesté faute de données, pas confirmé');
    }
    traits.push({ id: o.id, verdict, raisons, preuves, contre_exemples: contre });
  }
  return {
    date: today, fenetre: { du, au: today, jours: FENETRE_JOURS },
    couverture: { jours_avec_donnees: joursAvecDonnees, faits_lus: faitsLus, mesures_evaluees: (profil.objectifs || []).filter((o) => o.mesure).length },
    traits, reprenables: traits.filter((t) => t.verdict === 'retenu').map((t) => t.id), ecartes: traits.filter((t) => t.verdict !== 'retenu').map((t) => t.id),
  };
}

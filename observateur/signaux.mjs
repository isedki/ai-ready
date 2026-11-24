// Observateur · signaux d'observation continue (gemba walk), calculés par le code sur le journal
// du jour : fils de travail (sur quels dossiers passe le temps), répétitions (enchaînements qui
// reviennent) et frustration (va-et-vient, réouvertures, plantage suivi d'un arrêt).
import { localTime } from './lib.mjs'

const STOP = new Set(`re tr fw fwd tr: re: objet sujet the and pour avec dans des les une sur par from mail outlook microsoft
excel word powerpoint teams chrome safari google inbox boîte reception réception envoyé envoyés brouillon document
copie fichier untitled sans titre nouveau nouvelle message messages réunion meeting chat conversation phenix phénix`.split(/\s+/))

/** Clés de sujet d'un titre : références (A-043, MGEN3963, INC4660323), puis mots significatifs. */
export function topicKeys(title) {
  const t = (title ?? '').replace(/\[[^\]]+\]/g, ' ')
  const refs = t.match(/\b(?:A-\d{3}|MGEN\d{3,5}|INC\d{6,}|REQ\d{6,}|B-\d{5})\b/gi) ?? []
  const words = t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z][a-z0-9_-]{3,}/g) ?? []
  return [...new Set([...refs.map(r => r.toUpperCase()), ...words.filter(w => !STOP.has(w))])]
}

/**
 * Fils de travail : chaque échantillon actif est rattaché au mot-clé de son titre le plus fréquent
 * de la journée ; on compte le temps, le nombre de reprises et les applications utilisées.
 */
export function workThreads(records, cfg, step = cfg.intervalle_secondes) {
  const act = records.filter(r => !r.inactif && r.titre)
  const freq = new Map()
  for (const r of act) for (const k of topicKeys(r.titre)) freq.set(k, (freq.get(k) ?? 0) + 1)
  const threads = new Map()
  let last = null
  for (const r of act) {
    const keys = topicKeys(r.titre)
    if (!keys.length) { last = null; continue }
    const key = keys.sort((a, b) => (freq.get(b) ?? 0) - (freq.get(a) ?? 0))[0]
    const t = threads.get(key) ?? { sujet: key, n: 0, reprises: 0, apps: new Set(), debut: r.t, fin: r.t }
    if (last !== key) t.reprises++
    t.n++; t.apps.add(r.app); t.fin = r.t; threads.set(key, t); last = key
  }
  return [...threads.values()]
    .map(t => ({ sujet: t.sujet, minutes: Math.round((t.n * step) / 60), reprises: t.reprises, apps: [...t.apps],
      premiere: localTime(new Date(t.debut)), derniere: localTime(new Date(t.fin)) }))
    .filter(t => t.minutes >= 5)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 12)
}

/** Enchaînements de 3 applications (A → B → C) qui reviennent dans la journée : candidats à l'automatisation. */
export function repetitions(records) {
  const apps = []
  for (const r of records.filter(x => !x.inactif && x.app)) if (apps.at(-1) !== r.app) apps.push(r.app)
  const seq = new Map()
  for (let i = 0; i + 2 < apps.length; i++) {
    const k = `${apps[i]} → ${apps[i + 1]} → ${apps[i + 2]}`
    if (new Set([apps[i], apps[i + 1], apps[i + 2]]).size < 2) continue
    seq.set(k, (seq.get(k) ?? 0) + 1)
  }
  return [...seq].filter(([, n]) => n >= 4).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([enchainement, fois]) => ({ enchainement, fois }))
}

/**
 * Signaux de frustration, sans capture ni frappe :
 *  - va-et-vient : 6 bascules ou plus en 5 minutes entre les deux mêmes applications (avec un
 *    échantillon toutes les 30 s, c'est presque une bascule à chaque échantillon) ;
 *  - réouverture : le même titre repris 5 fois ou plus en 30 minutes ;
 *  - arrêt après plantage : 5 minutes ou plus d'inactivité dans les 10 minutes qui suivent un plantage.
 */
export function frustration(records, cfg) {
  const all = records.filter(r => r.app).map(r => ({ ...r, d: new Date(r.t) }))
  const act = all.filter(r => !r.inactif)
  const out = []

  for (let i = 0; i < act.length; i++) {
    const win = act.filter(r => r.d >= act[i].d && r.d - act[i].d <= 300_000)
    let sw = 0
    for (let j = 1; j < win.length; j++) if (win[j].app !== win[j - 1].app) sw++
    const pair = new Set(win.map(r => r.app))
    if (sw >= 6 && pair.size === 2) {
      const prev = out.at(-1)
      if (!(prev?.type === 'va-et-vient' && act[i].d - prev.d < 600_000)) {
        out.push({ type: 'va-et-vient', heure: localTime(act[i].d), d: act[i].d, detail: `${[...pair].join(' ↔ ')}, ${sw} bascules en 5 min (${win.find(r => r.titre)?.titre ?? 'sans titre'})` })
      }
    }
  }

  const reopen = new Map()
  let prevTitle = null
  for (const r of act) {
    if (r.titre && r.titre !== prevTitle) {
      const list = (reopen.get(r.titre) ?? []).filter(d => r.d - d <= 30 * 60_000)
      list.push(r.d); reopen.set(r.titre, list)
      if (list.length === 5) out.push({ type: 'réouverture', heure: localTime(r.d), d: r.d, detail: `« ${r.titre} » repris 5 fois en ${Math.round((r.d - list[0]) / 60_000)} min` })
    }
    prevTitle = r.titre
  }

  const seen = []
  for (const c of all.filter(r => r.plantages)) {
    if (seen.some(x => c.plantages.every(a => x.apps.includes(a)) && c.d - x.d < 600_000)) continue
    seen.push({ apps: c.plantages, d: c.d })
    const after = all.filter(r => r.d > c.d && r.d - c.d <= 10 * 60_000)
    const idle = after.filter(r => r.inactif).length * cfg.intervalle_secondes
    if (idle >= 300) out.push({ type: 'arrêt après plantage', heure: localTime(c.d), d: c.d, detail: `${c.plantages.join(', ')} a planté, ${Math.round(idle / 60)} min d'inactivité ensuite` })
  }

  return out.sort((a, b) => a.d - b.d).map(f => { const rest = { ...f }; delete rest.d; return rest })
}

/** La question du soir : courte, sur le moment le plus marquant de la journée. Le code la choisit. */
export function eveningQuestion({ frictions = [], slowdowns = [], threads = [] }) {
  const f = frictions.find(x => x.type === 'arrêt après plantage') ?? frictions.find(x => x.type === 'va-et-vient') ?? frictions[0]
  if (f) return `À ${f.heure} : ${f.detail}. Qu'est-ce qui se passait ?`
  const s = slowdowns.find(x => x.cause_regle !== 'pause') ?? slowdowns[0]
  if (s) return `Entre ${s.debut} et ${s.fin}, ton activité est tombée à ${s.signaux.activite_pct} %${s.signaux.sujet_principal ? ` (sur « ${s.signaux.sujet_principal} »)` : ''}. Pourquoi ?`
  const t = threads.find(x => x.reprises >= 4)
  if (t) return `Tu es revenu ${t.reprises} fois sur « ${t.sujet} » (${t.minutes} min). Qu'est-ce qui t'obligeait à y revenir ?`
  return `Qu'est-ce qui t'a le plus ralenti ou agacé aujourd'hui ?`
}

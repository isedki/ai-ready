import { lignesJournal, finPlanificateur, alertes } from './logs.mjs'
const n = Number(process.argv[2]) || 30
console.log(`Journal des passages (${n} derniers ; sans contenu de mail) :\n${lignesJournal(n).join('\n') || '(vide)'}`)
const a = alertes(); if (Object.keys(a).length) console.log(`\nDernières alertes : ${Object.entries(a).map(([k, v]) => `${k} (${v})`).join(', ')}`)
const f = finPlanificateur(); if (f) console.log(`\nJournal du planificateur (fin) :\n${f}`)

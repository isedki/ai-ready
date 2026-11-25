// Journal commun (hors passages) : une ligne JSON par événement, JAMAIS de contenu, de requête ni de secret.
import fs from 'node:fs'
import path from 'node:path'
import { JOURNAL_DIR } from './config.mjs'

export function journaliser(e) {
  fs.mkdirSync(JOURNAL_DIR, { recursive: true, mode: 0o700 })
  fs.appendFileSync(path.join(JOURNAL_DIR, `${new Date().toISOString().slice(0, 10)}.jsonl`), JSON.stringify({ at: new Date().toISOString(), ...e }) + '\n', { mode: 0o600 })
}

// Dépense du jour (UTC) d'un agent donné, lue dans le journal.
export function depenseDuJour(agent) {
  const f = path.join(JOURNAL_DIR, `${new Date().toISOString().slice(0, 10)}.jsonl`)
  let usd = 0
  if (fs.existsSync(f)) for (const l of fs.readFileSync(f, 'utf8').split('\n').filter(Boolean)) { try { const j = JSON.parse(l); if (j.agent === agent) usd += j.cout_usd || 0 } catch {} }
  return usd
}

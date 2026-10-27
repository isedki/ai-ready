import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { answer }                    from './agent'
import { search }                    from './search'
import type { Store }                from './store'

/**
 * A small golden set keeps the Copilote honest when documents, prompts or retrieval change.
 *
 * eval/questions.json (or any path): [{ "q": "...", "expect": ["mot", "10.30.159.2"], "source": "DAT", "absent": false }]
 *   expect  words that must appear in the retrieved passages (and in the answer with --answers)
 *   source  part of the title of a source that must be among the top passages
 *   absent  true when the base does NOT contain the answer: the Copilote must say « Pas trouvé »
 *
 * Without --answers only retrieval is measured (free, instant). With --answers each question
 * is answered by Claude and checked: expected words, valid references, honesty on absent facts.
 */
export type EvalCase = { q: string; expect?: string[]; source?: string; absent?: boolean; kind?: string }

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export async function runEval(db: Store, path: string, opts: { answers?: boolean; k?: number; log?: (s: string) => void } = {}) {
  if (!existsSync(path)) throw new Error(`Jeu de questions introuvable : ${path} (voir eval/questions.example.json)`)
  const cases = JSON.parse(readFileSync(path, 'utf8')) as EvalCase[]
  const k = opts.k ?? 8
  const log = opts.log ?? (() => {})
  const rows: Record<string, unknown>[] = []
  let retrOk = 0, ansOk = 0, ansRun = 0
  for (const c of cases) {
    const hits = await search(db, c.q, { k, kind: c.kind })
    const blob = fold(hits.map(h => `${h.title}\n${h.text}`).join('\n'))
    const missing = (c.expect ?? []).filter(w => !blob.includes(fold(w)))
    const srcOk = !c.source || hits.some(h => fold(h.title).includes(fold(c.source!)))
    const retrieval = c.absent ? true : missing.length === 0 && srcOk
    if (retrieval) retrOk++
    const row: Record<string, unknown> = { question: c.q, retrieval: retrieval ? 'OK' : `manque ${[...missing, ...(srcOk ? [] : [`source ${c.source}`])].join(', ')}` }
    if (opts.answers) {
      ansRun++
      let text = ''
      let check = { cited: [] as string[], unknown: [] as string[], unsourced: false }
      for await (const ev of answer(c.q, { db, telco: false })) {
        if (ev.type === 'done') { text = ev.answer; check = ev.check }
        if (ev.type === 'error') text = `ERREUR ${ev.message}`
      }
      const said = fold(text)
      const problems: string[] = []
      if (c.absent) { if (!said.includes('pas trouve')) problems.push('aurait dû dire « Pas trouvé »') }
      else {
        for (const w of c.expect ?? []) if (!said.includes(fold(w))) problems.push(`absent : ${w}`)
        if (check.unsourced) problems.push('aucune référence')
      }
      if (check.unknown.length) problems.push(`références inconnues ${check.unknown.join(',')}`)
      if (!problems.length) ansOk++
      row.answer = problems.length ? problems.join(' ; ') : 'OK'
    }
    rows.push(row)
    log(`${row.retrieval === 'OK' ? '✓' : '✗'}${opts.answers ? (row.answer === 'OK' ? '✓' : '✗') : ''} ${c.q}${row.retrieval !== 'OK' ? `  → ${row.retrieval}` : ''}${opts.answers && row.answer !== 'OK' ? `  → ${row.answer}` : ''}`)
  }
  log(`\nRecherche : ${retrOk}/${cases.length} questions trouvent leurs faits dans les ${k} premiers passages.`)
  if (opts.answers) log(`Réponses : ${ansOk}/${ansRun} correctes et sourcées.`)
  const out = path.replace(/\.json$/, '') + '.results.json'
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), k, rows }, null, 2))
  log(`Détail : ${out}`)
  return rows
}

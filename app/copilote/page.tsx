'use client'

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'

type Source = { ref: string; kind: string; title: string; version: string | null; date: string | null; author: string | null; locator: string | null; heading: string | null; text: string }
type Check  = { cited: string[]; unknown: string[]; unsourced: boolean }
type Qa = {
  question: string
  status:   string
  answer:   string
  sources:  Source[]
  check?:   Check
  error?:   string
  meta?:    string
  done:     boolean
}
type Status = { ok: boolean; sources?: number; chunks?: number; byKind?: Record<string, number>; lastIngest?: string | null; embeddings?: boolean; model?: string; error?: string }

const KIND: Record<string, string> = { doc: 'Document', email: 'Email', suivi: 'Suivi', annuaire: 'Annuaire', formation: 'Formation', note: 'Note' }

const EXAMPLES = [
  "Atos s'est-il engagé à faire une passation ou une formation pour Inetum ?",
  'À quoi sert SOA, et quand passe-t-on plutôt par APIGEE ?',
  'Quelles adresses IP connaît-on pour chaque environnement ?',
  'Qui contacter pour ouvrir un flux vers une base Oracle ?',
  "Où en est la MGEN3918 et qu'est-ce qui bloque le GO ?",
  'Quels sont les seuils Bill Compare et DR Simulation ?',
]

/* ── minimal Markdown: headings, lists, tables, **bold**, `code`, [S1] citations ── */
function inline(text: string, cite: (ref: string) => void, key: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[S\d+(?:\s*,\s*S\d+)*\])/g).map((part, i) => {
    const k = `${key}-${i}`
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={k} className="font-semibold text-zinc-50">{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={k} className="rounded bg-zinc-800 px-1 text-[0.85em] text-emerald-300">{part.slice(1, -1)}</code>
    if (/^\[S\d+/.test(part)) {
      return <Fragment key={k}>{part.slice(1, -1).split(/\s*,\s*/).map(ref => (
        <button key={ref} onClick={() => cite(ref)}
          className="mx-0.5 rounded bg-emerald-950 px-1 align-[1px] font-mono text-[11px] text-emerald-300 ring-1 ring-emerald-800 hover:bg-emerald-900">{ref}</button>
      ))}</Fragment>
    }
    return <Fragment key={k}>{part}</Fragment>
  })
}

function Markdown({ text, cite }: { text: string; cite: (ref: string) => void }) {
  const lines = text.split('\n')
  const out: ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const l = lines[i]
    const key = `l${i}`
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? '')) {
      const cells = (r: string) => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
      const head = cells(l)
      const body: string[][] = []
      i += 2
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) body.push(cells(lines[i++]))
      out.push(
        <div key={key} className="my-3 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead><tr>{head.map((c, j) => <th key={j} className="border border-zinc-700 bg-zinc-900 px-2 py-1 text-left font-semibold">{inline(c, cite, `${key}h${j}`)}</th>)}</tr></thead>
            <tbody>{body.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j} className="border border-zinc-800 px-2 py-1 align-top">{inline(c, cite, `${key}r${ri}c${j}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>)
      continue
    }
    let m: RegExpMatchArray | null
    if ((m = l.match(/^#{1,4}\s+(.*)/))) out.push(<h3 key={key} className="mt-4 mb-1 text-[15px] font-semibold text-zinc-50">{inline(m[1], cite, key)}</h3>)
    else if (/^\s*[-*]\s+/.test(l) || /^\s*\d+[.)]\s+/.test(l)) {
      const ordered = /^\s*\d/.test(l)
      const items: string[] = []
      while (i < lines.length && (ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/).test(lines[i])) items.push(lines[i++].replace(/^\s*(?:[-*]|\d+[.)])\s+/, ''))
      const List = ordered ? 'ol' : 'ul'
      out.push(<List key={key} className={`my-2 space-y-1 pl-5 ${ordered ? 'list-decimal' : 'list-disc'} marker:text-zinc-500`}>{items.map((it, j) => <li key={j}>{inline(it, cite, `${key}i${j}`)}</li>)}</List>)
      continue
    } else if (l.trim()) out.push(<p key={key} className="my-2">{inline(l, cite, key)}</p>)
    i++
  }
  return <div className="leading-relaxed text-zinc-200">{out}</div>
}

function SourceCard({ s, cited, active }: { s: Source; cited: boolean; active: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    if (active && ref.current) { ref.current.open = true; ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }
  }, [active])
  return (
    <details ref={ref} className={`rounded-lg border bg-zinc-900/60 ${active ? 'border-emerald-500' : cited ? 'border-zinc-700' : 'border-zinc-800 opacity-70'}`}>
      <summary className="cursor-pointer list-none px-3 py-2 text-sm">
        <span className="mr-2 font-mono text-xs text-emerald-400">{s.ref}</span>
        <span className="text-zinc-100">{s.title}</span>
        {s.version && <span className="ml-1 text-zinc-500">v{s.version}</span>}
        <div className="mt-0.5 text-xs text-zinc-500">{[KIND[s.kind] ?? s.kind, s.date, s.locator].filter(Boolean).join(' · ')}</div>
      </summary>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap border-t border-zinc-800 px-3 py-2 font-mono text-xs leading-relaxed text-zinc-300">{[s.author, s.heading].filter(Boolean).join(' · ')}{s.author || s.heading ? '\n\n' : ''}{s.text}</pre>
    </details>
  )
}

export default function Copilote() {
  const [status, setStatus]   = useState<Status | null>(null)
  const [input, setInput]     = useState('')
  const [telco, setTelco]     = useState(true)
  const [turns, setTurns]     = useState<Qa[]>([])
  const [active, setActive]   = useState<{ turn: number; ref: string } | null>(null)
  const [busy, setBusy]       = useState(false)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => { fetch('/api/copilote').then(r => r.json()).then(setStatus).catch(e => setStatus({ ok: false, error: String(e) })) }, [])

  const update = (idx: number, fn: (q: Qa) => Qa) => setTurns(t => t.map((q, i) => (i === idx ? fn(q) : q)))

  async function ask(question: string) {
    question = question.trim()
    if (!question || busy) return
    const idx = turns.length
    const history = turns.filter(t => t.done && !t.error).flatMap(t => [
      { role: 'user' as const, content: t.question },
      { role: 'assistant' as const, content: t.answer },
    ])
    setTurns(t => [...t, { question, status: 'Recherche dans la base…', answer: '', sources: [], done: false }])
    setInput('')
    setBusy(true)
    abort.current = new AbortController()
    try {
      const res = await fetch('/api/copilote', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question, history, telco }), signal: abort.current.signal,
      })
      if (!res.ok || !res.body) {
        const e = await res.json().catch(() => ({ error: `Erreur ${res.status}` }))
        update(idx, q => ({ ...q, error: e.error, done: true, status: '' }))
        return
      }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          const ev = JSON.parse(line)
          if (ev.type === 'status') update(idx, q => ({ ...q, status: ev.text }))
          else if (ev.type === 'source') update(idx, q => ({ ...q, sources: [...q.sources, ev.source] }))
          else if (ev.type === 'text') update(idx, q => ({ ...q, status: '', answer: q.answer + ev.delta }))
          else if (ev.type === 'error') update(idx, q => ({ ...q, error: ev.message, status: '' }))
          else if (ev.type === 'done') update(idx, q => ({
            ...q, check: ev.check, done: true, status: '',
            meta: `${ev.model} · ${ev.usage.input.toLocaleString('fr-FR')} jetons lus (${ev.usage.cacheRead.toLocaleString('fr-FR')} en cache) · ${ev.usage.output.toLocaleString('fr-FR')} écrits`,
          }))
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') update(idx, q => ({ ...q, error: (err as Error).message }))
      else update(idx, q => ({ ...q, error: 'Arrêté.' }))
    } finally {
      update(idx, q => ({ ...q, done: true, status: '' }))
      setBusy(false)
    }
  }

  const last = turns.at(-1)

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 font-sans">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Copilote projet</h1>
          <p className="text-sm text-zinc-400">Réponses sourcées sur les documents, le suivi, l&apos;annuaire et les emails du projet.</p>
        </div>
        <div className="text-right text-xs text-zinc-500">
          {status?.ok
            ? <>{status.sources?.toLocaleString('fr-FR')} sources · {status.chunks?.toLocaleString('fr-FR')} passages{status.embeddings ? ' · recherche hybride' : ' · recherche plein texte'}<br />{status.model}{status.lastIngest ? ` · mise à jour ${status.lastIngest.slice(0, 10)}` : ''}</>
            : status ? <span className="text-amber-400">{status.error}</span> : 'Chargement…'}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 space-y-6">
          {turns.length === 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <p className="mb-3 text-sm text-zinc-400">Exemples de questions :</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map(e => (
                  <button key={e} onClick={() => ask(e)} className="rounded-full border border-zinc-700 px-3 py-1.5 text-left text-sm text-zinc-200 hover:border-emerald-600 hover:text-emerald-200">{e}</button>
                ))}
              </div>
            </div>
          )}

          {turns.map((q, ti) => (
            <article key={ti} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <h2 className="mb-3 text-[15px] font-semibold text-zinc-50">{q.question}</h2>
              {q.status && <p className="font-mono text-xs text-zinc-500">{q.status}</p>}
              {q.answer && <Markdown text={q.answer} cite={ref => setActive({ turn: ti, ref })} />}
              {q.error && <p className="mt-2 rounded bg-amber-950/60 px-3 py-2 text-sm text-amber-300">{q.error}</p>}
              {q.check && (q.check.unknown.length > 0 || q.check.unsourced) && (
                <p className="mt-3 rounded bg-amber-950/60 px-3 py-2 text-xs text-amber-300">
                  Contrôle des sources : {q.check.unsourced ? 'aucune référence dans la réponse, à vérifier.' : ''}{q.check.unknown.length ? ` références inconnues ${q.check.unknown.join(', ')}.` : ''}
                </p>
              )}
              {q.meta && <p className="mt-3 font-mono text-[11px] text-zinc-600">{q.meta}</p>}
            </article>
          ))}

          <form onSubmit={e => { e.preventDefault(); ask(input) }} className="sticky bottom-4 rounded-xl border border-zinc-700 bg-zinc-950/95 p-3 shadow-lg backdrop-blur">
            <label htmlFor="q" className="sr-only">Question</label>
            <textarea id="q" value={input} onChange={e => setInput(e.target.value)} rows={2}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input) } }}
              placeholder={turns.length ? 'Question de suite…' : 'Pose ta question sur le projet…'}
              className="w-full resize-none bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600" />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <input type="checkbox" checked={telco} onChange={e => setTelco(e.target.checked)} className="accent-emerald-500" />
                Compléter avec l&apos;expertise telco (signalée à part)
              </label>
              <div className="flex gap-2">
                {busy && <button type="button" onClick={() => abort.current?.abort()} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">Arrêter</button>}
                <button type="submit" disabled={busy || !input.trim()} className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40">Demander</button>
              </div>
            </div>
          </form>
        </section>

        <aside className="min-w-0 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Sources {last ? `(${last.sources.length})` : ''}</h3>
          {!last && <p className="text-sm text-zinc-500">Les passages consultés s&apos;affichent ici. Les références [S1], [S2]… de la réponse ouvrent le passage exact.</p>}
          <div className="space-y-2">
            {last && [...last.sources]
              .sort((a, b) => Number(last.check?.cited.includes(b.ref) ?? false) - Number(last.check?.cited.includes(a.ref) ?? false))
              .map(s => (
                <SourceCard key={s.ref} s={s} cited={!last.check || last.check.cited.includes(s.ref)}
                  active={active?.turn === turns.length - 1 && active.ref === s.ref} />
              ))}
          </div>
          {active && active.turn !== turns.length - 1 && (
            <div className="mt-4 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Source d&apos;une réponse précédente</h3>
              {turns[active.turn]?.sources.filter(s => s.ref === active.ref).map(s => <SourceCard key={s.ref} s={s} cited active />)}
            </div>
          )}
        </aside>
      </div>
    </main>
  )
}

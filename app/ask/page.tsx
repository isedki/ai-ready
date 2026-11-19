'use client'

import { useEffect, useRef, useState } from 'react'

type Draft = { to: string[]; cc: string[]; subject: string; body: string }
type Reply = { answer: string; draft: Draft | null }
type Turn  = { role: 'user'; text: string } | { role: 'assistant'; reply: Reply } | { role: 'error'; text: string }
type Status = { ok: boolean; entries?: number; domains?: number; generated_at?: string; error?: string }

const EXAMPLES = [
  "J'ai besoin d'une VM en PREPROD pour un nouveau projet",
  'Ouvrir un flux réseau entre une application et une base de données en UAT',
  'Donner accès à un utilisateur à un groupe AD',
  'Installer un logiciel sur un serveur de production',
]

// Outlook expects ';' between recipients in mailto links.
function mailto(d: Draft): string {
  const q = [`subject=${encodeURIComponent(d.subject)}`, `body=${encodeURIComponent(d.body)}`]
  if (d.cc.length) q.unshift(`cc=${d.cc.join(';')}`)
  return `mailto:${d.to.join(';')}?${q.join('&')}`
}

// Minimal Markdown: **bold**, `code`, line breaks.
function Rich({ text }: { text: string }) {
  return (
    <div className="whitespace-pre-wrap leading-relaxed">
      {text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
        part.startsWith('**') ? <strong key={i} className="text-white">{part.slice(2, -2)}</strong>
        : part.startsWith('`') ? <code key={i} className="rounded bg-zinc-800 px-1 text-emerald-300">{part.slice(1, -1)}</code>
        : <span key={i}>{part}</span>)}
    </div>
  )
}

function DraftCard({ draft }: { draft: Draft }) {
  const [d, setD] = useState(draft)
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(`À : ${d.to.join('; ')}\n${d.cc.length ? `Cc : ${d.cc.join('; ')}\n` : ''}Objet : ${d.subject}\n\n${d.body}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="mt-3 rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-sm">
      <div className="text-zinc-400">À : <span className="text-zinc-200">{d.to.join('; ') || '—'}</span></div>
      {d.cc.length > 0 && <div className="text-zinc-400">Cc : <span className="text-zinc-200">{d.cc.join('; ')}</span></div>}
      <input
        className="mt-2 w-full rounded bg-zinc-800 px-2 py-1 text-zinc-100 outline-none focus:ring-1 focus:ring-emerald-500"
        value={d.subject} onChange={e => setD({ ...d, subject: e.target.value })} aria-label="Objet"
      />
      <textarea
        className="mt-2 h-56 w-full resize-y rounded bg-zinc-800 px-2 py-1 font-sans text-zinc-100 outline-none focus:ring-1 focus:ring-emerald-500"
        value={d.body} onChange={e => setD({ ...d, body: e.target.value })} aria-label="Message"
      />
      <div className="mt-2 flex gap-2">
        <a href={mailto(d)} className="rounded bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-500">Ouvrir dans Outlook</a>
        <button onClick={copy} className="rounded border border-zinc-600 px-3 py-1.5 text-zinc-200 hover:bg-zinc-800">{copied ? 'Copié ✓' : 'Copier'}</button>
      </div>
    </div>
  )
}

export default function AskPage() {
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status | null>(null)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => { fetch('/api/ask').then(r => r.json()).then(setStatus).catch(() => setStatus({ ok: false, error: 'Server not reachable' })) }, [])
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [turns, busy])

  const send = async (text: string) => {
    const q = text.trim()
    if (!q || busy) return
    const next: Turn[] = [...turns, { role: 'user', text: q }]
    setTurns(next)
    setInput('')
    setBusy(true)
    // The model only needs the text of earlier answers, not the full drafts.
    const messages = next.flatMap(t =>
      t.role === 'user' ? [{ role: 'user', content: t.text }]
      : t.role === 'assistant' ? [{ role: 'assistant', content: t.reply.answer + (t.reply.draft ? `\n\n(Brouillon proposé : « ${t.reply.draft.subject} »)` : '') }]
      : [])
    try {
      const res = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages }) })
      const data = await res.json()
      setTurns([...next, data.reply ? { role: 'assistant', reply: data.reply } : { role: 'error', text: data.error ?? 'Unknown error' }])
    } catch (err) {
      setTurns([...next, { role: 'error', text: (err as Error).message }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-6">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Qui contacter pour quoi ?</h1>
        <p className="text-sm text-zinc-400">
          {status === null ? 'Chargement…'
            : status.ok ? `${status.entries} demandes connues dans ${status.domains} domaines · annuaire du ${status.generated_at?.slice(0, 10)}`
            : <span className="text-amber-400">{status.error}</span>}
        </p>
      </header>

      <section className="flex-1 space-y-4">
        {turns.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-zinc-400">Décrivez ce dont vous avez besoin. Exemples :</p>
            {EXAMPLES.map(e => (
              <button key={e} onClick={() => send(e)} className="block w-full rounded border border-zinc-800 px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-900">{e}</button>
            ))}
          </div>
        )}
        {turns.map((t, i) =>
          t.role === 'user' ? <div key={i} className="ml-auto max-w-[85%] rounded-lg bg-emerald-900/40 px-3 py-2 text-sm">{t.text}</div>
          : t.role === 'error' ? <div key={i} className="rounded-lg border border-amber-700 px-3 py-2 text-sm text-amber-300">{t.text}</div>
          : <div key={i} className="rounded-lg bg-zinc-900/60 px-3 py-2 text-sm text-zinc-300"><Rich text={t.reply.answer} />{t.reply.draft && <DraftCard draft={t.reply.draft} />}</div>)}
        {busy && <div className="text-sm text-zinc-500">Recherche dans l’annuaire…</div>}
        <div ref={bottom} />
      </section>

      <form onSubmit={e => { e.preventDefault(); send(input) }} className="sticky bottom-0 mt-4 flex gap-2 bg-zinc-950 py-2">
        <input
          autoFocus value={input} onChange={e => setInput(e.target.value)} disabled={busy}
          placeholder="Ex : créer un compte AD pour un prestataire"
          className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
        <button disabled={busy || !input.trim()} className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium disabled:opacity-40">Envoyer</button>
      </form>
    </main>
  )
}

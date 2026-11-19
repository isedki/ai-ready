'use client'

import { useState } from 'react'

/** Only paths inside the Copilote are valid targets after login. */
function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get('next') ?? ''
  return /^\/copilote(\/|$|\?)/.test(next) ? next : '/copilote'
}

export default function Login() {
  const [error, setError] = useState('')
  const [busy, setBusy]   = useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const form = new FormData(e.currentTarget)
    try {
      const res = await fetch('/api/copilote/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user: form.get('user'), password: form.get('password') }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.ok && body.ok) return window.location.replace(nextPath())
      setError(body.error ?? `Erreur ${res.status}`)
    } catch (err) {
      setError((err as Error).message)
    }
    setBusy(false)
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] font-sans">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Copilote projet</h1>
          <p className="mt-1 text-sm text-zinc-400">Connecte-toi une fois : la session dure 90 jours sur cet appareil.</p>
        </div>
        <label className="block text-sm text-zinc-300">
          Identifiant
          <input name="user" autoComplete="username" autoCapitalize="none" required defaultValue="phenix"
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-base text-zinc-100 outline-none focus:border-emerald-600" />
        </label>
        <label className="block text-sm text-zinc-300">
          Mot de passe
          <input name="password" type="password" autoComplete="current-password" required autoFocus
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-base text-zinc-100 outline-none focus:border-emerald-600" />
        </label>
        {error && <p className="rounded bg-amber-950/60 px-3 py-2 text-sm text-amber-300">{error}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-emerald-600 py-2.5 text-base font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
          {busy ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </main>
  )
}

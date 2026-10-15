'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/meeting/client'

type Status = {
  auth: { ok: boolean; detail: string }
  stt:  { provider: 'elevenlabs' | 'openai'; ready: boolean }
}

/**
 * Zero-config onboarding: shows only what is still missing (Claude login, a
 * speech-to-text key) and lets you fix the key right here. With `settings`, it
 * is always shown as a small settings form instead.
 */
export default function SetupBanner({ settings = false }: { settings?: boolean }) {
  const [status, setStatus]     = useState<Status | null>(null)
  const [provider, setProvider] = useState<'elevenlabs' | 'openai'>('elevenlabs')
  const [key, setKey]           = useState('')
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function refresh() {
    try {
      const s = await api<Status>('/api/meeting/memory')
      setStatus(s)
      setProvider(s.stt.provider)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh() }, [])

  async function saveKey() {
    setError(null)
    try {
      await api('/api/meeting/memory', {
        method: 'POST',
        body: JSON.stringify({ op: 'settings', settings: { sttProvider: provider, [provider === 'openai' ? 'openaiKey' : 'elevenlabsKey']: key } }),
      })
      setKey(''); setSaved(true)
      await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  if (!status && !error) return null
  const allGood = status?.auth.ok && status?.stt.ready
  if (allGood && !settings) return null

  const field = 'bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600'

  return (
    <section className={`rounded-xl p-5 border ${allGood ? 'border-zinc-800 bg-zinc-900/40' : 'border-cyan-900/60 bg-cyan-950/10'}`}>
      <div className="font-mono text-xs tracking-widest text-cyan-400 mb-3">{settings ? 'SETTINGS' : 'FINISH SETUP'}</div>
      {error && <div className="text-sm text-red-300 mb-2">{error}</div>}
      {status && (
        <div className="space-y-3 text-sm">
          <div className={status.auth.ok ? 'text-green-400' : 'text-yellow-300'}>
            {status.auth.ok ? '✓' : '1.'} Claude — {status.auth.detail}
            {!status.auth.ok && <div className="text-xs text-zinc-400 mt-1">Open a terminal and run <code className="text-zinc-200">claude auth login</code>, choose your Claude subscription, then reload this page.</div>}
          </div>
          <div className={status.stt.ready ? 'text-green-400' : 'text-yellow-300'}>
            {status.stt.ready ? '✓' : '2.'} Speech-to-text — {status.stt.ready ? `${status.stt.provider} key saved` : 'add a key (ElevenLabs recommended; a few cents per meeting hour)'}
          </div>
          {(!status.stt.ready || settings) && (
            <div className="flex flex-wrap gap-2">
              <select className={field} value={provider} onChange={e => setProvider(e.target.value as typeof provider)}>
                <option value="elevenlabs">ElevenLabs</option>
                <option value="openai">OpenAI</option>
              </select>
              <input type="password" className={`${field} flex-1 min-w-48`} value={key} onChange={e => setKey(e.target.value)}
                placeholder={status.stt.ready ? 'Replace key…' : 'Paste API key'} />
              <button onClick={saveKey} disabled={!key.trim()}
                className="font-mono text-xs px-3 py-1.5 rounded border border-green-800 text-green-400 hover:bg-green-950/40 disabled:opacity-40">
                {saved ? 'Saved ✓' : 'Save'}
              </button>
            </div>
          )}
          {settings && <p className="text-xs text-zinc-600">Saved only on this computer, in the workspace folder.</p>}
        </div>
      )}
    </section>
  )
}

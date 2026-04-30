import Link from 'next/link'

const DIMENSIONS = [
  { icon: '🗄️', label: 'Data',         desc: 'Quality, ownership, accessibility' },
  { icon: '🏢', label: 'Organisation',  desc: 'Sponsorship, AI ownership, change capacity' },
  { icon: '⚙️', label: 'Process',       desc: 'Measurement culture, workflow adaptability' },
  { icon: '💻', label: 'Technology',    desc: 'Stack, APIs, deployment, observability' },
  { icon: '🛡️', label: 'Risk',          desc: 'Legal, compliance, fallback plans' },
]

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* Nav */}
      <nav className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <span className="font-mono text-sm text-zinc-400 tracking-widest">AI READY</span>
        <a
          href="https://issam-resume.vercel.app"
          target="_blank"
          className="font-mono text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          by Issam Sedki →
        </a>
      </nav>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center max-w-3xl mx-auto w-full">
        <div className="inline-block font-mono text-xs text-green-500 border border-green-900/50 px-3 py-1.5 rounded-full mb-8 tracking-widest">
          NOT A SURVEY
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-6">
          Is your organisation actually
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-green-400">
            ready for AI in production?
          </span>
        </h1>

        <p className="text-zinc-400 text-lg leading-relaxed mb-4 max-w-xl">
          Most teams think they're ready. Most teams are wrong.
          This is a structured interview — not a checkbox form — conducted by an AI analyst.
        </p>
        <p className="text-zinc-600 text-sm mb-12 font-mono">
          ~15 minutes · 5 dimensions · anonymous benchmarking · executive brief at the end
        </p>

        <Link
          href="/assess"
          className="px-8 py-4 rounded-xl border border-green-700/60 bg-green-950/20 text-green-400 font-mono text-base hover:bg-green-950/40 hover:border-green-600/70 transition-all"
        >
          Begin Assessment →
        </Link>

        {/* Dimensions */}
        <div className="mt-20 grid grid-cols-1 sm:grid-cols-5 gap-3 w-full">
          {DIMENSIONS.map((d, i) => (
            <div key={i} className="border border-zinc-800 rounded-xl p-4 bg-zinc-900/50 text-center">
              <div className="text-2xl mb-2">{d.icon}</div>
              <div className="font-mono text-xs text-zinc-300 mb-1">{d.label}</div>
              <div className="text-xs text-zinc-600 leading-relaxed">{d.desc}</div>
            </div>
          ))}
        </div>

        {/* How it's different */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full text-left">
          {[
            { icon: '🎤', title: 'Interview, not a form', body: 'The AI analyst asks follow-ups, challenges self-assessments, and probes for evidence.' },
            { icon: '📎', title: 'Evidence changes the score', body: 'Paste a job description, tech stack, or incident report. It re-evaluates in real time.' },
            { icon: '📄', title: 'Executive brief at the end', body: 'Not a score. A 1-page narrative written for your CEO, with blockers and a 90-day path.' },
          ].map((item, i) => (
            <div key={i} className="border border-zinc-800 rounded-xl p-5 bg-zinc-900/30">
              <div className="text-2xl mb-3">{item.icon}</div>
              <div className="font-mono text-sm text-zinc-200 mb-2">{item.title}</div>
              <div className="text-sm text-zinc-500 leading-relaxed">{item.body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-900 py-6 text-center">
        <p className="text-xs text-zinc-700 font-mono">
          Powered by Claude ·{' '}
          <a href="https://issam-resume.vercel.app" target="_blank" className="hover:text-zinc-500 transition-colors">
            Issam Sedki, PhD — Enterprise Architect & AI Researcher
          </a>
        </p>
      </footer>
    </main>
  )
}

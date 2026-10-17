import { ask, loadKb, type AskTurn } from '@/lib/kb/ask'

export const maxDuration = 120

/** Directory status for the page header. */
export async function GET() {
  try {
    const { kb } = loadKb()
    const domains = new Set(kb.entries.map(e => e.domain)).size
    return Response.json({ ok: true, generated_at: kb.generated_at, entries: kb.entries.length, domains })
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message })
  }
}

export async function POST(req: Request) {
  const body = await req.json() as { messages?: AskTurn[] }
  const messages = (body.messages ?? []).filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    return Response.json({ error: 'Send a question.' }, { status: 400 })
  }
  try {
    // Keep the last few turns; the conversation must start with a user turn.
    const recent = messages.slice(-12)
    while (recent[0]?.role === 'assistant') recent.shift()
    return Response.json({ reply: await ask(recent) })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}

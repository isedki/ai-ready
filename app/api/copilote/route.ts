import { answer, type Turn }    from '@/lib/copilote/agent'
import { embeddingsEnabled }    from '@/lib/copilote/embed'
import { openStore, stats }     from '@/lib/copilote/store'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 300

/** Base status for the page header. */
export async function GET() {
  try {
    const s = stats(openStore())
    return Response.json({ ok: true, ...s, embeddings: embeddingsEnabled(), model: process.env.COPILOTE_MODEL ?? 'claude-opus-5-5' })
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message })
  }
}

/** One question → newline-delimited JSON events (status, source, text, done, error). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { question?: string; history?: Turn[]; telco?: boolean }
  const question = (body.question ?? '').trim()
  if (!question) return Response.json({ error: 'Pose une question.' }, { status: 400 })
  if (question.length > 4000) return Response.json({ error: 'Question trop longue (4000 caractères au plus).' }, { status: 400 })
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return Response.json({ error: 'Clé API absente : ajoute ANTHROPIC_API_KEY dans .env.local (ou dans les variables du conteneur).' }, { status: 500 })
  }
  const history = (body.history ?? []).filter(t => (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string')
  const enc = new TextEncoder()
  const events = answer(question, { history, telco: body.telco !== false, signal: req.signal })
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await events.next()
        if (done) { controller.close(); return }
        controller.enqueue(enc.encode(JSON.stringify(value) + '\n'))
      } catch (err) {
        controller.enqueue(enc.encode(JSON.stringify({ type: 'error', message: (err as Error).message }) + '\n'))
        controller.close()
      }
    },
    async cancel() { await events.return(undefined) },
  })
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' } })
}

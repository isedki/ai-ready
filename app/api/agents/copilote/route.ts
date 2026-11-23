import { depsFromEnv, handleRequest } from '@/lib/copilote/remote'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const deps = depsFromEnv()

/**
 * Copilote for cloud agents: MCP over HTTP, read-only, bearer token COPILOTE_AGENT_TOKEN.
 * Outside the matcher of proxy.ts on purpose (that gate is for people and uses a password).
 */
export async function POST(req: Request) {
  const raw = await req.json().catch(() => null)
  const { status, body } = await handleRequest(req.headers, raw, deps)
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
}

export async function GET() {
  return Response.json({ error: 'Not found' }, { status: 404 })
}

import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, SESSION_DAYS, credentials, same, sessionToken } from '@/lib/copilote/auth'

export const runtime = 'nodejs'

/** Answers with JSON and lets the page navigate: a redirect from here would be made absolute with the server's own host, which is wrong behind a reverse proxy or a tunnel. */
export async function POST(request: NextRequest) {
  const cred = credentials()
  if (!cred) return NextResponse.json({ ok: true })
  const { user, password } = await request.json().catch(() => ({})) as { user?: unknown; password?: unknown }
  if (!same(String(user ?? ''), cred.user) || !same(String(password ?? ''), cred.password)) {
    await new Promise(r => setTimeout(r, 800))
    return NextResponse.json({ ok: false, error: 'Identifiant ou mot de passe incorrect.' }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true })
  const https = request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https'
  res.cookies.set(SESSION_COOKIE, await sessionToken(cred.user, cred.password), {
    httpOnly: true, sameSite: 'lax', secure: https, path: '/', maxAge: SESSION_DAYS * 86400,
  })
  return res
}

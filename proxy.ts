import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, credentials, same, sessionToken } from './lib/copilote/auth'

/**
 * Access gate for the Copilote. With COPILOTE_PASSWORD set (always, on a server), the page and its API
 * need a login: the session cookie from /copilote/login, or HTTP Basic for scripts (user COPILOTE_USER,
 * default "phenix"). Behind a company SSO reverse proxy, leave both unset and let the proxy authenticate.
 */
export async function proxy(request: NextRequest) {
  const cred = credentials()
  const path = request.nextUrl.pathname
  if (!cred || path === '/copilote/login' || path === '/api/copilote/login') return NextResponse.next()

  const token = await sessionToken(cred.user, cred.password)
  const cookie = request.cookies.get(SESSION_COOKIE)?.value
  if (cookie && same(cookie, token)) return NextResponse.next()

  const header = request.headers.get('authorization') ?? ''
  if (header.startsWith('Basic ')) {
    const [u, ...p] = atob(header.slice(6)).split(':')
    if (same(u, cred.user) && same(p.join(':'), cred.password)) return NextResponse.next()
  }

  if (path.startsWith('/api/')) return NextResponse.json({ error: 'Session expirée : reconnecte-toi.' }, { status: 401 })
  // Built from the Host the browser sent, so the redirect stays right behind a reverse proxy or a tunnel.
  const host  = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? request.nextUrl.host
  const proto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '')
  const login = new URL(`${proto}://${host}/copilote/login`)
  login.searchParams.set('next', path + request.nextUrl.search)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: ['/copilote/:path*', '/api/copilote/:path*'],
}

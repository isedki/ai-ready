import { NextResponse, type NextRequest } from 'next/server'

/**
 * Access gate for the Copilote. With COPILOTE_PASSWORD set (always, on a server), the page and its
 * API ask for a login (HTTP Basic, user COPILOTE_USER, default "phenix"). Behind a company SSO
 * reverse proxy, leave both unset and let the proxy authenticate.
 */
export function proxy(request: NextRequest) {
  const password = process.env.COPILOTE_PASSWORD
  if (!password) return NextResponse.next()
  const user = process.env.COPILOTE_USER ?? 'phenix'
  const header = request.headers.get('authorization') ?? ''
  if (header.startsWith('Basic ')) {
    const [u, ...p] = atob(header.slice(6)).split(':')
    if (u === user && p.join(':') === password) return NextResponse.next()
  }
  return new NextResponse('Authentification requise', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Copilote", charset="UTF-8"' } })
}

export const config = {
  matcher: ['/copilote/:path*', '/api/copilote/:path*'],
}

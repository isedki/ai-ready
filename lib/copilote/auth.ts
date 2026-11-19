/**
 * Login for the Copilote when COPILOTE_PASSWORD is set. A browser signs in once on /copilote/login and
 * keeps a session cookie (an installed iPhone app cannot answer an HTTP Basic prompt); scripts may still
 * send HTTP Basic. The cookie holds a hash of the credentials, so changing the password signs everyone out.
 */
export const SESSION_COOKIE = 'copilote_session'
export const SESSION_DAYS   = 90

export function credentials(): { user: string; password: string } | null {
  const password = process.env.COPILOTE_PASSWORD
  return password ? { user: process.env.COPILOTE_USER ?? 'phenix', password } : null
}

export async function sessionToken(user: string, password: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`copilote:${user}:${password}`))
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('')
}

/** Constant-time string comparison, so a wrong password takes as long to reject as a nearly right one. */
export function same(a: string, b: string): boolean {
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}

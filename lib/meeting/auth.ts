/**
 * The meeting routes run Claude under your subscription and read your private
 * workspace, so they are gated by a shared key when MEETING_ACCESS_KEY is set
 * (set it if anyone else can reach the machine running the app).
 */
export function unauthorized(req: Request): Response | null {
  const expected = process.env.MEETING_ACCESS_KEY
  if (!expected) return null
  if (req.headers.get('x-meeting-key') === expected) return null
  return Response.json({ error: 'Invalid or missing access key' }, { status: 401 })
}

export function errorResponse(scope: string, err: unknown) {
  console.error(`[meeting/${scope}]`, err)
  return Response.json({ error: err instanceof Error ? err.message : `${scope} failed` }, { status: 500 })
}

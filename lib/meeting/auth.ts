/**
 * The meeting routes spend STT and Claude credits, so they are gated by a shared
 * key when MEETING_ACCESS_KEY is set (always set it in production).
 */
export function unauthorized(req: Request): Response | null {
  const expected = process.env.MEETING_ACCESS_KEY
  if (!expected) return null
  if (req.headers.get('x-meeting-key') === expected) return null
  return Response.json({ error: 'Invalid or missing access key' }, { status: 401 })
}

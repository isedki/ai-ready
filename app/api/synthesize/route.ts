import { extractAssessmentResult } from '@/lib/ai/extract'

export const maxDuration = 120

export async function POST(req: Request) {
  try {
    const { messages } = await req.json()

    if (!messages || messages.length < 4) {
      return Response.json({ error: 'Assessment too short to synthesize' }, { status: 400 })
    }

    // Flatten UIMessages (v4 format with parts) to text-only for synthesis
    const flat = messages.map((m: any) => ({
      role:    m.role as 'user' | 'assistant',
      content: Array.isArray(m.parts)
        ? m.parts.filter((p: any) => p.type === 'text').map((p: any) => p.text).join(' ')
        : typeof m.content === 'string' ? m.content : '',
    })).filter((m: any) => m.content.trim() && ['user','assistant'].includes(m.role))

    const result = await extractAssessmentResult(flat)
    return Response.json(result)
  } catch (err) {
    console.error('[synthesize]', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Synthesis failed' },
      { status: 500 }
    )
  }
}

import { unauthorized, errorResponse } from '@/lib/meeting/auth'
import { ensureWorkspace, listKnowledge, saveKnowledge } from '@/lib/meeting/workspace'

/** Upload documents into the knowledge base (workspace/knowledge). You can also copy files there directly. */
export async function POST(req: Request) {
  const denied = unauthorized(req)
  if (denied) return denied
  try {
    await ensureWorkspace()
    const form = await req.formData()
    const saved: string[] = []
    for (const file of form.getAll('files')) {
      if (file instanceof File) saved.push(await saveKnowledge(file.name, Buffer.from(await file.arrayBuffer())))
    }
    return Response.json({ saved, files: await listKnowledge() })
  } catch (err) {
    return errorResponse('knowledge', err)
  }
}

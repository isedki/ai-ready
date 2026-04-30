import { streamText, tool, stepCountIs, convertToModelMessages } from 'ai'
import { anthropic }        from '@ai-sdk/anthropic'
import { z }                from 'zod'
import { buildSystemPrompt, DIMENSION_ORDER } from '@/lib/assessment/prompts'
import { Dimension, CompanySize, AIStage }    from '@/lib/assessment/schema'

export const maxDuration = 60

export async function POST(req: Request) {
  const body = await req.json()
  // v4 transport sends { messages: UIMessage[], id, trigger, messageId }
  const uiMessages: any[] = body.messages ?? []

  // ── Reconstruct state from tool call results in UIMessage parts ──
  const completedDimensions: string[] = []
  let companyProfile = ''

  for (const msg of uiMessages) {
    if (!Array.isArray(msg.parts)) continue
    for (const part of msg.parts) {
      // Dynamic tool parts with state 'output-available' have been executed
      if (part.type === 'dynamic-tool' && part.state === 'output-available') {
        if (part.toolName === 'score_dimension') {
          const dim = part.output?.dimension ?? part.input?.dimension
          if (dim && !completedDimensions.includes(dim)) completedDimensions.push(dim)
        }
        if (part.toolName === 'extract_profile') {
          const p = part.output ?? part.input
          if (p) companyProfile = `${p.size} ${p.industry} company, AI stage: ${p.stage}`
        }
      }
    }
  }

  const currentDimension = DIMENSION_ORDER.find(d => !completedDimensions.includes(d)) ?? null

  // Convert UIMessages to ModelMessages for streamText
  const messages = await convertToModelMessages(uiMessages)

  const result = streamText({
    model:  anthropic('claude-haiku-4-5'),
    system: buildSystemPrompt({
      completedDimensions: completedDimensions as any,
      currentDimension:    currentDimension as any,
      companyProfile,
      turnCount:           uiMessages.filter((m: any) => m.role === 'user').length,
    }),
    messages,
    stopWhen: stepCountIs(3),
    tools: {
      extract_profile: tool({
        description: 'Extract and record the company profile once you have enough signal',
        inputSchema: z.object({
          size:     CompanySize,
          industry: z.string().describe('Industry sector, e.g. "B2B SaaS", "Financial Services", "Healthcare"'),
          stage:    AIStage.describe('Current AI adoption stage'),
          name:     z.string().optional().describe('Company name if mentioned'),
        }),
        execute: async (args) => ({ ...args, recorded: true }),
      }),

      score_dimension: tool({
        description: 'Record the score for a completed dimension. Call when you have 3+ data points.',
        inputSchema: z.object({
          dimension:      Dimension,
          score:          z.number().min(0).max(100).describe('Score 0-100 based on evidence'),
          confidence:     z.enum(['low', 'medium', 'high']),
          evidence_based: z.boolean().describe('True if score is based on concrete evidence, not just self-report'),
          key_finding:    z.string().describe('Single most important finding for this dimension (1 sentence)'),
        }),
        execute: async (args) => ({ ...args, recorded: true }),
      }),

      request_evidence: tool({
        description: 'Signal to the UI that a specific artifact would improve assessment confidence',
        inputSchema: z.object({
          artifact_type: z.enum([
            'job_description', 'tech_stack', 'org_chart',
            'incident_report', 'data_schema', 'deployment_pipeline', 'other'
          ]),
          reason: z.string().describe('Why this artifact would help'),
          prompt: z.string().describe('What to ask the user to paste'),
        }),
        execute: async (args) => ({ ...args }),
      }),
    },
  })

  return result.toUIMessageStreamResponse()
}

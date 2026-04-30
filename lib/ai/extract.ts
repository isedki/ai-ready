import { generateObject } from 'ai'
import { anthropic }      from '@ai-sdk/anthropic'
import { z }              from 'zod'
import { AssessmentResult, type AssessmentResult as AR } from '@/lib/assessment/schema'
import { SYNTHESIS_PROMPT }                              from '@/lib/assessment/prompts'
import { calculatePercentile }                           from '@/lib/assessment/benchmarks'

type Message = { role: 'user' | 'assistant'; content: string }

/**
 * Extract a structured AssessmentResult from the full conversation.
 * Retries up to MAX_RETRIES times with schema validation error feedback.
 */
const MAX_RETRIES = 3

export async function extractAssessmentResult(
  messages: Message[]
): Promise<AR> {
  const conversationText = messages
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n')

  let lastError: string | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const retryNote = lastError
      ? `\n\nPREVIOUS ATTEMPT FAILED SCHEMA VALIDATION:\n${lastError}\nFix these specific issues in this attempt.`
      : ''

    try {
      const { object } = await generateObject({
        model:  anthropic('claude-sonnet-4-5'),
        schema: AssessmentResult,
        system: SYNTHESIS_PROMPT + retryNote,
        prompt: `Based on this assessment interview, generate the AssessmentResult JSON:\n\n${conversationText}`,
      })

      // Post-process: calculate benchmark percentile if not already set
      const size = object.company.size
      object.benchmark_percentile = calculatePercentile(object.overall_score, size)

      // Ensure overall_score is the weighted average
      const weights: Record<string, number> = { data: 0.25, org: 0.20, process: 0.20, tech: 0.20, risk: 0.15 }
      const weighted = object.dimensions.reduce((sum, d) => sum + d.score * (weights[d.dimension] ?? 0.2), 0)
      object.overall_score = Math.round(weighted)

      // Derive tier from overall score
      object.tier =
        object.overall_score >= 80 ? 'leading'    :
        object.overall_score >= 65 ? 'ready'       :
        object.overall_score >= 50 ? 'emerging'    :
        object.overall_score >= 30 ? 'foundations' : 'not_ready'

      return object
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      if (attempt === MAX_RETRIES) throw new Error(`Synthesis failed after ${MAX_RETRIES} attempts: ${lastError}`)
    }
  }

  throw new Error('Unreachable')
}

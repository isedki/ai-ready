import Anthropic           from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { z }          from 'zod'

const client = new Anthropic()

export const MEETING_MODEL = process.env.MEETING_MODEL ?? 'claude-opus-5-5'

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/**
 * One structured-output call to Claude. Streams under the hood (long transcripts
 * and long digests would otherwise hit HTTP timeouts) and returns the parsed object.
 *
 * Server-side fallback ("default") is enabled so a safety-classifier false
 * positive is retried on another model instead of failing the meeting.
 */
export async function structured<S extends z.ZodType>(opts: {
  schema:    S
  system:    string
  prompt:    string
  effort:    Effort
  maxTokens: number
}): Promise<z.infer<S>> {
  const stream = client.beta.messages.stream({
    model:         MEETING_MODEL,
    max_tokens:    opts.maxTokens,
    betas:         ['server-side-fallback-2026-07-01'],
    fallbacks:     'default',
    thinking:      { type: 'adaptive' },
    output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
    system:        [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
    messages:      [{ role: 'user', content: opts.prompt }],
  })

  const message = await stream.finalMessage()

  if (message.stop_reason === 'refusal') {
    throw new Error(`Claude declined this request (${message.stop_details?.category ?? 'unspecified'})`)
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error('Output was truncated (max_tokens). Try a shorter section of the meeting.')
  }
  if (message.parsed_output == null) {
    throw new Error('Claude returned output that did not match the expected schema')
  }
  return message.parsed_output as z.infer<S>
}

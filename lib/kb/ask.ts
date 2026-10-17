import Anthropic           from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z }               from 'zod'
import { existsSync, readFileSync, statSync } from 'node:fs'
import type { Entry, Person } from './directory'

/**
 * "Who do I ask for X?" assistant. The whole directory sits in a cached system
 * prompt, so the model sees every entry (no search misses) and each follow-up
 * question only pays for the cache read and the new turn.
 */
const MODEL = process.env.KB_ASK_MODEL ?? 'claude-opus-5-5'

export const AskReply = z.object({
  answer: z.string().describe('Short answer in the language of the question: who to contact, approval, what to include. Markdown allowed.'),
  draft: z.object({
    to:      z.array(z.string()).describe('Email addresses from the directory'),
    cc:      z.array(z.string()),
    subject: z.string(),
    body:    z.string().describe('The email body in French, ready to send, with placeholders like [nom du projet] for unknown details'),
  }).nullable().describe('A draft request email in French, or null if no directory entry fits'),
})
export type AskReply = z.infer<typeof AskReply>
export type AskTurn  = { role: 'user' | 'assistant'; content: string }

const INSTRUCTIONS = `You help an IT project manager at inwi (a Moroccan telecom operator) find who to contact to get something done, using a directory learned from the previous project manager's emails.

For each question:
- Find the matching directory entry or entries. Say who to email (name, address, department), whose approval is needed, who to copy, and what the request must include. Mention a tip if there is one.
- If several entries could fit, say which one you picked and name the alternative in one line.
- Mention the confidence when an entry was seen in only one thread, and when its last use is old.
- If nothing in the directory fits, say so plainly and suggest the closest domain / team to ask. Never invent people or addresses.
- Answer in the language of the question, briefly.
- Unless the user only asks for information, also write a draft email in French: polite and professional ("Bonjour …, … Cordialement"), addressed to the "email to" contact, cc the usual cc and the approver when approval is needed, listing the information to include as bullet points with [placeholders] for details the user has not given. Use details the user did give.`

type Kb = { generated_at: string; entries: Entry[] }
let cache: { path: string; mtime: number; kb: Kb; text: string } | null = null

const person = (p: Person) => `${p.name || p.addr} <${p.addr}>${p.department ? ` (${p.department})` : ''}`

function directoryText(kb: Kb): string {
  return kb.entries.map(e => [
    `[${e.id}] ${e.domain} › ${e.subdomain} › ${e.title}`,
    e.email_to.length ? `  email to: ${e.email_to.map(person).join('; ')}` : '  email to: unknown',
    e.approval.length ? `  approval: ${e.approval.map(person).join('; ')}` : null,
    e.cc.length ? `  cc: ${e.cc.map(person).join('; ')}` : null,
    e.channel && e.channel !== 'email' ? `  via: ${e.channel}` : null,
    e.include.length ? `  include: ${e.include.map(n => n.text).join('; ')}` : null,
    e.tips.length ? `  tips: ${e.tips.map(n => n.text).join(' / ')}` : null,
    e.previously.length ? `  previously: ${e.previously.map(person).join('; ')}` : null,
    `  seen in ${e.thread_count} thread(s), last ${e.last_seen?.slice(0, 10) ?? '?'}${e.example_subject ? `, e.g. "${e.example_subject}"` : ''}`,
  ].filter(Boolean).join('\n')).join('\n\n')
}

export function loadKb(path = process.env.KB_JSON ?? 'kb-out/kb.json') {
  if (!existsSync(path)) throw new Error(`No directory found at ${path}. Build it first: npm run kb -- run <dump.pst>`)
  const mtime = statSync(path).mtimeMs
  if (!cache || cache.path !== path || cache.mtime !== mtime) {
    const kb = JSON.parse(readFileSync(path, 'utf8')) as Kb
    cache = { path, mtime, kb, text: directoryText(kb) }
  }
  return cache
}

export async function ask(history: AskTurn[]): Promise<AskReply> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new Error('No API key: add ANTHROPIC_API_KEY=sk-ant-… to the .env.local file, then restart npm run ask.')
  }
  const { kb, text } = loadKb()
  const { type, schema } = zodOutputFormat(AskReply)
  const client = new Anthropic()
  const msg = await client.beta.messages.create({
    model:      MODEL,
    max_tokens: 8000,
    betas:      ['server-side-fallback-2026-07-01'],
    fallbacks:  'default',     // a declined request is retried server-side on the recommended fallback model
    system: [
      { type: 'text', text: INSTRUCTIONS },
      // The directory is identical for every question until it is rebuilt: cache it.
      { type: 'text', text: `<directory generated="${kb.generated_at}" entries="${kb.entries.length}">\n${text}\n</directory>`, cache_control: { type: 'ephemeral' } },
    ],
    messages: history.map(t => ({ role: t.role, content: t.content })),
    output_config: { effort: 'low', format: { type, schema } },
  })
  if (msg.stop_reason === 'refusal') throw new Error('The model declined this question; try rephrasing it.')
  if (msg.stop_reason === 'max_tokens') throw new Error('The answer was cut off; try a narrower question.')
  const out = msg.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')?.text
  if (!out) throw new Error('Empty answer from the model.')
  return AskReply.parse(JSON.parse(out))
}

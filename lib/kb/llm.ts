import Anthropic           from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { spawn, spawnSync } from 'node:child_process'
import { tmpdir }          from 'node:os'
import type { z }          from 'zod'
import type { DB }         from './db'

export const MODELS = {
  // Bulk, per-thread reading. Cheap and good at extraction.
  extract: process.env.KB_EXTRACT_MODEL ?? 'claude-haiku-5-5',
  // Matching items to existing entries; sees only short extracted items. Set to claude-sonnet-5-5 if matching is poor.
  fold:    process.env.KB_FOLD_MODEL    ?? 'claude-haiku-5-5',
}

type Effort = 'low' | 'medium' | 'high'

export type Job<T> = {
  id:        string                 // ^[a-zA-Z0-9_-]{1,64}$ (batch custom_id)
  system:    string
  user:      string
  schema:    z.ZodType<T>
  model:     string
  effort:    Effort
  maxTokens: number
}

export type JobResult<T> = { ok: true; value: T } | { ok: false; error: string }

export interface Runner {
  run<T>(kind: string, label: string, jobs: Job<T>[]): Promise<Map<string, JobResult<T>>>
  /** Set when the runner gave up for good (usage limit): jobs not run are absent from the results. */
  stopped?: string
}

/* ── pricing, $ per million tokens (list prices; batch is 50% off) ────── */
const PRICES: Record<string, { in: number; out: number }> = {
  'claude-haiku-5-5':  { in: 0.10, out: 0.50 },
  'claude-sonnet-5-5': { in: 2.00, out: 10.00 },
  'claude-opus-5-5':   { in: 4.00, out: 20.00 },
}

export function costOf(model: string, u: { input: number; output: number; cacheRead?: number; cacheWrite?: number }, batch: boolean): number {
  const p = PRICES[model]
  if (!p) return NaN
  const usd = (u.input * p.in + (u.cacheWrite ?? 0) * p.in * 1.25 + (u.cacheRead ?? 0) * p.in * 0.1 + u.output * p.out) / 1e6
  return batch ? usd / 2 : usd
}

export function knownPrice(model: string): boolean {
  return model in PRICES
}

/* ── Anthropic implementation ───────────────────────────────────────────── */

function paramsFor<T>(job: Job<T>): Anthropic.MessageCreateParamsNonStreaming {
  const { type, schema } = zodOutputFormat(job.schema as z.ZodType<T> & z.ZodObject)
  return {
    model:      job.model,
    max_tokens: job.maxTokens,
    // Fixed instructions first and cached; only the thread/items vary per request.
    system:     [{ type: 'text', text: job.system, cache_control: { type: 'ephemeral' } }],
    messages:   [{ role: 'user', content: job.user }],
    output_config: { effort: job.effort, format: { type, schema } },
  }
}

function parseMessage<T>(job: Job<T>, msg: Anthropic.Message): JobResult<T> {
  if (msg.stop_reason === 'refusal') return { ok: false, error: `refusal: ${msg.stop_details?.category ?? 'unknown'}` }
  if (msg.stop_reason === 'max_tokens') return { ok: false, error: 'max_tokens reached' }
  const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text
  if (!text) return { ok: false, error: 'no text block in response' }
  let json: unknown
  try { json = JSON.parse(text) } catch { return { ok: false, error: 'invalid JSON' } }
  const parsed = job.schema.safeParse(json)
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: parsed.error.message.slice(0, 500) }
}

export class AnthropicRunner implements Runner {
  private client = new Anthropic()

  constructor(private db: DB, private mode: 'batch' | 'sync', private log: (s: string) => void = console.log) {}

  private recordUsage(kind: string, model: string, u: Anthropic.Usage, batch: boolean) {
    this.db.prepare(`INSERT INTO llm_calls(kind, model, batch, input_tokens, output_tokens, cache_read, cache_write, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(kind, model, batch ? 1 : 0, u.input_tokens, u.output_tokens,
      u.cache_read_input_tokens ?? 0, u.cache_creation_input_tokens ?? 0, new Date().toISOString())
  }

  async run<T>(kind: string, label: string, jobs: Job<T>[]): Promise<Map<string, JobResult<T>>> {
    if (jobs.length === 0) return new Map()
    return this.mode === 'batch' ? this.runBatch(kind, label, jobs) : this.runSync(kind, jobs)
  }

  private async runSync<T>(kind: string, jobs: Job<T>[]): Promise<Map<string, JobResult<T>>> {
    const out = new Map<string, JobResult<T>>()
    const concurrency = Number(process.env.KB_CONCURRENCY ?? 4)
    let next = 0
    const worker = async () => {
      while (next < jobs.length) {
        const job = jobs[next++]
        try {
          const msg = await this.client.messages.create(paramsFor(job))
          this.recordUsage(kind, job.model, msg.usage, false)
          out.set(job.id, parseMessage(job, msg))
        } catch (err) {
          out.set(job.id, { ok: false, error: err instanceof Anthropic.APIError ? `${err.status} ${err.message}` : String(err) })
        }
        if (out.size % 25 === 0) this.log(`  ${out.size}/${jobs.length}`)
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker))
    return out
  }

  private async runBatch<T>(kind: string, label: string, jobs: Job<T>[]): Promise<Map<string, JobResult<T>>> {
    const byId = new Map(jobs.map(j => [j.id, j]))
    const out = new Map<string, JobResult<T>>()

    // Resume: collect results of batches already submitted for this label (e.g. after a crash).
    const previous = this.db.prepare("SELECT id FROM batches WHERE kind = ? AND label = ? AND status != 'collected'").all(kind, label) as { id: string }[]
    for (const b of previous) {
      this.log(`  resuming batch ${b.id}`)
      await this.collect(kind, b.id, byId, out)
    }

    const todo = jobs.filter(j => !out.has(j.id))
    const CHUNK = 5000
    for (let i = 0; i < todo.length; i += CHUNK) {
      const chunk = todo.slice(i, i + CHUNK)
      const batch = await this.client.messages.batches.create({
        requests: chunk.map(j => ({ custom_id: j.id, params: paramsFor(j) })),
      })
      this.db.prepare('INSERT INTO batches(id, kind, label, status, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(batch.id, kind, label, 'submitted', new Date().toISOString())
      this.log(`  submitted batch ${batch.id} (${chunk.length} requests)`)
      await this.collect(kind, batch.id, byId, out)
    }
    return out
  }

  private async collect<T>(kind: string, batchId: string, byId: Map<string, Job<T>>, out: Map<string, JobResult<T>>) {
    for (;;) {
      const b = await this.client.messages.batches.retrieve(batchId)
      if (b.processing_status === 'ended') break
      this.log(`  batch ${batchId}: ${b.request_counts.processing} processing, ${b.request_counts.succeeded} done`)
      await new Promise(r => setTimeout(r, Number(process.env.KB_POLL_SECONDS ?? 30) * 1000))
    }
    for await (const r of await this.client.messages.batches.results(batchId)) {
      const job = byId.get(r.custom_id)
      if (!job) continue
      if (r.result.type === 'succeeded') {
        this.recordUsage(kind, job.model, r.result.message.usage, true)
        out.set(r.custom_id, parseMessage(job, r.result.message))
      } else if (r.result.type === 'errored') {
        out.set(r.custom_id, { ok: false, error: `${r.result.error.error.type}: ${r.result.error.error.message}` })
      } else {
        out.set(r.custom_id, { ok: false, error: r.result.type })
      }
    }
    this.db.prepare("UPDATE batches SET status = 'collected' WHERE id = ?").run(batchId)
  }
}

/* ── Claude subscription, through the Claude Code CLI ──────────────────────
 * No API key: each job is one `claude -p` call, billed to the Claude plan the CLI is logged in with
 * (counts toward its usage limits). No tools, no MCP servers, no settings or CLAUDE.md: only the
 * job's own instructions, and the answer is checked against the same JSON schema.
 */
const CLAUDE_BIN = process.env.KB_CLAUDE_BIN ?? (process.platform === 'win32' ? 'claude.cmd' : 'claude')
const LIMIT = /usage limit|limit reached|rate.?limit|429|quota|out of (extra )?usage|credit balance/i

export function claudeCliStatus(): string | null {
  const r = spawnSync(CLAUDE_BIN, ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' })
  return r.status === 0 ? r.stdout.trim() : null
}

export class ClaudeCodeRunner implements Runner {
  stopped?: string

  constructor(private db: DB, private log: (s: string) => void = console.log) {}

  private call<T>(kind: string, job: Job<T>): Promise<JobResult<T> & { limit?: boolean }> {
    const { schema } = zodOutputFormat(job.schema as z.ZodType<T> & z.ZodObject)
    const args = ['-p', '--output-format', 'json', '--model', job.model, '--system-prompt', job.system,
      '--json-schema', JSON.stringify(schema), '--tools', '', '--strict-mcp-config', '--setting-sources', '', '--no-session-persistence']
    return new Promise(resolve => {
      // Run from an empty folder so no project CLAUDE.md is picked up.
      const child = spawn(CLAUDE_BIN, args, { cwd: tmpdir(), stdio: ['pipe', 'pipe', 'pipe'], shell: process.platform === 'win32' })
      let out = '', err = ''
      const timer = setTimeout(() => child.kill(), Number(process.env.KB_CALL_TIMEOUT_S ?? 300) * 1000)
      child.stdout.on('data', d => { out += d })
      child.stderr.on('data', d => { err += d })
      child.on('error', e => { clearTimeout(timer); resolve({ ok: false, error: `cannot start ${CLAUDE_BIN}: ${e.message}` }) })
      child.on('close', code => {
        clearTimeout(timer)
        let res: { is_error?: boolean; subtype?: string; result?: string; structured_output?: unknown; usage?: Record<string, number>; modelUsage?: Record<string, unknown> } | null = null
        try { res = JSON.parse(out) } catch { /* not JSON: an error message */ }
        if (!res || res.is_error || code !== 0) {
          const msg = (res?.result || err || out || `exit ${code}`).toString().trim().slice(0, 300)
          return resolve({ ok: false, error: msg, limit: LIMIT.test(msg) })
        }
        const u = res.usage ?? {}
        this.db.prepare(`INSERT INTO llm_calls(kind, model, batch, input_tokens, output_tokens, cache_read, cache_write, created_at)
          VALUES (?, ?, 0, ?, ?, ?, ?, ?)`).run(kind, `${job.model} (abonnement)`, u.input_tokens ?? 0, u.output_tokens ?? 0,
          u.cache_read_input_tokens ?? 0, u.cache_creation_input_tokens ?? 0, new Date().toISOString())
        const parsed = job.schema.safeParse(res.structured_output ?? (() => { try { return JSON.parse(res!.result ?? '') } catch { return undefined } })())
        resolve(parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: parsed.error.message.slice(0, 300) })
      })
      child.stdin.end(job.user)
    })
  }

  async run<T>(kind: string, _label: string, jobs: Job<T>[]): Promise<Map<string, JobResult<T>>> {
    const out = new Map<string, JobResult<T>>()
    if (this.stopped) return out
    const concurrency = Number(process.env.KB_CONCURRENCY ?? 4)
    let next = 0, done = 0
    const worker = async () => {
      while (next < jobs.length && !this.stopped) {
        const job = jobs[next++]
        const r = await this.call(kind, job)
        if (r.limit) {
          // Leave this job and the rest unanswered: they stay pending and run on the next attempt.
          this.stopped = r.ok ? 'usage limit' : r.error
          break
        }
        out.set(job.id, r.ok ? { ok: true, value: r.value } : { ok: false, error: r.error })
        if (++done % 25 === 0) this.log(`  ${done}/${jobs.length}`)
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker))
    return out
  }
}

import { spawn }  from 'node:child_process'
import fs         from 'node:fs/promises'
import os         from 'node:os'
import path       from 'node:path'
import { z }      from 'zod'
import { WORKSPACE, ensureWorkspace } from './workspace'

/**
 * All Claude calls go through the Claude Code CLI (`claude -p`) running on this
 * machine, signed in with your Claude subscription (`claude auth login`).
 * No Anthropic API key is used: ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN are
 * removed from the child environment so the CLI can't silently bill an API account.
 *
 * Claude runs inside the workspace folder with read-only file tools, so it can
 * search your knowledge base, memory and past meetings itself.
 */

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? 'claude'

// Model aliases understood by Claude Code. The per-chunk fidelity pass runs every
// ~45 s during a meeting, so it defaults to Sonnet to spare your plan's usage limits.
export const MODELS = {
  chunk: process.env.MEETING_MODEL_CHUNK ?? 'sonnet',
  deep:  process.env.MEETING_MODEL ?? 'opus',
}

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

interface RunOptions {
  system:    string
  prompt:    string
  model:     string
  effort:    Effort
  /** Let Claude search the workspace (knowledge base, memory, past meetings). */
  readFiles: boolean
  timeoutMs: number
}

interface CliResult {
  is_error?:          boolean
  subtype?:           string
  result?:            string
  structured_output?: unknown
}

async function run(opts: RunOptions, schema?: object): Promise<CliResult> {
  await ensureWorkspace()

  // System prompt goes through a file: Windows caps command lines at ~32 KB.
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'meeting-'))
  const systemFile = path.join(tmp, 'system.md')
  await fs.writeFile(systemFile, opts.system)

  const tools = opts.readFiles ? 'Read,Grep,Glob' : ''
  const args = [
    '-p',
    '--output-format', 'json',
    '--system-prompt-file', systemFile,
    '--model', opts.model,
    '--effort', opts.effort,
    '--tools', tools,
    '--permission-mode', 'dontAsk',
    '--permission-prompts', 'none',
    '--setting-sources', 'project',
    '--strict-mcp-config',
    '--no-session-persistence',
  ]
  if (tools) args.push('--allowedTools', tools)
  if (schema) args.push('--json-schema', JSON.stringify(schema))

  const env = { ...process.env }
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN

  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(CLAUDE_BIN, args, { cwd: WORKSPACE, env, stdio: ['pipe', 'pipe', 'pipe'] })
      let out = '', err = ''
      const timer = setTimeout(() => { child.kill('SIGINT'); reject(new Error('Claude timed out')) }, opts.timeoutMs)
      child.stdout.on('data', d => { out += d })
      child.stderr.on('data', d => { err += d })
      child.on('error', e => {
        clearTimeout(timer)
        reject(new Error(
          (e as NodeJS.ErrnoException).code === 'ENOENT'
            ? 'Claude Code CLI not found. Install it and run `claude auth login` with your Claude subscription.'
            : e.message,
        ))
      })
      child.on('close', code => {
        clearTimeout(timer)
        if (out.trim()) resolve(out)
        else reject(new Error(`claude exited with code ${code}: ${err.slice(0, 500)}`))
      })
      child.stdin.end(opts.prompt)
    })

    const parsed = JSON.parse(stdout.trim().split('\n').pop()!) as CliResult
    if (parsed.is_error || (parsed.subtype && parsed.subtype !== 'success')) {
      throw new Error(`Claude: ${parsed.result ?? parsed.subtype ?? 'unknown error'}`)
    }
    return parsed
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
}

/** One call that must return data matching `schema`. */
export async function structured<S extends z.ZodType>(schema: S, opts: RunOptions): Promise<z.infer<S>> {
  // The CLI's validator doesn't know the draft-2020-12 meta-schema URI zod emits, so drop it.
  const { $schema: _drop, ...jsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>
  void _drop
  const res = await run(opts, jsonSchema)
  const check = schema.safeParse(res.structured_output)
  if (!check.success) throw new Error(`Claude returned data that does not match the schema: ${check.error.message.slice(0, 300)}`)
  return check.data
}

/** One call that returns free text (used for Q&A). */
export async function text(opts: RunOptions): Promise<string> {
  const res = await run(opts)
  return res.result ?? ''
}

/** Reports how the CLI is authenticated, so the UI can warn if it isn't the subscription. */
export async function authStatus(): Promise<{ ok: boolean; method: string; detail: string }> {
  const env = { ...process.env }
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  return new Promise(resolve => {
    const child = spawn(CLAUDE_BIN, ['auth', 'status'], { env })
    let out = ''
    child.stdout.on('data', d => { out += d })
    child.on('error', () => resolve({ ok: false, method: 'none', detail: 'Claude Code CLI not installed' }))
    child.on('close', () => {
      try {
        const s = JSON.parse(out) as { loggedIn: boolean; authMethod: string }
        const subscription = s.authMethod === 'claude.ai' || s.authMethod === 'oauth_token'
        resolve({
          ok:     s.loggedIn && subscription,
          method: s.authMethod,
          detail: !s.loggedIn ? 'Not logged in: run `claude auth login`'
                : subscription ? 'Using your Claude subscription'
                : `Logged in with ${s.authMethod}: this is billed per use. Run \`claude auth login\` with your subscription account.`,
        })
      } catch {
        resolve({ ok: false, method: 'unknown', detail: out.slice(0, 200) || 'Could not read auth status' })
      }
    })
  })
}

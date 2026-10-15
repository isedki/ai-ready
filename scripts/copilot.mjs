#!/usr/bin/env node
/**
 * Meeting Copilot launcher — one command, no config files.
 *
 *   npm run copilot                 check setup, build if needed, start, open the browser
 *   npm run copilot -- --autostart  also start it automatically at login (and restart if it stops)
 *   npm run copilot -- --no-autostart   remove the login item
 *
 * The app listens on 127.0.0.1 only, so nothing outside this computer can reach it.
 */
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import fs   from 'node:fs'
import os   from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.MEETING_PORT ?? 3939)
const URL_ = `http://localhost:${PORT}/meeting`
const LABEL = 'com.meetingcopilot'
const args = new Set(process.argv.slice(2))
const background = args.has('--background')
const isWin = process.platform === 'win32'

const log  = (...m) => console.log('•', ...m)
const warn = (...m) => console.warn('⚠', ...m)

function which(cmd) {
  const r = spawnSync(isWin ? 'where' : 'which', [cmd], { encoding: 'utf8' })
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null
}

function checkClaude() {
  const bin = process.env.CLAUDE_BIN || which('claude')
  if (!bin) {
    warn('Claude Code is not installed. Install it from https://claude.com/claude-code, then run: claude auth login')
    return null
  }
  try {
    const s = JSON.parse(execFileSync(bin, ['auth', 'status'], { encoding: 'utf8', env: { ...process.env, ANTHROPIC_API_KEY: '' } }))
    if (!s.loggedIn) warn('Claude Code is not logged in. Run: claude auth login (choose your Claude subscription)')
    else if (!['claude.ai', 'oauth_token'].includes(s.authMethod)) warn(`Claude Code uses ${s.authMethod}, which is billed per use. Run: claude auth login with your subscription.`)
    else log('Claude: using your subscription')
  } catch { warn('Could not read Claude login status (run: claude auth status)') }
  return bin
}

function newestMtime(dir) {
  let newest = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) newest = Math.max(newest, newestMtime(p))
    else newest = Math.max(newest, fs.statSync(p).mtimeMs)
  }
  return newest
}

function npm(...a) {
  const r = spawnSync(isWin ? 'npm.cmd' : 'npm', a, { cwd: ROOT, stdio: 'inherit', shell: isWin })
  if (r.status !== 0) { console.error(`npm ${a.join(' ')} failed`); process.exit(1) }
}

function ensureBuilt() {
  if (!fs.existsSync(path.join(ROOT, 'node_modules', 'next'))) {
    log('Installing dependencies (first run)…')
    npm('install', '--no-audit', '--no-fund')
  }
  const buildId = path.join(ROOT, '.next', 'BUILD_ID')
  const built = fs.existsSync(buildId) ? fs.statSync(buildId).mtimeMs : 0
  const source = Math.max(...['app', 'components', 'lib'].map(d => newestMtime(path.join(ROOT, d))))
  if (source > built) {
    log('Building (first run or after an update)…')
    npm('run', 'build')
  }
}

async function alreadyRunning() {
  try { return (await fetch(URL_, { signal: AbortSignal.timeout(1500) })).ok } catch { return false }
}

function openBrowser() {
  if (isWin) spawn('cmd', ['/c', 'start', '', URL_], { detached: true, stdio: 'ignore' }).unref()
  else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [URL_], { detached: true, stdio: 'ignore' }).unref()
}

function start(claudeBin) {
  const nextBin = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next')
  const env = { ...process.env, NODE_ENV: 'production' }
  if (claudeBin) env.CLAUDE_BIN = claudeBin
  const child = spawn(process.execPath, [nextBin, 'start', '-H', '127.0.0.1', '-p', String(PORT)], { cwd: ROOT, env, stdio: 'inherit' })
  child.on('exit', code => process.exit(code ?? 0))
  if (!background) setTimeout(openBrowser, 2500)
  log(`Meeting Copilot: ${URL_}`)
}

// ── Autostart at login ────────────────────────────────────────────────────

function installAutostart(claudeBin) {
  const script = path.join(ROOT, 'scripts', 'copilot.mjs')
  const logDir = path.join(ROOT, 'workspace', 'logs')
  fs.mkdirSync(logDir, { recursive: true })
  const envPath = process.env.PATH ?? ''

  if (process.platform === 'darwin') {
    const plist = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`)
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    fs.writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array><string>${esc(process.execPath)}</string><string>${esc(script)}</string><string>--background</string></array>
  <key>WorkingDirectory</key><string>${esc(ROOT)}</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>${esc(envPath)}</string>
    ${claudeBin ? `<key>CLAUDE_BIN</key><string>${esc(claudeBin)}</string>` : ''}
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${esc(path.join(logDir, 'copilot.log'))}</string>
  <key>StandardErrorPath</key><string>${esc(path.join(logDir, 'copilot.log'))}</string>
</dict></plist>`)
    spawnSync('launchctl', ['unload', plist])
    spawnSync('launchctl', ['load', '-w', plist], { stdio: 'inherit' })
    log(`Installed login item (${plist}). It restarts automatically if it stops.`)
  } else if (isWin) {
    const startup = path.join(process.env.APPDATA ?? '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
    const vbs = path.join(startup, 'MeetingCopilot.vbs')
    // A tiny restart loop, run hidden: if the server ever stops, it comes back after 5 s.
    const loop = path.join(ROOT, 'workspace', 'copilot-loop.cmd')
    fs.writeFileSync(loop, [
      '@echo off',
      `cd /d "${ROOT}"`,
      claudeBin ? `set "CLAUDE_BIN=${claudeBin}"` : '',
      ':loop',
      `"${process.execPath}" "${script}" --background >> "${path.join(logDir, 'copilot.log')}" 2>&1`,
      'timeout /t 5 /nobreak >nul',
      'goto loop',
    ].join('\r\n'))
    fs.writeFileSync(vbs, `CreateObject("WScript.Shell").Run """${loop}""", 0, False\r\n`)
    spawn('wscript', [vbs], { detached: true, stdio: 'ignore' }).unref()
    log(`Installed login item (${vbs}).`)
  } else {
    const unitDir = path.join(os.homedir(), '.config', 'systemd', 'user')
    fs.mkdirSync(unitDir, { recursive: true })
    const unit = path.join(unitDir, 'meeting-copilot.service')
    fs.writeFileSync(unit, `[Unit]
Description=Meeting Copilot

[Service]
WorkingDirectory=${ROOT}
Environment=PATH=${envPath}
${claudeBin ? `Environment=CLAUDE_BIN=${claudeBin}` : ''}
ExecStart=${process.execPath} ${script} --background
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
`)
    const r = spawnSync('systemctl', ['--user', 'enable', '--now', 'meeting-copilot.service'], { stdio: 'inherit' })
    if (r.status === 0) log(`Installed user service (${unit}).`)
    else warn('Could not enable the systemd user service; start it manually with: npm run copilot')
  }
}

function removeAutostart() {
  if (process.platform === 'darwin') {
    const plist = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`)
    spawnSync('launchctl', ['unload', '-w', plist]); fs.rmSync(plist, { force: true })
  } else if (isWin) {
    fs.rmSync(path.join(process.env.APPDATA ?? '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'MeetingCopilot.vbs'), { force: true })
    log('Removed. The running copy stops at next logout (or end the "node" process in Task Manager).')
  } else {
    spawnSync('systemctl', ['--user', 'disable', '--now', 'meeting-copilot.service'], { stdio: 'inherit' })
  }
  log('Autostart removed.')
}

// ── main ──────────────────────────────────────────────────────────────────

if (args.has('--no-autostart')) { removeAutostart(); process.exit(0) }

const claudeBin = checkClaude()
ensureBuilt()

if (args.has('--autostart')) {
  installAutostart(claudeBin)
  setTimeout(async () => { if (await alreadyRunning()) openBrowser() }, 6000)
} else if (await alreadyRunning()) {
  log(`Already running: ${URL_}`)
  if (!background) openBrowser()
} else {
  start(claudeBin)
}

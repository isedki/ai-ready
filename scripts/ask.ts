/**
 * Start the local "qui contacter pour quoi ?" page and open it in the browser.
 * Stop with Ctrl+C.
 */
import { spawn }     from 'node:child_process'
import { existsSync } from 'node:fs'

const PORT = process.env.KB_ASK_PORT ?? '3210'
const URL = `http://localhost:${PORT}/ask`

if (!existsSync('.env.local')) {
  console.error('No .env.local found. Create it in this folder with one line:\nANTHROPIC_API_KEY=sk-ant-…')
  process.exit(1)
}
if (!existsSync(process.env.KB_JSON ?? 'kb-out/kb.json')) {
  console.error('The directory has not been built yet. Run first:  npm run kb -- run <path to the .pst file>')
  process.exit(1)
}

function openBrowser(url: string) {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]]
    : ['xdg-open', [url]]
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref()
}

const server = spawn('npx', ['next', 'dev', '--port', PORT], { shell: process.platform === 'win32', stdio: ['inherit', 'pipe', 'inherit'] })
let opened = false
server.stdout.on('data', (chunk: Buffer) => {
  const text = chunk.toString()
  if (!opened && /ready|started server|Local:/i.test(text)) {
    opened = true
    console.log(`\nAssistant ready at ${URL} (Ctrl+C to stop)`)
    openBrowser(URL)
  }
})
server.on('exit', code => process.exit(code ?? 0))

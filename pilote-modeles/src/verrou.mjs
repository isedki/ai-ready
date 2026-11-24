// Verrou : un seul passage à la fois (passage planifié ET passage manuel ne se chevauchent jamais).
import fs from 'node:fs'
import { VERROU, DATA } from './config.mjs'
const VIVANT = (pid) => { try { process.kill(pid, 0); return true } catch { return false } }
export function prendre(dureeMaxMs = 20 * 60000) {
  fs.mkdirSync(DATA, { recursive: true, mode: 0o700 })
  try {
    const v = JSON.parse(fs.readFileSync(VERROU, 'utf8'))
    if (VIVANT(v.pid) && Date.now() - v.at < dureeMaxMs) return false
  } catch {}
  fs.writeFileSync(VERROU, JSON.stringify({ pid: process.pid, at: Date.now() }), { mode: 0o600 })
  return true
}
export const rendre = () => { try { fs.unlinkSync(VERROU) } catch {} }

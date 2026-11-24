#!/usr/bin/env node
// Observateur · mails envoyés. Lit dans Apple Mail les messages envoyés du jour (objet, heure,
// nombre et domaines des destinataires, pièces jointes, texte sans l'historique cité) et les écrit,
// adresses et numéros masqués, dans ~/.observateur/mails/AAAA-MM-JJ.jsonl. Lancé par l'analyse du
// soir. La première fois, macOS demande d'autoriser node à piloter Mail (Automatisation).
import { execFileSync }                       from 'node:child_process'
import { mkdirSync, writeFileSync }           from 'node:fs'
import { join }                               from 'node:path'
import { localDay, maskText, redact }         from './lib.mjs'

const RS = String.fromCharCode(30), US = String.fromCharCode(31)

/** AppleScript des messages envoyés le jour situé `back` jours avant aujourd'hui (0 = aujourd'hui). */
const SCRIPT = back => `
set d to (current date) - ${back} * days
set time of d to 0
set e to d + 1 * days
set RS to (ASCII character 30)
set US to (ASCII character 31)
set out to ""
tell application "Mail"
  repeat with m in (messages of sent mailbox whose date sent ≥ d and date sent < e)
    set t to ""
    repeat with r in to recipients of m
      set t to t & (address of r) & ","
    end repeat
    set c to ""
    repeat with r in cc recipients of m
      set c to c & (address of r) & ","
    end repeat
    set out to out & (subject of m) & US & ((date sent of m) as «class isot» as string) & US & t & US & c & US & (count of mail attachments of m) & US & (content of m) & RS
  end repeat
end tell
return out`

/** Le texte écrit, sans l'historique cité en dessous (« De : », « Le … a écrit », « -----Original »). */
export function ownText(body) {
  const cut = (body ?? '').search(/^\s*(De ?:|From ?:|Le .{3,80} a écrit|On .{3,80} wrote|-{3,}\s*(Original|Message d'origine))/mi)
  return (cut >= 0 ? body.slice(0, cut) : body ?? '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim()
}

const domains = list => [...new Set(list.split(',').filter(Boolean).map(a => a.split('@')[1]?.toLowerCase()).filter(Boolean))]

/** Sortie brute de l'AppleScript → messages masqués, prêts à garder sur le Mac. */
export function parseSent(raw, mine = []) {
  const me = mine.map(a => a.toLowerCase())
  return raw.split(RS).filter(s => s.trim()).map(chunk => {
    const [subject = '', date = '', to = '', cc = '', att = '0', body = ''] = chunk.split(US)
    const all = `${to},${cc}`.toLowerCase().split(',').filter(Boolean)
    return {
      date,
      sujet: redact(subject),
      destinataires: to.split(',').filter(Boolean).length,
      copies: cc.split(',').filter(Boolean).length,
      domaines: domains(`${to},${cc}`),
      moi_en_copie: me.length ? all.some(a => me.includes(a)) : null,
      pieces_jointes: Number(att) || 0,
      texte: maskText(ownText(body)).slice(0, 4000),
    }
  })
}

/** Nombre de jours entre `day` (AAAA-MM-JJ) et aujourd'hui, en dates locales. */
export function daysBack(day, today = localDay()) {
  return Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / 86_400_000)
}

export function collectSent(cfg, day = localDay()) {
  const back = daysBack(day)
  if (!(back >= 0)) throw new Error(`jour invalide : ${day}`)
  const raw = execFileSync('osascript', ['-e', SCRIPT(back)], { encoding: 'utf8', timeout: 180_000, maxBuffer: 64 * 1024 * 1024 })
  const mails = parseSent(raw, cfg.mails.mes_adresses)
  const dir = join(cfg.dossier_donnees, '..', 'mails')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  writeFileSync(join(dir, `${day}.jsonl`), mails.map(m => JSON.stringify(m)).join('\n') + (mails.length ? '\n' : ''), { mode: 0o600 })
  return mails
}

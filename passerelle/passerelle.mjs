#!/usr/bin/env node
// Passerelle Gmail → waroom (macOS) : recopie dans le compte waroom d'Apple Mail, en brouillons, ceux que
// l'assistant prépare dans Gmail. Rien n'est envoyé ; rien ne quitte le Mac. Lancée toutes les 5 min par launchd.
//   node passerelle.mjs            recopie les nouveaux brouillons
//   node passerelle.mjs --essai    montre ce qui serait recopié, sans rien créer
//   node passerelle.mjs --comptes  liste les comptes d'Apple Mail (pour la configuration)
import { execFileSync }                                   from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir }                                        from 'node:os'
import { join }                                           from 'node:path'
import { fingerprint, logLine, parseDrafts, toCopy }      from './lib.mjs'

const DIR = join(homedir(), '.passerelle')
mkdirSync(DIR, { recursive: true, mode: 0o700 })
const CFG_FILE = join(DIR, 'config.json'), STATE_FILE = join(DIR, 'etat.json'), LOG = join(DIR, 'journal.log')
const cfg = { compte_gmail: '', compte_waroom: '', adresse_waroom: 'issam.sedki@waroom.ma', jours: 1,
  ...(existsSync(CFG_FILE) ? JSON.parse(readFileSync(CFG_FILE, 'utf8')) : {}) }
const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : { copies: {} }

const jxa = (code, arg) => execFileSync('osascript', ['-l', 'JavaScript', '-e', code, JSON.stringify(arg ?? null)],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 600_000 }).trim()

// Comptes d'Apple Mail : nom et adresses.
const ACCOUNTS = `function run(){const M=Application('Mail');return JSON.stringify(M.accounts().map(a=>({nom:a.name(),adresses:a.emailAddresses()})))}`
// Brouillons récents du seul compte Gmail, en AppleScript : « with timeout » lève la limite de 2 min
// des événements Apple, et le filtre « whose » (date, adresse waroom) est appliqué par Mail lui-même.
// Champs séparés par ASCII 31, brouillons par ASCII 30, adresses par des virgules.
const DRAFTS_AS = (account, own, days) => `
with timeout of 600 seconds
  tell application "Mail"
    set acc to account "${account.replace(/"/g, '\\"')}"
    set theBox to missing value
    repeat with b in (mailboxes of acc)
      set boxName to name of b
      if boxName contains "Brouillon" or boxName contains "Draft" then
        set theBox to b
        exit repeat
      end if
    end repeat
    if theBox is missing value then
      set theNames to ""
      repeat with b in (mailboxes of acc)
        set theNames to theNames & (name of b) & ", "
      end repeat
      return "ERREUR" & (character id 31) & theNames
    end if
    set limitDate to (current date) - (${days} * days)
    set theMsgs to (messages of theBox whose date received > limitDate)
    set theOut to ""
    repeat with m in theMsgs
      set tos to ""
      repeat with r in (to recipients of m)
        set tos to tos & (address of r) & ","
      end repeat
      set ccs to ""
      repeat with r in (cc recipients of m)
        set ccs to ccs & (address of r) & ","
      end repeat
      if (tos & ccs) contains "${own}" then
        set theOut to theOut & (message id of m) & (character id 31) & (subject of m) & (character id 31) & tos & (character id 31) & ccs & (character id 31) & (content of m) & (character id 30)
      end if
    end repeat
    return theOut
  end tell
end timeout`

// Crée un brouillon dans le compte waroom (expéditeur = adresse waroom) et l'enregistre sans l'envoyer.
const CREATE = `function run(argv){const d=JSON.parse(argv[0]);const M=Application('Mail');
const m=M.OutgoingMessage({subject:d.subject,content:d.content,visible:false,sender:d.sender});M.outgoingMessages.push(m);
d.to.forEach(a=>m.toRecipients.push(M.ToRecipient({address:a})));d.cc.forEach(a=>m.ccRecipients.push(M.CcRecipient({address:a})));
m.save();try{m.close({saving:'yes'})}catch(e){}return 'ok'}`

function main() {
  const accounts = JSON.parse(jxa(ACCOUNTS))
  if (process.argv.includes('--comptes')) { console.log(accounts); return }
  // Configuration automatique : le compte Gmail et le compte dont une adresse est l'adresse waroom.
  const byAddr = re => accounts.find(a => a.adresses.some(x => re.test(x)))?.nom ?? ''
  cfg.compte_gmail ||= byAddr(/@gmail\.com$/i)
  cfg.compte_waroom ||= accounts.find(a => a.adresses.some(x => x.toLowerCase() === cfg.adresse_waroom.toLowerCase()))?.nom ?? ''
  if (!cfg.compte_gmail || !cfg.compte_waroom) {
    console.error(`Compte introuvable dans Apple Mail (Gmail : « ${cfg.compte_gmail} », waroom : « ${cfg.compte_waroom} »). Comptes vus : ${accounts.map(a => a.nom).join(', ')}`)
    process.exit(1)
  }
  writeFileSync(CFG_FILE, JSON.stringify(cfg, null, 2))

  const raw = execFileSync('osascript', ['-e', DRAFTS_AS(cfg.compte_gmail, cfg.adresse_waroom.toLowerCase(), cfg.jours ?? 1)],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 660_000 })
  const drafts = parseDrafts(raw.replace(/\n$/, ''), cfg.compte_gmail)
  if (drafts.erreur) { console.error(drafts.erreur); process.exit(1) }
  const todo = toCopy(drafts, state, cfg)
  if (process.argv.includes('--essai')) {
    console.log(`${todo.length} brouillon(s) à recopier :`); todo.forEach(d => console.log(`  « ${d.subject} » → ${d.to.join(', ')}`)); return
  }
  for (const d of todo) {
    try {
      jxa(CREATE, { ...d, sender: cfg.adresse_waroom })
      state.copies[d.id] = fingerprint(d)
      appendFileSync(LOG, logLine(new Date(), d, true) + '\n')
    } catch (e) {
      appendFileSync(LOG, logLine(new Date(), d, false, String(e.message).split('\n')[0]) + '\n')
    }
  }
  writeFileSync(STATE_FILE, JSON.stringify(state))
  if (todo.length) console.log(`${todo.length} brouillon(s) traité(s) ; détail dans ${LOG}`)
}

main()

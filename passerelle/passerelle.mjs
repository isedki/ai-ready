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
import { fingerprint, logLine, toCopy }                   from './lib.mjs'

const DIR = join(homedir(), '.passerelle')
mkdirSync(DIR, { recursive: true, mode: 0o700 })
const CFG_FILE = join(DIR, 'config.json'), STATE_FILE = join(DIR, 'etat.json'), LOG = join(DIR, 'journal.log')
const cfg = { compte_gmail: '', compte_waroom: '', adresse_waroom: 'issam.sedki@waroom.ma',
  ...(existsSync(CFG_FILE) ? JSON.parse(readFileSync(CFG_FILE, 'utf8')) : {}) }
const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : { copies: {} }

const jxa = (code, arg) => execFileSync('osascript', ['-l', 'JavaScript', '-e', code, JSON.stringify(arg ?? null)],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 120_000 }).trim()

// Comptes d'Apple Mail : nom et adresses.
const ACCOUNTS = `function run(){const M=Application('Mail');return JSON.stringify(M.accounts().map(a=>({nom:a.name(),adresses:a.emailAddresses()})))}`
// Brouillons de tous les comptes (le dossier Brouillons unifié d'Apple Mail).
const DRAFTS = `function run(){const M=Application('Mail');return JSON.stringify(M.draftsMailbox().messages().map(m=>{let acc='';try{acc=m.mailbox().account().name()}catch(e){}
return {id:m.messageId(),account:acc,subject:m.subject(),content:m.content(),to:m.toRecipients().map(r=>r.address()),cc:m.ccRecipients().map(r=>r.address())}}))}`
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

  const drafts = JSON.parse(jxa(DRAFTS))
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

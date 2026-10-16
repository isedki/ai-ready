import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative }                    from 'node:path'
import { simpleParser, type AddressObject }  from 'mailparser'
import type { DB }                           from '../db'
import { htmlToText }                        from '../clean'
import { insertMessage, type Address }       from './store'

function flatten(a: AddressObject | AddressObject[] | undefined): Address[] {
  const list = Array.isArray(a) ? a : a ? [a] : []
  return list.flatMap(o => o.value).filter(v => v.address).map(v => ({ addr: v.address!, name: v.name ?? '' }))
}

function* emlFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* emlFiles(p)
    else if (name.toLowerCase().endsWith('.eml')) yield p
  }
}

/** Ingest a folder of .eml files (other exports, or `readpst -e` output). */
export async function ingestEmlDir(db: DB, dir: string): Promise<{ seen: number; inserted: number }> {
  let seen = 0
  let inserted = 0
  for (const file of emlFiles(dir)) {
    seen++
    const mail = await simpleParser(readFileSync(file))
    const refs = Array.isArray(mail.references) ? mail.references : mail.references ? [mail.references] : []
    const ok = insertMessage(db, {
      messageId:  mail.messageId ?? null,
      folder:     relative(dir, file),
      subject:    mail.subject ?? '',
      from:       flatten(mail.from)[0] ?? { addr: 'unknown', name: '' },
      to:         flatten(mail.to),
      cc:         flatten(mail.cc),
      date:       mail.date ?? null,
      inReplyTo:  mail.inReplyTo ?? null,
      references: refs,
      body:       mail.text || htmlToText(typeof mail.html === 'string' ? mail.html : ''),
    })
    if (ok) inserted++
  }
  return { seen, inserted }
}

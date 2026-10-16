import { createHash } from 'node:crypto'
import type { DB }    from '../db'
import { normalizeSubject, noiseReason, stripQuotesAndSignature, redactSecrets } from '../clean'

export type Address = { addr: string; name: string }

export type RawMessage = {
  messageId:   string | null
  folder:      string
  subject:     string
  from:        Address
  to:          Address[]
  cc:          Address[]
  date:        Date | null
  inReplyTo:   string | null
  references:  string[]
  body:        string
  messageClass?: string
}

export function cleanId(id: string | null | undefined): string | null {
  const m = (id ?? '').match(/<?([^<>\s]+)>?/)
  return m ? m[1].toLowerCase() : null
}

export function normalizeAddr(addr: string): string {
  return addr.trim().replace(/^<|>$/g, '').replace(/^smtp:/i, '').toLowerCase()
}

export function insertMessage(db: DB, m: RawMessage): boolean {
  const id = cleanId(m.messageId)
    ?? 'gen-' + createHash('sha1').update(`${m.subject}|${m.from.addr}|${m.date?.toISOString()}|${m.body.slice(0, 200)}`).digest('hex')
  const noise = noiseReason({ from: m.from.addr, subject: m.subject, body: m.body, messageClass: m.messageClass })
  const clean = redactSecrets(stripQuotesAndSignature(m.body))
  const res = db.prepare(`
    INSERT OR IGNORE INTO messages
      (id, folder, subject, norm_subject, from_addr, from_name, to_addrs, cc_addrs, date, in_reply_to, refs, body_raw, body_clean, is_noise, noise_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, m.folder, m.subject, normalizeSubject(m.subject),
    normalizeAddr(m.from.addr), m.from.name,
    JSON.stringify(m.to.map(a => ({ ...a, addr: normalizeAddr(a.addr) }))),
    JSON.stringify(m.cc.map(a => ({ ...a, addr: normalizeAddr(a.addr) }))),
    m.date?.toISOString() ?? null,
    cleanId(m.inReplyTo),
    JSON.stringify(m.references.map(cleanId).filter(Boolean)),
    // Raw bodies are kept redacted too, so the DB never holds a plaintext secret.
    redactSecrets(m.body), clean,
    noise ? 1 : 0, noise,
  )

  const upsertPerson = db.prepare(`
    INSERT INTO people(addr, name) VALUES (?, ?)
    ON CONFLICT(addr) DO UPDATE SET name = COALESCE(NULLIF(people.name, ''), excluded.name)
  `)
  for (const a of [m.from, ...m.to, ...m.cc]) {
    const addr = normalizeAddr(a.addr)
    if (addr) upsertPerson.run(addr, a.name || '')
  }
  return Number(res.changes) > 0
}

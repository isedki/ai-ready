import { PSTFile, PSTFolder, PSTMessage } from 'pst-extractor'
import type { DB }                         from '../db'
import { tx }                              from '../db'
import { htmlToText }                      from '../clean'
import { insertMessage, type Address }     from './store'

function header(headers: string, name: string): string | null {
  // Unfold continuation lines, then find the header.
  const unfolded = headers.replace(/\r?\n[ \t]+/g, ' ')
  const m = unfolded.match(new RegExp(`^${name}:\\s*(.*)$`, 'im'))
  return m ? m[1].trim() : null
}

function smtpFromHeader(value: string | null): string | null {
  const m = value?.match(/<([^>]+@[^>]+)>/) ?? value?.match(/([^\s<>"]+@[^\s<>"]+)/)
  return m ? m[1] : null
}

function senderOf(msg: PSTMessage): Address {
  const name = msg.senderName || msg.sentRepresentingName || ''
  if (msg.senderAddrtype?.toUpperCase() === 'SMTP' && msg.senderEmailAddress) {
    return { addr: msg.senderEmailAddress, name }
  }
  const fromHeader = smtpFromHeader(header(msg.transportMessageHeaders ?? '', 'From'))
  if (fromHeader) return { addr: fromHeader, name }
  if (msg.sentRepresentingAddressType?.toUpperCase() === 'SMTP' && msg.sentRepresentingEmailAddress) {
    return { addr: msg.sentRepresentingEmailAddress, name }
  }
  // Exchange DN (/o=…/cn=…): stable per person; unified with SMTP aliases later by display name.
  return { addr: msg.senderEmailAddress || name, name }
}

function recipientsOf(msg: PSTMessage): { to: Address[]; cc: Address[] } {
  const to: Address[] = []
  const cc: Address[] = []
  for (let i = 0; i < msg.numberOfRecipients; i++) {
    const r = msg.getRecipient(i)
    if (!r) continue
    const addr = r.smtpAddress || r.emailAddress
    if (!addr) continue
    const entry = { addr, name: r.displayName || '' }
    if (r.recipientType === 2) cc.push(entry)
    else if (r.recipientType === 1) to.push(entry)
  }
  return { to, cc }
}

export function ingestPst(db: DB, path: string, onProgress?: (n: number) => void): { seen: number; inserted: number } {
  const pst = new PSTFile(path)
  let seen = 0
  let inserted = 0

  const walk = (folder: PSTFolder, trail: string) => {
    const here = folder.displayName ? `${trail}/${folder.displayName}` : trail
    if (folder.hasSubfolders) {
      for (const child of folder.getSubFolders()) walk(child, here)
    }
    if (folder.contentCount <= 0) return
    tx(db, () => {
      let item = folder.getNextChild()
      while (item != null) {
        if (item instanceof PSTMessage) {
          seen++
          const headers = item.transportMessageHeaders ?? ''
          const { to, cc } = recipientsOf(item)
          const ok = insertMessage(db, {
            messageId:    item.internetMessageId || header(headers, 'Message-ID'),
            folder:       here,
            subject:      item.subject ?? '',
            from:         senderOf(item),
            to, cc,
            date:         item.clientSubmitTime ?? item.messageDeliveryTime,
            inReplyTo:    item.inReplyToId || header(headers, 'In-Reply-To'),
            references:   (header(headers, 'References') ?? '').split(/\s+/).filter(Boolean),
            body:         item.body || htmlToText(item.bodyHTML ?? ''),
            messageClass: item.messageClass,
          })
          if (ok) inserted++
          if (seen % 250 === 0) onProgress?.(seen)
        }
        item = folder.getNextChild()
      }
    })
  }

  walk(pst.getRootFolder(), '')
  return { seen, inserted }
}

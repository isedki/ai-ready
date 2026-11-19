import { createHash }                                    from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { extname, join }                                 from 'node:path'
import { PSTAttachment, PSTFile, PSTFolder, PSTMessage } from 'pst-extractor'

/** Formats the project index can read (lib/copilote/loaders.ts SUPPORTED, minus .json/.eml). */
export const ATTACHMENT_EXTS = ['.pdf', '.docx', '.xlsx', '.xlsm', '.pptx', '.odt', '.odp', '.ods', '.txt', '.md', '.csv']

export type AttachmentReport = {
  messages: number
  written: number
  duplicates: number
  skipped: { unsupported: number; tooSmall: number; tooBig: number; empty: number }
  bytes: number
}

const MIN_BYTES = 2 * 1024
const MAX_BYTES = 40 * 1024 * 1024

/** Safe file-name fragment: no path separators or control characters, accents kept. */
export function safeName(s: string, max = 80): string {
  return s
    .replace(/^\s*((re|tr|fw|fwd|réf|ref)\s*:\s*)+/i, '')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim()
}

/**
 * Name under which an attachment is saved: « AAAA-MM-JJ - <objet du mail> - <nom du fichier> ».
 * The index uses the file name as the title, so the email's date and subject travel with it.
 */
export function attachmentFileName(date: Date | null, subject: string, name: string): string {
  const ext = extname(name).toLowerCase()
  const stem = safeName(name.slice(0, name.length - ext.length), 90) || 'piece-jointe'
  const day = date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : 'sans-date'
  const subj = safeName(subject, 70)
  return `${day} - ${subj ? subj + ' - ' : ''}${stem}${ext}`
}

function readAttachment(att: PSTAttachment): Buffer | null {
  const stream = att.fileInputStream
  if (!stream) return null
  // The stream knows its full length: read it in one go (a block-by-block loop can stop early
  // on a short read and silently truncate the file).
  const length = Number(stream.length)
  if (!Number.isFinite(length) || length <= 0) return null
  const buf = Buffer.alloc(length)
  stream.readCompletely(buf)
  return buf
}

/**
 * Write every readable attachment of a PST into `outDir`, once per distinct content (sha256),
 * with a manifest (manifest.tsv, tab-separated, a format the index skips: file, original name, email date, subject, sender, folder, sha256).
 * Images, calendar items, embedded emails and formats the index cannot read are skipped.
 * Nothing is written to the email database.
 */
export function exportPstAttachments(path: string, outDir: string, onProgress?: (n: number) => void): AttachmentReport {
  mkdirSync(outDir, { recursive: true })
  const manifest = join(outDir, 'manifest.tsv')
  if (!existsSync(manifest)) writeFileSync(manifest, ['fichier', 'nom_original', 'date', 'objet', 'expediteur', 'dossier', 'sha256'].join('\t') + '\n')
  const seen = new Set<string>()
  for (const f of readdirSync(outDir)) { const m = /^\[([0-9a-f]{8})\]/.exec(f); if (m) seen.add(m[1]) }

  const rep: AttachmentReport = { messages: 0, written: 0, duplicates: 0, skipped: { unsupported: 0, tooSmall: 0, tooBig: 0, empty: 0 }, bytes: 0 }
  const cell = (s: string) => s.replace(/[\t\r\n]+/g, ' ')

  const walk = (folder: PSTFolder, trail: string) => {
    const here = folder.displayName ? `${trail}/${folder.displayName}` : trail
    if (folder.hasSubfolders) for (const child of folder.getSubFolders()) walk(child, here)
    if (folder.contentCount <= 0) return
    let item = folder.getNextChild()
    while (item != null) {
      if (item instanceof PSTMessage && item.hasAttachments) {
        rep.messages++
        if (rep.messages % 100 === 0) onProgress?.(rep.messages)
        const date = item.clientSubmitTime ?? item.messageDeliveryTime ?? null
        for (let i = 0; i < item.numberOfAttachments; i++) {
          let att: PSTAttachment
          try { att = item.getAttachment(i) } catch { rep.skipped.empty++; continue }
          const name = att.longFilename || att.filename || ''
          const ext = extname(name).toLowerCase()
          if (!ATTACHMENT_EXTS.includes(ext)) { rep.skipped.unsupported++; continue }
          const size = att.filesize ?? 0
          if (size > MAX_BYTES) { rep.skipped.tooBig++; continue }
          let buf: Buffer | null
          try { buf = readAttachment(att) } catch { buf = null }
          if (!buf || buf.length === 0) { rep.skipped.empty++; continue }
          if (buf.length < MIN_BYTES) { rep.skipped.tooSmall++; continue }
          const sha = createHash('sha256').update(buf).digest('hex')
          const key = sha.slice(0, 8)
          if (seen.has(key)) { rep.duplicates++; continue }
          seen.add(key)
          // The short hash prefix makes names unique and lets a later run skip what is already there.
          const file = `[${key}] ${attachmentFileName(date, item.subject ?? '', name)}`
          writeFileSync(join(outDir, file), buf)
          appendFileSync(manifest, [file, name, date ? date.toISOString() : '', item.subject ?? '', item.senderName ?? '', here, sha].map(cell).join('\t') + '\n')
          rep.written++
          rep.bytes += buf.length
        }
      }
      item = folder.getNextChild()
    }
  }

  walk(new PSTFile(path).getRootFolder(), '')
  return rep
}

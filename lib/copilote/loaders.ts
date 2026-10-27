import { createHash }                    from 'node:crypto'
import { readFileSync, statSync }        from 'node:fs'
import { basename, extname }             from 'node:path'
import { simpleParser, type AddressObject } from 'mailparser'
import { htmlToText, redactSecrets, stripQuotesAndSignature } from '../kb/clean'
import type { Section }                  from './chunk'

/**
 * File → sections. Each loader keeps the structure people cite: PDF pages, Word headings,
 * Excel sheets, slides. Every text is redacted (passwords, tokens, keys, MSISDN) before it
 * leaves this module, so nothing secret reaches the store or the model.
 */
export type Loaded = {
  title:    string
  kind:     string
  version:  string | null
  date:     string | null
  author:   string | null
  sha256:   string
  sections: Section[]
}

export const SUPPORTED = ['.pdf', '.docx', '.xlsx', '.xlsm', '.pptx', '.odt', '.odp', '.ods', '.txt', '.md', '.csv', '.eml', '.json']

const day = (d: Date) => d.toISOString().slice(0, 10)

/** "PHENIX_DAT_001_V1.24.docx" → "1.24"; "MC-MGEN4007 …_V1.1.xlsx" → "1.1". */
export function versionFrom(name: string): string | null {
  const m = name.match(/(?:^|[\s_\-.])v(\d+(?:\.\d+){0,3})(?=[\s_\-.]|$)/i)
  return m ? m[1] : null
}

const clean = (s: string) => redactSecrets(s.replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim())

async function loadPdf(buf: Buffer): Promise<Section[]> {
  const { getDocumentProxy, extractText } = await import('unpdf')
  const pdf = await getDocumentProxy(new Uint8Array(buf))
  const { text } = await extractText(pdf, { mergePages: false })
  return (text as string[]).map((t, i) => ({ text: clean(t), locator: `p. ${i + 1}` })).filter(s => s.text)
}

async function loadDocx(buf: Buffer): Promise<Section[]> {
  const mammoth = await import('mammoth')
  const { value: html } = await mammoth.convertToHtml({ buffer: buf })
  // Split on headings; tables become "a | b | c" lines so a row stays readable on its own.
  const withTables = html
    .replace(/(<t[dh][^>]*>)([\s\S]*?)(<\/t[dh]>)/gi, (_m, open: string, inner: string, close: string) =>
      open + inner.replace(/<\/?p[^>]*>/gi, ' ').replace(/\s+/g, ' ').trim() + close)
    .replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, ' | ')
    .replace(/<\/tr>/gi, '\n')
  const parts = withTables.split(/(?=<h[1-4][^>]*>)/i)
  const sections: Section[] = []
  const trail: string[] = []
  for (const part of parts) {
    const h = part.match(/^<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/i)
    if (h) {
      const level = Number(h[1])
      trail.length = level - 1
      trail[level - 1] = htmlToText(h[2]).trim()
    }
    const text = clean(htmlToText(h ? part.slice(h[0].length) : part))
    if (text) sections.push({ text, heading: trail.filter(Boolean).join(' › ') || null, locator: trail.at(-1) ? `§ ${trail.at(-1)}` : null })
  }
  return sections
}

async function loadXlsx(path: string): Promise<Section[]> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const sections: Section[] = []
  const ROWS = 40
  wb.eachSheet(ws => {
    const rows: string[] = []
    ws.eachRow({ includeEmpty: false }, row => {
      const cells = (row.values as unknown[]).slice(1).map(v => {
        if (v == null) return ''
        if (typeof v === 'object') {
          const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[]; hyperlink?: string }
          if (o.richText) return o.richText.map(r => r.text).join('')
          if (o.result !== undefined) return String(o.result)
          if (o.text !== undefined) return String(o.text)
          if (v instanceof Date) return day(v)
          return ''
        }
        return String(v)
      })
      while (cells.length && !cells.at(-1)) cells.pop()
      if (cells.some(Boolean)) rows.push(`${row.number}: ${cells.join(' | ')}`)
    })
    if (!rows.length) return
    // Each block repeats the header row, so a passage read alone still says what each column is.
    const header = rows[0]
    for (let i = 0; i < rows.length; i += ROWS) {
      const block = i === 0 ? rows.slice(0, ROWS) : [header, ...rows.slice(i, i + ROWS)]
      const first = i + 1, last = Math.min(i + ROWS, rows.length)
      sections.push({ text: clean(block.join('\n')), heading: ws.name, locator: `onglet ${ws.name}, lignes ${first}–${last}` })
    }
  })
  return sections
}

async function loadOffice(path: string): Promise<Section[]> {
  const { parseOfficeAsync } = await import('officeparser')
  const text = await parseOfficeAsync(path)
  return [{ text: clean(String(text)) }]
}

function loadMarkdown(text: string): Section[] {
  const sections: Section[] = []
  const trail: string[] = []
  for (const part of text.split(/\n(?=#{1,4}\s)/)) {
    const h = part.match(/^(#{1,4})\s+(.*)/)
    if (h) { trail.length = h[1].length - 1; trail[h[1].length - 1] = h[2].trim() }
    const body = clean(h ? part.slice(h[0].length) : part)
    if (body) sections.push({ text: body, heading: trail.filter(Boolean).join(' › ') || null, locator: trail.at(-1) ? `§ ${trail.at(-1)}` : null })
  }
  return sections
}

const addrs = (a: AddressObject | AddressObject[] | undefined) =>
  (Array.isArray(a) ? a : a ? [a] : []).flatMap(o => o.value).map(v => v.name ? `${v.name} <${v.address}>` : v.address).join(', ')

async function loadEml(buf: Buffer): Promise<Partial<Loaded> & { sections: Section[] }> {
  const mail = await simpleParser(buf)
  const body = mail.text || htmlToText(typeof mail.html === 'string' ? mail.html : '')
  const head = `De : ${addrs(mail.from)}\nÀ : ${addrs(mail.to)}${mail.cc ? `\nCc : ${addrs(mail.cc)}` : ''}\nDate : ${mail.date?.toISOString() ?? '?'}\nObjet : ${mail.subject ?? ''}`
  return {
    title:  mail.subject ?? '(sans objet)',
    author: addrs(mail.from) || null,
    date:   mail.date ? day(mail.date) : null,
    sections: [{ text: clean(`${head}\n\n${stripQuotesAndSignature(body)}`), locator: mail.date ? day(mail.date) : null }],
  }
}

/** Load one file. `kind` defaults to email for .eml and doc otherwise. */
export async function loadFile(path: string, kind?: string): Promise<Loaded> {
  const buf  = readFileSync(path)
  const ext  = extname(path).toLowerCase()
  const name = basename(path)
  const base: Loaded = {
    title:   name.replace(/\.[^.]+$/, ''),
    kind:    kind ?? (ext === '.eml' ? 'email' : 'doc'),
    version: versionFrom(name),
    date:    day(statSync(path).mtime),
    author:  null,
    sha256:  createHash('sha256').update(buf).digest('hex'),
    sections: [],
  }
  switch (ext) {
    case '.pdf':  return { ...base, sections: await loadPdf(buf) }
    case '.docx': return { ...base, sections: await loadDocx(buf) }
    case '.xlsx':
    case '.xlsm': return { ...base, sections: await loadXlsx(path) }
    case '.pptx':
    case '.odt':
    case '.odp':
    case '.ods':  return { ...base, sections: await loadOffice(path) }
    case '.md':   return { ...base, sections: loadMarkdown(buf.toString('utf8')) }
    case '.txt':
    case '.csv':  return { ...base, sections: [{ text: clean(buf.toString('utf8')) }] }
    case '.eml': {
      const m = await loadEml(buf)
      return { ...base, ...m, title: m.title ?? base.title, sections: m.sections }
    }
    default: throw new Error(`Format non pris en charge : ${ext} (${SUPPORTED.join(', ')})`)
  }
}

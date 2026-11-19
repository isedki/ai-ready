import { createHash }                    from 'node:crypto'
import { readFileSync, statSync }        from 'node:fs'
import { basename, extname }             from 'node:path'
import { simpleParser, type AddressObject } from 'mailparser'
import { htmlToText, redactSecrets, stripQuotesAndSignature } from '../kb/clean'
import { relativizeRels }                from '../kb/xlsx'
import { TARGET, type Section }         from './chunk'

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

type CellValue = unknown

function cellText(v: CellValue): string {
  if (v == null) return ''
  if (v instanceof Date) return day(v)
  if (typeof v === 'object') {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[]; error?: unknown }
    if (o.richText) return o.richText.map(r => r.text).join('')
    if (o.result !== undefined) return cellText(o.result)
    if (o.text !== undefined) return String(o.text)
    return ''
  }
  return String(v)
}

/** Rows kept to repeat at the top of every passage of a sheet, so a passage read alone says what each column is. */
const HEADER_SCAN = 5

async function loadXlsx(path: string): Promise<Section[]> {
  const ExcelJS = (await import('exceljs')).default
  const buf = readFileSync(path)
  let wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
  } catch (first) {
    // Workbooks written by openpyxl use absolute relationship targets ("/xl/tables/table1.xml");
    // exceljs only resolves Excel's relative form and throws "Cannot read properties of undefined
    // (reading 'name')" on sheets holding a table. Rewrite the targets and try again.
    let repaired: Buffer | null = null
    try { repaired = relativizeRels(buf) } catch { /* not a zip we can read: fall through */ }
    try {
      if (!repaired) throw first
      wb = new ExcelJS.Workbook()
      await wb.xlsx.load(repaired as unknown as ArrayBuffer)
    } catch {
      // Still unreadable: keep the text rather than losing the file.
      return loadOffice(path)
    }
  }
  const sections: Section[] = []
  const ROWS = 40
  wb.worksheets.forEach((ws, index) => {
    // A sheet without a usable name still gets a stable label from its position.
    const name = (typeof ws?.name === 'string' && ws.name.trim()) || `Feuille ${index + 1}`
    const rows: { n: number; text: string; hMerged: boolean }[] = []
    ws.eachRow({ includeEmpty: false }, row => {
      const cells: string[] = []
      let hMerged = false
      for (let c = 1; c <= row.cellCount; c++) {
        const cell = row.getCell(c)
        const master = cell.isMerged ? cell.master : cell
        if (master !== cell && master.row === cell.row) {
          // Right part of a horizontal merge ("Flux" over three columns): write the label once.
          hMerged = true
          cells.push('')
          continue
        }
        // A vertical merge keeps its value on every row: each row then stands on its own.
        cells.push(cellText(master.value).replace(/\s*\n\s*/g, ' ').trim())
      }
      while (cells.length && !cells.at(-1)) cells.pop()
      if (cells.some(Boolean)) rows.push({ n: row.number, text: `${row.number}: ${cells.join(' | ')}`, hMerged })
    })
    if (!rows.length) return
    // Header: the first row that is not a merged title or column group, with the merged rows above it
    // ("Matrice des flux" / "Flux · Volumétrie" over "Source | Cible | …"). A plain table: its first row.
    const plain = rows.slice(0, HEADER_SCAN).findIndex(r => !r.hMerged)
    const header = rows.slice(0, plain < 0 ? 1 : plain + 1)
    const body = rows.slice(header.length)
    // Blocks of at most ROWS rows that fit one passage together with the header, so the chunker
    // never cuts a block: every passage starts with the header and its locator gives its exact rows.
    const head = header.map(r => r.text).join('\n')
    const blocks: (typeof rows)[] = [[]]
    let len = head.length
    for (const r of body) {
      const cur = blocks.at(-1)!
      if (cur.length && (cur.length >= ROWS || len + 1 + r.text.length > TARGET)) { blocks.push([]); len = head.length }
      blocks.at(-1)!.push(r)
      len += 1 + r.text.length
    }
    blocks.forEach((block, i) => {
      // The first block's lines start at the header, the next ones at their own first row.
      const from = i === 0 ? header[0].n : block[0].n
      const to   = (block.at(-1) ?? header.at(-1)!).n
      sections.push({ text: clean([head, ...block.map(r => r.text)].join('\n')), heading: name, locator: `onglet ${name}, lignes ${from}–${to}` })
    })
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

/**
 * Minimal .xlsx writer: text and number cells, bold frozen header row with filters, column widths.
 * Enough for listing the mailbox in Excel without adding a dependency (a zip of a few XML files).
 */
import { writeFileSync } from 'node:fs'
import { crc32, deflateRawSync } from 'node:zlib'

export type Cell = string | number | null | undefined
export type Sheet = { name: string; columns: { header: string; width: number }[]; rows: Cell[][] }

const esc = (s: string) => s
  // Characters XML 1.0 does not allow (control characters found in some mail bodies).
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const col = (i: number): string => (i >= 26 ? col(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26))

function sheetXml(s: Sheet): string {
  const cell = (v: Cell, ref: string, style = 0) => {
    if (v == null || v === '') return ''
    const st = style ? ` s="${style}"` : ''
    if (typeof v === 'number') return `<c r="${ref}"${st}><v>${v}</v></c>`
    // Excel cells hold at most 32,767 characters.
    return `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${esc(String(v).slice(0, 32000))}</t></is></c>`
  }
  const rows = [s.columns.map(c => c.header), ...s.rows]
  const body = rows.map((r, i) => `<row r="${i + 1}">${r.map((v, j) => cell(v, `${col(j)}${i + 1}`, i === 0 ? 1 : 0)).join('')}</row>`).join('')
  const last = `${col(s.columns.length - 1)}${rows.length}`
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${s.columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`).join('')}</cols>
<sheetData>${body}</sheetData>
<autoFilter ref="A1:${last}"/>
</worksheet>`
}

/** A zip archive, every entry deflated. */
function zip(files: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = [], central: Buffer[] = []
  let offset = 0
  for (const f of files) {
    const name = Buffer.from(f.name), packed = deflateRawSync(f.data), crc = crc32(f.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8)
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(f.data.length, 22); local.writeUInt16LE(name.length, 26)
    const dir = Buffer.alloc(46)
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(0x0800, 8); dir.writeUInt16LE(8, 10)
    dir.writeUInt32LE(crc, 16); dir.writeUInt32LE(packed.length, 20); dir.writeUInt32LE(f.data.length, 24); dir.writeUInt16LE(name.length, 28)
    dir.writeUInt32LE(offset, 42)
    parts.push(local, name, packed)
    central.push(dir, name)
    offset += 30 + name.length + packed.length
  }
  const cd = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, cd, end])
}

export function writeXlsx(path: string, sheets: Sheet[]) {
  const names = sheets.map(s => esc(s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)))
  const files: [string, string][] = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
<definedNames>${sheets.map((s, i) => `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${names[i]}'!$A$1:$${col(s.columns.length - 1)}$${s.rows.length + 1}</definedName>`).join('')}</definedNames>
</workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`],
    ['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`],
    ...sheets.map((s, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)]),
  ]
  writeFileSync(path, zip(files.map(([name, xml]) => ({ name, data: Buffer.from(xml, 'utf8') }))))
}

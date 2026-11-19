import { strict as assert }      from 'node:assert'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir }                from 'node:os'
import { join }                  from 'node:path'
import { test }                  from 'node:test'
import { relativizeRels, unzip, writeXlsx, zip } from '../kb/xlsx'
import { chunkSections }         from './chunk'
import { loadFile }              from './loaders'

const FIXTURE = join(__dirname, 'fixtures', 'matrice-flux-openpyxl.xlsx')

test('an openpyxl flow matrix (merged headers, table on a sheet) loads per sheet with its header repeated', async () => {
  const doc = await loadFile(FIXTURE)
  const sheets = [...new Set(doc.sections.map(s => s.heading))]
  assert.deepEqual(sheets, ['Procédure', 'Flux'])

  const procedure = doc.sections.filter(s => s.heading === 'Procédure')
  assert.equal(procedure.length, 1)
  assert.equal(procedure[0].locator, 'onglet Procédure, lignes 1–7')
  assert.match(procedure[0].text, /^1: Matrice des flux — Procédure\n2: Étape \| Acteur \| Action \| Délai\n3: 1 \| Acteur 1/)

  // 50 data rows: several passages, each one starting with the merged group row and the column header,
  // and still one passage each once chunked (a block never exceeds the chunker's size).
  const flux = chunkSections(doc.sections.filter(s => s.heading === 'Flux'))
  assert.ok(flux.length >= 2)
  const seen: number[] = []
  for (const s of flux) {
    const [groups, header, ...data] = s.text.split('\n')
    // A horizontal merge is written once, not repeated in every merged column.
    assert.equal(groups, '1: Flux |  |  | Volumétrie')
    assert.equal(header, '2: Source | Cible | Protocole | Fréquence | Volume')
    const rows = data.map(l => Number(l.split(':')[0]))
    const [, from, to] = s.locator!.match(/^onglet Flux, lignes (\d+)–(\d+)$/)!.map(Number)
    assert.equal(to, rows.at(-1))
    assert.equal(from, seen.length ? rows[0] : 1)
    seen.push(...rows)
  }
  assert.deepEqual(seen, Array.from({ length: 50 }, (_, i) => i + 3))
  assert.match(flux.at(-1)!.text, /\n52: SRC50 \| TGT50 \| SFTP \| Quotidien \| 500$/)
})

test('absolute relationship targets are rewritten relative to their part, external links untouched', () => {
  const fixed = relativizeRels(readFileSync(FIXTURE))
  assert.ok(fixed, 'the openpyxl fixture has absolute targets')
  const files = new Map(unzip(fixed!).map(f => [f.name, f.data.toString('utf8')]))
  assert.match(files.get('xl/worksheets/_rels/sheet2.xml.rels')!, /Target="\.\.\/tables\/table1\.xml"/)
  assert.match(files.get('xl/_rels/workbook.xml.rels')!, /Target="worksheets\/sheet1\.xml"/)
  assert.match(files.get('_rels/.rels')!, /Target="xl\/workbook\.xml"/)
  for (const [name, xml] of files) if (name.endsWith('.rels')) assert.doesNotMatch(xml, /Target="\//, name)
  // Every other part is carried over byte for byte.
  const before = new Map(unzip(readFileSync(FIXTURE)).map(f => [f.name, f.data.toString('utf8')]))
  assert.equal(files.get('xl/worksheets/sheet2.xml'), before.get('xl/worksheets/sheet2.xml'))

  const rels = (attrs: string) => zip([{ name: 'xl/worksheets/_rels/sheet1.xml.rels', data: Buffer.from(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" ${attrs}/></Relationships>`) }])
  const hyperlink = 'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"'
  assert.equal(relativizeRels(rels(`${hyperlink} Target="/srv/partage/flux.xlsx" TargetMode="External"`)), null)
  assert.equal(relativizeRels(rels(`TargetMode="External" ${hyperlink} Target="/srv/partage/flux.xlsx"`)), null)
})

test('a workbook laid out like Excel (relative targets, one sheet, plain header) is unchanged by the repair and loads as before', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'loaders-')), 'matrice.xlsx')
  writeXlsx(path, [{
    name: 'Feuil1',
    columns: [{ header: 'Activité', width: 20 }, { header: 'R', width: 10 }, { header: 'A', width: 10 }],
    rows: Array.from({ length: 45 }, (_, i) => [`Activité ${i + 1}`, 'Atos', 'inwi']),
  }])
  assert.equal(relativizeRels(readFileSync(path)), null)
  const doc = await loadFile(path)
  // Short rows: blocks of 40 data rows under the single header row.
  assert.deepEqual(doc.sections.map(s => s.locator), ['onglet Feuil1, lignes 1–41', 'onglet Feuil1, lignes 42–46'])
  for (const s of chunkSections(doc.sections)) assert.equal(s.text.split('\n')[0], '1: Activité | R | A')
})

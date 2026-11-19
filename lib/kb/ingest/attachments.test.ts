import assert   from 'node:assert/strict'
import { test } from 'node:test'
import { attachmentFileName, safeName } from './attachments'

test('safeName removes path characters and reply prefixes, keeps accents', () => {
  assert.equal(safeName('RE: TR: Matrice / flux: été?'), 'Matrice flux été')
  assert.equal(safeName('a\\b\x07c'), 'a b c')
})

test('attachment file name carries the email date and subject', () => {
  const d = new Date('2026-10-20T09:35:09Z')
  assert.equal(attachmentFileName(d, 'RE: Synthèse catalogue', 'Catalogue_V2.XLSX'), '2026-10-20 - Synthèse catalogue - Catalogue_V2.xlsx')
  assert.equal(attachmentFileName(null, '', 'DAT.pdf'), 'sans-date - DAT.pdf')
})

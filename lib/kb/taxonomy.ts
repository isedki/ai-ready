import { existsSync, readFileSync } from 'node:fs'

export type Taxonomy = { domains: Record<string, string> }

export function loadTaxonomy(path = process.env.KB_TAXONOMY ?? 'config/kb-taxonomy.json'): Taxonomy {
  if (!existsSync(path)) throw new Error(`taxonomy file not found: ${path}`)
  const t = JSON.parse(readFileSync(path, 'utf8')) as Taxonomy
  if (!t.domains || Object.keys(t.domains).length === 0) throw new Error(`no domains in ${path}`)
  if (!('Other' in t.domains)) t.domains.Other = 'anything that fits nowhere else'
  return t
}

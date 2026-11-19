import { mkdirSync, writeFileSync } from 'node:fs'
import { join }                    from 'node:path'
import type { DB }                 from './db'
import { buildEntries, type Entry, type Person } from './directory'

const name = (p: Person) => p.name || p.addr
const withDept = (p: Person) => {
  const showDept = p.department && !p.department.toLowerCase().includes(name(p).toLowerCase())
  return `${name(p)}${showDept ? ` (${p.department})` : ''}`
}
const date = (d: string | null) => d?.slice(0, 10) ?? '?'
const csv = (s: string | number | null) => `"${String(s ?? '').replace(/"/g, '""')}"`

function entryMarkdown(e: Entry): string[] {
  const lines: string[] = []
  const to = e.email_to[0]
  const head = to
    ? `email **${withDept(to)}** \`${to.addr}\`${e.email_to.length > 1 ? `, or ${e.email_to.slice(1).map(p => `${name(p)} \`${p.addr}\``).join(', ')}` : ''}`
    : 'no clear contact yet'
  lines.push(`- **${e.title}** → ${head}`)
  const details: string[] = []
  if (e.approval.length) details.push(`Approval: ${e.approval.map(withDept).join(', ')}`)
  if (e.cc.length) details.push(`Cc: ${e.cc.map(name).join(', ')}`)
  if (e.channel && e.channel !== 'email') details.push(`Via: ${e.channel}`)
  if (details.length) lines.push(`  - ${details.join(' · ')}`)
  if (e.include.length) lines.push(`  - Include: ${e.include.map(n => n.text).join('; ')}`)
  for (const t of e.tips) lines.push(`  - Tip: ${t.text}`)
  if (e.previously.length) lines.push(`  - Previously handled by ${e.previously.map(p => `${name(p)} (until ${date(p.last)})`).join(', ')}`)
  lines.push(`  - *${e.confidence} confidence · ${e.thread_count} thread${e.thread_count === 1 ? '' : 's'} · last ${date(e.last_seen)}${e.example_subject ? ` · e.g. "${e.example_subject}"` : ''}*`)
  return lines
}

/** Write the routing directory: Markdown grouped by domain/subdomain, a CSV for Excel, a contact list and kb.json. */
export function renderAll(db: DB, outDir: string) {
  const entries = buildEntries(db)
  mkdirSync(outDir, { recursive: true })

  // Domains ordered by volume, subdomains alphabetically, entries by how often they occur.
  const domains = new Map<string, Map<string, Entry[]>>()
  for (const e of entries) {
    const subs = domains.get(e.domain) ?? new Map<string, Entry[]>()
    subs.set(e.subdomain, [...(subs.get(e.subdomain) ?? []), e])
    domains.set(e.domain, subs)
  }
  const volume = (subs: Map<string, Entry[]>) => [...subs.values()].flat().reduce((s, e) => s + e.thread_count, 0)
  const ordered = [...domains.entries()].sort((a, b) => volume(b[1]) - volume(a[1]))

  const md = ['# Who to ask for what', '', `*${entries.length} kinds of request learned from email. Generated ${date(new Date().toISOString())}.*`, '']
  md.push(...ordered.map(([d, subs]) => `- [${d}](#${d.toLowerCase().replace(/[^a-z0-9]+/g, '-')}) (${[...subs.values()].flat().length})`), '')
  for (const [d, subs] of ordered) {
    md.push(`## ${d}`, '')
    for (const [sub, list] of [...subs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      md.push(`### ${sub}`, '')
      for (const e of list.sort((a, b) => b.thread_count - a.thread_count)) md.push(...entryMarkdown(e))
      md.push('')
    }
  }
  writeFileSync(join(outDir, 'README.md'), md.join('\n'))

  const rows = [['Domain', 'Subdomain', 'Request', 'Email to', 'Address', 'Department', 'Approval', 'Cc', 'Via', 'Include', 'Threads', 'Last seen'].map(csv).join(',')]
  for (const e of entries) {
    const to = e.email_to[0]
    rows.push([e.domain, e.subdomain, e.title, to ? name(to) : '', to?.addr ?? '', to?.department ?? '',
      e.approval.map(withDept).join('; '), e.cc.map(p => p.addr).join('; '), e.channel ?? '',
      e.include.map(n => n.text).join('; '), e.thread_count, date(e.last_seen)].map(csv).join(','))
  }
  writeFileSync(join(outDir, 'directory.csv'), '﻿' + rows.join('\n') + '\n') // BOM so Excel reads UTF-8

  // People → what they handle, grouped by department.
  const byPerson = new Map<string, { p: Person; what: string[] }>()
  for (const e of entries) for (const p of e.email_to) {
    const cur = byPerson.get(p.addr) ?? { p, what: [] }
    cur.what.push(`${e.title} (${e.domain} › ${e.subdomain})`)
    byPerson.set(p.addr, cur)
  }
  const byDept = new Map<string, { p: Person; what: string[] }[]>()
  for (const x of byPerson.values()) {
    const d = x.p.department ?? 'Unknown department'
    byDept.set(d, [...(byDept.get(d) ?? []), x])
  }
  const contacts = ['# Contacts by department', '']
  for (const [d, list] of [...byDept.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    contacts.push(`## ${d}`, '')
    for (const { p, what } of list) contacts.push(`- **${name(p)}** \`${p.addr}\`: ${what.join('; ')}`)
    contacts.push('')
  }
  writeFileSync(join(outDir, 'contacts.md'), contacts.join('\n'))

  writeFileSync(join(outDir, 'kb.json'), JSON.stringify({ generated_at: new Date().toISOString(), entries }, null, 2))
  return { entries: entries.length, domains: domains.size }
}

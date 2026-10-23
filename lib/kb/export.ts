/** The mailbox as an Excel workbook: every email with what the analysis did with it, and every thread. */
import type { DB }       from './db'
import { writeXlsx }     from './xlsx'

const STATUS: Record<string, string> = {
  pending: 'À analyser', extracted: 'Analysé : demande trouvée', folded: 'Analysé : demande trouvée',
  irrelevant: 'Analysé : pas de demande', failed: 'Échec (à relancer)', skipped: 'Ignoré (vide ou trop court)',
}
const NOISE: Record<string, string> = { sender: 'expéditeur automatique', subject: 'invitation / réponse auto', newsletter: 'newsletter' }

type Addr = { addr: string; name?: string }   // threads store bare addresses, messages {addr, name}
const people = (json: string | null) => { try { return (JSON.parse(json || '[]') as (Addr | string)[]).map(p => typeof p === 'string' ? p : p.name ? `${p.name} <${p.addr}>` : p.addr).join('; ') } catch { return '' } }
const when = (d: string | null) => (d || '').replace('T', ' ').slice(0, 16)

export function exportEmails(db: DB, path: string) {
  // Entry titles per thread, following merges to the surviving entry.
  const entries = new Map((db.prepare('SELECT id, title, domain, merged_into FROM entries').all() as { id: string; title: string; domain: string; merged_into: string | null }[]).map(e => [e.id, e]))
  const live = (id: string) => { let e = entries.get(id); for (let i = 0; e?.merged_into && i < 20; i++) e = entries.get(e.merged_into); return e }
  const learned = new Map<string, Set<string>>()
  for (const r of db.prepare('SELECT entry_id, thread_id FROM entry_threads').all() as { entry_id: string; thread_id: string }[]) {
    const e = live(r.entry_id)
    if (e) learned.set(r.thread_id, (learned.get(r.thread_id) ?? new Set()).add(`${e.domain} › ${e.title}`))
  }

  const threads = db.prepare('SELECT id, subject, participants, first_date, last_date, message_count, status FROM threads ORDER BY first_date').all() as
    { id: string; subject: string; participants: string; first_date: string; last_date: string; message_count: number; status: string }[]
  const num = new Map(threads.map((t, i) => [t.id, `F${String(i + 1).padStart(4, '0')}`]))
  const status = new Map(threads.map(t => [t.id, t.status]))

  const msgs = db.prepare('SELECT thread_id, folder, subject, from_addr, from_name, to_addrs, cc_addrs, date, body_clean, is_noise, noise_reason FROM messages ORDER BY date').all() as
    { thread_id: string | null; folder: string; subject: string; from_addr: string; from_name: string; to_addrs: string; cc_addrs: string; date: string; body_clean: string; is_noise: number; noise_reason: string | null }[]

  writeXlsx(path, [
    { name: 'Emails',
      columns: [
        { header: 'Date', width: 17 }, { header: 'Dossier', width: 18 }, { header: 'De', width: 26 }, { header: 'Email expéditeur', width: 30 },
        { header: 'À', width: 40 }, { header: 'Cc', width: 30 }, { header: 'Objet', width: 50 }, { header: 'Statut', width: 26 },
        { header: 'Fil', width: 8 }, { header: 'Demandes apprises', width: 50 }, { header: 'Début du message (secrets retirés)', width: 70 },
      ],
      rows: msgs.map(m => {
        const st = m.is_noise ? `Ignoré : ${NOISE[m.noise_reason ?? ''] ?? m.noise_reason ?? 'bruit'}` : STATUS[status.get(m.thread_id ?? '') ?? ''] ?? 'Hors fil'
        return [when(m.date), m.folder, m.from_name, m.from_addr, people(m.to_addrs), people(m.cc_addrs), m.subject, st,
          num.get(m.thread_id ?? ''), [...(learned.get(m.thread_id ?? '') ?? [])].join(' ; '), (m.body_clean || '').replace(/\s+/g, ' ').slice(0, 300)]
      }) },
    { name: 'Fils',
      columns: [
        { header: 'Fil', width: 8 }, { header: 'Objet', width: 55 }, { header: 'Premier message', width: 17 }, { header: 'Dernier message', width: 17 },
        { header: 'Messages', width: 10 }, { header: 'Participants', width: 60 }, { header: 'Statut', width: 26 }, { header: 'Demandes apprises', width: 60 },
      ],
      rows: threads.map(t => [num.get(t.id), t.subject, when(t.first_date), when(t.last_date), t.message_count, people(t.participants),
        STATUS[t.status] ?? t.status, [...(learned.get(t.id) ?? [])].join(' ; ')]) },
  ])
  return { emails: msgs.length, threads: threads.length }
}

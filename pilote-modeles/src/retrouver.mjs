// Diagnostic : la recherche du pilote voit-elle un mail donné ? Affiche des faits, jamais d'objet ni de contenu.
import { api } from './google.mjs'
const mots = process.argv.slice(2).join(' ').trim()
if (!mots) { console.error('Usage : ./pilote.sh retrouver "mots de l\'objet ou expéditeur"'); process.exit(2) }
const q = encodeURIComponent
const cible = await api(`gmail.googleapis.com/gmail/v1/users/me/threads?q=${q(mots)}&maxResults=5`)
if (!cible.threads?.length) { console.log('Aucun fil ne correspond à ces mots dans Gmail (essaie d\'autres mots).'); process.exit(1) }
const pilote = await api(`gmail.googleapis.com/gmail/v1/users/me/threads?q=${q('newer_than:1d')}&maxResults=500`)
const ids = (pilote.threads || []).map((t) => t.id)
console.log(`Fils sur les dernières 24 h : ${ids.length} (le pilote n'en reçoit que 8 par recherche).`)
for (const t of cible.threads) {
  const f = await api(`gmail.googleapis.com/gmail/v1/users/me/threads/${t.id}?format=metadata&metadataHeaders=Date`)
  const m = f.messages[f.messages.length - 1]
  const rang = ids.indexOf(t.id)
  const etiq = [...new Set(f.messages.flatMap((x) => x.labelIds || []))].join(', ')
  console.log(`- fil ${t.id} : ${f.messages.length} message(s), dernier le ${new Date(+m.internalDate).toLocaleString('fr-FR')}, étiquettes : ${etiq}`)
  console.log(`  dans la recherche « newer_than:1d » : ${rang < 0 ? 'ABSENT (plus ancien que 24 h ?)' : `position ${rang + 1} sur ${ids.length}${rang >= 8 ? ' → HORS DES 8 PREMIERS, jamais vu par le modèle' : ' (dans les 8 premiers)'}`}`)
}

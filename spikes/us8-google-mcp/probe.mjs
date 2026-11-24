// Étape A (sans compte, sans secret) : que répondent les serveurs sans jeton ?
import { McpClient, SERVERS } from './lib.mjs'
for (const [nom, url] of Object.entries(SERVERS)) {
  const c = new McpClient(url, null)
  const t = await c.tools()
  const outils = t.result?.tools || []
  const lecture = outils.filter((o) => o.annotations?.readOnlyHint).length
  console.log(`${nom}: HTTP ${t.status}, ${outils.length} outils (${lecture} en lecture seule)`)
  console.log(`   ${outils.map((o) => o.name).join(', ')}`)
  if (!outils.length) console.log(`   réponse : ${t.error?.message || 'aucune liste'}`)
}

/**
 * Cheap local candidate retrieval (TF-IDF over procedure titles and step labels).
 * It only has to put the right procedure in the top few; the LLM makes the call.
 */

const STOP = new Set(('a an the of to for in on and or with by from at as is be new request requests ' +
  'le la les de des du un une et ou pour sur dans avec par au aux en demande').split(' '))

const SYNONYMS: Record<string, string> = {
  'virtual': 'vm', 'machine': 'vm', 'server': 'vm', 'serveur': 'vm', 'vms': 'vm',
  'flux': 'flow', 'flows': 'flow', 'firewall': 'flow', 'fw': 'flow', 'matrix': 'flow', 'opening': 'open', 'ouverture': 'open',
  'active': 'ad', 'directory': 'ad', 'ldap': 'ad', 'account': 'access', 'accounts': 'access', 'credentials': 'access', 'acces': 'access',
  'permission': 'access', 'permissions': 'access', 'rights': 'access', 'droits': 'access',
  'installation': 'install', 'installing': 'install', 'deployment': 'deploy', 'deploying': 'deploy', 'mep': 'deploy', 'release': 'deploy',
  'provisioning': 'provision', 'creation': 'create', 'creating': 'create',
  'preprod': 'preprod', 'pre-prod': 'preprod', 'production': 'prod', 'recette': 'uat', 'staging': 'preprod',
}

export function tokenize(text: string): string[] {
  return text.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9-]+/)
    .filter(t => t.length > 1 && !STOP.has(t))
    .map(t => SYNONYMS[t] ?? (t.length > 4 && t.endsWith('s') ? t.slice(0, -1) : t))
}

export type Doc = { id: string; text: string }

export class TfIdf {
  private vectors = new Map<string, Map<string, number>>()
  private idf = new Map<string, number>()

  constructor(docs: Doc[]) {
    const df = new Map<string, number>()
    const tfs = docs.map(d => {
      const tf = new Map<string, number>()
      for (const t of tokenize(d.text)) tf.set(t, (tf.get(t) ?? 0) + 1)
      for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1)
      return [d.id, tf] as const
    })
    const n = docs.length
    for (const [t, c] of df) this.idf.set(t, Math.log(1 + n / c))
    for (const [id, tf] of tfs) this.vectors.set(id, this.weigh(tf))
  }

  private weigh(tf: Map<string, number>): Map<string, number> {
    const v = new Map<string, number>()
    let norm = 0
    for (const [t, c] of tf) {
      const w = (1 + Math.log(c)) * (this.idf.get(t) ?? Math.log(2))
      v.set(t, w)
      norm += w * w
    }
    norm = Math.sqrt(norm) || 1
    for (const [t, w] of v) v.set(t, w / norm)
    return v
  }

  query(text: string, k = 5, minScore = 0.12): { id: string; score: number }[] {
    const tf = new Map<string, number>()
    for (const t of tokenize(text)) tf.set(t, (tf.get(t) ?? 0) + 1)
    const q = this.weigh(tf)
    const scores: { id: string; score: number }[] = []
    for (const [id, v] of this.vectors) {
      let s = 0
      for (const [t, w] of q) s += w * (v.get(t) ?? 0)
      if (s >= minScore) scores.push({ id, score: s })
    }
    return scores.sort((a, b) => b.score - a.score).slice(0, k)
  }
}

/** Token-overlap similarity for short labels (step names). */
export function labelSimilarity(a: string, b: string): number {
  const ta = new Set(tokenize(a)), tb = new Set(tokenize(b))
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / Math.min(ta.size, tb.size)
}

export function normalizeFact(text: string): string {
  return tokenize(text).sort().join(' ')
}

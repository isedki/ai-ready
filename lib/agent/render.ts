/**
 * Renders the scheduled-task prompts from the templates in agent/prompts and a project
 * configuration. Templates use {{a.b}} for values and {{> name}} to include
 * agent/prompts/_name.md. An unknown placeholder is an error, so a typo never ships
 * a prompt with a hole in it.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join }                     from 'node:path'
import type { AgentConfig }         from './config'

export type RenderedTask = {
  name:     string
  template: string
  cron:     string | null
  enabled:  boolean
  /** Model tier and the model it maps to. For a « persistante » task the session's own
   *  model applies (a task bound to a session cannot change it): `model` is then null. */
  modele:   'leger' | 'standard' | 'fort'
  session:  'persistante' | 'nouvelle'
  model:    string | null
  prompt:   string
}

const NC = '(non configuré)'
const bullets  = (xs: string[]) => xs.map(x => `- ${x}`).join('\n')
const numbered = (xs: string[]) => xs.map((x, i) => `${i + 1}. ${x}`).join('\n')

/** Values the templates can use, flattened from the configuration. */
export function context(cfg: AgentConfig, task?: AgentConfig['taches'][number]): Record<string, unknown> {
  const by = (mode: string) => cfg.personnes.filter(p => p.mode === mode)
  const me = by('moi')[0]
  const names = (mode: string) => by(mode).map(p => p.name).join(', ') || '(personne)'
  return {
    projet:   cfg.projet,
    moi:      { ...me, email: me.email ?? '(adresse non configurée)' },
    // Optional places render as « non configuré » so a smaller project can still use every template.
    stockage: {
      qui_contacter: NC, tableau_de_bord: NC, registre_risques: NC, fiche: NC,
      ...cfg.stockage,
      drive: { a_traiter: NC, traites: NC, base_de_connaissance: NC, conversations_observateur: NC, ...cfg.stockage.drive },
    },
    index:    { depuis: 'le début', ...cfg.index },
    task:     { name: task?.name ?? '', modele: task?.modele ?? 'fort', session: task?.session ?? 'persistante', ...(task?.params ?? {}) },
    modeles:  cfg.modeles,
    personnes: {
      predecesseur: names('predecesseur'),
      manager:      names('manager'),
      surveiller:   names('surveiller'),
      exclu:        names('exclu'),
      liste: cfg.personnes
        .filter(p => p.mode !== 'moi')
        .map(p => `- ${p.name} : ${p.role}${p.mode === 'surveiller' ? ' (à surveiller, pas de tâche)' : p.mode === 'exclu' ? ' (ne plus prendre en compte)' : ''}${p.aliases.length ? ` (dit aussi « ${p.aliases.join(' », « ')} »)` : ''}`)
        .join('\n'),
    },
    priorites: {
      liste:       numbered(cfg.priorites.ordre),
      validees_le: cfg.priorites.validees_le ?? 'non validées',
      validation:  cfg.priorites.validation,
    },
    regles: {
      interdits: bullets(cfg.regles.interdits),
      style:     bullets(cfg.regles.style),
      domaines:  Object.entries(cfg.regles.domaines).map(([k, v]) => `${k} = ${v}`).join(' ; '),
    },
    notifications: { seulement: cfg.notifications.seulement.join(', ') },
  }
}

function lookup(ctx: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), ctx)
}

export function renderTemplate(src: string, ctx: Record<string, unknown>, dir: string, seen: string[] = []): string {
  const withPartials = src.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, name: string) => {
    if (seen.includes(name)) throw new Error(`Inclusion circulaire : ${[...seen, name].join(' → ')}`)
    const file = join(dir, `_${name}.md`)
    if (!existsSync(file)) throw new Error(`Gabarit inclus introuvable : ${file}`)
    return renderTemplate(readFileSync(file, 'utf8').trim(), ctx, dir, [...seen, name])
  })
  return withPartials.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const v = lookup(ctx, path)
    if (v === undefined || v === null || typeof v === 'object') throw new Error(`Valeur inconnue dans le gabarit : {{${path}}}`)
    return String(v)
  })
}

export function renderTasks(cfg: AgentConfig, dir = 'agent/prompts'): RenderedTask[] {
  return cfg.taches.map(t => {
    const file = join(dir, `${t.template}.md`)
    if (!existsSync(file)) throw new Error(`Gabarit introuvable pour « ${t.name} » : ${file}`)
    const prompt = renderTemplate(readFileSync(file, 'utf8').trim(), context(cfg, t), dir)
    return {
      name: t.name, template: t.template, cron: t.cron ? `CRON_TZ=${cfg.projet.fuseau} ${t.cron}` : null, enabled: t.enabled,
      modele: t.modele, session: t.session, model: t.session === 'nouvelle' ? cfg.modeles[t.modele] : null, prompt,
    }
  })
}

/** Rules (agent/rules/*.md) → a knowledge-base pack the tasks read as `p-regles`. */
export function rulesPack(files: { name: string; text: string }[], date: string) {
  return {
    source: 'agent/rules (dépôt), généré par npm run agent -- rules-pack',
    created: date,
    chunks: files.map(f => {
      const title = (f.text.match(/^#\s+(.+)$/m)?.[1] ?? f.name).trim()
      return { id: `rg-${f.name}`, kind: 'regle', title: `Règles · ${title}`, source: `agent/rules/${f.name}.md`, date, text: f.text.replace(/^#\s+.+\n+/, '').trim() }
    }),
  }
}

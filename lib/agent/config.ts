/**
 * Configuration of the PMO agent: one JSON file per project (config/agent.<projet>.json).
 * Everything that used to be hard-coded in the scheduled-task prompts lives here: the
 * person served, people and their roles, priorities, what is only watched, where the
 * state is kept (artefacts, Drive folders), the time zone and the task schedule.
 */
import { readFileSync } from 'node:fs'
import { z }            from 'zod'

const Person = z.object({
  name:  z.string(),
  role:  z.string(),
  /** « moi » : the person served ; « predecesseur » : whose role was taken over ;
   *  « surveiller » : follow and learn, never a task ; « suivre » : normal follow-up. */
  mode:  z.enum(['moi', 'predecesseur', 'manager', 'suivre', 'surveiller', 'exclu']).default('suivre'),
  email: z.string().optional(),
  aliases: z.array(z.string()).default([]),
})

const Task = z.object({
  /** Template in agent/prompts/<template>.md */
  template: z.string(),
  name:     z.string(),
  /** 5-field cron in the project time zone, or null for a task created on demand. */
  cron:     z.string().nullable(),
  enabled:  z.boolean().default(true),
  /** Model tier of the task as a whole (see `modeles`). */
  modele:   z.enum(['leger', 'standard', 'fort']).default('fort'),
  /** « persistante » fires into the long-running session (its model is that session's
   *  model: light steps are delegated to a light sub-agent) ; « nouvelle » starts a fresh
   *  session per run, which can run on its own model tier. */
  session:  z.enum(['persistante', 'nouvelle']).default('persistante'),
  /** Free values given to the template as {{task.<key>}}. */
  params:   z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
})

export const AgentConfig = z.object({
  projet: z.object({
    nom:         z.string(),
    description: z.string(),
    langue:      z.string().default('fr'),
    fuseau:      z.string(),
    /** One line on the time zone that the prompts repeat (e.g. GMT, no offset in Gmail). */
    note_heure:  z.string().default(''),
  }),
  personnes: z.array(Person).min(1),
  priorites: z.object({
    /** Ordered list, validated by the person served. */
    ordre:     z.array(z.string()).min(1),
    validees_le: z.string().optional(),
    /** Who proposes and who validates the objectives of the day. */
    validation: z.string().default('Les objectifs du jour sont proposés, puis validés par la personne servie avant de devenir actifs.'),
  }),
  regles: z.object({
    interdits: z.array(z.string()).default([]),
    style:     z.array(z.string()).default([]),
    /** Domains of the integrator / external partners, used for the address rule. */
    domaines:  z.record(z.string(), z.string()).default({}),
  }),
  stockage: z.object({
    /** Artefact holding the tracker (collections actions, paths, jour…). */
    suivi:      z.string().url(),
    /** Artefact holding the knowledge base (collection kb: rules, directory, packs). */
    copilote:   z.string().url(),
    qui_contacter: z.string().url().optional(),
    tableau_de_bord: z.string().url().optional(),
    registre_risques: z.string().url().optional(),
    fiche:      z.string().url().optional(),
    drive: z.object({
      a_traiter: z.string().optional(),
      traites:   z.string().optional(),
      base_de_connaissance: z.string().optional(),
    }).default({}),
  }),
  index: z.object({
    /** Local Copilote base used by every task (see docs/agent.md). */
    db:       z.string().default('data/copilote.sqlite'),
    /** Folder where the kb export and documents are written before ingestion. */
    corpus:   z.string().default('data/corpus'),
    /** Gmail query that selects the project's threads. */
    gmail:    z.string(),
    depuis:   z.string().optional(),
  }),
  /** Model per tier. Light: sorting, extraction, indexing. Standard: summaries, capsules.
   *  Strong: decisions, drafts, the day's review. */
  modeles: z.object({
    leger:    z.string().default('claude-haiku-5-5'),
    standard: z.string().default('claude-sonnet-5-5'),
    fort:     z.string().default('claude-opus-5-5'),
    /** Short name the Agent tool takes for a light sub-agent. */
    sous_agent_leger: z.string().default('haiku'),
  }).default({ leger: 'claude-haiku-5-5', standard: 'claude-sonnet-5-5', fort: 'claude-opus-5-5', sous_agent_leger: 'haiku' }),
  notifications: z.object({
    /** When a task may notify the phone. Everything else stays silent. */
    seulement: z.array(z.string()).default(['urgence', 'escalade à décider', 'imputation nouvelle']),
  }).default({ seulement: ['urgence', 'escalade à décider', 'imputation nouvelle'] }),
  taches: z.array(Task).min(1),
})

export type AgentConfig = z.infer<typeof AgentConfig>

export function loadConfig(path: string): AgentConfig {
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  const res = AgentConfig.safeParse(raw)
  if (!res.success) {
    const lines = res.error.issues.map(i => `  ${i.path.join('.') || '(racine)'} : ${i.message}`)
    throw new Error(`Configuration invalide (${path}) :\n${lines.join('\n')}`)
  }
  const me = res.data.personnes.filter(p => p.mode === 'moi')
  if (me.length !== 1) throw new Error(`Configuration invalide (${path}) : il faut exactement une personne en mode « moi » (trouvé ${me.length}).`)
  return res.data
}

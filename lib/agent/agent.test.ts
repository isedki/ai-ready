import { strict as assert }                        from 'node:assert'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir }                                  from 'node:os'
import { join }                                    from 'node:path'
import { test }                                    from 'node:test'
import { loadConfig }                              from './config'
import { buildPacks, directoryChunks, docChunks, kbChunks } from './corpus'
import { context, renderTasks, renderTemplate, rulesPack } from './render'

const tmp = () => mkdtempSync(join(tmpdir(), 'agent-'))

test('both shipped configurations are valid and render every task', () => {
  for (const p of ['phenix', 'exemple']) {
    const cfg = loadConfig(`agent/projects/${p}/config.json`)
    const tasks = renderTasks(cfg)
    assert.equal(tasks.length, cfg.taches.length)
    for (const t of tasks) {
      assert.doesNotMatch(t.prompt, /\{\{/, `${p} · ${t.name} : placeholder left`)
      if (t.cron) assert.match(t.cron, new RegExp(`^CRON_TZ=${cfg.projet.fuseau} `))
    }
  }
})

test('the people to watch are named in every task that loads the common rules', () => {
  const cfg = loadConfig('agent/projects/phenix/config.json')
  const matin = renderTasks(cfg).find(t => t.template === 'matin')!
  assert.match(matin.prompt, /El Mehdi Yagoubi, Badr Wahby/)
  assert.match(matin.prompt, /1\. CreditSet/)
  assert.match(matin.prompt, /ne plus prendre en compte\)/)
})

test('each step runs on the right model: fresh sessions carry their model, the main session keeps its own', () => {
  const cfg = loadConfig('agent/projects/phenix/config.json')
  const tasks = renderTasks(cfg)
  const by = (tpl: string) => tasks.find(t => t.template === tpl)!
  assert.equal(by('indexation').model, 'claude-haiku-5-5')
  assert.equal(by('indexation').session, 'nouvelle')
  assert.match(by('indexation').prompt, /NOUVELLE SESSION/)
  assert.equal(by('tram').model, 'claude-sonnet-5-5')
  for (const t of tasks.filter(t => t.session === 'persistante')) assert.equal(t.model, null, t.name)
  // Light steps inside a strong task go to a light sub-agent.
  assert.match(by('veille').prompt, /model « haiku »/)
  assert.match(by('bilan').prompt, /niveau « fort »/)
})

test('an unknown placeholder or a missing partial is an error', () => {
  const dir = tmp()
  assert.throws(() => renderTemplate('{{projet.inconnu}}', { projet: {} }, dir), /Valeur inconnue/)
  assert.throws(() => renderTemplate('{{> absent}}', {}, dir), /introuvable/)
  writeFileSync(join(dir, '_a.md'), '{{> a}}')
  assert.throws(() => renderTemplate('{{> a}}', {}, dir), /circulaire/)
})

test('a configuration needs exactly one person served', () => {
  const dir = tmp()
  const cfg = JSON.parse(readFileSync('agent/projects/exemple/config.json', 'utf8'))
  cfg.personnes = cfg.personnes.map((p: { mode: string }) => ({ ...p, mode: 'suivre' }))
  writeFileSync(join(dir, 'c.json'), JSON.stringify(cfg))
  assert.throws(() => loadConfig(join(dir, 'c.json')), /exactement une personne/)
})

test('optional places render as not configured', () => {
  const cfg = loadConfig('agent/projects/exemple/config.json')
  const ctx = context(cfg) as { stockage: { fiche: string; drive: { a_traiter: string } } }
  assert.equal(ctx.stockage.fiche, '(non configuré)')
  assert.equal(ctx.stockage.drive.a_traiter, '(non configuré)')
})

test('rules become a knowledge-base pack, title taken from the heading', () => {
  const pack = rulesPack([{ name: '01-interdits', text: '# Interdits\n\nRien envoyer.\n' }], '2026-11-19')
  assert.deepEqual(pack.chunks[0], { id: 'rg-01-interdits', kind: 'regle', title: 'Règles · Interdits', source: 'agent/rules/01-interdits.md', date: '2026-11-19', text: 'Rien envoyer.' })
})

test('artefact exports become packs, wrapped in {data} or not', () => {
  assert.equal(kbChunks({ data: { chunks: [{ id: 'x', text: 'a' }, { text: '' }] } }).length, 1)
  assert.equal(kbChunks({ chunks: [{ id: 'x', kind: 'email', text: 'a' }] })[0].kind, 'email')
  assert.equal(docChunks('d1', { data: { name: 'DAT', at: '2026-11-16T10:00:00Z', notes: { summary: 's' } } })[0].date, '2026-11-16')
  assert.equal(directoryChunks('c0', { entries: [{ domain: 'Network', subdomain: 'Flux' }] })[0].title, 'Qui contacter · Network · Flux')

  const raw = tmp(), out = join(tmp(), 'packs')
  mkdirSync(join(raw, 'kb')); mkdirSync(join(raw, 'docs'))
  writeFileSync(join(raw, 'kb', 'p1.json'), JSON.stringify({ data: { chunks: [{ id: 'a', text: 't' }, { id: 'b', text: 'u' }] } }))
  writeFileSync(join(raw, 'docs', 'd.json'), JSON.stringify({ name: 'DAT', notes: 'n' }))
  assert.deepEqual(buildPacks(raw, out), { files: 2, chunks: 3 })
  assert.equal(JSON.parse(readFileSync(join(out, 'kb-p1.json'), 'utf8')).chunks.length, 2)
})

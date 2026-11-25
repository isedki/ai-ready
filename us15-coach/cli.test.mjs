// Tests du CLI US-15 : codes de sortie et refus. Rien n'est écrit hors du dossier temporaire du test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const CLI = join(dirname(fileURLToPath(import.meta.url)), 'plan.mjs');
const dir = mkdtempSync(join(tmpdir(), 'us15-'));
const run = (cmd, obj, extra = []) => { const f = join(dir, cmd + '.json'); writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj)); const r = spawnSync('node', [CLI, cmd, f, ...extra], { encoding: 'utf8' }); return { code: r.status, out: r.stdout, err: r.stderr }; };
const base = { to: ['moi@example.test'], cc: [], bcc: [], subject: 'Plan du jour 2026-11-25', day: '2026-11-25', self: 'moi@example.test', sent: [] };
test('CLI : entrée JSON illisible = code 2, aucun envoi autorisé', () => { const r = run('check-send', '{pas du json'); assert.equal(r.code, 2); assert.match(r.err, /entrée illisible/); });
test('CLI : destinataire différent = code 3 et refus nommé', () => { const r = run('check-send', { ...base, to: ['autre@example.test'] }); assert.equal(r.code, 3); assert.equal(JSON.parse(r.out).code, 'dest_different'); });
test('CLI : plan déjà envoyé = code 3 « deja_envoye » ; sinon code 0', () => {
  assert.equal(JSON.parse(run('check-send', { ...base, sent: [{ subject: base.subject, to: base.to, date: '2026-11-25T08:01:00Z' }] }).out).code, 'deja_envoye');
  assert.equal(run('check-send', base).code, 0);
});
test('CLI : commande inconnue = code 2', () => assert.equal(run('danser', {}).code, 2));
test('CLI : plan sans source = validate code 3', () => {
  const r = run('validate', { day: '2026-11-25', plan: { jour: '2026-11-25', priorites: [{ id: 'P1', titre: 't', raison: 'r', sources: [] }, { id: 'P2', titre: 't', raison: 'r', sources: [] }, { id: 'P3', titre: 't', raison: 'r', sources: [] }] } });
  assert.equal(r.code, 3); assert.match(r.out, /aucune source/);
});
test('CLI : unpack refuse une empreinte différente et un nom de fichier dangereux, n\'écrit rien de faux', () => {
  const ok = 'console.log(1)'; const files = { 'a.js': { contenu: ok, sha256: createHash('sha256').update(ok).digest('hex') }, 'b.js': { contenu: 'x', sha256: '00' }, '../evil.js': { contenu: 'y', sha256: createHash('sha256').update('y').digest('hex') } };
  const o = join(dir, 'unpacked'); const r = run('unpack', { files }, ['--out', o]); assert.equal(r.code, 3); assert.match(r.out, /b\.js : empreinte différente/); assert.match(r.out, /evil\.js : nom refusé/);
  assert.equal(readFileSync(join(o, 'a.js'), 'utf8'), ok);
});

// Exécute le script complet de la page (avec le bloc Plan du jour) sur un DOM minimal et une base simulée, puis clique les verdicts.
// Usage : node us15-coach/page-harness.mjs <page.html> [plan.json]   (plan.json : document plans/pl-<jour> ; sans lui, base vide)
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const [, , file, planFile] = process.argv;
const html = readFileSync(file, 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
function el(tag) { const e = { tag, id: '', className: '', children: [], attrs: {}, style: {}, listeners: {}, hidden: false, value: '', disabled: false, dataset: {}, _t: '', options: [],
  set textContent(v) { this._t = String(v); this.children = []; }, get textContent() { return this._t + this.children.map((c) => c.textContent).join(''); },
  set innerHTML(v) { this._t = ''; this.children = []; }, get innerHTML() { return ''; },
  appendChild(c) { if (c) this.children.push(c); return c; }, append(...cs) { cs.forEach((c) => this.appendChild(c)); }, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
  addEventListener(ev, f) { (this.listeners[ev] = this.listeners[ev] || []).push(f); }, querySelector() { return el('x'); }, querySelectorAll() { return []; }, focus() {}, click() {}, remove() {}, scrollIntoView() {}, requestSubmit() {}, classList: { add() {}, remove() {} } }; return e; }
const byId = {}; const document = { hidden: false, activeElement: null, getElementById: (id) => (byId[id] = byId[id] || Object.assign(el('div'), { id })), createElement: el, createTextNode: (t) => ({ textContent: String(t), children: [] }), querySelectorAll: () => [], addEventListener() {}, body: el('body') };
['viewL'].forEach((i) => { document.getElementById(i).hidden = true; });
const day = new Date().toISOString().slice(0, 10);
const writes = [];
const store = { plans: planFile ? [{ id: 'pl-' + day, data: JSON.parse(readFileSync(planFile, 'utf8')) }] : [], verdicts: [], agents: [] };
const db = { collection: (name) => { const q = { where: () => q, onSnapshot: (ok) => ok({ docs: (store[name] || []).map((d) => ({ id: d.id, data: () => d.data })) }), doc: (id) => ({ set: async (d) => { writes.push({ coll: name, id, data: d }); }, update: async () => {}, delete: async () => {} }) }; return q; } };
const ctx = { document, window: {}, navigator: { clipboard: { writeText: async () => {} } }, localStorage: { getItem: () => null, setItem() {} }, setTimeout, setInterval: () => 0, clearTimeout, console, Date, claude: { use: async (n) => (n === 'db' ? db : n === 'user' ? { can: async () => true } : null) }, URL, Promise };
ctx.window = ctx; vm.createContext(ctx);
const errs = []; process.on('unhandledRejection', (e) => errs.push(String(e)));
for (const s of scripts) { try { vm.runInContext(s, ctx); } catch (e) { errs.push('script : ' + e.stack.split('\n').slice(0, 4).join(' | ')); } }
await new Promise((r) => setTimeout(r, 80));
const walk = (n, f) => { f(n); (n.children || []).forEach((c) => walk(c, f)); };
const root = document.getElementById('plMount');
const out1 = root.textContent;
// clique : P1 « bonne », puis P2 « mauvaise » sans phrase (refus attendu), puis avec phrase, puis « manquante » sans phrase
const buttons = []; walk(root, (n) => { if (n.tag === 'button') buttons.push(n); });
const inputs = []; walk(root, (n) => { if (n.tag === 'input') inputs.push(n); });
const click = async (b) => { for (const f of b.listeners.click || []) await f(); await new Promise((r) => setTimeout(r, 20)); };
let refus = null;
if (buttons.length) {
  await click(buttons[0]);                                 // P1 bonne
  await click(buttons[3]);                                 // P2 mauvaise sans phrase
  const errNodes = []; walk(document.getElementById('plMount'), (n) => { if (n.className === 'pl-err' && n.textContent) errNodes.push(n.textContent); }); refus = errNodes;
}
console.log(JSON.stringify({ erreurs: errs, rendu: out1.slice(0, 1500), nBoutons: buttons.length, ecritures: writes, refus_sans_phrase: refus }, null, 1));

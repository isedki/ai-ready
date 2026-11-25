// Exécute le script complet de la page publiée avec un DOM minimal et une base simulée (données réelles exportées ou vides).
// Usage : node page-harness.mjs <page.html> <dossier-données|vide>
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import vm from 'node:vm';
const [, , file, dataDir] = process.argv;
const html = readFileSync(file, 'utf8');
const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].filter((m) => !/type="application\/json"/.test(m[1])).map((m) => m[2]);
const jsonBlocks = Object.fromEntries([...html.matchAll(/<script id="([^"]+)"[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => [m[1], m[2]]));
function el(tag) { const e = { tag, id: '', className: '', children: [], attrs: {}, style: {}, listeners: {}, hidden: false, value: '', disabled: false, dataset: {}, _t: '', options: [],
  set textContent(v) { this._t = String(v); this.children = []; this.options = []; }, get textContent() { return this._t + this.children.map((c) => c.textContent).join(''); },
  set innerHTML(v) { this._t = ''; this.children = []; }, get innerHTML() { return ''; },
  appendChild(c) { if (!c) return c; this.children.push(c); if (c.tag === 'option') this.options.push(c); return c; }, append(...cs) { cs.forEach((c) => this.appendChild(c)); }, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
  addEventListener(ev, f) { (this.listeners[ev] = this.listeners[ev] || []).push(f); }, querySelector() { return el('x'); }, querySelectorAll() { return []; }, focus() {}, click() {}, remove() {}, scrollIntoView() {}, requestSubmit() {}, classList: { add() {}, remove() {} }, open: false }; return e; }
const byId = {}; const document = { hidden: false, activeElement: null, getElementById: (id) => (byId[id] = byId[id] || Object.assign(el('div'), { id }, jsonBlocks[id] ? { _t: jsonBlocks[id] } : {})), createElement: el, createTextNode: (t) => ({ textContent: String(t), children: [] }), querySelectorAll: () => [], addEventListener() {}, body: el('body') };
['viewL'].forEach((i) => { document.getElementById(i).hidden = true; });
const read = (c) => { const d = `${dataDir}/${c}`; if (dataDir === 'vide' || !existsSync(d)) return []; return readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => ({ id: f.slice(0, -5), data: ((x) => (x && typeof x === 'object' && 'data' in x && 'version' in x ? x.data : x))(JSON.parse(readFileSync(`${d}/${f}`, 'utf8'))) })); };
const fail = process.env.FAIL_COLL;
const db = { collection: (name) => { const q = { where: () => q, onSnapshot: (ok, ko) => { if (name === fail) { ko({ code: 'permission-denied', message: 'lecture refusée (test)' }); return; } const docs = (name === 'livrables' && process.env.LIV ? JSON.parse(process.env.LIV) : read(name)).map((d) => ({ id: d.id, data: () => d.data })); ok({ docs }); }, doc: () => ({ set: async () => {}, update: async () => {}, delete: async () => {} }) }; return q; } };
const ctx = { document, window: {}, navigator: { clipboard: { writeText: async () => {} } }, localStorage: { getItem: () => null, setItem() {} }, setTimeout, setInterval: () => 0, clearTimeout, console, Date, claude: { use: async (n) => (n === 'db' ? db : n === 'user' ? { can: async () => true } : null) }, URL, Promise };
ctx.window = ctx; vm.createContext(ctx);
const errs = []; process.on('unhandledRejection', (e) => errs.push(String(e)));
for (const s of scripts) { try { vm.runInContext(s, ctx); } catch (e) { errs.push('script : ' + e.stack.split('\n').slice(0,4).join(' | ')); } }
await new Promise((r) => setTimeout(r, 50));
// ouvre l'onglet Activité
const tab = document.getElementById('tabL'); document.getElementById('viewL').hidden = false;
(document.getElementById('tabL').listeners.click || []).forEach((f) => f());
await new Promise((r) => setTimeout(r, 50));
const out = document.getElementById('acMount').textContent;
console.log(JSON.stringify({ erreurs: errs, longueur: out.length, extrait: out.slice(0, +(process.env.LEN || 1400)) }, null, 1));

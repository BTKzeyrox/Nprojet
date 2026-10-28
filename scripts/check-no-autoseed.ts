// Contrôle : une liste de missions VIDE reste vide (M18.2). Avant, le site recréait les 10 missions d'exemple à chaque connexion de l'admin.
// Lancer : npm run check:no-autoseed
const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => (k in mem ? mem[k] : null), setItem: (k: string, v: string) => { mem[k] = String(v); }, removeItem: (k: string) => { delete mem[k]; } };
g.sessionStorage = g.localStorage; g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
Object.defineProperty(g, 'navigator', { value: { onLine: true }, configurable: true });
const { AppStore } = await import('../src/db/store');
const { memoryKV } = await import('../src/utils/offlineVault');
import { readFileSync } from 'node:fs';

let fails = 0, n = 0;
const ok = (c: boolean, name: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };
const tick = (ms = 60) => new Promise(r => setTimeout(r, ms));

const sent: any[] = [];
const server = { contracts: [] as any[] };
const admin = { id: 'ad', name: 'Chef', username: 'chef', role: 'admin', status: 'active' };
g.fetch = async (url: string, init?: any) => {
  const route = (String(url).split('/df-api/')[1] || '').split('?')[0];
  const body = init?.body ? JSON.parse(init.body) : {};
  const json = (status: number, data: any) => ({ ok: status < 400, status, json: async () => data });
  if (route === 'login') return json(200, { token: 'T', user: admin });
  if (route === 'state') return json(200, { collections: { users: { ids: ['ad'], changed: [admin] }, contracts: { ids: server.contracts.map(c => c.id), changed: server.contracts } }, serverTime: new Date().toISOString(), me: admin });
  if (route === 'sync') { sent.push(body.changes); for (const ch of Object.values<any>(body.changes)) void ch; return json(200, { ok: true, rejected: [] }); }
  return json(200, { ok: true });
};
const s = new AppStore({ offlineKV: memoryKV(), offlineDelayMs: 0 });
await s.whenReady();
await s.login('chef', 'x');
await tick(300);
ok(s.getContracts().length === 0, 'l\'admin se connecte sur une liste de missions vide : elle reste vide');
ok(!sent.some(c => c && c.contracts && (c.contracts.upserts || []).length > 0), 'rien n\'est envoyé au serveur pour les missions');
ok(s.getUnsent(true).items.filter(i => i.col === 'contracts').length === 0, 'aucune mission « en attente d\'envoi »');
await s.refreshNow?.();
await tick(100);
ok(s.getContracts().length === 0, 'même après un rafraîchissement : toujours vide');

// le site ne contient plus le remplissage automatique ni le compteur fixe
const store = readFileSync('src/db/store.ts', 'utf8');
ok(!/AVAILABLE_CLIENT_CONTRACTS/.test(store) && !/l'admin remplit les 20 missions/.test(store), 'store.ts : plus de remplissage automatique');
const emp = readFileSync('src/views/employee/EmployeeDashboard.tsx', 'utf8');
ok(!/AVAILABLE_CLIENT_CONTRACTS/.test(emp) && /Missions disponibles \(\{db\.getContracts\(\)\.length\}\)/.test(emp), 'opérateur : « Missions disponibles » compte les vraies missions (plus un nombre fixe)');
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);

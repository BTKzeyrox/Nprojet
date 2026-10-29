// Contrôle de la carte « Ma façon de travailler » (module 19, M19.5), rendue en français et en anglais. Lancer : npm run check:work-mode-ui
import React from 'react';
import { renderToString } from 'react-dom/server';
const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => (k in mem ? mem[k] : null), setItem: (k: string, v: string) => { mem[k] = String(v); }, removeItem: (k: string) => { delete mem[k]; } };
g.sessionStorage = g.localStorage; g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
Object.defineProperty(g, 'navigator', { value: { onLine: true }, configurable: true });
const { db } = await import('../src/db/store');
const W = await import('../src/utils/workMode');
const { AppProvider } = await import('../src/context/AppContext');
const { WorkModeCard } = await import('../src/components/WorkModeCard');

let fails = 0, n = 0;
const ok = (c: boolean, name: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };
const bad = (h: string) => /NaN|Infinity|undefined|\[object/.test(h);
const render = (lang: string, el: React.ReactElement) => { mem['delta_lang'] = lang; return renderToString(<AppProvider>{el}</AppProvider>).replace(/<!-- -->/g, '').replace(/&#x27;/g, "'"); };

db.enterDemo('employee');
const emp = db.getCurrentUser()!;
const contract = db.getContracts().find(c => c.post_type)!;
const open = db.getPosts().find(p => p.employee_id === emp.id && ['pending_start', 'active', 'pending_end'].includes(p.status));
if (open) db.forceReleasePost(open.id, 'essai');
const card = (lang: 'fr' | 'en') => render(lang, <WorkModeCard uid={emp.id} lang={lang} today="2026-10-28" onMerge={() => {}} onOpen={() => {}} />);

for (const lang of ['fr', 'en'] as const) {
  const L = (fr: string, en: string) => (lang === 'en' ? en : fr);
  W.setWorkMode(emp.id, 'site');
  let h = card(lang);
  ok(!bad(h) && h.includes('data-testid="work-mode-card"') && h.includes(L('Ma façon de travailler', 'My way of working')), `${lang} : la carte s'affiche`);
  ok(h.includes(L('Sur le site', 'On the site')) && h.includes(L('Excel externe', 'External Excel')), `${lang} : les deux choix`);
  ok(h.includes('aria-pressed="true"') && h.indexOf('work-mode-site') < h.indexOf('aria-pressed="true"') + 400, `${lang} : « Sur le site » est le choix par défaut`);
  ok(!h.includes('mission-without-sheet') && !h.includes(L('Modèle Excel à remplir', 'Excel model to fill')), `${lang} : sur le site et sans mission en attente : aucun bouton Excel`);
  ok(!h.includes(L('dès que tu démarres', 'as soon as you start')), `${lang} : pas de consigne Excel quand on travaille sur le site`);

  W.setWorkMode(emp.id, 'excel');
  h = card(lang);
  ok(h.includes(L('dès que tu démarres une mission', 'as soon as you start a mission')), `${lang} : Excel externe sans mission : explication`);
  const r = db.startPost({ employeeId: emp.id, clientName: contract.client_name, accountTag: contract.account_tag, targetScore: contract.target_score, initialScore: 0, postNumber: contract.post_number, shiftType: 'day', status: 'pending_start' });
  await new Promise(res => setTimeout(res, 5));
  h = card(lang);
  ok(r.success && h.includes('mission-without-sheet'), `${lang} : la mission démarrée apparaît, sans tableau`);
  ok(h.includes(L('Modèle Excel à remplir', 'Excel model to fill')) && h.includes(L('Remettre mon fichier', 'Hand in my file')) && h.includes(L('Travailler sur le site', 'Work on the site')), `${lang} : modèle Excel, remettre mon fichier, travailler sur le site`);
  ok(h.includes(contract.client_name) && h.includes(L('(Excel externe)', '(external Excel)')) && !bad(h), `${lang} : la mission est nommée (client) et marquée Excel externe`);
  ok(!h.includes(L('dès que tu démarres', 'as soon as you start')), `${lang} : avec une mission en attente, plus d'explication vide`);
  db.prepareMissionSheetNow(r.post!.id);
  h = card(lang);
  ok(!h.includes('mission-without-sheet'), `${lang} : une fois son tableau préparé, la mission quitte la liste`);
  const o = db.getPosts().find(p => p.employee_id === emp.id && ['pending_start', 'active', 'pending_end'].includes(p.status)); if (o) db.forceReleasePost(o.id, 'essai');
  await new Promise(res => setTimeout(res, 5));
}
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);

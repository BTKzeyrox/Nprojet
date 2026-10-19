// Essai de rendu de la page Statistiques (sans écran) : démo admin, 4 périodes × 2 langues, aucune erreur ni « NaN ».
// Lancer : npm run check:page
import React from 'react';
import { renderToString } from 'react-dom/server';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
let calls = 0; g.fetch = async () => { calls++; throw new Error('RESEAU'); };

const { db } = await import('../src/db/store');
const { StatsPage } = await import('../src/views/admin/StatsPage');
const { AppProvider } = await import('../src/context/AppContext');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const bad = (html: string) => /NaN|Infinity|undefined|\[object/.test(html);

db.enterDemo('admin');
for (const lang of ['fr', 'en']) {
  for (const gran of ['day', 'week', 'month', 'year']) {
    mem['stats_gran'] = gran; mem['delta_lang'] = lang;
    let html = '';
    try { html = renderToString(<AppProvider><StatsPage onNavigate={() => {}} onOpenEmployee={() => {}} /></AppProvider>); } catch (e) { console.log(String(e)); }
    ok(html.length > 2000 && !bad(html), `${lang} / ${gran} : la page s'affiche sans erreur (${html.length} caractères)`);
    ok(html.includes(lang === 'en' ? 'Missions done' : 'Missions faites'), `${lang} / ${gran} : titre des missions dans la bonne langue`);
  }
}
db.enterDemo('employee');
mem['stats_gran'] = 'month'; mem['delta_lang'] = 'fr';
ok(renderToString(<AppProvider><StatsPage /></AppProvider>) === '', 'un opérateur ne voit rien (page réservée à l\'admin)');
ok(calls === 0, `aucun appel réseau (${calls})`);
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);

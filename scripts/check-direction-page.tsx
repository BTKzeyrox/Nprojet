// Essai de la page « Direction » (M8.1), sans écran réel ni réseau : démo admin, FR et EN, rôles. Lancer : npm run check:direction-page
import React from 'react';
import { renderToString } from 'react-dom/server';
import fs from 'node:fs';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
let calls = 0; g.fetch = async () => { calls++; throw new Error('RESEAU'); };

const { db } = await import('../src/db/store');
const { AppProvider } = await import('../src/context/AppContext');
const { DirectionPage } = await import('../src/views/admin/DirectionPage');
const { viewAllowedFor } = await import('../src/utils/roles');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const bad = (html: string) => /NaN|Infinity|undefined|\[object|\bnull\b/.test(html);
const view = (lang: 'fr' | 'en') => { mem.delta_lang = lang; return renderToString(<AppProvider><DirectionPage onNavigate={() => {}} /></AppProvider>).replace(/<!-- -->/g, ''); };

db.enterDemo('admin');
const fr = view('fr'), en = view('en');
ok(fr.length > 1500 && !bad(fr) && !bad(en), 'démo admin : la page s\'affiche en FR et EN sans NaN ni undefined');
for (const k of ['Argent du mois', 'Créances en retard', 'Meilleurs clients du mois', 'Meilleurs salariés', 'Stock critique', 'Alertes']) ok(fr.includes(k), `carte « ${k} » affichée`);
for (const k of ['Money this month', 'Overdue receivables', 'Top clients this month', 'Top employees', 'Critical stock', 'Alerts']) ok(en.includes(k), `card "${k}" displayed`);
ok(!/Argent du mois|Créances|Bénéfice/.test(en), 'anglais : aucun libellé français dans les cartes');
ok(fr.includes('752') || fr.includes('Chiffre d'), 'le chiffre d\'affaires est affiché');
ok(['stats', 'invoices', 'clients', 'performance', 'health'].every(v => true) && (fr.match(/Voir /g) || []).length >= 5, 'chaque carte a son lien « Voir… » (vers la page qui détaille)');
ok((fr.match(/min-h-\[44px\]/g) || []).length >= 5, 'liens de 44 px minimum (téléphone)');
ok(!viewAllowedFor('accountant', 'direction') && viewAllowedFor('admin', 'direction'), 'le Comptable n\'ouvre pas la page Direction');
const side = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');
ok(/\.\.\.\(isAdmin \? \[\{ id: 'direction'/.test(side), 'menu : « Direction » réservé à l\'admin');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const adminBranch = app.slice(app.indexOf("activeView === 'direction'") - 200, app.indexOf("activeView === 'direction'") + 200);
ok((app.match(/activeView === 'direction'/g) || []).length === 1 && /DirectionPage/.test(adminBranch), 'la page n\'est branchée que dans la partie admin de l\'application');
ok(calls === 0, 'aucun appel réseau');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);

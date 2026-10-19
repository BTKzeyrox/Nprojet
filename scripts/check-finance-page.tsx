// Essai de l'onglet Finances (sans écran, sans réseau) : démo admin, ajout / modification / suppression, rendu FR et EN.
// Lancer : npm run check:finance-page
import React from 'react';
import { renderToString } from 'react-dom/server';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
let calls = 0; g.fetch = async () => { calls++; throw new Error('RESEAU'); };

const { db } = await import('../src/db/store');
const { FinanceTab } = await import('../src/views/admin/FinanceTab');
const { todayMada } = await import('../src/utils/stats');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const bad = (html: string) => /NaN|Infinity|undefined|\[object/.test(html);
const today = todayMada();
const range = { start: `${today.slice(0, 7)}-01`, end: `${today.slice(0, 7)}-31` };
const view = (lang: 'fr' | 'en', salariesAr = 0, advancesAr = 0, r = range) => renderToString(<FinanceTab range={r} lang={lang} salariesAr={salariesAr} advancesAr={advancesAr} />);

db.enterDemo('admin');
const before = db.getCash().length;
ok(before === 0, 'départ : aucune ligne d\'argent');
const empty = view('fr');
ok(!bad(empty) && empty.includes('Aucune ligne sur cette période.'), 'liste vide : message clair, sans erreur');

const a = db.addCash({ kind: 'in', category: 'Paiement client', amount: '150 000', date: today, client_name: 'Client Test', note: 'Essai' });
const b = db.addCash({ kind: 'out', category: 'Loyer', amount: 40000, date: today });
ok(a.success && b.success && db.getCash().length === 2, 'ajout d\'un paiement et d\'une dépense');
ok(!db.addCash({ kind: 'in', category: 'Paiement client', amount: 0, date: today }).success && db.getCash().length === 2, 'montant 0 refusé, rien d\'ajouté');
ok(db.addCash({ kind: 'in', category: 'Paiement client', amount: 5, date: '2026-13-40' }).error === 'date', 'date fausse : code d\'erreur « date »');

for (const lang of ['fr', 'en'] as const) {
  const html = view(lang, 60000, 20000);
  ok(!bad(html), `${lang} : aucun NaN ni « undefined »`);
  ok(html.includes(lang === 'en' ? 'Money received' : 'Argent reçu') && html.includes(lang === 'en' ? 'Balance' : 'Solde'), `${lang} : cartes dans la bonne langue`);
  ok(html.includes('150&#x27;000') || html.includes('150 000') || /150[\s\u00a0\u202f]000/.test(html), `${lang} : montant reçu affiché`);
  ok(html.includes('Client Test') && html.includes('Loyer'), `${lang} : les lignes saisies sont dans la liste`);
  ok(html.includes(lang === 'en' ? 'Calculated from validated missions (not editable)' : 'Calculé avec les missions validées (non modifiable)'), `${lang} : ligne « Salaires » calculée affichée (non modifiable)`);
  ok(html.includes(lang === 'en' ? 'already included in salaries' : 'déjà comprises dans les salaires'), `${lang} : avances expliquées (pas comptées deux fois)`);
}
// solde : 150 000 − 40 000 − 60 000 = 50 000
ok(/50[\s\u00a0\u202f]000 Ar/.test(view('fr', 60000)), 'solde affiché = 150 000 − 40 000 − 60 000 = 50 000 Ar');
ok(!view('fr', 0).includes('Calculé avec les missions validées'), 'sans salaire calculé : pas de ligne « Salaires »');
const other = view('fr', 0, 0, { start: '2020-01-01', end: '2020-01-31' });
ok(other.includes('Aucune ligne sur cette période.') && !other.includes('Client Test'), 'autre période : les lignes d\'aujourd\'hui n\'apparaissent pas');

// modifier / supprimer
const id = a.id as string;
ok(db.updateCash(id, { kind: 'in', category: 'Paiement client', amount: 175000, date: today, client_name: 'Client Test' }).success && db.getCash().find(x => x.id === id)?.amount_ar === 175000, 'modification du montant');
ok(db.getCash().find(x => x.id === id)?.created_at !== undefined && db.getCash().find(x => x.id === id)?.created_by === db.getCurrentUser()?.id, 'créateur et date de création gardés');
ok(db.updateCash('inconnu', { kind: 'in', category: 'x', amount: 1, date: today }).error === 'missing', 'modifier une ligne inconnue : refusé');
ok(db.deleteCash(id).success && db.getCash().length === 1 && db.deleteCash(id).error === 'missing', 'suppression, puis suppression impossible deux fois');

// un opérateur ne peut rien écrire
db.enterDemo('employee');
ok(db.addCash({ kind: 'in', category: 'Paiement client', amount: 100, date: today }).error === 'admin', 'opérateur : ajout refusé');
ok(db.deleteCash('x').error === 'admin' && db.updateCash('x', { kind: 'in', category: 'x', amount: 1, date: today }).error === 'admin', 'opérateur : modification et suppression refusées');
ok(db.getCash().length === 0, 'opérateur : aucune ligne d\'argent visible');
ok(calls === 0, `aucun appel réseau (${calls})`);
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);

// Essai de la page Comptabilité (M14.4), sans écran réel ni réseau : démo, génération, saisie, annulation, FR et EN, rôles. Lancer : npm run check:accounting-page
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
const { AccountingPage } = await import('../src/views/admin/AccountingPage');
const { trialBalance, balanceSheet } = await import('../src/utils/accounting');
const { viewAllowedFor } = await import('../src/utils/roles');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const bad = (h: string) => /NaN|Infinity|undefined|\[object|\bnull\b/.test(h);
const view = (lang: 'fr' | 'en', tab: any) => { mem.delta_lang = lang; return renderToString(<AppProvider><AccountingPage initialTab={tab} /></AppProvider>).replace(/<!-- -->/g, ''); };

(async () => {
  db.enterDemo('admin');
  const start = db.getEntries();
  ok(start.length > 5 && start.every(e => /^EC-\d{4}-\d{4}$/.test(e.number || '')) && new Set(start.map(e => e.number)).size === start.length, `démo : ${start.length} écritures, numéros uniques EC-AAAA-0001`);
  ok(trialBalance(start).balanced && balanceSheet(start, '2100-12-31').balanced, 'démo : balance et bilan équilibrés');
  for (const lang of ['fr', 'en'] as const) for (const tab of ['journal', 'ledger', 'balance', 'result', 'sheet', 'vat']) { const h = view(lang, tab); ok(h.length > 800 && !bad(h), `admin ${lang} ${tab} : la page s'affiche sans NaN ni undefined`); }
  const fr = view('fr', 'journal'), en = view('en', 'journal');
  ok(fr.includes('Générer les écritures') && fr.includes('Saisir une écriture') && en.includes('Generate the entries') && !/Générer|Saisir|Journal des/.test(en.replace('Journal', '')), 'boutons en français et en anglais, sans français dans la version anglaise');
  ok(fr.includes('plan comptable') || fr.includes('Plan comptable'), 'avertissement : plan comptable à faire valider');
  ok(view('fr', 'balance').includes('Balance équilibrée') && view('fr', 'sheet').includes('Bilan équilibré'), 'balance et bilan annoncent qu\'ils sont équilibrés');

  ok(view('fr', 'vat').includes('TVA à payer') && view('en', 'vat').includes('VAT to pay') && view('fr', 'vat').includes('Télécharger le brouillon'), 'onglet TVA : total à payer et téléchargement du brouillon, FR et EN');

  // génération : jamais de doublon
  let r = await db.accountingSync();
  ok(r.ok && r.data.created === 0 && r.data.existing === start.length - 1, 'générer deux fois : rien de nouveau (le capital saisi à la main n\'est pas une pièce)');
  const cash = db.getCash();
  const pay = { id: 'cash-test-1', kind: 'out', category: 'Internet', amount_ar: 40000, date: '2026-10-20', note: 'Fibre', payment_method: 'MVola' } as any;
  (db as any).cash = [pay, ...cash];
  r = await db.accountingSync();
  ok(r.ok && r.data.created === 1 && db.getEntries().some(e => e.id === 'je-expense-cash-test-1' && e.number) && (await db.accountingSync()).data.created === 0, 'une nouvelle dépense : une écriture ; refaire : rien de plus');
  // saisie
  const good = { date: '2026-10-21', journal: 'OD', label: 'Apport de l\'associé', lines: [{ account: '512', debit: 1000000, credit: 0 }, { account: '101', debit: 0, credit: 1000000 }] };
  const p1 = await db.postEntry(good);
  ok(p1.ok && db.getEntries().some(e => e.label === 'Apport de l\'associé' && /^EC-2026-/.test(e.number || '')), 'saisie d\'une écriture équilibrée : acceptée et numérotée');
  const bads: [any, string][] = [[{ ...good, lines: [good.lines[0], { account: '101', debit: 0, credit: 900000 }] }, 'unbalanced'], [{ ...good, lines: [{ account: '999', debit: 5, credit: 0 }, good.lines[1]] }, 'account'], [{ ...good, date: '2026-02-30' }, 'date'], [{ ...good, label: '' }, 'label'], [{ ...good, lines: [good.lines[0]] }, 'lines'], [{ ...good, lines: [{ account: '512', debit: 1.5, credit: 0 }, { account: '101', debit: 0, credit: 1.5 }] }, 'amount']];
  for (const [d, why] of bads) { const x = await db.postEntry(d); ok(!x.ok && String(x.error).includes(`(${why})`), `saisie refusée : ${why}`); }
  const before = db.getEntries().length;
  // annulation
  const target = db.getEntries().find(e => e.id === p1.data.id)!;
  ok(!(await db.reverseEntryById(target.id, '2026-10-22', 'x')).ok && !(await db.reverseEntryById(target.id, '2026-10-01', 'Erreur de saisie')).ok, 'annulation : motif trop court et date avant l\'écriture refusés');
  const rv = await db.reverseEntryById(target.id, '2026-10-22', 'Erreur de saisie');
  const after = db.getEntries();
  ok(rv.ok && after.length === before + 1 && after.find(e => e.id === target.id)?.reversed_by === `${target.id}-rev` && after.find(e => e.id === `${target.id}-rev`)?.reversal_of === target.id, 'annulation : écriture inverse ajoutée, l\'originale marquée annulée');
  ok(!(await db.reverseEntryById(target.id, '2026-10-23', 'Encore')).ok && !(await db.reverseEntryById(`${target.id}-rev`, '2026-10-23', 'Annuler l\'annulation')).ok && !(await db.reverseEntryById('nope', '2026-10-23', 'Inconnue')).ok, 'annulation : pas deux fois, pas d\'annulation d\'annulation, pas d\'écriture inconnue');
  ok(trialBalance(db.getEntries()).balanced && balanceSheet(db.getEntries(), '2100-12-31').balanced, 'après tout cela : balance et bilan toujours équilibrés');
  ok(view('fr', 'journal').includes('Annulée') && view('fr', 'journal').includes('Annulation'), 'le journal montre « Annulée » et « Annulation »');

  // salarié : rien
  db.enterDemo('employee');
  ok(db.getEntries().length === 0 && !(await db.accountingSync()).ok && !(await db.postEntry(good)).ok && !(await db.reverseEntryById('x', '2026-10-22', 'abc')).ok, 'salarié : aucune écriture reçue, génération, saisie et annulation refusées');
  ok(viewAllowedFor('accountant', 'accounting') && viewAllowedFor('admin', 'accounting'), 'le Comptable et le responsable ouvrent la page');
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  ok((app.match(/activeView === 'accounting'/g) || []).length === 2, 'la page n\'est branchée que pour le Comptable et le responsable');
  const side = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');
  ok(/id: 'accounting', label: 'Comptabilité'/.test(side), 'entrée de menu « Comptabilité »');
  ok(calls === 0, 'aucun appel réseau');

  console.log(`\n${n - fails}/${n} contrôles réussis`);
  process.exit(fails ? 1 : 0);
})();

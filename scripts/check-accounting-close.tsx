// Contrôle de la clôture de la comptabilité (M14.6), sans réseau : règles, report à nouveau, démo (clôture, refus d'écrire, réouverture), serveur, écran FR/EN.
// Lancer : npm run check:accounting-close
import React from 'react';
import { renderToString } from 'react-dom/server';
import fs from 'node:fs';
import { transformSync } from 'esbuild';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
let calls = 0; g.fetch = async () => { calls++; throw new Error('RESEAU'); };

const { db } = await import('../src/db/store');
const { AppProvider } = await import('../src/context/AppContext');
const { AccountingPage } = await import('../src/views/admin/AccountingPage');
const A = await import('../src/utils/accounting');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const view = (lang: 'fr' | 'en', tab: any) => { mem.delta_lang = lang; return renderToString(<AppProvider><AccountingPage initialTab={tab} /></AppProvider>).replace(/<!-- -->/g, ''); };

// ---- règles pures
ok(A.isMonthEnd('2026-10-31') && A.isMonthEnd('2028-02-29') && !A.isMonthEnd('2026-10-30') && !A.isMonthEnd('2027-02-29') && !A.isMonthEnd('x') && !A.isMonthEnd(5), 'fin de mois : bonnes dates seulement');
ok(A.addDays('2026-12-31', 1) === '2027-01-01' && A.addDays('2026-03-01', -1) === '2026-02-28', 'addDays');
ok(A.planClose('', '2026-09-30', '2026-10-27').ok === true, 'clôture : un mois fini');
ok((A.planClose('', '2026-09-29', '2026-10-27') as any).reason === 'date' && (A.planClose('', '2026-10-31', '2026-10-27') as any).reason === 'future' && (A.planClose('2026-09-30', '2026-08-31', '2026-10-27') as any).reason === 'already' && (A.planClose('2026-09-30', '2026-09-30', '2026-10-27') as any).reason === 'already', 'clôture refusée : date, futur, déjà clos');
ok((A.planClose('', '2025-12-31', '2026-10-27') as any).yearEnd === true && (A.planClose('', '2025-11-30', '2026-10-27') as any).yearEnd === false, 'le 31 décembre = fin d\'exercice');
ok((A.planReopen('', '', 'abc') as any).reason === 'nothing' && (A.planReopen('2026-09-30', '', 'a') as any).reason === 'reason' && (A.planReopen('2026-09-30', '2026-09-30', 'abc') as any).reason === 'later' && (A.planReopen('2026-09-30', '2026-08-15', 'abc') as any).reason === 'date' && A.planReopen('2026-09-30', '', 'Erreur').ok && A.planReopen('2026-09-30', '2026-08-31', 'Erreur').ok, 'réouverture : motif, date, plus ancienne');
// report à nouveau : bénéfice, perte, rien
const mk = (id: string, date: string, a: [string, number, number][]): any => ({ id, date, journal: 'OD', label: id, lines: a.map(([account, debit, credit]) => ({ account, debit, credit })) });
const profit = [mk('v', '2025-05-01', [['411', 1000, 0], ['706', 0, 1000]]), mk('a', '2025-06-01', [['601', 300, 0], ['401', 0, 300]])];
const ce = A.closingEntry(profit, '2025-01-01', '2025-12-31', 'je-closing-2025-12-31-1')!;
ok(!!ce && ce.date === '2025-12-31' && ce.source?.type === 'closing' && A.cleanEntry(ce).ok && A.totals(ce.lines).debit === A.totals(ce.lines).credit, 'report à nouveau : écriture valide et équilibrée');
ok(ce.lines.find(l => l.account === '110')?.credit === 700 && ce.lines.find(l => l.account === '706')?.debit === 1000 && ce.lines.find(l => l.account === '601')?.credit === 300, 'bénéfice : 110 crédité de 700, produits soldés, charges soldées');
const loss = [mk('a', '2025-06-01', [['601', 500, 0], ['401', 0, 500]]), mk('v', '2025-07-01', [['411', 200, 0], ['706', 0, 200]])];
ok(A.closingEntry(loss, '2025-01-01', '2025-12-31', 'x')!.lines.find(l => l.account === '110')?.debit === 300, 'perte : 110 débité de 300');
ok(A.closingEntry([mk('b', '2025-03-01', [['512', 5, 0], ['101', 0, 5]])], '2025-01-01', '2025-12-31', 'x') === null && A.closingEntry([], '2025-01-01', '2025-12-31', 'x') === null, 'exercice sans produits ni charges : rien à reporter');
ok(A.closingEntry([...profit, ce], '2025-01-01', '2025-12-31', 'y') === null, 'déjà reporté : pas de deuxième écriture');
const all = [...profit, ce];
ok(A.incomeStatement(all, '2025-01-01', '2025-12-31').result === 700 && A.incomeStatement(all, '2025-01-01', '2025-12-31', true).result === 0, 'le résultat affiché ignore l\'écriture de clôture');
ok(A.balanceSheet(all, '2025-12-31').balanced && A.balanceSheet(profit, '2025-12-31').balanced && A.balanceSheet(all, '2025-12-31').liabilities.some(l => l.account === '110' && l.amount === 700) && A.balanceSheet(all, '2025-12-31').result === 0, 'bilan équilibré avant et après le report (110 = 700, résultat 0)');
const next = [...all, mk('n', '2026-02-01', [['411', 400, 0], ['706', 0, 400]])];
ok(A.incomeStatement(next, '2026-01-01', '2026-12-31').result === 400 && A.balanceSheet(next, '2026-12-31').balanced && A.balanceSheet(next, '2026-12-31').result === 400, 'année suivante : résultat 400, bilan équilibré, le 110 garde 700');

// ---- démo : clôturer, refus d'écrire, rouvrir
(async () => {
  db.enterDemo('admin');
  const E = db.getEntries();
  ok(db.getAcctClose().through === '' && db.getAcctClose().log.length === 0, 'démo : rien de clos au départ');
  const today = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
  const lastDone = A.addDays(`${today.slice(0, 7)}-01`, -1);
  const good = { date: '2026-01-15', journal: 'OD', label: 'Apport', lines: [{ account: '512', debit: 1000, credit: 0 }, { account: '101', debit: 0, credit: 1000 }] };
  ok(!(await db.closeAccounting('2026-02-15')).ok && !(await db.closeAccounting('2999-12-31')).ok, 'clôture refusée : pas une fin de mois, futur');
  const c1 = await db.closeAccounting('2026-02-28');
  ok(c1.ok && db.getAcctClose().through === '2026-02-28' && db.getAcctClose().log.length === 1 && db.getAcctClose().log[0].action === 'close', 'clôture au 28/02/2026 : état et historique');
  ok(!(await db.postEntry(good)).ok && String((await db.postEntry(good)).error).includes('(closed)'), 'saisie dans une période close : refusée (closed)');
  ok((await db.postEntry({ ...good, date: '2026-03-01' })).ok, 'saisie le lendemain de la clôture : acceptée');
  const some = db.getEntries().find(e => e.date <= '2026-02-28' && !e.reversal_of && !e.reversed_by);
  if (some) ok(!(await db.reverseEntryById(some.id, '2026-02-28', 'Erreur')).ok && (await db.reverseEntryById(some.id, '2026-03-02', 'Erreur')).ok, 'annulation : refusée à une date close, acceptée après');
  else ok(true, 'annulation : pas d\'écriture ancienne en démo (ignoré)');
  ok(!(await db.closeAccounting('2026-02-28')).ok && !(await db.closeAccounting('2026-01-31')).ok, 'on ne reclôture pas une période déjà close');
  ok(!(await db.reopenAccounting('', 'x')).ok && !(await db.reopenAccounting('2026-02-28', 'Erreur')).ok, 'réouverture : motif trop court, date pas plus ancienne');
  ok((await db.reopenAccounting('2026-01-31', 'Correction facture')).ok && db.getAcctClose().through === '2026-01-31' && db.getAcctClose().log.length === 2 && db.getAcctClose().log[1].reason === 'Correction facture', 'réouverture partielle : clôture ramenée au 31/01, motif gardé');
  ok((await db.postEntry({ ...good, date: '2026-02-10' })).ok, 'après réouverture : on peut écrire à nouveau');
  ok((await db.reopenAccounting('', 'Tout revoir')).ok && db.getAcctClose().through === '', 'tout rouvrir');
  // fin d'exercice : report à nouveau passé puis annulé à la réouverture
  const y = String(Number(today.slice(0, 4)) - 1);
  const fy = await db.closeAccounting(`${y}-12-31`);
  const closing = db.getEntries().filter(e => e.source?.type === 'closing' && !e.reversal_of);
  ok(fy.ok, `clôture de l'exercice ${y}`);
  ok(closing.length <= 1, 'au plus un report à nouveau');
  if (closing.length) {
    ok(closing[0].date === `${y}-12-31` && closing[0].lines.some(l => l.account === '110') && A.cleanEntry(closing[0]).ok, 'report à nouveau : daté du 31/12, sur le compte 110');
    ok(A.trialBalance(db.getEntries()).balanced && A.balanceSheet(db.getEntries(), `${y}-12-31`).balanced, 'balance et bilan équilibrés après le report');
    ok((await db.reopenAccounting('', 'Retour')).ok && db.getEntries().find(e => e.id === closing[0].id)?.reversed_by === `${closing[0].id}-rev`, 'réouverture : le report à nouveau est annulé');
    ok((await db.closeAccounting(`${y}-12-31`)).ok && db.getEntries().filter(e => e.source?.type === 'closing' && !e.reversal_of).length === 2 && A.trialBalance(db.getEntries()).balanced, 'reclôture : un nouveau report (numéro -2), jamais deux actifs');
  }

  // ---- écran
  for (const lang of ['fr', 'en'] as const) { const h = view(lang, 'close'); ok(h.length > 500 && !/NaN|Infinity|undefined|\[object/.test(h), `écran Clôture ${lang} : s'affiche sans valeur cassée`); }
  ok(view('fr', 'close').includes('Clôturer') && view('en', 'close').includes('Close') && view('fr', 'close').includes('report à nouveau'), 'écran : textes FR et EN');
  ok(view('fr', 'journal').includes('Clôture'), 'onglet « Clôture » visible');
  // le Comptable voit la page mais le bouton est réservé au responsable (démo : pas de compte Comptable)
  ok(/Seul le responsable peut clôturer/.test(fs.readFileSync('src/views/admin/AccountingPage.tsx', 'utf8')) && /!isAdmin \? <p/.test(fs.readFileSync('src/views/admin/AccountingPage.tsx', 'utf8')), 'Comptable : voit, pas de bouton (réservé au responsable)');
  db.enterDemo('employee');
  ok(!(await db.closeAccounting('2026-01-31')).ok && !(await db.reopenAccounting('', 'abcd')).ok, 'salarié : refusé');

  // ---- serveur
  const server = fs.readFileSync('supabase/functions/df-api/index.ts', 'utf8');
  ok(/accounting-close" && req\.method === "POST"\) return await accountingClose/.test(server), 'serveur : route accounting-close');
  const rt = server.slice(server.indexOf('async function accountingClose'), server.indexOf('// ===== END ACCOUNTING ====='));
  ok(/adminOnly\(res, me\)/.test(rt), 'serveur : clôture et réouverture réservées à l\'admin');
  ok(/ACCT\.planClose\(/.test(rt) && /ACCT\.planReopen\(/.test(rt) && /ACCT\.closingEntry\(/.test(rt), 'serveur : mêmes règles que le site');
  ok(/acctCloseState\(\)\)\.through\);\n  if \(!v\.ok\) return acctFail\(res, `Écriture refusée/.test(server) || /source: \{ type: 'manual', id \} \}, \(await acctCloseState\(\)\)\.through\)/.test(server), 'serveur : saisie manuelle vérifiée contre la clôture');
  ok(/ACCT\.cleanEntry\(rev, \(await acctCloseState\(\)\)\.through\)/.test(server), 'serveur : annulation vérifiée contre la clôture');
  ok(/e\.date <= closed\) built\.skipped\.push/.test(server) && /reason: 'closed'/.test(server), 'serveur : la génération saute les pièces d\'une période close (et les signale)');
  ok(/acct_close: \(existing as any\)\.acct_close/.test(server) && /delete \(toSave as any\)\.acct_close/.test(server), 'serveur : la synchro ne peut pas changer la clôture (valeur de la base gardée)');
  ok(/SETTINGS_ADMIN_KEYS[^\n]*"acct_close"/.test(server), 'serveur : jamais envoyée à un opérateur');
  ok(/await auditLog\(me, 'accounting_close'/.test(rt) && /await auditLog\(me, 'accounting_reopen'/.test(rt), 'serveur : tout est noté dans le journal d\'audit');
  ok(/reason\.length|planReopen\(cur\.through, through, reason\)/.test(rt) && /df_reverse_entry/.test(rt), 'serveur : réouverture avec motif, annule les reports à nouveau');
  ok(calls === 0, 'aucun appel réseau');
  console.log(`\n${n - fails}/${n} contrôles réussis`);
  process.exit(fails ? 1 : 0);
})();

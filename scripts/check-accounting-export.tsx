// Contrôle de l'export pour le comptable (M14.8), sans réseau. Lancer : npm run check:accounting-export
import fs from 'node:fs';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
let calls = 0; g.fetch = async () => { calls++; throw new Error('RESEAU'); };
const { db } = await import('../src/db/store');
const X = await import('../src/utils/accountingExport');
const A = await import('../src/utils/accounting');
const { matrixToCsv, parseCsv } = await import('../src/utils/importRules');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };

db.enterDemo('admin');
await db.accountingSync();
const E = db.getEntries();
const sum = (rows: (string | number)[][], col: number) => rows.slice(1, -1).reduce((t, r) => t + (Number(r[col]) || 0), 0);

for (const lang of ['fr', 'en'] as const) {
  const j = X.journalRows(E, undefined, undefined, lang);
  const lines = E.reduce((t, e) => t + e.lines.length, 0);
  ok(j.length === lines + 2, `journal ${lang} : une ligne par ligne d'écriture (${lines}) + titres + total`);
  const tot = j[j.length - 1];
  ok(tot[7] === tot[8] && tot[7] === sum(j, 7) && sum(j, 8) === tot[8], `journal ${lang} : total débit = total crédit = somme des lignes`);
  ok(j.slice(1, -1).every(r => typeof r[7] === 'number' && typeof r[8] === 'number' && Number.isInteger(r[7]) && Number.isInteger(r[8])), `journal ${lang} : montants en nombres entiers (pas de texte)`);
  ok(j.slice(1, -1).every(r => X.PLAN_CODES.has(String(r[5])) && String(r[6]) !== ''), `journal ${lang} : chaque compte est au plan, avec son intitulé`);
  const dates = j.slice(1, -1).map(r => String(r[0]));
  ok(dates.every((d, i) => i === 0 || dates[i - 1] <= d), `journal ${lang} : dans l'ordre des dates`);
  const b = X.balanceRows(E, undefined, undefined, lang);
  const bt = b[b.length - 1];
  ok(bt[2] === bt[3] && bt[2] === sum(b, 2) && bt[4] === bt[5], `balance ${lang} : débits = crédits, soldes débiteurs = soldes créditeurs`);
  const l = X.ledgerRows(E, undefined, undefined, lang);
  ok(l.length > 1 && l[0].length === 10 && l.slice(1).every(r => r.length === 10), `grand livre ${lang} : 10 colonnes partout`);
}
ok(X.journalRows(E)[0][0] === 'Date' && X.journalRows(E, undefined, undefined, 'en')[0][2] === 'Entry no.' && X.balanceRows(E, undefined, undefined, 'en')[0][4] === 'Debit balance', 'titres FR et EN');

// période : seulement les écritures dans les dates ; solde antérieur dans le grand livre
const mid = E.map(e => e.date).sort()[Math.floor(E.length / 2)];
const jp = X.journalRows(E, mid, undefined);
ok(jp.slice(1, -1).every(r => String(r[0]) >= mid) && jp.length < X.journalRows(E).length, 'journal : respecte la période');
const lp = X.ledgerRows(E, mid);
const opening = lp.filter(r => r[6] === 'Solde antérieur');
ok(opening.length > 0 && opening.every(r => Number(r[7]) === 0 || Number(r[8]) === 0), 'grand livre : solde antérieur par compte quand la période ne commence pas au début');
// le solde final de chaque compte est le même avec ou sans période
const lastBal = (rows: (string | number)[][], acc: string) => { const r = rows.filter(x => x[0] === acc); return r.length ? Number(r[r.length - 1][9]) : 0; };
ok(['411', '512', '706', '4457'].every(a => lastBal(lp, a) === lastBal(X.ledgerRows(E), a)), 'grand livre : même solde final avec ou sans période (le solde antérieur est bien reporté)');
ok(X.balanceRows([], undefined, undefined).length === 2 && X.journalRows([]).length === 2 && X.ledgerRows([]).length === 1, 'aucune écriture : titres et total seulement, sans erreur');

// sécurité des cellules (injection de formule) et CSV
const evil: any = { id: 'x', date: '2026-10-01', journal: 'OD', number: 'EC-2026-9999', ref: '=CMD()', label: '=HYPERLINK("http://x")', lines: [{ account: '512', debit: 5, credit: 0 }, { account: '101', debit: 0, credit: 5, label: '+SUM(A1)' }] };
const jr = X.journalRows([evil]);
ok(jr.slice(1, -1).every(r => !/^[=+\-@]/.test(String(r[3])) && !/^[=+\-@]/.test(String(r[4]))) && String(jr[1][4]).startsWith("'="), 'libellés qui commencent par = + - @ : neutralisés');
ok(X.safeCell(-5) === -5 && X.safeCell(NaN) === 0 && X.safeCell('abc') === 'abc' && X.safeCell(null) === '', 'cellules : nombres gardés, NaN → 0');
const csv = matrixToCsv(X.journalRows(E).map(r => r.map(String)));
const back = parseCsv(csv);
console.log(back.length, X.journalRows(E).length, back[0][0], back[1]?.length);
ok(back.length === X.journalRows(E).length && back[0][0] === 'Date' && back[1].length === 10, 'CSV journal : se relit (séparateur « ; », accents, mêmes lignes)');
ok(X.exportFileName('journal', '2026-01-01', '2026-12-31', '2026-10-27') === 'journal_2026-01-01_2026-12-31' && X.exportFileName('balance', undefined, undefined, '2026-10-27') === 'balance_debut_2026-10-27' && !/[ éà/]/.test(X.exportFileName('comptabilite', 'é/ à', undefined, 'x')), 'noms de fichier : sans espace ni accent');
const info = X.infoRows('=Société X', '2026-01-01', undefined, '2026-10-27', 12);
ok(String(info[0][1]).startsWith("'=") && String(info[1][1]).includes('2026-01-01') && String(info[info.length - 1][0]).includes('plan comptable'), 'page Infos : entreprise neutralisée, période, avertissement plan comptable');

// branchement
const page = fs.readFileSync('src/views/admin/AccountingPage.tsx', 'utf8');
ok(/exportExcel/.test(page) && /exportCsv\('journal'\)/.test(page) && /exportCsv\('grand-livre'\)/.test(page) && /exportCsv\('balance'\)/.test(page), 'page : 4 boutons d\'export');
const doc = fs.readFileSync('src/utils/exportDoc.ts', 'utf8');
ok(/replace\(\/\\\.xlsx\$\/i, ''\)/.test(doc), 'Excel : jamais « .xlsx.xlsx »');
ok(calls === 0, 'aucun appel réseau');
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);

// Contrôle de la vue Formulaire et des champs intelligents (module 19, M19.3 et M19.4), rendus en français et en anglais. Lancer : npm run check:sheet-form
import React from 'react';
import { renderToString } from 'react-dom/server';
import type * as ST from '../src/utils/sheets';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => (k in mem ? mem[k] : null), setItem: (k: string, v: string) => { mem[k] = String(v); }, removeItem: (k: string) => { delete mem[k]; } };
g.sessionStorage = g.localStorage; g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
Object.defineProperty(g, 'navigator', { value: { onLine: true }, configurable: true });

const S = await import('../src/utils/sheets');
const A = await import('../src/utils/sheetAuto');
const { AppProvider } = await import('../src/context/AppContext');
const { SheetForm, rowSummary, formRows } = await import('../src/components/SheetForm');
const { SmartField } = await import('../src/components/SmartField');

let fails = 0, n = 0;
const ok = (c: boolean, name: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };
const bad = (h: string) => /NaN|Infinity|undefined|\[object/.test(h);
const NOW = '2026-10-28T09:00:00.000Z', TODAY = '2026-10-28';
const count = (h: string, re: string) => (h.match(new RegExp(re, 'g')) || []).length;

// tableau d'essai : une colonne de chaque sorte
let sh = S.emptySheet('Suivi des dossiers', NOW);
for (const [name, type, opts] of [['Réf', 'code'], ['Date', 'date'], ['Client', 'text'], ['Montant', 'money'], ['Téléphone', 'phone'], ['Heure', 'time'], ['État', 'list', ['À faire', 'Fait']], ['Urgent', 'check'], ['Poids', 'number']] as any[]) sh = S.addColumn(sh, name, type, NOW, opts)!;
const ids = sh.columns.map(c => c.id);
const [cRef, cDate, cCli, cMon, cTel, cHeu, cEtat, cUrg, cPoids] = ids;
sh = S.updateColumn(sh, cCli, { required: true }, NOW)!;
for (const r of [
  { [cRef]: 'REF001', [cDate]: '2026-10-20', [cCli]: 'Société Rakoto', [cMon]: '1500000', [cTel]: '034 12 345 67', [cHeu]: '09:30', [cEtat]: 'Fait', [cUrg]: '1', [cPoids]: '12.5' },
  { [cRef]: 'REF002', [cDate]: '2026-10-21', [cCli]: 'Rasoa', [cMon]: '250000', [cEtat]: 'À faire' },
  { [cRef]: 'REF003', [cDate]: '2026-10-22', [cCli]: 'Société Rakoto', [cMon]: '=D1*2', [cPoids]: '=I1+1' },
]) sh = S.addRow(sh, NOW, r)!;
const comp = S.computeSheet(sh, TODAY);
const apply = () => null;
const render = (lang: string, el: React.ReactElement) => { mem['delta_lang'] = lang; return renderToString(<AppProvider>{el}</AppProvider>).replace(/<!-- -->/g, '').replace(/&#x27;/g, "'"); };
const form = (lang: 'fr' | 'en', ro = false, s = sh, c = comp) => render(lang, <SheetForm sheet={s} comp={c} ro={ro} lang={lang} today={TODAY} apply={apply} t={(fr, en) => (lang === 'en' ? en : fr)} now={() => NOW} />);

// ---- fonctions pures de la vue
ok(rowSummary(sh, S.activeRows(sh)[0], 'fr') === 'REF001 · 20/10/2026 · Société Rakoto', 'résumé : 3 premières valeurs, date en jj/mm/aaaa');
ok(rowSummary(sh, S.activeRows(sh)[2], 'fr').includes('REF003') && !rowSummary(sh, S.activeRows(sh)[2], 'fr').includes('undefined'), 'résumé : ligne avec formules');
ok(rowSummary(S.addRow(S.addColumn(S.emptySheet('x', NOW), 'A', 'text', NOW)!, NOW, {})!, S.activeRows(S.addRow(S.addColumn(S.emptySheet('x', NOW), 'A', 'text', NOW)!, NOW, {})!)[0], 'fr') === '', 'résumé : ligne vide');
ok(formRows(sh, '').length === 3 && formRows(sh, 'rakoto').length === 2 && formRows(sh, 'RASOA').length === 1 && formRows(sh, 'societe').length === 2 && formRows(sh, 'zzz').length === 0, 'recherche : sans accents ni majuscules');
ok(formRows(S.deleteRow(sh, S.activeRows(sh)[0].id, NOW)!, '').length === 2, 'recherche : les fiches à la corbeille ne sont pas listées');

// ---- un gros tableau : la liste est limitée à 200 cartes
{
  let big = S.addColumn(S.emptySheet('Gros', NOW), 'Client', 'text', NOW)!;
  big = { ...big, rows: Array.from({ length: 1200 }, (_, i) => ({ id: 'r' + i, cells: { [big.columns[0].id]: `Client ${i}` } })) };
  const hb = render('fr', <SheetForm sheet={big} comp={S.computeSheet(big, TODAY)} ro={false} lang="fr" today={TODAY} apply={apply} t={(fr) => fr} now={() => NOW} />);
  ok(count(hb, 'data-testid="form-card"') === 200, 'gros tableau (1 200 lignes) : 200 cartes au plus dans la liste');
  ok(hb.includes('data-testid="form-more"') && hb.includes('1000 autre(s) fiche(s)'), 'gros tableau : « 1000 autres fiches : utilise la recherche »');
  ok(hb.includes('Fiche 1 / 1200'), 'gros tableau : la position reste « Fiche 1 / 1200 »');
  const t0 = Date.now(); for (let i = 0; i < 5; i++) hb.length; ok(Date.now() - t0 < 500, 'gros tableau : rendu rapide');
}
for (const lang of ['fr', 'en'] as const) {
  const L = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const h = form(lang);
  ok(!bad(h), `${lang} : aucune valeur cassée (NaN, undefined…)`);
  ok(count(h, 'data-testid="form-field"') === 9, `${lang} : un champ par colonne (9)`);
  ok(count(h, 'data-testid="form-card"') === 3, `${lang} : une carte par fiche (3)`);
  ok(h.includes(`${L('Fiche', 'Record')} 1 / 3`), `${lang} : position « Fiche 1 / 3 »`);
  ok(h.includes(L('Précédent', 'Previous')) && h.includes(L('Suivant', 'Next')) && h.includes(L('Ajouter', 'Add')) && h.includes(L('Dupliquer', 'Duplicate')) && h.includes(L('Supprimer la fiche', 'Delete the record')), `${lang} : Précédent, Suivant, Ajouter, Dupliquer, Supprimer`);
  ok(h.includes('28/10/2026') === false && h.includes('20/10/2026'), `${lang} : la date de la fiche s'affiche en jj/mm/aaaa`);
  ok(h.includes(lang === 'en' ? '1,500,000' : '1 500 000'), `${lang} : le montant a ses séparateurs de milliers`);
  ok(h.includes('034 12 345 67') && h.includes('09:30'), `${lang} : téléphone et heure`);
  ok(h.includes('inputMode="numeric"') && h.includes('inputMode="tel"') && h.includes('inputMode="decimal"') && h.includes('inputMode="text"'), `${lang} : un bon clavier par type (chiffres, téléphone, virgule, texte)`);
  ok(h.includes('<datalist') && h.includes('Société Rakoto') && h.includes('Rasoa'), `${lang} : suggestions des mots déjà tapés dans la colonne Client`);
  ok(h.includes(`>${L('aujourd\'hui', 'today')}</button>`), `${lang} : « aujourd'hui » à côté d'un champ date`);
  ok(h.includes('<select') && h.includes(L('À faire', 'À faire')) && h.includes('type="checkbox"'), `${lang} : liste déroulante et case à cocher`);
  ok(h.includes('<span class="text-red-400"> *</span>'), `${lang} : champ obligatoire marqué`);
  ok(!h.includes('readOnly=""') && !h.includes('readonly=""'), `${lang} : modifiable pour l'opérateur`);

  // lecture seule (le responsable)
  const r = form(lang, true);
  ok(!r.includes(L('Ajouter', 'Add')) && !r.includes(L('Dupliquer', 'Duplicate')) && !r.includes(L('Supprimer la fiche', 'Delete the record')) && !r.includes(`>${L('aujourd\'hui', 'today')}</button>`), `${lang} : lecture seule = ni Ajouter, ni Dupliquer, ni Supprimer`);
  ok(r.includes('readOnly=""') || r.includes('readonly=""'), `${lang} : lecture seule = champs non modifiables`);
  ok(r.includes('disabled=""'), `${lang} : lecture seule = case et liste désactivées`);

  // tableau vide, sans colonne
  const empty = S.addColumn(S.emptySheet('V', NOW), 'A', 'text', NOW)!;
  const he = form(lang, false, empty, S.computeSheet(empty, TODAY));
  ok(he.includes(L('Aucune fiche pour le moment', 'No record yet')) && he.includes(L('Ajouter', 'Add')), `${lang} : tableau vide : message et bouton Ajouter`);
  const noCol = S.emptySheet('V', NOW);
  ok(form(lang, false, noCol, S.computeSheet(noCol, TODAY)).includes(L('Ajoute une colonne', 'Add a column')), `${lang} : sans colonne : explication`);
  const hr = form(lang, true, empty, S.computeSheet(empty, TODAY));
  ok(!hr.includes(L('Appuie sur', 'Press')), `${lang} : lecture seule vide : pas de consigne « Appuie sur Ajouter »`);

  // un champ intelligent seul
  const f = (col: ST.Column, value: string, shown = value) => render(lang, <SmartField col={col} value={value} shown={shown} lang={lang} today={TODAY} onCommit={() => {}} />);
  const C = (type: ST.ColType): ST.Column => ({ id: 'c', name: 'X', type });
  ok(f(C('date'), '2026-10-28').includes('value="28/10/2026"'), `${lang} : champ date : valeur gardée AAAA-MM-JJ, affichée jj/mm/aaaa`);
  ok(f(C('date'), '').includes(`placeholder="${L('jj/mm/aaaa', 'dd/mm/yyyy')}"`), `${lang} : champ date vide : aide « ${L('jj/mm/aaaa', 'dd/mm/yyyy')} »`);
  ok(f(C('money'), '1234567', '1234567').includes(lang === 'en' ? 'value="1,234,567"' : 'value="1 234 567"'), `${lang} : champ montant : milliers`);
  ok(f(C('money'), '1234567').includes('inputMode="numeric"'), `${lang} : champ montant : clavier chiffres`);
  ok(f(C('phone'), '0341234567').includes('value="034 12 345 67"') || f(C('phone'), '034 12 345 67').includes('value="034 12 345 67"'), `${lang} : champ téléphone`);
  ok(f(C('phone'), '').includes('inputMode="tel"'), `${lang} : champ téléphone : clavier téléphone`);
  ok(f(C('number'), '=A1*2', '10').includes('value="10"') , `${lang} : une formule montre son résultat`);
  ok(f(C('text'), 'abc').includes('inputMode="text"') && f(C('text'), 'abc').includes('autoComplete="off"'), `${lang} : texte : clavier normal`);
  ok(f({ ...C('text') }, 'abc').includes('text-right') === false && f(C('money'), '5').includes('text-right'), `${lang} : les nombres sont alignés à droite`);
  ok(f({ ...C('text') }, 'abc').includes('list=') === false, `${lang} : (liste de suggestions seulement si l'appelant en donne une)`);
  ok(render(lang, <SmartField col={C('text')} value="" shown="" lang={lang} today={TODAY} listId="dl-x" onCommit={() => {}} />).includes('list="dl-x"'), `${lang} : texte : branché sur sa liste de suggestions`);
  ok(render(lang, <SmartField col={C('date')} value="" shown="" lang={lang} today={TODAY} listId="dl-x" onCommit={() => {}} />).includes('list=') === false, `${lang} : date : pas de liste de suggestions`);
  ok(render(lang, <SmartField col={C('date')} value="2026-10-28" shown="" lang={lang} today={TODAY} readOnly onCommit={() => {}} />).match(/readOnly=""|readonly=""/) !== null, `${lang} : champ en lecture seule`);
}
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);

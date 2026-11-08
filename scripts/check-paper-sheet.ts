// Feuille papier imprimable et saisie groupée (module 26, M26.9). Lancer : npm run check:paper-sheet
import { readFileSync } from 'node:fs';
import { paperSheetHtml, applyGroup, PAPER_MAX_DAYS, PAPER_MAX_NAMES } from '../src/utils/paperSheet';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const q = { name: 'Emballage', measure: 'quantity', unit: 'boîte' };
const h = paperSheetHtml(['Rivo', 'Zo'], q, '2026-11-08', 7, 'fr', 'Ma Société');
ok(h.includes('Rivo') && h.includes('Zo') && h.includes('Emballage') && h.includes('boîte') && h.includes('Ma Société'), 'noms, type, unité et société sont sur la feuille');
ok((h.match(/<th colspan="2">/g) || []).length === 7 && h.includes('dim 08/11') && h.includes('sam 14/11'), '7 jours en tête, avec le jour de la semaine (08/11 = dimanche)');
ok(h.includes('Qté') && h.includes('Refus'), 'quantité : colonnes Qté et Refus');
ok(paperSheetHtml(['A'], { name: 'Présence', measure: 'presence' }, '2026-11-08', 2, 'fr').includes('Heures'), 'présence : colonnes Prés. et Heures');
ok(paperSheetHtml(['A'], q, '2026-11-08', 3, 'en').includes('Sun 11-08') && paperSheetHtml(['A'], q, '2026-11-08', 3, 'en').includes('Name'), 'version anglaise');
ok(!/<script/i.test(h), 'aucune balise script (page sans code)');
const evil = paperSheetHtml(['<script>alert(1)</script>', 'A"B'], { name: '<img src=x onerror=1>', measure: 'quantity', unit: '<b>' }, '2026-11-08', 1, 'fr', '<i>x</i>');
ok(!/<script|<img|<b>|<i>/.test(evil) && evil.includes('&lt;script&gt;'), 'un nom piégé est neutralisé (pas de HTML injecté)');
ok((paperSheetHtml(['A'], q, '2026-11-08', 99, 'fr').match(/<th colspan="2">/g) || []).length === PAPER_MAX_DAYS && (paperSheetHtml(['A'], q, '2026-11-08', 0, 'fr').match(/<th colspan="2">/g) || []).length === 1 && (paperSheetHtml(['A'], q, '2026-11-08', NaN, 'fr').match(/<th colspan="2">/g) || []).length === 1, 'jours : 1 à 7, jamais plus ni NaN');
ok((paperSheetHtml(Array.from({ length: 500 }, (_, i) => 'N' + i), q, '2026-11-08', 1, 'fr').match(/<td class="nm">/g) || []).length === PAPER_MAX_NAMES, '200 noms au plus');
ok((paperSheetHtml([], q, '2026-11-08', 1, 'fr').match(/<td class="nm">/g) || []).length === 10, 'liste vide : 10 lignes vierges à remplir');
ok(!/NaN|undefined|null/.test(paperSheetHtml(['A'], q, 'faux', 2, 'fr')) && !/NaN|undefined/.test(paperSheetHtml([null as any, 'B'], q, '2026-02-30', 2, 'fr')), 'date fausse : jamais NaN ni undefined');
ok(/@page\{size:A4 landscape/.test(h), 'A4 en paysage');

// Saisie groupée
const rows = { a: { quantity: '50' }, b: {} } as any;
const g = applyGroup(rows, ['a', 'b', 'c'], { quantity: ' 100 ', presence: 'present' });
ok(g.a.quantity === '50' && g.a.presence === 'present' && g.b.quantity === '100' && g.c.quantity === '100', 'cases vides remplies, case saisie à la main jamais écrasée');
ok(rows.a.presence === undefined && rows.c === undefined, 'les données de départ ne sont pas modifiées (copie)');
ok(applyGroup(rows, ['a'], { quantity: '9' }, false).a.quantity === '9', 'option « écraser » : remplace aussi');
ok(JSON.stringify(applyGroup(rows, ['a', 'b'], { quantity: '  ', hours: '' })) === JSON.stringify(rows), 'valeur vide : rien ne change');
ok(JSON.stringify(applyGroup(rows, [], { quantity: '5' })) === JSON.stringify(rows), 'liste vide : rien ne change');
ok(!('x' in applyGroup({}, ['a'], { quantity: '1', x: '2' } as any).a), 'seuls présence, heures, quantité, refusées sont acceptés');

const ws = readFileSync('src/views/WorksheetView.tsx', 'utf8');
ok(/data-worksheet-group/.test(ws) && /data-group-present/.test(ws) && /data-worksheet-print/.test(ws) && /applyGroup\(prev, people\.map/.test(ws), 'écran : saisie groupée et bouton « Imprimer la feuille papier »');
ok(/people\.length > 0 && \(\s*<div className=\{`\$\{card\} space-y-2`\} data-worksheet-group/.test(ws), 'écran : rien à grouper sans opérateur');
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
process.exit(fails ? 1 : 0);

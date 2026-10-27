// Contrôle des règles d'impression (A4, Times New Roman, taille normale, coupure propre), sans écran ni réseau. Lancer : npm run check:print-format
import { A4_MM, PRINT_CONTENT_W_MM, PRINT_CONTENT_W_PX, PRINT_FONT, PRINT_FONT_FACE, PRINT_MARGIN_MM, PRINT_PT, pickBreak, withPrintRules } from '../src/utils/printFormat';
import { companyForSlip, slipHtml, type Slip } from '../src/utils/payslip';
import { demoSheets, exportMatrix } from '../src/utils/sheets';
import { sheetHtml } from '../src/utils/sheetExport';
import { existsSync, readFileSync } from 'node:fs';

let fails = 0;
const ok = (c: boolean, name: string) => { if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };

// ---------- constantes ----------
ok(A4_MM.w === 210 && A4_MM.h === 297, 'A4 = 210 × 297 mm');
ok(PRINT_MARGIN_MM === 15 && PRINT_CONTENT_W_MM === 180, 'marges normales de 15 mm, largeur utile 180 mm');
ok(PRINT_CONTENT_W_PX === 680, '180 mm = 680 px à 96 dpi (donc 12 pt à l\'écran = 12 pt sur le papier)');
ok(PRINT_PT === 12 && PRINT_FONT.startsWith("'Times New Roman'"), 'texte normal 12 pt, Times New Roman en premier');
ok(PRINT_FONT.includes("'Tinos'") && PRINT_FONT_FACE.includes('tinos-latin-400-normal.woff2') && PRINT_FONT_FACE.includes('tinos-latin-700-italic.woff2'), 'Tinos (remplaçante de mêmes largeurs) déclarée en 4 styles');
for (const f of ['400-normal', '400-italic', '700-normal', '700-italic']) ok(existsSync(`public/fonts/tinos-latin-${f}.woff2`) && readFileSync(`public/fonts/tinos-latin-${f}.woff2`).length > 5000, `fichier de police tinos-latin-${f}.woff2 présent`);

// ---------- coupure des pages ----------
const safe = [100, 220, 480, 700, 900, 1000];
ok(pickBreak(safe, 0, 1000, 5000) === 1000, 'coupe au dernier bas de bloc qui tient (1000)');
ok(pickBreak(safe, 0, 800, 5000) === 700, 'page de 800 : coupe à 700 (pas au milieu du bloc 700→900)');
ok(pickBreak(safe, 0, 250, 5000) === 220, 'page de 250 : coupe à 220');
ok(pickBreak([], 0, 800, 5000) === 800, 'aucun bloc : coupe à la hauteur de la page');
ok(pickBreak([100, 150], 0, 800, 5000) === 800, 'seuls des blocs trop près du haut : on ne fait pas de page presque vide');
ok(pickBreak(safe, 0, 2000, 1500) === 1500, 'tout tient : fin du document');
ok(pickBreak([1200, 1900, 2600], 1000, 1500, 9000) === 1900, 'deuxième page : coupe relative au début de la page');
// boucle complète : jamais de page vide, toujours en avant, la dernière page finit au bas du document
{
  const total = 7300, pageH = 1000, blocks = Array.from({ length: 60 }, (_, i) => 120 * (i + 1));
  let y = 0, pages = 0, last = -1, bad = false;
  while (y < total && pages < 50) { const end = pickBreak(blocks, y, pageH, total); const h = Math.min(end, total) - y; if (h <= 0 || end <= last) bad = true; if (h > pageH) bad = true; last = end; y += h; pages++; }
  ok(!bad && y === total && pages >= 8 && pages < 12, `boucle de pages : ${pages} pages, aucune vide, aucune trop haute, fin exacte`);
}

// ---------- règle ajoutée à une page HTML ----------
const w1 = withPrintRules('<!doctype html><html><head><title>x</title></head><body>a</body></html>', 'https://site.test');
ok(w1.includes('<base href="https://site.test/">') && w1.includes("'Times New Roman'") && w1.includes('font-size:12pt') && w1.indexOf('<style>') < w1.indexOf('</head>'), 'règle ajoutée dans <head>');
ok(withPrintRules('<p>a</p>', 'https://s.t').startsWith('<base'), 'page sans <head> : règle ajoutée au début');
ok(!withPrintRules('<html><head></head></html>', 'https://x"><script>').includes('<script>'), 'adresse du site nettoyée (pas d\'injection)');

// ---------- les pages imprimables ----------
const slip: Slip = {
  id: 's1', pid: '2026-10', period_start: '2026-10-01', period_end: '2026-10-31', user_id: 'u1', name: 'Rakoto Jean', username: 'rakoto', phone: '',
  lines: [{ post_id: 'p1', date: '2026-10-03', client: 'Atelier', post_number: 4, score: 2500, rate: 2, amount: 5000 }], gross: 5000, bonuses: [], penalties: [], penalty_applied: 0,
  advance_due_before: 0, advance_deducted: 0, advance_carry: 0, net: 5000, paid: null, closed_at: '2026-11-01T00:00:00Z',
};
const slipPage = slipHtml(slip, { lang: 'fr', company: companyForSlip({ identity: { name: 'Soa', address: '', phone: '', email: '', logo_url: '', currency: 'Ar' }, legal: { tax_id: '', register_id: '', notes: [] } }) });
ok(slipPage.includes("font-family:'Times New Roman'") && !slipPage.includes('Arial') && slipPage.includes('font-size:12pt') && slipPage.includes('@page{size:A4;margin:15mm}'), 'bulletin : Times New Roman, 12 pt, A4, marge 15 mm');

const sheet = demoSheets('2026-10-27T08:00:00Z', 'fr')[0];
const nCols = exportMatrix(sheet, '2026-10-27', 'fr').header.length;
const sh = sheetHtml(sheet, '2026-10-27', 'fr', 'BTK', { print: true });
ok(sh.includes("font-family:'Times New Roman'") && !sh.includes('system-ui') && sh.includes('font-size:12pt'), 'Mes tableaux : Times New Roman, 12 pt');
ok(sh.includes(`@page{size:A4 ${nCols > 7 ? 'landscape' : 'portrait'};margin:15mm}`), `Mes tableaux : A4 ${nCols > 7 ? 'paysage' : 'portrait'} pour ${nCols} colonnes`);
const wide: any = { ...sheet, columns: Array.from({ length: 9 }, (_, i) => ({ ...sheet.columns[0], id: `c${i}`, name: `Col ${i}` })), rows: [] };
ok(sheetHtml(wide, '2026-10-27', 'fr', 'BTK').includes('@page{size:A4 landscape;margin:15mm}'), 'Mes tableaux : plus de 7 colonnes = A4 paysage (pas de texte rétréci)');

console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est OK');
process.exit(fails ? 1 : 0);

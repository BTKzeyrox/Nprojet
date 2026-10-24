// Contrôle de l'import Excel et CSV (module 16, M16.1) : lecture CSV, colonnes reconnues, aperçu ligne par ligne, doublons, tableau libre, mots de passe. Sans écran, sans réseau.
// Lancer : npm run check:import
import { matrixFromWorkbookData, cellToText } from '../src/utils/importFile';
import {
  asIsoDate, asNumberText, buildPreview, credentialsMatrix, generatePassword, IMPORT_LIMITS, mapColumns, matrixToCsv, okDrafts, parseCsv, parseShift,
  PW_LENGTH, sheetFromMatrix, templateMatrix, IMPORT_ERROR_TEXT, IMPORT_PROBLEM_TEXT, type ExistingNames,
} from '../src/utils/importRules';

let fails = 0, n = 0;
const eq = (got: unknown, want: unknown, name: string) => { n++; const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { fails++; console.log(`ECHEC ${name}\n   obtenu  ${JSON.stringify(got)}\n   attendu ${JSON.stringify(want)}`); } else console.log(`OK    ${name}`); };

const NONE: ExistingNames = { clients: [], products: [], usernames: [] };

// --- CSV ---
eq(parseCsv('a;b;c\n1;2;3'), [['a', 'b', 'c'], ['1', '2', '3']], 'CSV avec point-virgule');
eq(parseCsv('a,b,c\r\n1,2,3\r\n'), [['a', 'b', 'c'], ['1', '2', '3']], 'CSV avec virgule et fin de ligne Windows');
eq(parseCsv('a\tb\n1\t2'), [['a', 'b'], ['1', '2']], 'CSV avec tabulation');
eq(parseCsv('﻿nom;ville\nAina;Toliara'), [['nom', 'ville'], ['Aina', 'Toliara']], 'BOM retiré');
eq(parseCsv('nom;note\n"Aina; Rakoto";"il dit ""bonjour"""'), [['nom', 'note'], ['Aina; Rakoto', 'il dit "bonjour"']], 'guillemets, séparateur et guillemets doublés dans un champ');
eq(parseCsv('nom;note\n"ligne 1\nligne 2";x'), [['nom', 'note'], ['ligne 1\nligne 2', 'x']], 'retour à la ligne dans un champ entre guillemets');
eq(parseCsv('a;b\n\n;\n1;2\n'), [['a', 'b'], ['1', '2']], 'lignes vides ignorées');
eq(parseCsv(''), [], 'texte vide');
eq(parseCsv('seul'), [['seul']], 'une seule cellule');
eq(parseCsv('a;b\n"1;2'), [['a', 'b'], ['1;2']], 'guillemet jamais fermé : ne plante pas, le reste du texte devient une case');
eq(parseCsv(matrixToCsv([['x', 'y;z', 'a"b'], ['1', ' sp ', 'l1\nl2']])), [['x', 'y;z', 'a"b'], ['1', ' sp ', 'l1\nl2']], 'CSV écrit puis relu = identique');

// --- Colonnes ---
const c1 = mapColumns(['Nom', 'E-mail', 'Téléphone', 'Truc', 'Prix'], 'clients');
eq([c1.map, c1.unknown, c1.missing], [{ name: 0, email: 1, phone: 2, price_default: 4 }, ['Truc'], []], 'clients : colonnes reconnues (accents, majuscules), inconnue signalée');
eq(mapColumns(['Société', 'Nom'], 'clients').map, { name: 0 }, 'clients : « Nom » repéré une seule fois');
eq(mapColumns(['Nom', 'Nom'], 'clients').repeated, ['Nom'], 'colonne répétée signalée');
eq(mapColumns(['phone', 'email'], 'clients').missing, ['name'], 'colonne obligatoire manquante');
eq(mapColumns(['Prix d\'achat (Ar)', 'Prix de vente (Ar)', "Seuil d'alerte"], 'products').map, { buy_price: 0, sell_price: 1, alert_threshold: 2 } as unknown, 'produits : titres du modèle reconnus');
eq(mapColumns(['  IDENTIFIANT ', 'Nom complet'], 'employees').map, { username: 0, name: 1 }, 'salariés : espaces et casse');

// --- Aperçu clients ---
const clientsCsv = parseCsv('Nom;Contact;E-mail;Délai de paiement (jours);Prix par défaut (Ar)\nAina;Rakoto;a@b.mg;30;5 000\nVola;;pasunemail;;\n;x;;;\nAina;;;;\nboutique zo;;;400;\nSociété Neuve;;;;12,5\n');
const pc = buildPreview('clients', clientsCsv, { ...NONE, clients: ['Boutique Zo'] });
eq(pc.problem, undefined, 'clients : fichier lisible');
eq(pc.rows.map(r => [r.line, r.status, r.code ?? null]), [[2, 'ok', null], [3, 'error', 'email'], [4, 'error', 'name'], [5, 'duplicate', 'in_file'], [6, 'error', 'terms'], [7, 'ok', null]], 'clients : état de chaque ligne (numéro de ligne du fichier)');
eq(pc.counts, { ok: 2, error: 3, duplicate: 1 }, 'clients : compteurs');
eq(okDrafts(pc).map(d => d.name), ['Aina', 'Société Neuve'], 'clients : seules les lignes bonnes sont à écrire');
eq(buildPreview('clients', clientsCsv.slice(0, 3), { ...NONE, clients: ['AINA'] }).rows[0].code, 'exists', 'clients : déjà dans le site (casse ignorée)');
eq(buildPreview('clients', clientsCsv.slice(0, 3), { ...NONE, clients: ['  aina '] }).rows[0].status, 'duplicate', 'clients : déjà là malgré les espaces');
eq(buildPreview('clients', [], NONE).problem, 'empty', 'clients : fichier vide');
eq(buildPreview('clients', [['Truc', 'Machin']], NONE).problem, 'no_header', 'clients : aucune colonne reconnue');
eq(buildPreview('clients', [['Contact', 'Truc']], NONE).problem, 'missing_columns', 'clients : colonne Nom absente mais d\'autres reconnues');
eq(buildPreview('clients', [['Nom']], NONE).problem, 'no_rows', 'clients : que l\'en-tête');
eq(buildPreview('clients', [['Nom'], ['', '']], NONE).problem, 'no_rows', 'clients : que des lignes vides');
const big: string[][] = [['Nom']]; for (let i = 0; i < IMPORT_LIMITS.rows.clients + 1; i++) big.push([`C${i}`]);
eq(buildPreview('clients', big, NONE).problem, 'too_many_rows', 'clients : trop de lignes');
big.pop();
eq(buildPreview('clients', big, NONE).counts.ok, IMPORT_LIMITS.rows.clients, 'clients : pile à la limite = accepté');
eq(buildPreview('clients', [['Nom', 'Prix'], ['A', '-5'], ['B', 'abc'], ['C', '1e3'], ['D', '0']], NONE).rows.map(r => r.status), ['error', 'error', 'ok', 'ok'], 'clients : prix négatif et texte refusés, 0 accepté');
eq(buildPreview('clients', [['Nom'], ['=1+1'], ['__proto__']], NONE).counts.ok, 2, 'clients : texte étrange accepté comme simple texte (aucun effet)');

// --- Aperçu produits ---
const pp = buildPreview('products', parseCsv('Produit;Catégorie;Prix achat;Prix vente;Seuil\nPapier;Bureau;9000;12000;5\nStylo;;abc;;\nPapier;;;;\nColle;;;-1;\nCrayon;;100;200;x'), { ...NONE, products: ['Crayon'] });
eq(pp.rows.map(r => [r.status, r.code ?? null]), [['ok', null], ['error', 'buy'], ['duplicate', 'in_file'], ['error', 'sell'], ['error', 'threshold']], 'produits : état de chaque ligne (une erreur de prix passe avant un doublon)');
eq(buildPreview('products', [['Nom'], ['Crayon']], { ...NONE, products: ['crayon'] }).rows[0].code, 'exists', 'produits : déjà dans le stock');

// --- Aperçu salariés ---
const pe = buildPreview('employees', parseCsv('Identifiant;Nom complet;Téléphone;Vacation;Équipe\nrakoto.jean;Jean Rakoto;034 12 345 67;Jour;A\nRASOA;Marie Rasoa;;nuit;B\nx;Court;;;\nok.user;;;;\nbad.phone;Bad Phone;12;;\nshift.bad;Shift Bad;;soir-matin;\nrakoto.jean;Double;;;\nadmin;Déjà là;;;'), { ...NONE, usernames: ['Admin'] });
eq(pe.rows.map(r => [r.line, r.status, r.code ?? null]), [[2, 'ok', null], [3, 'ok', null], [4, 'error', 'username'], [5, 'error', 'name'], [6, 'error', 'phone'], [7, 'error', 'shift'], [8, 'duplicate', 'in_file'], [9, 'duplicate', 'exists']], 'salariés : état de chaque ligne');
eq(okDrafts(pe), [
  { username: 'rakoto.jean', name: 'Jean Rakoto', phone: '261 34 12 345 67', shift: 'day', team: 'A' },
  { username: 'rasoa', name: 'Marie Rasoa', phone: '', shift: 'night', team: 'B' },
], 'salariés : identifiant en minuscules, téléphone au format du site, vacation comprise');
eq(buildPreview('employees', [['Identifiant', 'Nom', 'Rôle'], ['a.b.c', 'Un', 'admin']], NONE).rows[0].draft, { username: 'a.b.c', name: 'Un', phone: '', shift: 'day', team: '' }, 'salariés : une colonne « Rôle » est ignorée (jamais de compte responsable par import)');
eq((buildPreview('employees', [['Identifiant', 'Nom', 'Rôle'], ['a.b.c', 'Un', 'admin']], NONE).columns as any).unknown, ['Rôle'], 'salariés : la colonne « Rôle » est signalée comme ignorée');
const many: string[][] = [['Identifiant', 'Nom']]; for (let i = 0; i < 101; i++) many.push([`user${i}x`, `N${i}`]);
eq(buildPreview('employees', many, NONE).problem, 'too_many_rows', 'salariés : 100 au plus par import');
eq(['Jour', 'DAY', 'matin', '', 'Nuit', 'night', 'soir', 'zzz'].map(parseShift), ['day', 'day', 'day', 'day', 'night', 'night', 'night', null], 'vacation : mots reconnus');
eq(buildPreview('employees', [['Identifiant', 'Nom', 'Tél'], ['u.ser', 'Un', '261341234567']], NONE).rows[0].draft?.phone, '261 34 12 345 67', 'salariés : téléphone sans espaces remis au format');
eq(buildPreview('employees', [['Identifiant', 'Nom', 'Tél'], ['u.ser', 'Un', '0341234567']], NONE).rows[0].draft?.phone, '261 34 12 345 67', 'salariés : téléphone avec 0 devant remis au format');

// --- Nombres et dates ---
eq(['2026-10-25', '25/10/2026', '5.1.2026', '2026-02-30', '31/04/2026', 'hier', ''].map(asIsoDate), ['2026-10-25', '2026-10-25', '2026-01-05', null, null, null, null], 'dates : AAAA-MM-JJ et JJ/MM/AAAA, dates fausses refusées');
eq(['12', '1 200,50', '-3', '1e3', 'abc', '', '12abc', '0,5'].map(asNumberText), ['12', '1200.50', '-3', null, null, null, null, '0.5'], 'nombres : espaces et virgule acceptés, le reste refusé');

// --- Tableau libre ---
const NOW = '2026-10-25T10:00:00.000Z';
const si = sheetFromMatrix(parseCsv('Date;Nom;Montant;Note\n25/10/2026;Aina;1 200,5;\n26/10/2026;Vola;300;ok\n;Zo;;'), 'Mon import', NOW);
eq([si.problem ?? null, si.rowCount, si.shortened, si.columns], [null, 3, 0, [{ name: 'Date', type: 'date' }, { name: 'Nom', type: 'text' }, { name: 'Montant', type: 'number' }, { name: 'Note', type: 'text' }]], 'tableau : types devinés (date, texte, nombre) et nombre de lignes');
const cells = si.sheet!.rows.map(r => si.sheet!.columns.map(c => r.cells[c.id] ?? '')); // une case vide n'est pas gardée par le site
eq(cells, [['2026-10-25', 'Aina', '1200.5', ''], ['2026-10-26', 'Vola', '300', 'ok'], ['', 'Zo', '', '']], 'tableau : valeurs remises au format du site');
eq(si.sheet!.title, 'Mon import', 'tableau : titre');
eq(sheetFromMatrix([['Code'], ['007'], ['12']], 't', NOW).columns[0].type, 'number', 'tableau : « 007 » est un nombre (limite connue : le zéro devant est perdu en colonne nombre)');
eq(sheetFromMatrix([['A', 'A', ''], ['1', '2', '3']], 't', NOW).columns.map(c => c.name), ['A', 'A (2)', 'Colonne 3'], 'tableau : titres en double et vides rendus uniques');
eq(sheetFromMatrix([], 't', NOW).problem, 'empty', 'tableau : vide');
eq(sheetFromMatrix([['A']], 't', NOW).problem, 'no_rows', 'tableau : que l\'en-tête');
eq(sheetFromMatrix([['A'], ['x'.repeat(600)]], 't', NOW).shortened, 1, 'tableau : case trop longue raccourcie et comptée');
eq(sheetFromMatrix([Array.from({ length: 201 }, (_, i) => `c${i}`), Array.from({ length: 201 }, () => '1')], 't', NOW).problem, 'too_many_columns', 'tableau : 201 colonnes refusées');
const bigSheet: string[][] = [['A']]; for (let i = 0; i < IMPORT_LIMITS.rows.sheet + 1; i++) bigSheet.push(['1']);
eq(sheetFromMatrix(bigSheet, 't', NOW).problem, 'too_many_rows', 'tableau : trop de lignes');
eq(sheetFromMatrix([['A'], ['1']], '', NOW).sheet!.title, 'Tableau importé', 'tableau : titre vide remplacé');
const fx = sheetFromMatrix([['Texte'], ['=SOMME(A1:A3)']], 't', NOW).sheet!;
eq(fx.rows[0].cells[fx.columns[0].id], '=SOMME(A1:A3)', 'tableau : un texte qui commence par = est gardé tel quel (Mes tableaux le lit alors comme une formule sûre, sans accès au réseau)');

const heavy: string[][] = [['A', 'B', 'C']]; for (let i = 0; i < 4000; i++) heavy.push(['x'.repeat(200), 'y'.repeat(200), 'z'.repeat(200)]);
eq(sheetFromMatrix(heavy, 't', NOW).problem, 'invalid', 'tableau : trop gros pour le serveur (1,5 million de signes) : refusé avant l\'envoi');

// --- Modèles ---
for (const kind of ['clients', 'products', 'employees'] as const) for (const lang of ['fr', 'en'] as const) {
  const t = templateMatrix(kind, lang);
  const p = buildPreview(kind as any, t, NONE);
  eq([kind, lang, p.problem ?? null, p.counts.error, p.counts.duplicate], [kind, lang, null, 0, 0], `modèle ${kind} ${lang} : relu par le site sans erreur`);
  eq(Object.keys((p.columns as any).map).length, t[0].length, `modèle ${kind} ${lang} : toutes ses colonnes sont reconnues`);
  eq(parseCsv(matrixToCsv(t)), t, `modèle ${kind} ${lang} : CSV écrit puis relu = identique`);
}

// --- Mots de passe ---
let seed = 7; const rnd = (m: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % m; };
const pw = generatePassword(rnd);
eq([pw.length, /^[abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/.test(pw)], [PW_LENGTH, true], 'mot de passe : 10 signes, sans 0 O 1 l I');
eq(generatePassword(() => 9999).length, PW_LENGTH, 'mot de passe : un hasard hors limites ne plante pas');
eq(generatePassword(() => -5).length, PW_LENGTH, 'mot de passe : un hasard négatif ne plante pas');
eq(credentialsMatrix([{ username: 'a.b', name: 'Un', password: 'xyz' }], 'fr'), [['Identifiant', 'Nom complet', 'Mot de passe provisoire'], ['a.b', 'Un', 'xyz']], 'liste des mots de passe provisoires');

// --- Textes : tout code a sa phrase FR et EN ---
const codes = Object.keys(IMPORT_ERROR_TEXT).concat(Object.keys(IMPORT_PROBLEM_TEXT));
eq(codes.every(c => { const t = (IMPORT_ERROR_TEXT as any)[c] || (IMPORT_PROBLEM_TEXT as any)[c]; return t.fr && t.en && t.fr !== t.en; }), true, 'textes : chaque code a une phrase en français et en anglais, différentes');

// --- Fichier Excel réel (écrit puis relu avec la bibliothèque du site) ---
(async () => {
  const mod: any = await import('xlsx'); const XLSX = mod.default ?? mod;
  const ws: any = XLSX.utils.aoa_to_sheet([['Nom', 'Montant', 'Date', 'Actif'], ['Aina', 1200.5, 46320, true], ['Vola', '', '', false], [null, null, null, null], ['Zo', 7, 'texte', 'x']]);
  ws['C2'].z = 'dd/mm/yyyy'; // case de date
  ws['C2'].t = 'n';
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Feuille1'); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Autre']]), 'Feuille2');
  const buf: ArrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const m = await matrixFromWorkbookData(new Uint8Array(buf));
  eq(m, [['Nom', 'Montant', 'Date', 'Actif'], ['Aina', '1200.5', '2026-10-25', 'oui'], ['Vola', '', '', 'non'], ['Zo', '7', 'texte', 'x']], 'Excel : premier onglet seulement, nombre, date (AAAA-MM-JJ), oui/non, ligne vide retirée');
  eq(cellToText({ t: 'e', v: 15 }, XLSX), '', 'Excel : une erreur de formule n\'est pas une donnée');
  eq(cellToText(undefined, XLSX), '', 'Excel : case absente');
  eq(await matrixFromWorkbookData(new Uint8Array(0)).then(x => x.length).catch(() => 'erreur'), 0 as unknown, 'Excel : contenu vide : liste vide ou erreur, jamais de plantage du site');
  // un CSV jamais d\'accord avec un faux .xlsx
  eq(await matrixFromWorkbookData(new TextEncoder().encode('ceci n\'est pas un classeur')).then(x => x.length >= 0).catch(() => true), true, 'Excel : un faux fichier ne plante pas le site');

  console.log(`\n${n - fails}/${n} contrôles réussis`);
  if (fails) {   console.log(`${fails} ÉCHEC(S)`); process.exit(1); }
})();

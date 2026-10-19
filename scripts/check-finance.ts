// Contrôle des règles de l'onglet Finances (sans réseau). Lancer : npm run check:finance
// Vérifie les calculs (montants, filtres, soldes) ET que toute ligne acceptée par le site est aussi acceptée par le serveur (cleanCash).
import fs from 'node:fs';
import { transformSync } from 'esbuild';
import { categoriesFor, checkDraft, filterCash, parseAmount, periodMoney, sumCash } from '../src/utils/finance';
import type { CashEntry } from '../src/types';

let fails = 0, n = 0;
const ok = (c: boolean, name: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };

// --- montants ---
ok(parseAmount('1 500') === 1500, 'montant « 1 500 » = 1500');
ok(parseAmount('1\u00a0500,4') === 1500.4, 'montant avec espace insécable et virgule');
ok(Number.isNaN(parseAmount('')) && Number.isNaN(parseAmount('abc')), 'montant vide ou texte = pas un nombre');

// --- vérification d'une ligne ---
const base = { kind: 'in' as const, category: 'Paiement client', amount: '150 000', date: '2026-10-18', note: 'Client A', client_name: 'Client A' };
const good = checkDraft(base);
ok(good.ok && good.clean.amount_ar === 150000 && good.clean.kind === 'in', 'ligne valide acceptée, montant en nombre');
ok(!checkDraft({ ...base, amount: 0 }).ok && !checkDraft({ ...base, amount: -5 }).ok, 'montant 0 ou négatif refusé');
ok(!checkDraft({ ...base, amount: '0,4' }).ok, 'montant qui s\'arrondit à 0 refusé');
ok(!checkDraft({ ...base, amount: 2e12 }).ok, 'montant énorme refusé');
ok(!checkDraft({ ...base, amount: 'abc' }).ok, 'montant texte refusé');
ok(!checkDraft({ ...base, date: '2026-02-30' }).ok && !checkDraft({ ...base, date: '18/10/2026' }).ok && !checkDraft({ ...base, date: '' }).ok, 'dates fausses refusées (30 février, mauvais format, vide)');
ok(checkDraft({ ...base, date: '2028-02-29' }).ok, '29 février d\'une année bissextile accepté');
ok(!checkDraft({ ...base, category: '   ' }).ok, 'catégorie vide refusée');
const long = checkDraft({ ...base, category: 'x'.repeat(60) });
ok(long.ok && long.clean.category.length === 40, 'catégorie coupée à 40 lettres');
ok(!checkDraft({ ...base, kind: 'autre' as never }).ok, 'type inconnu refusé');
const rounded = checkDraft({ ...base, amount: '1000,6' });
ok(rounded.ok && rounded.clean.amount_ar === 1001, 'montant arrondi à l\'Ar');

// --- accord avec le serveur : ce que le site accepte, le serveur l'accepte aussi ---
const src = fs.readFileSync(new URL('../supabase/functions/df-api/index.ts', import.meta.url), 'utf8');
const m = /\/\/ ===== BEGIN CASH[^\n]*\n([\s\S]*?)\/\/ ===== END CASH =====/.exec(src);
ok(!!m, 'bloc « CASH » trouvé dans le serveur');
const js = transformSync(m![1], { loader: 'ts' }).code;
const { cleanCash } = new Function(`${js}\nreturn { cleanCash };`)() as { cleanCash: (r: any, e: any, me: string, now: string) => { ok: boolean; save?: any } };
const samples = [base, { ...base, kind: 'out' as const, category: 'Loyer', amount: 80000, client_name: '' }, { ...base, amount: '1000,6' }, { ...base, category: 'y'.repeat(60) }];
ok(samples.every(s => { const v = checkDraft(s); if (!v.ok) return false; const r = cleanCash({ id: 'c1', ...v.clean }, null, 'u1', '2026-10-19T00:00:00Z'); return r.ok && r.save.amount_ar === v.clean.amount_ar && r.save.category === v.clean.category; }), 'le serveur accepte et enregistre exactement ce que le site prépare');

// --- filtres et totaux ---
const e = (id: string, kind: 'in' | 'out', category: string, amount_ar: number, date: string, created_at = '2026-10-01T00:00:00Z'): CashEntry => ({ id, kind, category, amount_ar, date, note: '', created_at });
const list = [
  e('1', 'in', 'Paiement client', 100000, '2026-10-01'), e('2', 'out', 'Loyer', 40000, '2026-10-05'), e('3', 'in', 'Paiement client', 50000, '2026-10-31'),
  e('4', 'out', 'Internet', 20000, '2026-11-01'), e('5', 'out', 'Achats', 10000, '2026-10-05', '2026-10-05T10:00:00Z'), e('6', 'in', 'Autre entrée', 5000, '2026-09-30'),
];
const oct = filterCash(list, { start: '2026-10-01', end: '2026-10-31', kind: 'all', category: '' });
ok(oct.map(x => x.id).join() === '3,5,2,1', 'période : bornes comprises, plus récent d\'abord, même jour = le plus récemment créé en premier');
ok(filterCash(list, { start: '2026-10-01', end: '2026-10-31', kind: 'in', category: '' }).map(x => x.id).join() === '3,1', 'filtre « entrées »');
ok(filterCash(list, { start: '2026-10-01', end: '2026-10-31', kind: 'all', category: 'Loyer' }).map(x => x.id).join() === '2', 'filtre par catégorie');
ok(filterCash([], { start: '2026-10-01', end: '2026-10-31', kind: 'all', category: '' }).length === 0, 'aucune ligne : liste vide, sans erreur');
const s = sumCash(oct);
ok(s.in === 150000 && s.out === 50000 && s.countIn === 2 && s.countOut === 2, 'totaux entrées et sorties');

// --- catégories proposées ---
const cats = categoriesFor('out', [...list, e('7', 'out', 'Cadeaux', 1, '2026-10-02'), e('8', 'out', 'Achats', 1, '2026-10-02')]);
ok(cats[0] === 'Achats' && cats.includes('Cadeaux') && cats.filter(c => c === 'Achats').length === 1, 'catégories : celles de départ + celles déjà utilisées, sans doublon');
ok(categoriesFor('in', []).join() === 'Paiement client,Autre entrée', 'catégories des entrées par défaut');

// --- solde de la période ---
const pm = periodMoney(oct, 60000);
ok(pm.received === 150000 && pm.spent === 50000 && pm.salaries === 60000 && pm.totalOut === 110000 && pm.net === 40000, 'solde = reçu − dépenses − salaires');
ok(periodMoney([], 0).net === 0 && periodMoney([], -5).salaries === 0, 'rien du tout : zéros ; salaire négatif ramené à 0');
ok(periodMoney([e('9', 'out', 'Loyer', 100, '2026-10-01')], 0).net === -100, 'solde négatif possible (perte)');
ok(periodMoney(oct, 60000.4).salaries === 60000, 'salaires arrondis à l\'Ar');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);

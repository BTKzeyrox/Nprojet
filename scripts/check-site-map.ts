// Contrôle de la carte du site (M11.8) : chaque page du menu a sa fiche, fiches complètes en FR et EN, réglages liés qui existent. Pur. Lancer : npm run check:site-map
import fs from 'node:fs';
import { SITE_MAP, findPage, pagesFor } from '../src/utils/siteKnowledge';
import { COMPANY_SPEC } from '../src/utils/companyRules';
import { isKnownView } from '../src/utils/health/menu';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };

// Les pages du menu, lues dans le vrai fichier du menu
const sidebar = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');
const navBlock = sidebar.slice(sidebar.indexOf('const navItems'), sidebar.indexOf('];', sidebar.indexOf('const navItems')));
const menuIds = [...new Set([...navBlock.matchAll(/\{ id: '([a-z-]+)'/g)].map(m => m[1]))];
ok(menuIds.length >= 15, `menu : ${menuIds.length} pages trouvées dans le menu (${menuIds.join(', ')})`);
for (const id of menuIds) ok(!!findPage(id), `fiche : la page « ${id} » du menu a sa fiche`);
const mapIds = SITE_MAP.map(p => p.id);
ok(mapIds.length === new Set(mapIds).size, 'fiches : identifiants uniques');
for (const id of mapIds) ok(menuIds.includes(id), `fiche : « ${id} » correspond à une vraie page du menu (pas de fiche orpheline)`);

// Complétude
const txt = (b: { fr: string; en: string }) => b.fr.trim().length > 0 && b.en.trim().length > 0;
for (const p of SITE_MAP) {
  const all = [p.title, p.purpose, ...p.howto, ...p.rules, ...p.figures.flatMap(f => [f.name, f.formula])];
  ok(all.every(txt), `${p.id} : tous les textes existent en FR et en EN`);
  ok(p.howto.length === 3, `${p.id} : mode d'emploi en 3 lignes`);
  ok(p.purpose.fr.length <= 260 && p.howto.every(h => h.fr.length <= 130) && p.rules.every(r => r.fr.length <= 200), `${p.id} : textes courts (lisibles sur téléphone)`);
  ok(all.every(x => x.en.trim().toLowerCase() !== x.fr.trim().toLowerCase() || /^[A-Za-zÀ-ÿ ]{1,20}$/.test(x.en)), `${p.id} : l'anglais n'est pas une copie du français`);
  ok(all.every(x => !/[àâçéèêëîïôùûœ]/i.test(x.en)), `${p.id} : aucun accent français dans l'anglais`);
  ok(all.every(x => !/undefined|\bNaN\b|\[object|\bTODO\b|xxx/.test(x.fr + x.en)), `${p.id} : aucun texte cassé`);
  for (const c of p.conditions || []) { const [s, k] = c.split('.'); ok(!!(COMPANY_SPEC as any)[s]?.[k], `${p.id} : le réglage lié « ${c} » existe dans les Conditions`); }
  ok(isKnownView(p.id) || ['feed', 'grid', 'profile', 'my-performance'].includes(p.id), `${p.id} : identifiant de page connu`);
}

// Rôles : chaque rôle a des fiches, et l'employé n'a aucune fiche réservée à l'admin dans son menu
const adminPages = pagesFor('admin').map(p => p.id), empPages = pagesFor('employee').map(p => p.id);
ok(adminPages.length >= 12 && empPages.length >= 6, `rôles : ${adminPages.length} fiches pour l'admin, ${empPages.length} pour l'employé`);
for (const id of ['clients', 'stats', 'health', 'errors', 'validations']) ok(!empPages.includes(id), `rôles : la fiche « ${id} » n'est pas donnée à l'employé`);
// Les fiches pour l'employé ne parlent ni de prix clients ni de finances de l'entreprise
for (const id of ['grid', 'profile', 'feed', 'chat', 'calendar']) { const p = findPage(id)!; ok(!/Encaissé|Facturé|Bénéfice|Marge/.test(JSON.stringify(p)), `rôles : la fiche « ${id} » (vue par l'employé) ne contient aucun chiffre d'entreprise`); }

// Les formules importantes sont bien écrites comme le code les calcule
const f = (page: string, name: string) => findPage(page)!.figures.find(x => x.name.fr === name)?.formula.fr || '';
ok(/Bénéfice ÷ encaissé/.test(f('stats', 'Marge')) && /Encaissé − dépenses/.test(f('stats', 'Bénéfice')) && /Facturé − encaissé/.test(f('stats', 'À encaisser')), 'formules : marge, bénéfice, à encaisser comme dans financeStats.ts');
ok(/Brut \+ primes − retenues appliquées − avances remboursées/.test(f('advances', 'Net')), 'formules : le net comme dans le serveur (df-api)');
const fin = fs.readFileSync('src/utils/financeStats.ts', 'utf8');
ok(fin.includes('Marge = bénéfice ÷ encaissé') && fin.includes('Bénéfice = encaissé − dépenses') && fin.includes('À encaisser = facturé − encaissé'), 'formules : le code source dit toujours la même chose (si ce contrôle échoue, la fiche est à relire)');
const srv = fs.readFileSync('supabase/functions/df-api/index.ts', 'utf8');
ok(srv.includes('net: afterPen - advDeducted') && srv.includes('Math.min(pen, total)'), 'formules : le serveur calcule toujours le net comme la fiche le dit');
const cl = fs.readFileSync('src/utils/clients.ts', 'utf8');
ok(cl.includes('new_days: 60, regular_missions: 3, regular_months: 6') && cl.includes('strategic_top_pct: 20, strategic_months: 12, strategic_min_missions: 5') && cl.includes('inactive_days: 90'), 'formules : les valeurs de départ des statuts clients sont celles de la fiche');
ok(!/(password|mot de passe)\s*[:=]\s*\S{4,}|sk-[A-Za-z0-9]{10,}|ghp_/.test(JSON.stringify(SITE_MAP)), 'sécurité : aucune clé ni mot de passe dans la carte');

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);

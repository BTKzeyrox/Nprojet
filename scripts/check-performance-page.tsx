// Essai des écrans « Scores et badges » (module 3, M3.3) : démo responsable et opérateur, vie privée (D8, D9), FR et EN, sans réseau.
// Lancer : npm run check:performance-page
import React from 'react';
import { renderToString } from 'react-dom/server';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
let calls = 0; g.fetch = async () => { calls++; throw new Error('RESEAU'); };

const { db } = await import('../src/db/store');
const { AppProvider } = await import('../src/context/AppContext');
const { PerformanceScores } = await import('../src/views/admin/PerformanceScores');
const { PerformancePage } = await import('../src/views/admin/PerformancePage');
const { MyPerformance } = await import('../src/components/MyPerformance');
const { performanceInput, badgeAccess, canSeeProfileBadges } = await import('../src/utils/usePerformance');
const { computePerformance, rankByScore } = await import('../src/utils/performanceScore');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const bad = (html: string) => /NaN|Infinity|undefined|\[object|\bnull\b/.test(html);
const clean = (html: string) => html.replace(/<!-- -->/g, '').replace(/&#x27;/g, "'").replace(/[\u00a0\u202f]/g, ' ');
const show = (el: React.ReactElement, lang: 'fr' | 'en') => { mem.delta_lang = lang; return clean(renderToString(<AppProvider>{el}</AppProvider>)); };

// ---------- responsable (démo) ----------
const admin = db.enterDemo('admin');
const res = computePerformance(performanceInput());
const ranking = rankByScore(res);
ok(res.team.size >= 3, `démo : ${res.team.size} salariés actifs`);
ok(ranking.some(r => r.score !== null), 'démo : au moins un salarié a un score');
const names = [...res.employees.values()].map(p => p.name);

for (const lang of ['fr', 'en'] as const) {
  const html = show(<PerformanceScores />, lang);
  ok(!bad(html), `${lang} : Scores et badges : aucun NaN, « undefined » ni « null » affichés`);
  ok(names.every(nm => html.includes(nm)), `${lang} : tous les salariés sont dans le classement`);
  ok(html.includes(lang === 'en' ? 'Employee of the month' : 'Employé du mois'), `${lang} : carte « Employé du mois »`);
  ok(html.includes(lang === 'en' ? 'Ranking of the last 30 days' : 'Classement des 30 derniers jours'), `${lang} : titre du classement`);
  ok(html.includes('min-h-[44px]'), `${lang} : cibles tactiles de 44 px`);
  ok(html.includes('aria-expanded="false"'), `${lang} : les lignes sont repliées au départ`);
}
{
  const html = show(<PerformancePage />, 'fr');
  ok(!bad(html) && html.includes('Tableau') && html.includes('Scores et badges'), 'page Performance : deux onglets (Tableau, Scores et badges)');
  ok(html.includes('Taux d\'acceptation') || html.includes('Taux d’acceptation'), 'page Performance : le tableau existant est toujours là');
  ok(show(<PerformancePage />, 'en').includes('Scores and badges'), 'page Performance : onglets en anglais');
}
ok(badgeAccess().enabled === true && badgeAccess().seesBadges === true && badgeAccess().seesAttention === false, 'responsable : réglages Badges lus depuis la page Conditions (oui, oui, non au départ)');

// badges désactivés : la page le dit au lieu d'afficher
{
  const s = db.getSettings() as any;
  const before = s.company.options.badges_enabled;
  s.company.options.badges_enabled = false;
  ok(badgeAccess().enabled === false, 'réglage « badges désactivés » : lu');
  s.company.options.badges_enabled = before;
}

// ---------- opérateur (démo) : sa page, rien des autres ----------
const me = db.enterDemo('employee');
const mine = computePerformance(performanceInput()).employees.get(me.id)!;
const others = [...computePerformance(performanceInput()).employees.values()].filter(p => p.id !== me.id);
ok(!!mine && others.length >= 2, `opérateur démo : ${others.length} collègues dans les données`);
ok(badgeAccess().enabled && badgeAccess().seesBadges && !badgeAccess().seesAttention, 'opérateur : reçoit les 3 réglages Badges (oui, oui, non)');
for (const lang of ['fr', 'en'] as const) {
  const html = show(<MyPerformance />, lang);
  ok(!bad(html), `${lang} : Ma performance : aucun NaN, « undefined » ni « null » affichés`);
  ok(html.includes(lang === 'en' ? 'My performance' : 'Ma performance'), `${lang} : titre de la page`);
  ok(others.every(o => !html.includes(o.name)), `${lang} : aucun nom de collègue affiché (D8)`);
  ok(!/Classement|Ranking|Employé du mois|Employee of the month/.test(html), `${lang} : ni classement ni « Employé du mois »`);
  ok(!/Points d'attention|Points of attention/.test(html), `${lang} : aucun point d'attention (D9)`);
  ok(!/How the score is calculated|Comment le score est calculé/.test(html) && !/\d+ \/ 100<\/span>/.test(html), `${lang} : par défaut, aucune partie faible du score n'est détaillée (D9 : seulement les réussites)`);
  ok(mine.score === null ? /Not enough data|Pas assez de données/.test(html) : /combines the quality|réunit la qualité/.test(html), `${lang} : le score est quand même expliqué en une phrase`);
}
// l'admin a choisi que le salarié voie ses points d'attention : ils apparaissent seulement s'il y en a
{
  const s = db.getSettings() as any;
  s.company.options.employee_sees_attention = true;
  const withAttn = computePerformance(performanceInput()).employees.get(me.id)!;
  const html = show(<MyPerformance />, 'fr');
  ok(withAttn.attention.length === 0 ? !/Points d'attention/.test(html) : /Points d'attention/.test(html), 'réglage « le salarié voit ses points d\'attention » : respecté');
  ok(withAttn.score === null || /Comment le score est calculé/.test(html), 'avec ce réglage, le détail du score (4 parties) est ouvert au salarié');
  ok(withAttn.attention.length === 0 || !html.includes('visibles par le responsable seulement'), 'le salarié ne lit jamais « visibles par le responsable seulement »');
  s.company.options.employee_sees_attention = false;
}
// accès fermé par défaut : si le serveur n'a pas (encore) envoyé les réglages, l'opérateur ne voit rien
{
  const s = db.getSettings() as any;
  const saved = s.company.options;
  delete s.company.options;
  ok(!badgeAccess().enabled && !badgeAccess().seesBadges, 'serveur sans réglages Badges : accès fermé');
  const html = show(<MyPerformance />, 'fr');
  ok(html.includes('pas activée') && !/\d+\s*\/\s*100/.test(html) && !html.includes('Comment le score'), 'serveur sans réglages Badges : la page dit « pas activée » et ne montre aucun score');
  s.company.options = { ...saved, badges_enabled: false };
  ok(show(<MyPerformance />, 'fr').includes('pas activée'), 'badges désactivés par le responsable : la page dit « pas activée »');
  s.company.options = { ...saved, employee_sees_badges: false };
  ok(show(<MyPerformance />, 'en').includes('not turned on'), 'le salarié ne doit pas voir ses badges : page fermée (en anglais aussi)');
  s.company.options = saved;
}

// ---------- fiche Profil : qui voit quoi ----------
{
  const [a, b] = others.map(o => (db.getUsers().find(u => u.id === o.id))!);
  const meUser = db.getCurrentUser()!;
  ok(canSeeProfileBadges(meUser, meUser), 'fiche Profil : le salarié voit ses propres badges');
  ok(!canSeeProfileBadges(meUser, a), 'fiche Profil : le salarié ne voit pas les badges d\'un collègue');
  ok(!canSeeProfileBadges(a, b), 'fiche Profil : un collègue ne voit pas ceux d\'un autre');
  ok(canSeeProfileBadges(admin, a) && canSeeProfileBadges(admin, meUser), 'fiche Profil : le responsable voit ceux de tous les salariés');
  ok(!canSeeProfileBadges(admin, admin) && !canSeeProfileBadges(null, a), 'fiche Profil : pas pour un compte non salarié, pas sans connexion');
}

ok(calls === 0, `aucun appel réseau (${calls})`);
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);

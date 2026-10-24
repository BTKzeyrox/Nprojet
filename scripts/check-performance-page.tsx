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
const { ClientsPage } = await import('../src/views/admin/ClientsPage');
const { computeClientBadges } = await import('../src/utils/clientBadges');
const { summarizeClients, clientMissionsFromPosts } = await import('../src/utils/clients');
const { todayMada } = await import('../src/utils/stats');
const { PerformanceSettings, fromRaw } = await import('../src/components/PerformanceSettings');
const { PERFORMANCE_DEFAULTS } = await import('../src/utils/performanceScore');
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


// ---------- Réglages > Performance (M3.4) ----------
{
  const html = show(<PerformanceSettings lang="fr" />, 'fr');
  ok(!bad(html) && html.includes('Période du score') && html.includes('Seuils des badges') && html.includes('Poids des 4 parties'), 'Réglages Performance : sections présentes, rien de cassé');
  ok(show(<PerformanceSettings lang="en" />, 'en').includes('Score period'), 'Réglages Performance : anglais');
  ok((html.match(/min-h-\[44px\]/g) || []).length >= 20 && html.includes('<label for="perf-window_days"'), 'Réglages Performance : champs de 44 px avec étiquette');
  const D = PERFORMANCE_DEFAULTS;
  const raw = (over: Record<string, string> = {}) => ({ window_days: '30', score_min_missions: '10', quality_min_missions: '20', 'w.quality': '40', 'w.volume': '25', 'w.punctuality': '20', 'w.regularity': '15', 'quality_levels.0': '90', 'quality_levels.1': '95', 'quality_levels.2': '98', 'punctuality_levels.0': '90', 'punctuality_levels.1': '95', 'punctuality_levels.2': '100', 'streak_levels.0': '5', 'streak_levels.1': '10', 'streak_levels.2': '20', 'rendement_levels.0': '10', 'rendement_levels.1': '25', 'rendement_levels.2': '40', 'versatility_levels.0': '2', 'versatility_levels.1': '3', 'versatility_levels.2': '5', rookie_missions: '10', rookie_days: '90', month_min_team: '5', min_duration_min: '2', max_duration_min: '960', default_work_days: '6', ...over });
  ok(JSON.stringify(fromRaw(raw(), 'fr').value) === JSON.stringify(D) && fromRaw(raw(), 'fr').errors.length === 0, 'saisie = valeurs de départ : aucune erreur, réglages identiques');
  ok(fromRaw(raw({ window_days: '45' }), 'fr').value.window_days === 45, 'fenêtre 45 : acceptée');
  ok(fromRaw(raw({ window_days: '3' }), 'fr').errors.length === 1, 'fenêtre 3 : refusée avec un message (pas corrigée en silence)');
  ok(fromRaw(raw({ window_days: '' }), 'fr').errors.length === 1 && fromRaw(raw({ window_days: 'abc' }), 'fr').errors.length === 1, 'champ vide ou texte : refusé');
  ok(fromRaw(raw({ window_days: '30.5' }), 'fr').errors.length === 1, 'nombre à virgule là où il faut un entier : refusé');
  ok(fromRaw(raw({ 'w.quality': '0', 'w.volume': '0', 'w.punctuality': '0', 'w.regularity': '0' }), 'fr').errors.length === 1, 'poids tous à 0 : refusé');
  ok(fromRaw(raw({ 'quality_levels.0': '96' }), 'fr').errors.some(e => e.includes('doivent monter')), 'niveaux qui ne montent pas : refusés avec le nom du badge');
  ok(fromRaw(raw({ 'quality_levels.2': '101' }), 'fr').errors.length >= 1, 'seuil au-dessus de 100 % : refusé');
  ok(fromRaw(raw({ min_duration_min: '60', max_duration_min: '60' }), 'fr').errors.length >= 1, 'durée courte ≥ durée longue : refusée');
  ok(fromRaw(raw({ window_days: '3', 'w.quality': 'x' }), 'en').errors.length === 2 && fromRaw(raw({ window_days: '3' }), 'en').errors[0].includes('Score period'), 'erreurs en anglais, une par champ faux');
  // un réglage enregistré change vraiment le calcul, pour le responsable comme pour le salarié
  const s = db.getSettings() as any;
  db.enterDemo('admin');
  (db as any).updateSettings({ performance: { ...D, window_days: 60 } });
  ok(computePerformance(performanceInput()).cfg.window_days === 60, 'réglage enregistré : le calcul utilise la fenêtre de 60 jours');
  const emp = db.enterDemo('employee');
  (db as any).updateSettings({ performance: { ...D, window_days: 60 } });
  ok(computePerformance(performanceInput()).cfg.window_days === 60 && !!emp, 'le salarié calcule avec les mêmes réglages');
  (db as any).updateSettings({ performance: undefined });
  ok(computePerformance(performanceInput()).cfg.window_days === 30, 'sans réglage enregistré : valeurs de départ');
  void s;
}


// ---------- badges et score de relation des clients (M3.6), démo responsable ----------
{
  db.enterDemo('admin');
  const showClients = (lang: 'fr' | 'en', open?: string) => show(<ClientsPage initialOpen={open} />, lang);
  const cls = db.getClients(), st = db.getSettings() as any;
  const ms = clientMissionsFromPosts(db.getPosts(), db.getContracts(), cls, { client_price_default_ar: st.client_price_default_ar, client_prices_by_type: st.client_prices_by_type });
  const pf = computeClientBadges({ clients: cls, summaries: summarizeClients(cls, ms, todayMada()), missions: ms, invoices: db.getInvoices(), cash: db.getCash(), today: todayMada() });
  const withAttention = cls.filter(c => (pf.clients.get(c.id)?.attention.length || 0) > 0);
  const watch = cls.find(c => pf.clients.get(c.id)!.badges.some(b => b.id === 'watch'));
  ok(!!watch && withAttention.length >= 1, `démo clients : ${withAttention.length} client(s) avec point d'attention`);
  const fr = showClients('fr'), en = showClients('en');
  ok(fr.includes('À surveiller') && fr.includes('Gros volume'), 'clients : badges « À surveiller » et « Gros volume » dans la liste');
  ok(en.includes('To watch') && en.includes('High volume'), 'clients (anglais) : badges traduits');
  ok(fr.includes(`Points d'attention (${withAttention.length})`) && en.includes(`Needs attention (${withAttention.length})`), 'clients : filtre « Points d\'attention » avec le bon nombre');
  ok(!bad(fr + en), 'clients : aucun NaN ni « undefined » affichés');
  const open = showClients('fr', watch!.id);
  ok(open.includes('Score de relation') && open.includes('Ponctualité de paiement') && open.includes('Régularité des commandes'), 'fiche client ouverte : score de relation et ses 3 parties');
  ok(/Facture FA-[^ ]+ en retard de \d+ jours/.test(open), 'fiche client ouverte : « À surveiller » dit pourquoi (facture, jours de retard)');
  ok(showClients('en', watch!.id).includes('Relationship score'), 'fiche client ouverte (anglais) : score de relation');
  // l'alerte d'accueil
  const { getAdminAlerts } = await import('../src/utils/alertsDb');
  const al = getAdminAlerts().find(a => a.id === 'clients_watch');
  ok(!!al && al.go === 'clients' && /à surveiller/.test(al.fr) && /to watch/.test(al.en), 'accueil : alerte « clients à surveiller » qui ouvre la page Clients');
  // un salarié n'a ni clients ni alerte
  db.enterDemo('employee');
  ok(getAdminAlerts().length === 0 && db.getClients().length === 0, 'opérateur : aucune alerte d\'admin, aucun client');
}


// ---------- publication « Employé du mois » (M3.7) ----------
{
  db.enterDemo('admin');
  const html0 = show(<PerformanceScores />, 'fr');
  ok(!html0.includes('Publier dans Actualités'), 'employé du mois : pas de bouton tant qu\'il n\'y a pas de gagnant (équipe trop petite)');
  (db as any).updateSettings({ performance: { quality_min_missions: 1, month_min_team: 2 } });
  const { employeeOfMonthPost } = await import('../src/utils/recognition');
  const { previousMonth } = await import('../src/utils/usePerformance');
  const inp = performanceInput();
  const eom = (await import('../src/utils/performanceScore')).employeeOfMonth(inp, previousMonth(inp.today));
  const html1 = show(<PerformanceScores />, 'fr');
  ok(eom.winners.length > 0 && html1.includes('Publier dans Actualités') && html1.includes(eom.winners[0].name), 'employé du mois : le mois fini a un gagnant et un bouton « Publier dans Actualités »');
  ok((html1.match(/Publier dans Actualités/g) || []).length === 1, 'employé du mois : pas de bouton pour le mois en cours (pas fini)');
  const post = employeeOfMonthPost(previousMonth(inp.today), eom.winners, 'fr')!;
  ok(!/\d+\s*\/\s*100|\d+ Ar/.test(post.text), 'publication : ni score ni argent');
  const before = db.getNews().length;
  const out = db.publishNews({ title: post.title, text: post.text });
  ok(out.success && db.getNews().length === before + 1, 'publication : le responsable la publie en un clic');
  ok(show(<PerformanceScores />, 'fr').includes('Déjà publié dans Actualités') && !show(<PerformanceScores />, 'fr').includes('Publier dans Actualités'), 'employé du mois : après publication, « Déjà publié » (pas de doublon)');
  ok(show(<PerformanceScores />, 'en').includes('Already published') || !show(<PerformanceScores />, 'en').includes('Publish in News'), 'employé du mois (anglais) : pas de second bouton');
  (db as any).updateSettings({ performance: undefined });
}

ok(calls === 0, `aucun appel réseau (${calls})`);
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);

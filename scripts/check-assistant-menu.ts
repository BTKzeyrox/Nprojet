// Contrôle du menu « / » de l'assistant : chaque message prêt déclenche bien la bonne réponse (FR et EN), sans nom de personne, et le bouton est dans le champ.
// Lancer : npm run check:assistant-menu
import { readFileSync } from 'node:fs';
import { assistantMenu, filterMenu, menuLabel, pageItems, FIGURE_MENU } from '../src/utils/assistantMenu';
import { detectIntent, explainPage } from '../src/utils/assistant';
import { SITE_MAP } from '../src/utils/siteKnowledge';
import { TEMPLATES } from '../src/utils/messageTemplates';
import { detectShortcut, type Shortcut } from '../src/utils/assistantShortcuts';
import { FIGURE_IDS } from '../src/utils/siteSnapshot';
import { buildDemoData } from '../src/demo/demoData';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };

const demo = buildDemoData();
const menu = assistantMenu(null);
const all = menu.flatMap(g => g.items.map(it => ({ g: g.id, it })));
const get = (id: string) => all.find(x => x.it.id === id)!.it;

// ---------- forme
ok(menu.map(g => g.id).join() === 'summaries,today,money,complete,compose,pages,help' && menu.every(g => g.items.length > 0), 'menu : 7 groupes (Résumés, À traiter, Argent et chiffres, À compléter, Rédiger un message, Pages, Aide), aucun vide');
ok(new Set(all.map(x => x.it.id)).size === all.length, 'menu : chaque message a un identifiant unique');
ok(all.every(x => x.it.label.fr && x.it.label.en && x.it.send.fr && x.it.send.en && x.it.label.fr.length <= 48 && x.it.label.en.length <= 48 && ['send', 'fill', 'compose'].includes(x.it.kind)), 'menu : libellés et messages en français et en anglais, libellés courts (48 caractères au plus), chaque message a son mode (envoyer, compléter ou rédiger)');
ok(menu.every(g => g.title.fr && g.title.en), 'menu : chaque groupe a un titre FR et EN');
const pagesExpected = SITE_MAP.filter(p => p.audience !== 'employee');
ok(all.length === 5 + 5 + 13 + 4 + TEMPLATES.length + pagesExpected.length + 1 && pagesExpected.length === 24 && TEMPLATES.length === 6, 'menu : 58 messages (5 résumés, 5 à traiter, argent du mois + 12 chiffres, 4 à compléter, 6 modèles, 24 pages, aide)');

// ---------- chaque message déclenche la bonne réponse
const kind = (t: string) => detectIntent(t).kind;
for (const l of ['fr', 'en'] as const) {
  const s = (id: string) => get(id).send[l];
  ok(kind(s('morning')) === 'morning' && detectShortcut(s('morning')) === 'morning', `${l} : « Résumé du jour » = le résumé du jour`);
  ok(kind(s('todo')) === 'todo', `${l} : « Quoi faire maintenant ? » = les actions utiles`);
  ok(kind(s('suggest')) === 'suggest', `${l} : « Suggestions » = les solutions`);
  ok(kind(s('team')) === 'team', `${l} : « Liste les employés » = l'équipe`);
  ok(detectShortcut(s('working')) === 'working', `${l} : « Qui travaille maintenant » = le bouton du même nom`);
  ok(['validate', 'advances', 'overdue', 'stock', 'silent'].every(id => detectShortcut(s(id)) === id), `${l} : les 5 messages « à traiter » = les 5 boutons du bas`);
  ok(detectShortcut(s('money')) === 'money', `${l} : « Argent du mois » = le bouton du même nom`);
  ok(FIGURE_IDS.every(f => { const it = detectIntent(s(`figure-${f}`)); return it.kind === 'figure' && (it as any).id === f; }), `${l} : les 12 « Pourquoi… » expliquent bien le bon chiffre (« à encaisser » n'est pas pris pour « encaissé »)`);
  ok(kind(s('help')) === 'help', `${l} : « Aide » = ce que l'assistant sait faire`);
}
// ---------- à compléter (M24.3) : le texte se met dans le champ, une fois complété l'assistant le comprend
const demoInput = { users: demo.users } as any;
const firstEmp = demo.users.find(u => u.role === 'employee')!;
for (const l of ['fr', 'en'] as const) {
  const f = (id: string) => { const it = get(id); return it.kind === 'fill' ? it.send[l] : ''; };
  const sal = detectIntent(`${f('whatif-salary')}10 %`) as any, exp = detectIntent(`${f('whatif-expenses')}10 %`) as any, pr = detectIntent(`${f('whatif-price')}5 %`) as any;
  ok(pr.kind === 'whatif' && pr.w.clientPricePct === 5, `${l} : « prix client monte de… » + 5 % = +5 % sur le prix client`);
  ok(sal.kind === 'whatif' && sal.w.salaryPct === -10, `${l} : « salaires baissent de… » + 10 % = −10 % sur les salaires`);
  ok(exp.kind === 'whatif' && exp.w.expensesPct === -10, `${l} : « dépenses baissent de… » + 10 % = −10 % sur les dépenses`);
  const rc = detectIntent(`${f('recap')}${firstEmp.name}`, demoInput) as any;
  ok(rc.kind === 'employee' && rc.id === firstEmp.id, `${l} : « Récap de… » + le nom d'un employé = son récap`);
  ok(detectIntent(f('whatif-price')).kind === 'whatif' && (detectIntent(f('whatif-price')) as any).w.clientPricePct === undefined, `${l} : sans pourcentage, l'assistant ne devine rien (il demande le pourcentage)`);
}
ok(all.filter(x => x.g === 'complete').every(x => x.it.kind === 'fill' && /\s$/.test(x.it.send.fr) && /\s$/.test(x.it.send.en)) && all.filter(x => x.g !== 'complete' && x.g !== 'compose').every(x => x.it.kind === 'send'), 'à compléter : le texte finit par un espace (on continue d\'écrire) ; tous les autres messages partent tout de suite');

// ---------- rédiger un message (M24.4)
const comp = all.filter(x => x.g === 'compose').map(x => x.it);
ok(comp.length === TEMPLATES.length && TEMPLATES.every(tp => comp.some(c => c.tpl === tp.id && c.kind === 'compose' && c.label.fr === tp.name.fr && c.label.en === tp.name.en)), 'rédiger : un message par modèle, avec le nom du modèle en français et en anglais');
ok(new Set(comp.map(c => c.tpl)).size === comp.length, 'rédiger : chaque modèle une seule fois');

// ---------- recherche
const names = (q: string) => filterMenu(menu, q).flatMap(g => g.items.map(i => i.id));
ok(filterMenu(menu, '') === menu && filterMenu(menu, '   ') === menu, 'recherche : rien de tapé = tout le menu');
ok(names('marge').includes('figure-margin') && names('MARGE').includes('figure-margin') && names('margin').includes('figure-margin'), 'recherche : sans majuscule ni accent, en français ou en anglais');
ok(names('tresorerie').includes('figure-treasury') && names('tresorerie').includes('page-treasury') && names('trésorerie').length === names('tresorerie').length, 'recherche : « trésorerie » trouve le chiffre ET la page, avec ou sans accent');
ok(names('valeur stock').join() === 'figure-stockValue', 'recherche : plusieurs mots, tous doivent être là (« valeur stock »)');
ok(names('zzzzqq').length === 0 && filterMenu(menu, 'zzzzqq').length === 0, 'recherche : aucun résultat = liste vide, aucun plantage');
ok(filterMenu(menu, 'relance').some(g => g.id === 'compose') && filterMenu(menu, 'relance').every(g => g.items.length > 0), 'recherche : « relance » trouve le modèle de relance ; les groupes sans résultat disparaissent');
ok(JSON.stringify(filterMenu(menu, 'a').map(g => g.id)) === JSON.stringify(menu.map(g => g.id).filter(id => filterMenu(menu, 'a').some(g => g.id === id))), 'recherche : l\'ordre des groupes est gardé');

// ---------- pages
const pageIt = all.filter(x => x.g === 'pages').map(x => x.it);
ok(pageIt.length === pagesExpected.length && pagesExpected.every(p => pageIt.some(i => i.id === `page-${p.id}`)), 'pages : toutes les pages de la carte du site que l\'admin voit sont dans le menu (une nouvelle page apparaît toute seule)');
ok(SITE_MAP.filter(p => p.audience === 'employee').every(p => !pageIt.some(i => i.id === `page-${p.id}`)) && SITE_MAP.some(p => p.audience === 'employee'), 'pages : les pages réservées aux employés sont laissées de côté');
for (const l of ['fr', 'en'] as const) {
  const bad = pagesExpected.filter(p => { const it = detectIntent(pageIt.find(i => i.id === `page-${p.id}`)!.send[l]); return !(it.kind === 'page' && (it as any).id === p.id); });
  ok(bad.length === 0, `${l} : « Explique la page X » ouvre la bonne fiche pour les ${pagesExpected.length} pages${bad.length ? ` (erreurs : ${bad.map(p => p.id).join(', ')})` : ''}`);
}
ok(pagesExpected.every(p => { const r = explainPage(p.id); return r.intent === 'page' && r.title.fr === p.title.fr && r.lines.length >= 2; }), 'pages : chaque fiche a un titre et du contenu');
ok(pageIt.find(i => i.id === 'page-active-post')!.label.fr === 'Mission en cours' && pageIt.find(i => i.id === 'page-hr')!.label.en === 'Human resources', 'pages : un titre à deux noms (« A / B ») garde le premier');
ok(pageItems([]).length === 0 && pageItems([{ id: 'x', audience: 'admin', title: { fr: 'Essai', en: 'Test' } }])[0].send.fr === 'Explique la page Essai', 'pages : liste vide sans plantage ; le message reprend le titre');
ok(menu.find(g => g.id === 'pages')!.collapsed === true && menu.filter(g => g.id !== 'pages').every(g => !g.collapsed), 'pages : groupe replié au départ, les autres ouverts');
ok(FIGURE_IDS.every(f => !!FIGURE_MENU[f]) && Object.keys(FIGURE_MENU).length === FIGURE_IDS.length, 'les 12 chiffres connus de l\'assistant sont tous dans le menu');

// ---------- chiffres du jour
const sc = (id: Shortcut['id'], count: number | null): Shortcut => ({ id, q: { fr: id, en: id }, label: { fr: id, en: id }, count });
const withCounts = assistantMenu([sc('overdue', 3), sc('validate', 2)]);
const today = withCounts.find(g => g.id === 'today')!.items;
ok(today.length === 5 && menuLabel(today.find(x => x.id === 'overdue')!, 'fr') === 'Factures en retard (3)' && menuLabel(today.find(x => x.id === 'validate')!, 'en') === 'To validate (2)', 'chiffre du jour : « Factures en retard (3) », « To validate (2) »');
ok(menuLabel(today.find(x => x.id === 'stock')!, 'fr') === 'Stock bas' && today.find(x => x.id === 'stock')!.count === 0, 'rien à montrer (bouton caché en bas) : le message reste dans le menu, sans chiffre');
ok(assistantMenu(null).find(g => g.id === 'today')!.items.every(x => x.count === undefined && menuLabel(x, 'fr') === x.label.fr), 'sans données : libellés simples');
ok(assistantMenu([]).find(g => g.id === 'today')!.items.every(x => x.count === 0), 'liste du jour vide : aucun chiffre, aucun plantage');

// ---------- aucun nom de personne
const NAMES = [...demo.users.map(u => u.name), ...demo.clients.map(c => c.name), ...demo.products.map(p => p.name)].filter(x => x && x.length > 2);
const text = JSON.stringify(menu);
ok(NAMES.every(nm => !text.includes(nm)), 'le menu ne contient aucun nom d\'employé, de client ou de produit');
ok(!/NaN|undefined|\[object|null/.test(text), 'le menu ne contient ni NaN ni undefined');

// ---------- le bouton est dans le champ de saisie
const ui = readFileSync(new URL('../src/components/AssistantChat.tsx', import.meta.url), 'utf8');
const pill = /<div className=\{`flex items-center gap-1\.5 rounded-3xl[\s\S]*?<\/form>/.exec(ui)?.[0] || '';
ok(/aria-haspopup="menu"/.test(pill) && /aria-expanded=\{menuOpen\}/.test(pill) && /type="button"[^>]*onClick=\{\(\) => \{ inputRef\.current\?\.blur\(\); setMenuQ\(''\); setMenuOpen/.test(pill) && pill.indexOf('aria-haspopup') < pill.indexOf('<input ref={inputRef}'), 'bouton « / » : dans le champ, à gauche de la saisie, jamais un bouton d\'envoi (type button)');
ok(/e\.key === 'Escape'\) \{ setMenuOpen\(false\); setMenuQ\(''\); \}/.test(ui), 'Échap ferme le menu et vide la recherche');
ok(/g\.collapsed \? <button type="button" aria-expanded=\{!shut\}/.test(ui) && /setFoldOpen\(v => v\.includes\(g\.id\)/.test(ui) && /\{!shut && <div className="flex flex-wrap/.test(ui), 'groupe replié : le titre est un bouton (aria-expanded) qui ouvre et ferme la liste');
const pickFn = /const pick = \(it: MenuItem\) => \{[\s\S]*?\n  \};/.exec(ui)?.[0] || '';
ok(/setMenuOpen\(false\); setMenuQ\(''\)/.test(pickFn) && /\n    ask\(msg\);/.test(pickFn), 'toucher un message : ferme le menu, vide la recherche et l\'envoie tout de suite (même chemin qu\'un message écrit)');
ok(/it\.kind === 'fill'\) \{ setText\(msg\)/.test(pickFn) && /setSelectionRange\(msg\.length, msg\.length\)/.test(pickFn), 'message à compléter : le texte va dans le champ, le curseur est à la fin, rien ne part');
ok(/it\.kind === 'compose' && it\.tpl\) \{ setComposing\(true\); setTplId\(it\.tpl\)/.test(pickFn), 'modèle de message : ouvre l\'éditeur avec ce modèle déjà choisi (rien n\'est envoyé)');
ok(/data-menu-search/.test(ui) && /type="search"/.test(ui) && /filterMenu\(menu, menuQ\)/.test(ui) && /!searching; return/.test(ui) && /Aucun message ne correspond/.test(ui), 'recherche : champ en haut du panneau, les groupes repliés s\'ouvrent pendant la recherche, message si rien ne correspond');
ok(/data-assistant-menu/.test(ui) && /max-h-\[55vh\] overflow-y-auto/.test(ui) && /min-h-\[40px\]/.test(/data-menu-group[\s\S]*?<\/div>\s*<\/div>/.exec(ui)?.[0] || ''), 'panneau : défile (55 % de la hauteur au plus), boutons de 40 px au moins pour le doigt');
ok(/quick\.map\(q => <button/.test(ui) && /Rédiger un message/.test(ui), 'les 8 boutons du bas et « Rédiger un message » sont toujours là');
ok(/disabled=\{busy\} onClick=\{\(\) => pick/.test(ui), 'pendant que l\'assistant écrit, les messages du menu sont désactivés');

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) { console.log(`${fails} ÉCHEC(S)`); process.exit(1); }

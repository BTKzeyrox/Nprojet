// Contrôle du menu « / » de l'assistant : chaque message prêt déclenche bien la bonne réponse (FR et EN), sans nom de personne, et le bouton est dans le champ.
// Lancer : npm run check:assistant-menu
import { readFileSync } from 'node:fs';
import { assistantMenu, menuLabel, pageItems, FIGURE_MENU } from '../src/utils/assistantMenu';
import { detectIntent, explainPage } from '../src/utils/assistant';
import { SITE_MAP } from '../src/utils/siteKnowledge';
import { detectShortcut, type Shortcut } from '../src/utils/assistantShortcuts';
import { FIGURE_IDS } from '../src/utils/siteSnapshot';
import { buildDemoData } from '../src/demo/demoData';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };

const menu = assistantMenu(null);
const all = menu.flatMap(g => g.items.map(it => ({ g: g.id, it })));
const get = (id: string) => all.find(x => x.it.id === id)!.it;

// ---------- forme
ok(menu.map(g => g.id).join() === 'summaries,today,money,pages,help' && menu.every(g => g.items.length > 0), 'menu : 5 groupes (Résumés, À traiter, Argent et chiffres, Pages, Aide), aucun vide');
ok(new Set(all.map(x => x.it.id)).size === all.length, 'menu : chaque message a un identifiant unique');
ok(all.every(x => x.it.label.fr && x.it.label.en && x.it.send.fr && x.it.send.en && x.it.label.fr.length <= 40 && x.it.label.en.length <= 40), 'menu : libellés et messages en français et en anglais, libellés courts (40 caractères au plus)');
ok(menu.every(g => g.title.fr && g.title.en), 'menu : chaque groupe a un titre FR et EN');
const pagesExpected = SITE_MAP.filter(p => p.audience !== 'employee');
ok(all.length === 5 + 5 + 13 + pagesExpected.length + 1 && pagesExpected.length === 24, 'menu : 48 messages (5 résumés, 5 à traiter, argent du mois + 12 chiffres, 24 pages, aide)');

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
const demo = buildDemoData();
const NAMES = [...demo.users.map(u => u.name), ...demo.clients.map(c => c.name), ...demo.products.map(p => p.name)].filter(x => x && x.length > 2);
const text = JSON.stringify(menu);
ok(NAMES.every(nm => !text.includes(nm)), 'le menu ne contient aucun nom d\'employé, de client ou de produit');
ok(!/NaN|undefined|\[object|null/.test(text), 'le menu ne contient ni NaN ni undefined');

// ---------- le bouton est dans le champ de saisie
const ui = readFileSync(new URL('../src/components/AssistantChat.tsx', import.meta.url), 'utf8');
const pill = /<div className=\{`flex items-center gap-1\.5 rounded-3xl[\s\S]*?<\/form>/.exec(ui)?.[0] || '';
ok(/aria-haspopup="menu"/.test(pill) && /aria-expanded=\{menuOpen\}/.test(pill) && /type="button"[^>]*onClick=\{\(\) => \{ inputRef\.current\?\.blur\(\); setMenuOpen/.test(pill) && pill.indexOf('aria-haspopup') < pill.indexOf('<input ref={inputRef}'), 'bouton « / » : dans le champ, à gauche de la saisie, jamais un bouton d\'envoi (type button)');
ok(/e\.key === 'Escape'\) setMenuOpen\(false\)/.test(ui), 'Échap ferme le menu');
ok(/g\.collapsed \? <button type="button" aria-expanded=\{!shut\}/.test(ui) && /setFoldOpen\(v => v\.includes\(g\.id\)/.test(ui) && /\{!shut && <div className="flex flex-wrap/.test(ui), 'groupe replié : le titre est un bouton (aria-expanded) qui ouvre et ferme la liste');
ok(/const pick = \(send[^)]*\) => \{ setMenuOpen\(false\); ask\(l === 'en' \? send\.en : send\.fr\); \}/.test(ui), 'toucher un message : ferme le menu et l\'envoie tout de suite (même chemin qu\'un message écrit)');
ok(/data-assistant-menu/.test(ui) && /max-h-\[55vh\] overflow-y-auto/.test(ui) && /min-h-\[40px\]/.test(/data-menu-group[\s\S]*?<\/div>\s*<\/div>/.exec(ui)?.[0] || ''), 'panneau : défile (55 % de la hauteur au plus), boutons de 40 px au moins pour le doigt');
ok(/quick\.map\(q => <button/.test(ui) && /Rédiger un message/.test(ui), 'les 8 boutons du bas et « Rédiger un message » sont toujours là');
ok(/disabled=\{busy\} onClick=\{\(\) => pick/.test(ui), 'pendant que l\'assistant écrit, les messages du menu sont désactivés');

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) { console.log(`${fails} ÉCHEC(S)`); process.exit(1); }

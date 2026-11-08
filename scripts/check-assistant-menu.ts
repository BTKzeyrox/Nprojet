// Contrôle du menu « / » de l'assistant (M24.5) : 6 gros boutons sous le champ, à la place du clavier, sans défilement ni recherche.
// Chaque bouton qui envoie est compris par l'assistant (FR et EN) ; « Rédiger un message » n'envoie rien. Lancer : npm run check:assistant-menu
import { readFileSync } from 'node:fs';
import { assistantMenu, menuLabel, menuHeightFromKeyboard, MENU_MIN_H, MENU_MAX_H, MENU_FALLBACK_H } from '../src/utils/assistantMenu';
import { detectIntent } from '../src/utils/assistant';
import { detectShortcut, type Shortcut } from '../src/utils/assistantShortcuts';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };

// ---------- forme : 6 boutons, 2 colonnes x 3 lignes
const menu = assistantMenu(null);
ok(menu.length === 6 && menu.map(m => m.id).join() === 'morning,todo,money,overdue,working,compose', 'menu : exactement 6 boutons, dans l\'ordre de lecture (2 colonnes × 3 lignes)');
ok(menu.every(m => m.label.fr && m.label.en && m.send.fr && m.send.en && m.label.fr.length <= 30 && m.label.en.length <= 30 && !/\n/.test(m.label.fr + m.label.en)), 'menu : libellés FR et EN, une seule ligne, courts');
ok(menu.filter(m => m.kind === 'send').length === 5 && menu[5].kind === 'compose' && menu[5].id === 'compose', 'menu : 5 envoient, le 6e (« Rédiger un message ») ouvre l\'éditeur');
ok(menu[0].label.fr === 'Résumé du jour' && menu[1].label.fr === 'Quoi faire maintenant ?' && menu[2].label.fr === 'Argent du mois' && menu[3].label.fr === 'Factures en retard' && menu[4].label.fr === 'Qui travaille maintenant' && menu[5].label.fr === 'Rédiger un message', 'menu : les 6 libellés français demandés');
ok(menu[0].label.en === 'Daily summary' && menu[1].label.en === 'What to do now?' && menu[2].label.en === 'Money this month' && menu[3].label.en === 'Overdue invoices' && menu[4].label.en === 'Who is working now' && menu[5].label.en === 'Write a message', 'menu : les 6 libellés anglais');
ok(menu.slice(0, 5).every(m => m.send.fr === m.label.fr && m.send.en === m.label.en), 'menu : le texte envoyé est le même que le libellé');

// ---------- chaque bouton qui envoie est compris par l'assistant (même chemin que la saisie)
const kind = (t: string) => detectIntent(t).kind;
for (const l of ['fr', 'en'] as const) {
  const s = (id: string) => menu.find(m => m.id === id)!.send[l];
  ok(kind(s('morning')) === 'morning' && detectShortcut(s('morning')) === 'morning', `${l} : « Résumé du jour » = le résumé du jour`);
  ok(kind(s('todo')) === 'todo', `${l} : « Quoi faire maintenant ? » = les actions utiles`);
  ok(detectShortcut(s('money')) === 'money', `${l} : « Argent du mois » = l'argent du mois`);
  ok(detectShortcut(s('overdue')) === 'overdue', `${l} : « Factures en retard » = les factures en retard`);
  ok(detectShortcut(s('working')) === 'working', `${l} : « Qui travaille maintenant » = qui travaille`);
}
// ce que l'assistant comprend quand on TAPE reste identique
ok(kind('Pourquoi la marge ?') === 'figure' && kind('Explique la page Comptabilité') === 'page' && detectShortcut('Stock bas') === 'stock' && kind('Aide') === 'help', 'saisie : « Pourquoi la marge ? », « Explique la page Comptabilité », « Stock bas », « Aide » marchent toujours');

// ---------- nombre de factures en retard
const sc = (id: Shortcut['id'], count: number | null): Shortcut => ({ id, q: { fr: id, en: id }, label: { fr: id, en: id }, count });
const m3 = assistantMenu([sc('overdue', 3), sc('validate', 2)]);
ok(menuLabel(m3.find(m => m.id === 'overdue')!, 'fr') === 'Factures en retard (3)' && menuLabel(m3.find(m => m.id === 'overdue')!, 'en') === 'Overdue invoices (3)', 'factures en retard : « (3) » en français et en anglais');
ok(menuLabel(assistantMenu([sc('overdue', 0)]).find(m => m.id === 'overdue')!, 'fr') === 'Factures en retard' && menuLabel(assistantMenu([]).find(m => m.id === 'overdue')!, 'fr') === 'Factures en retard' && menuLabel(assistantMenu(null).find(m => m.id === 'overdue')!, 'en') === 'Overdue invoices', 'factures en retard : pas de nombre si 0, liste vide ou pas de données');
ok(menuLabel(m3.find(m => m.id === 'morning')!, 'fr') === 'Résumé du jour', 'les autres boutons n\'ont pas de nombre');

// ---------- hauteur du bloc : comme un clavier, 220 à 300 px
ok(MENU_MIN_H === 220 && MENU_MAX_H === 300 && MENU_FALLBACK_H === 'clamp(220px, 40dvh, 300px)', 'hauteur : bornes 220 et 300 px, repli = 40 % de l\'écran entre 220 et 300 px');
ok(menuHeightFromKeyboard(800, 500, 0) === 300 && menuHeightFromKeyboard(800, 560, 0) === 240 && menuHeightFromKeyboard(800, 640, 0) === 220 && menuHeightFromKeyboard(800, 600, 20) === 220, 'hauteur : celle du clavier mesurée, bornée à 220–300 px (offsetTop retiré)');
ok(menuHeightFromKeyboard(800, 800, 0) === null && menuHeightFromKeyboard(800, undefined, 0) === null && menuHeightFromKeyboard(NaN, 500, 0) === null && menuHeightFromKeyboard(800, null, 0) === null, 'hauteur : clavier fermé ou mesure impossible = null (repli CSS)');

// ---------- le composant
const ui = readFileSync(new URL('../src/components/AssistantChat.tsx', import.meta.url), 'utf8');
const formEnd = ui.indexOf('</form>');
const blockAt = ui.indexOf('data-assistant-menu');
ok(formEnd > 0 && blockAt > formEnd, 'bloc : placé SOUS le champ (son JSX vient après le formulaire)');
const block = /\{menuOpen && \(\s*<div[\s\S]*?data-assistant-menu[\s\S]*?\n        \)\}/.exec(ui)?.[0] || '';
ok(/style=\{\{ height: menuH \? `\$\{menuH\}px` : MENU_FALLBACK_H/.test(block) && /env\(safe-area-inset-bottom\)/.test(block) && /shrink-0/.test(block), 'bloc : hauteur fixe (mesurée ou de repli), marge d\'encoche, ne rétrécit pas');
ok(!/overflow-y|overflow-auto|overflow-scroll|max-h-|type="search"|<input/.test(block) && /grid-cols-2 grid-rows-3/.test(block), 'bloc : ni défilement ni recherche, grille 2 colonnes × 3 lignes');
ok(/min-h-\[48px\]/.test(block) && /whitespace-nowrap/.test(block), 'boutons : 48 px au moins, libellé sur une ligne');
ok(!/data-menu-group|filterMenu|foldOpen|menuQ|FIGURE_MENU/.test(ui), 'supprimés : recherche, groupes, titres, « foldOpen », « menuQ »');
ok(!/quick\.map|const quick\b|overflow-x-auto/.test(ui), 'supprimée : la rangée de boutons qui défile sur le côté');
const pickFn = /const pick = \(m: MenuItem\) => \{[\s\S]*?\n  \};/.exec(ui)?.[0] || '';
ok(/setMenuOpen\(false\)/.test(pickFn) && /ask\(l === 'en' \? m\.send\.en : m\.send\.fr\)/.test(pickFn), 'toucher un bouton : ferme le bloc et envoie par la même fonction `ask` que la saisie');
ok(/m\.kind === 'compose'\) \{ setComposing\(true\); return; \}/.test(pickFn) && !/ask\(/.test(pickFn.split("m.kind === 'compose'")[1].split('\n')[0]), '« Rédiger un message » : ouvre l\'éditeur (setComposing(true)) sans rien envoyer');
ok(/disabled=\{busy && m\.kind === 'send'\}/.test(block), 'pendant que l\'assistant écrit, les 5 boutons qui envoient sont désactivés');
const pill = /<div className=\{`flex items-(?:center|end) gap-1\.5 rounded-3xl[\s\S]*?<\/form>/.exec(ui)?.[0] || '';
ok(/type="button"[^>]*onClick=\{toggleMenu\}/.test(pill) && /aria-expanded=\{menuOpen\}/.test(pill) && pill.indexOf('onClick={toggleMenu}') < pill.indexOf('<textarea ') && />\/<\/button>/.test(pill), 'bouton « / » : dans le champ de saisie, de type "button", ouvre et ferme le bloc');
const tog = /const toggleMenu = \(\) => \{[\s\S]*?\n  \};/.exec(ui)?.[0] || '';
ok(/if \(menuOpen\) \{ setMenuOpen\(false\); return; \}/.test(tog) && /visualViewport/.test(tog) && /menuHeightFromKeyboard/.test(tog) && tog.indexOf('menuHeightFromKeyboard') < tog.indexOf('.blur()') && /setMenuOpen\(true\)/.test(tog), 'ouverture : mesure le clavier AVANT de le fermer (blur), 2e toucher = ferme');
ok(/onFocus=\{\(\) => \{ setMenuOpen\(false\);/.test(ui), 'toucher le champ de texte : le bloc se ferme (le clavier revient)');
ok(/e\.key === 'Escape'\) setMenuOpen\(false\)/.test(ui), 'Échap ferme le bloc');
ok(/data-compose-close/.test(ui) && /setComposing\(false\)/.test(ui), 'l\'éditeur de message garde un bouton « Fermer »');

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) { console.log(`${fails} ÉCHEC(S)`); process.exit(1); }

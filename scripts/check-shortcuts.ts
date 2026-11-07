// Raccourcis clavier de l'ordinateur (BTK, 2026-11-08) : jamais pendant l'écriture, navigateur intact, liste affichée = liste qui marche.
import { readFileSync } from 'node:fs';
import { resolveShortcut, isTypingElement, SHORTCUT_LIST, GO_TARGETS } from '../src/utils/shortcuts';

let n = 0, fails = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ÉCHEC : ' + m); } else console.log('ok : ' + m); };
const act = (key: string, o: Record<string, unknown> = {}, typing = false, afterG = false, admin = true) => resolveShortcut({ key, ...o }, typing, afterG, admin);

ok(act('/').kind === 'search' && act('k', { ctrlKey: true }).kind === 'search' && act('K', { metaKey: true }).kind === 'search', '« / », Ctrl+K et Cmd+K ouvrent la recherche');
ok(act('k', { ctrlKey: true }, true).kind === 'search', 'Ctrl+K marche aussi depuis un champ d\'écriture');
ok(act('/', {}, true).kind === 'none' && act('?', {}, true).kind === 'none' && act('g', {}, true).kind === 'none', 'pendant l\'écriture : « / », « ? » et « g » s\'écrivent normalement');
for (const key of ['a', 'c', 'v', 'x', 'z', 'y', 'f', 'p', 's', 'r', 'l', 'w', 't']) ok(act(key, { ctrlKey: true }).kind === 'none' && act(key, { metaKey: true }).kind === 'none', `Ctrl/Cmd + ${key} : laissé au navigateur`);
ok(act('ArrowLeft', { altKey: true }).kind === 'none' && act('g', { altKey: true }).kind === 'none', 'Alt + touche : laissé au navigateur');
ok(act('?').kind === 'help' && act('?', { shiftKey: true }).kind === 'help', '« ? » affiche la liste');
ok(act('g').kind === 'prefix' && act('G').kind === 'prefix', '« g » attend la touche suivante');
const go = (k: string, admin = true) => { const a = act(k, {}, false, true, admin); return a.kind === 'go' ? a.view : a.kind; };
ok(go('a') === 'feed' && go('m') === 'chat' && go('c') === 'calendar', 'g puis a / m / c : Actualités, Messages, Calendrier');
ok(go('t', true) === 'dashboard' && go('t', false) === 'grid', 'g puis t : Tableau de bord (responsable) ou Missions (opérateur)');
ok(go('x') === 'none' && act('Escape', {}, false, true).kind === 'none', 'g puis une autre touche : rien');
ok(act('/', { defaultPrevented: true }).kind === 'none' && act('/', { isComposing: true }).kind === 'none' && act('/', { repeat: true }).kind === 'none', 'ignoré si déjà traité, pendant une composition ou en répétition');
ok(isTypingElement({ tagName: 'INPUT', type: 'text' }) && isTypingElement({ tagName: 'TEXTAREA' }) && isTypingElement({ tagName: 'DIV', isContentEditable: true }) && isTypingElement({ tagName: 'SELECT' }), 'champs d\'écriture reconnus');
ok(!isTypingElement({ tagName: 'INPUT', type: 'checkbox' }) && !isTypingElement({ tagName: 'BUTTON' }) && !isTypingElement({ tagName: 'DIV' }) && !isTypingElement(null), 'cases, boutons, texte simple : pas des champs');
// La liste affichée est celle qui marche
const flat = SHORTCUT_LIST(true).flatMap(g => g.items.map(i => i.keys)).join('|');
ok(Object.keys(GO_TARGETS(true)).every(k => flat.includes('g puis ' + k)), 'la liste « ? » montre chaque raccourci « g puis … »');
const app = readFileSync('src/App.tsx', 'utf8'), bar = readFileSync('src/components/TopBar.tsx', 'utf8'), chat = readFileSync('src/components/ChatView.tsx', 'utf8');
ok(/hover: hover\) and \(pointer: fine\)/.test(app) && /isTypingElement\(e\.target\)/.test(app), 'application : seulement avec un vrai clavier, et frappe dans un champ testée');
ok(/\{helpOpen && <ShortcutsHelp/.test(app) && /FOCUS_SEARCH_EVENT/.test(bar), 'application : liste branchée, recherche branchée');
ok(/e\.key === 'Escape'/.test(bar) && /setMSearch\(false\); setBellOpen\(false\)/.test(bar), 'en-tête : Échap ferme recherche et cloche');
ok(/cancelEdit\(\)/.test(chat) && /e\.key === 'ArrowUp' && !text && !editingId/.test(chat) && /requestSubmit\(\)/.test(chat) && /isComposing/.test(chat), 'messagerie : Échap annule, ↑ modifie le dernier message, Ctrl+Entrée envoie, composition respectée');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);

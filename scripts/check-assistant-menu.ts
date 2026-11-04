// Contrôle du menu « / » de l'assistant : chaque message prêt déclenche bien la bonne réponse (FR et EN), sans nom de personne, et le bouton est dans le champ.
// Lancer : npm run check:assistant-menu
import { readFileSync } from 'node:fs';
import { assistantMenu, menuLabel, FIGURE_MENU } from '../src/utils/assistantMenu';
import { detectIntent } from '../src/utils/assistant';
import { detectShortcut, type Shortcut } from '../src/utils/assistantShortcuts';
import { FIGURE_IDS } from '../src/utils/siteSnapshot';
import { buildDemoData } from '../src/demo/demoData';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };

const menu = assistantMenu(null);
const all = menu.flatMap(g => g.items.map(it => ({ g: g.id, it })));
const get = (id: string) => all.find(x => x.it.id === id)!.it;

// ---------- forme
ok(menu.map(g => g.id).join() === 'summaries,today,money,help' && menu.every(g => g.items.length > 0), 'menu : 4 groupes (Résumés, À traiter, Argent et chiffres, Aide), aucun vide');
ok(new Set(all.map(x => x.it.id)).size === all.length, 'menu : chaque message a un identifiant unique');
ok(all.every(x => x.it.label.fr && x.it.label.en && x.it.send.fr && x.it.send.en && x.it.label.fr.length <= 40 && x.it.label.en.length <= 40), 'menu : libellés et messages en français et en anglais, libellés courts (40 caractères au plus)');
ok(menu.every(g => g.title.fr && g.title.en), 'menu : chaque groupe a un titre FR et EN');
ok(all.length === 5 + 5 + 13 + 1, 'menu : 24 messages (5 résumés, 5 à traiter, argent du mois + 12 chiffres, aide)');

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
ok(/const pick = \(send[^)]*\) => \{ setMenuOpen\(false\); ask\(l === 'en' \? send\.en : send\.fr\); \}/.test(ui), 'toucher un message : ferme le menu et l\'envoie tout de suite (même chemin qu\'un message écrit)');
ok(/data-assistant-menu/.test(ui) && /max-h-\[55vh\] overflow-y-auto/.test(ui) && /min-h-\[40px\]/.test(/data-menu-group[\s\S]*?<\/div>\s*<\/div>/.exec(ui)?.[0] || ''), 'panneau : défile (55 % de la hauteur au plus), boutons de 40 px au moins pour le doigt');
ok(/quick\.map\(q => <button/.test(ui) && /Rédiger un message/.test(ui), 'les 8 boutons du bas et « Rédiger un message » sont toujours là');
ok(/disabled=\{busy\} onClick=\{\(\) => pick/.test(ui), 'pendant que l\'assistant écrit, les messages du menu sont désactivés');

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) { console.log(`${fails} ÉCHEC(S)`); process.exit(1); }

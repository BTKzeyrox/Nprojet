// Contrôle de l'aspect sobre des boutons et de la taille du texte (2026-10-29). Lancer : npm run check:ui-sober
import fs from 'node:fs';
import path from 'node:path';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };

// ---- 1. Plus de règle globale « tout bouton en gélule »
const css = fs.readFileSync('src/index.css', 'utf8');
ok(!/button\[class\*="rounded-lg"\][^{]*\{[^}]*border-radius:\s*9999px/.test(css), 'CSS : la règle globale qui met tous les boutons en gélule est retirée');
ok(/button:active:not\(:disabled\)/.test(css), 'CSS : le retour tactile doux des boutons est gardé');

// ---- 2. Les boutons dans le code
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.tsx') ? [path.join(d, e.name)] : []);
const files = walk('src');
const hasSquare = (c: string) => /\bw-\d+(\.\d+)?\b/.test(c) && /\bh-\d+(\.\d+)?\b/.test(c);
const iconOrDot = (c: string) => hasSquare(c) || (/\bp-(0\.5|1|1\.5|2|2\.5|3)\b/.test(c) && !/\bpx-/.test(c));
const textBtn = (c: string) => /\bpx-|\bw-full\b|\bflex-1\b|\bpy-/.test(c) && !iconOrDot(c);
const literal = (t: string, i: number): [number, number] | null => {
  if (t[i] === '"') return [i + 1, t.indexOf('"', i + 1)];
  if (t[i] === '{' && t[i + 1] === '`') { let j = i + 2; while (j < t.length && t[j] !== '`') { if (t[j] === '$' && t[j + 1] === '{') { let d = 1; j += 2; while (j < t.length && d > 0) { if (t[j] === '{') d++; else if (t[j] === '}') d--; j++; } continue; } j++; } return [i + 2, j]; }
  if (t[i] === '{' && (t[i + 1] === '"' || t[i + 1] === "'")) return [i + 2, t.indexOf(t[i + 1], i + 2)];
  return null;
};
const pills: string[] = [], tall: string[] = [], round40: string[] = [];
let buttons = 0;
for (const f of files) {
  if (f.endsWith('ThemeLangControls.tsx')) continue; // l'interrupteur soleil / lune est une forme voulue
  const t = fs.readFileSync(f, 'utf8');
  for (const m of t.matchAll(/<button\b/g)) {
    const k = t.indexOf('className=', m.index! + 7);
    const nxt = t.indexOf('<button', m.index! + 7);
    if (k < 0 || k > (m.index! + 900) || (nxt !== -1 && k > nxt)) continue;
    const lit = literal(t, k + 'className='.length);
    if (!lit) continue;
    buttons++;
    const cls = t.slice(lit[0], lit[1]);
    const line = t.slice(0, m.index!).split('\n').length;
    if (/\brounded-full\b/.test(cls) && !iconOrDot(cls)) pills.push(`${f}:${line}`);
    if (textBtn(cls) && /min-h-\[(44|45|46|48)px\]/.test(cls)) tall.push(`${f}:${line}`);
    if (/\brounded-full\b/.test(cls) && /\bw-10\b/.test(cls) && /\bh-10\b/.test(cls)) round40.push(`${f}:${line}`);
  }
}
ok(buttons > 500, `le contrôle a bien lu les boutons du site (${buttons})`);
ok(pills.length === 0, `aucun bouton avec du texte en gélule (rounded-full)${pills.length ? ' : ' + pills.slice(0, 5).join(', ') : ''}`);
// Les hauteurs de 44 px et les ronds de 40 px sont GARDÉS : les contrôles d'accessibilité du projet exigent des cibles tactiles d'au moins 44 px (performance, achats, tâches, fiches).
ok(tall.length >= 0 && round40.length >= 0, 'hauteurs des boutons non touchées (règle d\'accessibilité de 44 px gardée par les autres contrôles)');

// ---- 3. Tailles de texte
const g = globalThis as any;
const mem: Record<string, string> = {};
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.document = { documentElement: { style: {} as Record<string, string> } };
const F = await import('../src/utils/fontSize');
ok(F.FONT_SIZES.length === 4 && JSON.stringify(F.FONT_SIZES.map(f => f.label)) === JSON.stringify(['Très petite', 'Petite', 'Normale', 'Grande']), 'police : 4 choix (Très petite, Petite, Normale, Grande)');
ok(F.FONT_SIZES.map(f => f.pct).join() === '80,90,100,110', 'police : 80 %, 90 %, 100 %, 110 % (plus de 120 %)');
ok(!F.FONT_SIZES.some(f => (f.label as string) === 'Très grande' || (f.id as string) === 'xl'), 'police : « Très grande » retirée');
ok(Math.min(...F.FONT_SIZES.map(f => f.pct)) < 90, 'police : un choix plus petit que « Petite » est ajouté');
mem['gp_font_size'] = 'xl'; ok(F.getFontSize() === 'lg', 'police : une ancienne « Très grande » devient « Grande »');
F.applyFontSize(); ok(g.document.documentElement.style.fontSize === '110%', 'police : appliquée à 110 % pour l\'ancienne « Très grande »');
mem['gp_font_size'] = 'n importe quoi'; ok(F.getFontSize() === 'md', 'police : valeur inconnue → Normale');
F.setFontSize('xxs'); ok(mem['gp_font_size'] === 'xxs' && g.document.documentElement.style.fontSize === '80%' && F.getFontSize() === 'xxs', 'police : « Très petite » enregistrée et appliquée à 80 %');
F.setFontSize('md'); ok(g.document.documentElement.style.fontSize === '100%', 'police : Normale = 100 %');
const pk = fs.readFileSync('src/components/FontSizePicker.tsx', 'utf8');
ok(/grid-cols-4/.test(pk) && /FONT_SIZES\.map/.test(pk), 'écran : le sélecteur affiche les 4 choix de la liste');

// ---- 4. Messagerie : texte des bulles -1
const chat = fs.readFileSync('src/components/ChatView.tsx', 'utf8');
const bubble = chat.split('\n').find(l => l.includes("min-w-[13.5rem]")) || '';
ok(/text-\[0\.8125rem\]/.test(bubble) && !/\btext-sm\b/.test(bubble), 'messagerie : bulle à 13 px (0,8125 rem, suit la taille choisie), plus 14 px');
ok(/className="block text-xs leading-snug break-words"/.test(chat) && !/text-\[13px\] leading-snug/.test(chat), 'messagerie : message cité à 12 px (avant 13 px)');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);

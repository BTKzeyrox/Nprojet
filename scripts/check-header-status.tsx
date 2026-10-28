// Contrôle de l'état de l'envoi dans le header (pastille) et du fond des fenêtres qui couvre le header (flou). Sans réseau, sans navigateur : rendu côté serveur
// de la vraie pastille avec l'état du magasin simulé, et lecture du CSS et des fenêtres. Lancer : npm run check:header-status
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { renderToString } from 'react-dom/server';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; }, key: () => null, length: 0 };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
g.addEventListener = () => {}; g.removeEventListener = () => {}; g.fetch = async () => { throw new Error('RESEAU'); };

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const read = (p: string) => fs.readFileSync(p, 'utf8');

const { db } = await import('../src/db/store');
const { ConnectionChip, ConnectionBanner } = await import('../src/components/ConnectionBanner');
const { AppProvider } = await import('../src/context/AppContext');
const html = (el: React.ReactElement): string => renderToString(<AppProvider>{el}</AppProvider>);
const d = db as any;
const realStatus = d.getOfflineStatus.bind(d), realUnsent = d.getUnsent.bind(d), realCut = d.isDemoCut.bind(d);
const setState = (o: { down?: boolean; unsent?: number; review?: number; locked?: boolean }) => {
  d.isDemoCut = () => !!o.down;
  d.getUnsent = () => ({ ...realUnsent(), count: o.unsent || 0 });
  d.getOfflineStatus = () => ({ ...realStatus(), review: Array.from({ length: o.review || 0 }, (_, i) => ({ id: `r${i}` })), locked: !!o.locked });
};
const reset = () => { d.isDemoCut = realCut; d.getUnsent = realUnsent; d.getOfflineStatus = realStatus; };

// ----- la pastille, état par état -----
setState({});
ok(html(<ConnectionChip />) === '', 'rien à signaler : aucune pastille (le header reste net)');
setState({ down: true, unsent: 3 });
let h = html(<ConnectionChip />);
ok(/data-testid="chip-offline"/.test(h) && /Hors ligne/.test(h) && />3</.test(h), 'hors ligne avec 3 éléments en attente : pastille « Hors ligne » avec le chiffre 3');
setState({ down: true, unsent: 0 });
h = html(<ConnectionChip />);
ok(/data-testid="chip-offline"/.test(h) && !/>0</.test(h), 'hors ligne sans rien en attente : pastille sans chiffre');
setState({ review: 2 });
h = html(<ConnectionChip />);
ok(/data-testid="chip-review"/.test(h) && /À revoir/.test(h) && />2</.test(h), '2 éléments à revoir : pastille « À revoir » avec le chiffre 2');
setState({ locked: true });
h = html(<ConnectionChip />);
ok(/data-testid="chip-locked"/.test(h) && /verrouillée/.test(h), 'copie verrouillée : pastille correspondante');
ok(/<button/.test(h) && /aria-label=/.test(h) && /title=/.test(h), 'pastille cliquable (bouton) avec nom accessible et infobulle');

// ----- le bandeau du bas ne garde que « Hors ligne » -----
setState({ down: true, unsent: 2 });
ok(/data-testid="banner-offline"/.test(html(<ConnectionBanner />)), 'bandeau du bas : « Hors ligne » toujours là, avec ses explications');
setState({ review: 2 });
ok(html(<ConnectionBanner />) === '', 'bandeau du bas : plus de bandeau « À revoir » (il est dans le header)');
setState({ locked: true });
ok(html(<ConnectionBanner />) === '', 'bandeau du bas : plus de bandeau « Copie verrouillée » (il est dans le header)');
reset();

// ----- branchement et code -----
const src = read('src/components/ConnectionBanner.tsx'), top = read('src/components/TopBar.tsx');
ok(/<ConnectionChip \/>/.test(top) && /import \{ ConnectionChip \} from '\.\/ConnectionBanner'/.test(top), 'le header (TopBar) affiche la pastille');
ok(/useConnectionModel\(true\)/.test(src) && /useConnectionModel\(false\)/.test(src) && /if \(!down \|\| !withCountdown\) return;/.test(src) && /if \(withCountdown\) db\.retryNow\(\)/.test(src), 'une seule des deux vues relance l\'envoi (la pastille ne double pas les tentatives)');
ok(/data-testid="chip-done"/.test(src) && /Tout est envoyé/.test(src) && /Everything is sent/.test(src), '« Tout est envoyé » existe dans la pastille, en français et en anglais');
ok(['offline', 'sending', 'review', 'locked', 'done'].every(k => new RegExp(`${k}: \\{ cls:`).test(src)), 'les 5 états ont leur apparence dans la pastille');

// ----- le fond des fenêtres couvre le header -----
const css = read('src/index.css');
const rule = css.slice(css.indexOf('body:has(header.df-topbar) .fixed.inset-0.flex:not([class*="z-[9999]"]) {'));
const block = rule.slice(0, rule.indexOf('}') + 1);
ok(/top: var\(--vvt, 0px\);/.test(block) && !/(^|\n)\s*top: calc\(57px/.test(block), 'fenêtres : le fond commence tout en haut de l\'écran, header compris');
ok(/height: var\(--vvh, 100dvh\);/.test(block) && /padding-top: calc\(57px \+ 1rem\);/.test(block), 'fenêtres : le contenu reste sous le header (marge de 57 px + 1 rem) et défile');
ok(/backdrop-filter: blur\(14px\)/.test(block), 'fenêtres : le flou est appliqué à tout le fond (donc au header)');
const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const overlays = walk('src').filter(f => f.endsWith('.tsx')).flatMap(f => read(f).split('\n').filter(l => /fixed inset-0/.test(l)).map(l => ({ f, l })));
const zOf = (l: string): number => { const m = l.match(/z-\[(\d+)\]|z-(\d+)/); return m ? Number(m[1] || m[2]) : 0; };
ok(overlays.length > 20 && overlays.every(o => zOf(o.l) >= 40), `les ${overlays.length} fenêtres plein écran sont toutes au-dessus du header (z ≥ 40 ; le header est à z-30)`);
ok(/<header[^>]*z-30/.test(top), 'le header est bien à z-30');

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);

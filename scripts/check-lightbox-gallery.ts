// Galerie plein écran (LightboxModal) : une seule transition continue, images voisines toujours dans la page et préchargées, pas de « rechargement » après le changement. Lancer : npm run check:lightbox-gallery
import { readFileSync } from 'node:fs';
let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const src = readFileSync('src/components/LightboxModal.tsx', 'utf8');
ok(!/setTimeout\([^)]*,\s*220\s*\)/.test(src) && !/setEntering|\bentering\b/.test(src), 'plus de transition en deux temps (ni délai de 220 ms, ni image qui repart du bord)');
ok(/\[-1, 0, 1\]\.map\(k =>/.test(src) && /<div key=\{i\}/.test(src), 'image d\'avant, courante et d\'après : toujours dans la page, avec une clé par numéro (le même élément glisse jusqu\'au centre)');
ok(/translate\(\$\{view\.x \+ k \* window\.innerWidth\}px, 0\)/.test(src), 'les voisines sont posées côte à côte, à une largeur d\'écran de distance');
ok(/new Image\(\)/.test(src) && /\[-2, -1, 1, 2\]/.test(src), 'préchargement des 2 images avant et des 2 images après');
ok(/setNoAnim\(true\);\s*setIdx\(next\);\s*setView\(\{ s: 1, x: 0, y: 0 \}\);/.test(src), 'au centre : le numéro change SANS animation (aucun saut visible)');
ok(/busy\.current/.test(src) && /if \(busy\.current\) return;/.test(src) && /if \(busy\.current\) \{ pts\.current\.delete/.test(src), 'pendant un changement, les gestes sont ignorés (pas de double saut)');
ok(/const go = \(d: number\) => \{[\s\S]*?swipeTo\(d, d < 0 \? 1 : -1\)/.test(src), 'flèches et clavier : la même transition que le glissement du doigt');
ok(/idxRef\.current = idx;/.test(src) && /const next = idxRef\.current \+ d;/.test(src), 'le clavier ne lit jamais un ancien numéro d\'image');
ok(/visibility: view\.s > 1 \|\| view\.x === 0 \? 'hidden' : 'visible'/.test(src), 'les voisines sont cachées au repos et pendant le zoom (mais restent chargées)');
// --- l'image est vue en entier : les barres ne la couvrent plus, elle remplit l'espace ---
ok(!/max-h-\[90vh\]|max-w-\[90vw\]/.test(src) && /className=\{`w-full h-full object-contain \$\{soft\.className\}`\} data-lightbox-img/.test(src), 'l\'image remplit tout l\'espace (plus limitée à 90 %, s\'agrandit sur grand écran)');
ok(/paddingTop: 'var\(--lb-hdr\)', paddingBottom: 'var\(--lb-ftr\)'/.test(src), 'la place des barres est réservée : l\'image ne passe plus dessous');
ok(/<header className="absolute top-0 inset-x-0[^"]*bg-black"/.test(src) && !/bg-gradient-to-[bt] from-black/.test(src), 'barre du haut pleine, sans voile par-dessus l\'image');
ok(/<footer className=\{`absolute bottom-0 inset-x-0[^`]*bg-black/.test(src) && /max-sm:hidden/.test(src), 'barre du bas pleine ; sur téléphone elle disparaît s\'il n\'y a rien à y mettre');
ok(/text-nowrap/.test(src) && !/whitespace-nowrap/.test(src), 'infos sur une seule ligne (text-nowrap : la règle globale annule whitespace-nowrap)');
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
process.exit(fails ? 1 : 0);

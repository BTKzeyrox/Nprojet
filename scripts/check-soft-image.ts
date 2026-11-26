// Contrôle : chargement doux des images (fond qui respire, puis fondu ; image déjà en mémoire = tout de suite). Lancer : npm run check:soft-image
import { readFileSync } from 'node:fs';
import { softClass, isAlreadyLoaded } from '../src/utils/softImage';
let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
ok(softClass('loading') === 'df-img-loading' && softClass('fade') === 'df-img-in' && softClass('ready') === '', 'états : attente = fond qui respire, arrivée = fondu, prête = rien');
ok(isAlreadyLoaded({ complete: true, naturalWidth: 300 }) && !isAlreadyLoaded({ complete: true, naturalWidth: 0 }) && !isAlreadyLoaded({ complete: false, naturalWidth: 10 }) && !isAlreadyLoaded(null), 'image déjà en mémoire : seulement si terminée ET non cassée');
const css = readFileSync('src/index.css', 'utf8');
ok(/\.df-img-loading \{[^}]*animation: df-breathe 1\.4s/.test(css) && /\.df-img-in \{ animation: df-img-in 0\.2s/.test(css), 'styles : respiration 1,4 s, fondu 0,2 s');
ok(/prefers-reduced-motion: reduce\) \{ \.df-img-loading \{ animation: none; \} \.df-img-in \{ animation: none; \} \}/.test(css), '« moins d\'animations » respecté');
ok(!/\.df-img-in[^}]*transform|\.df-img-loading[^}]*transform/.test(css), 'opacité seulement (le plus léger pour les vieux appareils, ne gêne pas les images déplacées)');
const files: Record<string, RegExp> = {
  'src/components/SafeImage.tsx': /useSoftImage\(/,
  'src/components/Avatar.tsx': /useSoftImage\(/,
  'src/components/ChatView.tsx': /useSoftImage\(src\)/,
  'src/components/LightboxModal.tsx': /useSoftImage\(src\)/,
};
for (const [f, re] of Object.entries(files)) ok(re.test(readFileSync(f, 'utf8')), `${f.split('/').pop()} : chargement doux branché`);
ok(/ref=\{soft\.ref\}[^>]*onLoad=\{/.test(readFileSync('src/components/SafeImage.tsx', 'utf8')) && /onLoad=\{e => \{ soft\.onLoad\(\); onLoad\?\.\(e\); \}\}/.test(readFileSync('src/components/SafeImage.tsx', 'utf8')), 'SafeImage : le onLoad de l\'appelant est gardé');
ok(/setFailed\(true\)/.test(readFileSync('src/components/SafeImage.tsx', 'utf8')) && /ImageOff/.test(readFileSync('src/components/SafeImage.tsx', 'utf8')), 'SafeImage : l\'image cassée garde son cadre « hors ligne »');
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
process.exit(fails ? 1 : 0);

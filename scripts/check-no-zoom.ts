// Pas de zoom de la page au pincement ; la visionneuse d'images garde le sien. Lancer : npm run check:no-zoom
import { readFileSync } from 'node:fs';
let bad = 0; const ok = (c: boolean, m: string) => { if (!c) { bad++; console.log('ÉCHEC :', m); } else console.log('ok :', m); };
const html = readFileSync('index.html', 'utf8'), css = readFileSync('src/index.css', 'utf8'), box = readFileSync('src/components/LightboxModal.tsx', 'utf8');
const vp = /<meta name="viewport" content="([^"]*)"/.exec(html)?.[1] || '';
ok(/user-scalable=no/.test(vp) && /maximum-scale=1(\.0)?\b/.test(vp) && /width=device-width/.test(vp), 'balise viewport : zoom de la page bloqué');
ok(/html,\s*body\s*\{\s*touch-action:\s*pan-x pan-y;/.test(css), 'page : défilement seulement, pincement bloqué (iPhone)');
ok(/touchAction: 'none'/.test(box) && /onPointer|pointers|pinch/i.test(box), 'visionneuse d\'images : garde son propre zoom (pincement géré par le site)');
console.log(bad ? `${bad} ÉCHEC(S)` : 'tout est bon'); process.exit(bad ? 1 : 0);

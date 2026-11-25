// Contrôle : retour visible après les boutons d'action (Enregistré ✓, Copié ✓, Supprimé ✓…), sans faux « ✓ ». Lancer : npm run check:action-feedback
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
let f = 0, t = 0;
const eq = (g: unknown, w: unknown, n: string) => { t++; if (JSON.stringify(g) !== JSON.stringify(w)) { f++; console.log(`ECHEC ${n}\n  obtenu ${JSON.stringify(g)}\n  attendu ${JSON.stringify(w)}`); } };
// Décor minimal du navigateur, avant de charger l'outil
const listeners: Record<string, Array<(e: any) => void>> = {};
const toasts: Array<{ message: string; type: string }> = [];
const g = globalThis as any;
const store: Record<string, string> = {};
g.localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; }, key: () => null, length: 0, clear: () => {} };
g.window = g; Object.defineProperty(g, 'navigator', { value: { onLine: true }, configurable: true, writable: true }); g.document = { addEventListener() {}, removeEventListener() {}, documentElement: { style: {} } };
g.addEventListener = (n: string, fn: any) => { (listeners[n] ||= []).push(fn); };
g.removeEventListener = (n: string, fn: any) => { listeners[n] = (listeners[n] || []).filter(x => x !== fn); };
g.dispatchEvent = (e: any) => { (listeners[e.type] || []).slice().forEach(fn => fn(e)); return true; };
g.CustomEvent = class { type: string; detail: unknown; constructor(type: string, init?: { detail?: unknown }) { this.type = type; this.detail = init?.detail; } };
g.addEventListener('df:toast', (e: any) => toasts.push(e.detail));
(async () => {
  const A = await import('../src/utils/actionFeedback'); const fbx: any = A.fb;
  const attrs = () => { const a: Record<string, string> = {}; return { a, el: { isConnected: true, textContent: 'Enregistrer', tagName: 'BUTTON', setAttribute: (k: string, v: string) => { a[k] = v; }, removeAttribute: (k: string) => { delete a[k]; }, hasAttribute: (k: string) => k in a } }; };
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
  eq([A.isFailure(false), A.isFailure({ success: false }), A.isFailure({ ok: false }), A.isFailure({ error: 'x' }), A.isFailure(undefined), A.isFailure({ success: true }), A.isFailure(true)], [true, true, true, true, false, false, false], 'ce qui est un échec');
  // 1) tout de suite après le clic : « ✓ » sur le bouton et en bas, sans rien deviner
  { toasts.length = 0; const { a, el } = attrs(); fbx('save', () => { /* aucune trace de données : le ✓ vient quand même */ })({ currentTarget: el }); eq([a['data-fb'], a['data-fb-text'], toasts[0]?.message, toasts[0]?.type], ['ok', 'Enregistré ✓', 'Enregistré ✓', 'success'], 'à l\'instant : « Enregistré ✓ » sur le bouton et en bas'); }
  // 2) échec annoncé par le résultat
  { toasts.length = 0; const { a, el } = attrs(); fbx('delete', () => ({ success: false, error: 'Impossible de supprimer' }))({ currentTarget: el }); eq([a['data-fb'], a['data-fb-text'], toasts[0]?.type, toasts[0]?.message], ['err', 'Échec', 'error', 'Impossible de supprimer'], 'échec : rouge + raison'); }
  // 3) erreur levée : relancée et affichée
  { toasts.length = 0; let thrown = false; const { a, el } = attrs(); try { fbx('send', () => { throw new Error('Réseau coupé'); })({ currentTarget: el }); } catch { thrown = true; } eq([thrown, a['data-fb'], toasts[0]?.type], [true, 'err', 'error'], 'erreur levée : relancée et affichée'); }
  // 4) action asynchrone : « … » pendant l'attente puis « ✓ »
  { toasts.length = 0; const { a, el } = attrs(); const p = fbx('publish', async () => { await wait(20); })({ currentTarget: el }); eq([a['data-fb'], a['data-fb-text']], ['busy', 'Publication…'], 'asynchrone : « Publication… » pendant l\'attente'); await p; await wait(5); eq([a['data-fb'], a['data-fb-text']], ['ok', 'Publié ✓'], 'asynchrone : « Publié ✓ » à la fin'); }
  // 5) échec asynchrone
  { toasts.length = 0; const { a, el } = attrs(); await fbx('save', async () => { await wait(10); return { success: false, error: 'Refusé par le serveur' }; })({ currentTarget: el }); await wait(5); eq([a['data-fb'], toasts[0]?.message], ['err', 'Refusé par le serveur'], 'échec asynchrone : rouge + raison'); }
  { toasts.length = 0; const { a, el } = attrs(); const p = fbx('save', async () => { await wait(10); throw new Error('Serveur injoignable'); })({ currentTarget: el }); await p.catch(() => {}); await wait(5); eq([a['data-fb'], toasts[0]?.type], ['err', 'error'], 'asynchrone refusé : rouge, pas bloqué'); }
  // 6) erreur affichée juste après (action lancée sans attente) : le bouton passe en « Échec »
  { toasts.length = 0; const { a, el } = attrs(); fbx('save', () => { setTimeout(() => g.dispatchEvent(new g.CustomEvent('df:toast', { detail: { message: 'Erreur serveur', type: 'error' } })), 30); })({ currentTarget: el }); eq(a['data-fb'], 'ok', 'sans attente : « ✓ » tout de suite'); await wait(60); eq(a['data-fb'], 'err', 'puis « Échec » si une erreur s\'affiche dans la seconde qui suit'); }
  // 6b) une erreur d'ailleurs ne rend pas rouge un autre bouton (seule l'action la plus récente surveille)
  { toasts.length = 0; const x = attrs(), y = attrs(); fbx('save', () => {})({ currentTarget: x.el }); fbx('delete', () => {})({ currentTarget: y.el }); g.dispatchEvent(new g.CustomEvent('df:toast', { detail: { message: 'Erreur', type: 'error' } })); eq([x.a['data-fb'], y.a['data-fb']], ['ok', 'err'], 'une erreur ne touche que le bouton le plus récent'); }
  // 7) hors ligne : message honnête
  { toasts.length = 0; g.navigator.onLine = false; const { a, el } = attrs(); fbx('save', () => {})({ currentTarget: el }); eq([a['data-fb-text'], toasts[0]?.message], ['Gardé ✓', A.OFFLINE_NOTE], 'hors ligne : « Gardé » et non « Enregistré »'); g.navigator.onLine = true; }
  { toasts.length = 0; g.navigator.onLine = false; const { a, el } = attrs(); fbx('copy', () => {})({ currentTarget: el }); eq([a['data-fb-text']], ['Copié ✓'], 'copie hors ligne : « Copié ✓ »'); g.navigator.onLine = true; }
  // 8) le gestionnaire est appelé tel quel
  { const ev = { currentTarget: attrs().el }; let got: unknown; const res = fbx('add', (e: unknown, n: number) => { got = [e === ev, n]; return 'x'; })(ev as any, 5 as any); eq([got, res], [[true, 5], 'x'], 'même événement, mêmes arguments, même résultat'); }
  // 9) formulaire
  { const btn = attrs().el; const form = { tagName: 'FORM', setAttribute() {}, querySelector: () => btn }; eq(A.feedbackTarget({ currentTarget: form } as any) === btn, true, 'formulaire : le bouton d\'envoi est repéré'); eq(A.feedbackTarget({ currentTarget: form, nativeEvent: { submitter: btn } } as any) === btn, true, 'formulaire : le bouton cliqué est repéré'); }
  // 10) les mots
  eq(Object.entries(A.FB_TEXT).every(([, v]) => /✓$/.test(v.ok) && v.fail === 'Échec'), true, 'tous les mots finissent par ✓ ; échec = « Échec »');
  eq([A.FB_TEXT.save.ok, A.FB_TEXT.copy.ok, A.FB_TEXT.publish.ok, A.FB_TEXT.send.ok, A.FB_TEXT.download.ok, A.FB_TEXT.delete.ok], ['Enregistré ✓', 'Copié ✓', 'Publié ✓', 'Envoyé ✓', 'Téléchargé ✓', 'Supprimé ✓'], 'les six mots demandés');
  // 11) jamais bloqué : la marque disparaît
  { const { a, el } = attrs(); fbx('save', () => {})({ currentTarget: el }); await wait(1700); eq(a['data-fb'], undefined, 'la marque disparaît après 1,5 s'); }
  // 12) polices et boutons collés en bas
  const css2 = readFileSync('src/index.css', 'utf8');
  eq(/font-size: calc\(16px \* var\(--fs, 1\)\) !important/.test(css2) && /@supports \(-webkit-touch-callout: none\)/.test(css2) && /max\(16px, calc\(16px \* var\(--fs, 1\)\)\)/.test(css2), true, 'police : les champs suivent la taille choisie (16 px minimum seulement sur iPhone)');
  eq(['10', '11', '12', '13', '14', '15', '22'].every(n => css2.includes(`.text-\\[${n}px\\] { font-size: calc(${n}px * var(--fs, 1)) !important; }`)), true, 'police : les textes en pixels fixes suivent la taille choisie');
  eq(/setProperty\('--fs'/.test(readFileSync('src/utils/fontSize.ts', 'utf8')), true, 'police : le facteur --fs est posé');
  eq(/sticky bottom-\[calc\(var\(--bnh,0px\)\+0\.5rem\)\]/.test(readFileSync('src/components/PerformanceSettings.tsx', 'utf8')), true, 'Performance : « Enregistrer » collé au-dessus de la barre du bas');
  const chat2 = readFileSync('src/components/ChatView.tsx', 'utf8');
  eq(/onClick=\{togglePlus\}/.test(chat2) && /composer\.readOnly = true/.test(chat2) && /isKeyboardOpen\(\)/.test(chat2) && /maxHeight: 'calc\(var\(--vvh, 100dvh\) - var\(--hdr, 65px\) - 7rem\)'/.test(chat2), true, 'chat : « + » ferme le clavier puis ouvre le menu, qui ne dépasse pas sous l\'en-tête');
  // 13) un seul « Enregistrer » sur l'onglet Performance ; il retourne un ✓
  const sv = readFileSync('src/views/admin/SettingsView.tsx', 'utf8');
  eq(/tab !== 'performance' && \(\s*<button type="button" onClick=\{fb\('save', save\)\}/.test(sv), true, 'Réglages : le bouton du bas est caché sur l\'onglet Performance (un seul « Enregistrer »)');
  eq(/onClick=\{fb\('save', save\)\} disabled=\{!touched\}/.test(readFileSync('src/components/PerformanceSettings.tsx', 'utf8')), true, 'Performance : son « Enregistrer » affiche le retour');
  // 14) les boutons qui ouvrent seulement une fenêtre n'affichent pas de « ✓ »
  const all0 = (d0: string): string[] => readdirSync(d0).flatMap(n => { const p = join(d0, n); return statSync(p).isDirectory() ? all0(p) : p.endsWith('.tsx') ? [p] : []; });
  const openers = all0('src').flatMap(p => (readFileSync(p, 'utf8').match(/fb\('\w+', \(\) => set[A-Z]\w*\([^()]*\)\)/g) || []).map(m => `${p}: ${m}`));
  eq(openers, [], 'aucun bouton qui change seulement un état local (ouvrir, fermer) ne montre « ✓ »');
  // 11) branchements dans le code
  const walk = (d0: string): string[] => readdirSync(d0).flatMap(n => { const p = join(d0, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : []; });
  const files = walk('src'); const used = files.filter(p => /\bfb\('/.test(readFileSync(p, 'utf8')));
  eq(used.length >= 40, true, `au moins 40 fichiers utilisent fb (${used.length})`);
  eq(used.every(p => /from '[./]+\/utils\/actionFeedback'|from '\.\/actionFeedback'/.test(readFileSync(p, 'utf8')) || p.endsWith('actionFeedback.ts')), true, 'chaque fichier qui utilise fb l\'importe');
  const css = readFileSync('src/index.css', 'utf8');
  eq(['data-fb="busy"', 'data-fb="ok"', 'data-fb="err"', 'data-fb-text'].every(k => css.includes(k)), true, 'styles : en cours, ok, échec, texte');
  eq(/onSubmit=\{fb\('send'/.test(readFileSync('src/components/ChatView.tsx', 'utf8')), false, 'messagerie : pas de message « Envoyé ✓ » à chaque message (le message apparaît déjà)');
  console.log(f ? `${f} échec(s) sur ${t}` : `OK : ${t} contrôles`);
  process.exit(f ? 1 : 0);
})();

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
  eq([A.isFailure(false), A.isFailure({ success: false }), A.isFailure({ ok: false }), A.isFailure({ error: 'x' }), A.isFailure(undefined), A.isFailure({ success: true })], [true, true, true, true, false, false], 'ce qui est un échec');
  eq([A.isSuccess(true), A.isSuccess({ success: true }), A.isSuccess({ ok: true }), A.isSuccess(undefined), A.isSuccess({})], [true, true, true, false, false], 'ce qui est une réussite');
  eq([A.verdict(undefined, 1, 2, false), A.verdict(undefined, 1, 1, false), A.verdict(false, 1, 2, false), A.verdict({ success: true }, 1, 1, false), A.verdict(undefined, 1, 2, true)], ['ok', 'none', 'fail', 'ok', 'fail'], 'verdict : trace réelle = ok ; rien = rien ; échec ou erreur affichée = échec');
  // 1) action qui change les données : ✓ + message
  const d: any = { mutationSeq: 0 }; A.setEvidenceSource(() => d.mutationSeq);
  { toasts.length = 0; const { a, el } = attrs(); const h: any = fbx('save', () => { d.mutationSeq++; }); h({ currentTarget: el }); eq([a['data-fb'], a['data-fb-text'], toasts[0]?.message, toasts[0]?.type], ['ok', 'Enregistré ✓', 'Enregistré ✓', 'success'], 'enregistrement : « Enregistré ✓ » sur le bouton et en bas'); }
  // 2) bouton qui refuse (champ vide) : rien n'est affiché
  { toasts.length = 0; const { a, el } = attrs(); const h: any = fbx('save', () => { /* return; */ }); h({ currentTarget: el }); await new Promise(r => setTimeout(r, 1400)); eq([a['data-fb'], toasts.length], [undefined, 0], 'bouton qui refuse : aucun faux « ✓ »'); }
  // 3) échec annoncé
  { toasts.length = 0; const { a, el } = attrs(); fbx('delete', () => ({ success: false, error: 'Impossible de supprimer' }))({ currentTarget: el }); eq([a['data-fb'], a['data-fb-text'], toasts[0]?.type, toasts[0]?.message], ['err', 'Échec', 'error', 'Impossible de supprimer'], 'échec : rouge + raison'); }
  // 4) erreur levée : relancée et affichée
  { toasts.length = 0; let thrown = false; try { fbx('send', () => { throw new Error('Réseau coupé'); })({ currentTarget: attrs().el }); } catch { thrown = true; } eq([thrown, toasts[0]?.type], [true, 'error'], 'erreur levée : relancée et affichée'); }
  // 5) action asynchrone : en cours puis ✓
  { toasts.length = 0; const { a, el } = attrs(); const p = fbx('publish', async () => { await new Promise(r => setTimeout(r, 20)); d.mutationSeq++; return undefined; })({ currentTarget: el }); eq(a['data-fb'], 'busy', 'asynchrone : « en cours » pendant l\'attente'); await p; await new Promise(r => setTimeout(r, 5)); eq([a['data-fb'], a['data-fb-text']], ['ok', 'Publié ✓'], 'asynchrone : « Publié ✓ » à la fin'); }
  // 6) hors ligne : message honnête
  { toasts.length = 0; g.navigator.onLine = false; const { a, el } = attrs(); fbx('save', () => { d.mutationSeq++; })({ currentTarget: el }); eq([a['data-fb-text'], toasts[0]?.message], ['Gardé ✓', A.OFFLINE_NOTE], 'hors ligne : « Gardé » et non « Enregistré »'); g.navigator.onLine = true; }
  // 7) copie hors ligne : reste « Copié ✓ »
  { toasts.length = 0; g.navigator.onLine = false; const { a, el } = attrs(); const r = fbx('copy', () => ({ ok: true }))({ currentTarget: el }); eq([a['data-fb-text']], ['Copié ✓'], 'copie hors ligne : « Copié ✓ »'); g.navigator.onLine = true; void r; }
  // 8) le gestionnaire est appelé tel quel : même événement, même résultat
  { const ev = { currentTarget: attrs().el }; let got: unknown; const res = fbx('add', (e: unknown, n: number) => { got = [e === ev, n]; return 'x'; })(ev as any, 5 as any); eq([got, res], [[true, 5], 'x'], 'même événement, mêmes arguments, même résultat'); }
  // 9) formulaire : le bouton « submit » est trouvé
  { const btn = attrs().el; const form = { tagName: 'FORM', setAttribute() {}, querySelector: () => btn }; eq(A.feedbackTarget({ currentTarget: form } as any) === btn, true, 'formulaire : le bouton d\'envoi est repéré'); eq(A.feedbackTarget({ currentTarget: form, nativeEvent: { submitter: btn } } as any) === btn, true, 'formulaire : le bouton cliqué est repéré'); }
  // 10) les mots
  eq(Object.entries(A.FB_TEXT).every(([, v]) => /✓$/.test(v.ok) && v.fail === 'Échec'), true, 'tous les mots finissent par ✓ ; échec = « Échec »');
  eq([A.FB_TEXT.save.ok, A.FB_TEXT.copy.ok, A.FB_TEXT.publish.ok, A.FB_TEXT.send.ok, A.FB_TEXT.download.ok, A.FB_TEXT.delete.ok], ['Enregistré ✓', 'Copié ✓', 'Publié ✓', 'Envoyé ✓', 'Téléchargé ✓', 'Supprimé ✓'], 'les six mots demandés');
  // 12) action asynchrone sans trace (enregistrement direct au serveur) : « ✓ » à la fin, jamais bloquée « en cours »
  { toasts.length = 0; const { a, el } = attrs(); await fbx('save', async () => { await new Promise(r => setTimeout(r, 80)); })({ currentTarget: el }); await new Promise(r => setTimeout(r, 5)); eq([a['data-fb'], a['data-fb-text']], ['ok', 'Enregistré ✓'], 'asynchrone sans trace : « Enregistré ✓ »'); }
  // 13) refus immédiat (champ vide) : débloqué, rien d'affiché
  { toasts.length = 0; const { a, el } = attrs(); await fbx('save', async () => { /* return; */ })({ currentTarget: el }); await new Promise(r => setTimeout(r, 5)); eq([a['data-fb'], toasts.length], [undefined, 0], 'refus immédiat : le bouton est débloqué, rien d\'affiché'); }
  // 14) échec asynchrone : rouge, débloqué après
  { toasts.length = 0; const { a, el } = attrs(); await fbx('save', async () => { await new Promise(r => setTimeout(r, 60)); return { success: false, error: 'Refusé par le serveur' }; })({ currentTarget: el }); await new Promise(r => setTimeout(r, 5)); eq([a['data-fb'], toasts[0]?.message], ['err', 'Refusé par le serveur'], 'échec asynchrone : rouge + raison'); }
  // 15) jamais bloqué : après le délai, plus aucune marque
  { const { a, el } = attrs(); fbx('save', () => { d.mutationSeq++; })({ currentTarget: el }); await new Promise(r => setTimeout(r, 1700)); eq(a['data-fb'], undefined, 'la marque disparaît après 1,5 s'); }
  // 16) polices et boutons collés en bas
  const css2 = readFileSync('src/index.css', 'utf8');
  eq(/font-size: calc\(16px \* var\(--fs, 1\)\) !important/.test(css2) && /@supports \(-webkit-touch-callout: none\)/.test(css2) && /max\(16px, calc\(16px \* var\(--fs, 1\)\)\)/.test(css2), true, 'police : les champs suivent la taille choisie (16 px minimum seulement sur iPhone)');
  eq(['10', '11', '12', '13', '14', '15', '22'].every(n => css2.includes(`.text-\\[${n}px\\] { font-size: calc(${n}px * var(--fs, 1)) !important; }`)), true, 'police : les textes en pixels fixes suivent la taille choisie');
  eq(/setProperty\('--fs'/.test(readFileSync('src/utils/fontSize.ts', 'utf8')), true, 'police : le facteur --fs est posé');
  eq(/sticky bottom-\[calc\(var\(--bnh,0px\)\+0\.5rem\)\]/.test(readFileSync('src/components/PerformanceSettings.tsx', 'utf8')), true, 'Performance : « Enregistrer » collé au-dessus de la barre du bas');
  const chat2 = readFileSync('src/components/ChatView.tsx', 'utf8');
  eq(/onClick=\{togglePlus\}/.test(chat2) && /composer\.readOnly = true/.test(chat2) && /isKeyboardOpen\(\)/.test(chat2) && /maxHeight: 'calc\(var\(--vvh, 100dvh\) - var\(--hdr, 65px\) - 7rem\)'/.test(chat2), true, 'chat : « + » ferme le clavier puis ouvre le menu, qui ne dépasse pas sous l\'en-tête');
  // 11) branchements dans le code
  const walk = (d0: string): string[] => readdirSync(d0).flatMap(n => { const p = join(d0, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : []; });
  const files = walk('src'); const used = files.filter(p => /\bfb\('/.test(readFileSync(p, 'utf8')));
  eq(used.length >= 40, true, `au moins 40 fichiers utilisent fb (${used.length})`);
  eq(used.every(p => /from '[./]+\/utils\/actionFeedback'|from '\.\/actionFeedback'/.test(readFileSync(p, 'utf8')) || p.endsWith('actionFeedback.ts')), true, 'chaque fichier qui utilise fb l\'importe');
  eq(/installActionEvidence\(\)/.test(readFileSync('src/main.tsx', 'utf8')) && /mutationSeq/.test(readFileSync('src/main.tsx', 'utf8')), true, 'main.tsx : preuves (copie, téléchargement) installées');
  const css = readFileSync('src/index.css', 'utf8');
  eq(['data-fb="busy"', 'data-fb="ok"', 'data-fb="err"', 'data-fb-text'].every(k => css.includes(k)), true, 'styles : en cours, ok, échec, texte');
  eq(/onSubmit=\{fb\('send'/.test(readFileSync('src/components/ChatView.tsx', 'utf8')), false, 'messagerie : pas de message « Envoyé ✓ » à chaque message (le message apparaît déjà)');
  console.log(f ? `${f} échec(s) sur ${t}` : `OK : ${t} contrôles`);
  process.exit(f ? 1 : 0);
})();

// Contrôle : le responsable valide ou refuse une session par le SERVEUR (post-decide), une décision à la fois ; le mot facultatif est accepté et nettoyé.
import { readFileSync } from 'node:fs';
let ok = 0, bad = 0;
const t = (n: string, c: boolean) => { if (c) ok++; else { bad++; console.error('✗', n); } };
const page = readFileSync('src/views/admin/AdminDashboard.tsx', 'utf8');
const store = readFileSync('src/db/store.ts', 'utf8');
const api = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
t('valider : par decidePost', /db\.decidePost\(postId, true, undefined, note\)/.test(page));
t('refuser : par decidePost', /db\.decidePost\(id, false, rejectReason\)/.test(page));
t('plus de validation ni de rejet purement locaux dans le tableau de bord', !/db\.validatePost\(/.test(page) && !/db\.rejectPost\(/.test(page));
t('une décision à la fois par mission', page.includes('decidingRef.current.has(postId)') && page.includes('decidingRef.current.has(id)') && /finally \{ decidingRef\.current\.delete/.test(page));
t('le magasin envoie le mot facultatif et recharge l\'état', /note: approve \? note : undefined/.test(store) && /post-decide[\s\S]{0,300}this\.pull\(true\)/.test(store));
t('le mode démo valide quand même en local', /this\.demo\) \{ const r = approve \? this\.validatePost\(id, note\)/.test(store));
const r = api.slice(api.indexOf('async function postDecide'), api.indexOf('// ---------- comptes'));
t('serveur : mot facultatif nettoyé et limité à 300', /b\.note/.test(r) && /slice\(0, 300\)/.test(r) && /admin_notes: note/.test(r));
t('serveur : le mot ne s\'applique qu\'à une approbation', /if \(approve\) \{ const note/.test(r));
console.log(`${ok}/${ok + bad} contrôles OK`);
process.exit(bad ? 1 : 0);

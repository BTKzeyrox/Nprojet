// Essai des notifications côté site (store démo, carte Réglages, service worker, routes serveur), sans réseau. Lancer : npm run check:push-store
import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
let calls = 0; g.fetch = async () => { calls++; throw new Error('RESEAU'); };

const { db } = await import('../src/db/store');
const { AppProvider } = await import('../src/context/AppContext');
const { NotificationsCard } = await import('../src/components/NotificationsCard');

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const view = (lang: 'fr' | 'en') => { mem.delta_lang = lang; return renderToString(<AppProvider><NotificationsCard /></AppProvider>).replace(/<!-- -->/g, ''); };
const bad = (h: string) => /NaN|Infinity|undefined|\[object|\bnull\b/.test(h);

db.enterDemo('admin');
const k = await db.pushKey(); const s = await db.pushSubscribe({}); const t = await db.pushTest(); await db.pushUnsubscribe('https://x.y/zzzzzzzzzzzzzzzz');
ok(!k.ok && !s.ok && !t.ok, 'démo : clé, abonnement et test indisponibles (message clair)');
ok(calls === 0, 'démo : rien ne part sur internet');
const fr = view('fr'), en = view('en');
ok(fr.includes('Notifications') && fr.includes('Activer sur cet appareil'), 'carte FR : bouton « Activer sur cet appareil »');
ok(en.includes('Turn on for this device') && !en.includes('Activer'), 'carte EN : tout en anglais');
ok(!bad(fr) && !bad(en), 'carte : pas de NaN / undefined / null');

const sw = readFileSync('public/sw.js', 'utf8');
ok(/addEventListener\('push'/.test(sw) && /addEventListener\('notificationclick'/.test(sw) && /showNotification/.test(sw), 'service worker : reçoit et affiche les notifications');
ok(!/caches\.|fetch\(/.test(sw), 'service worker : ne met rien en cache et ne touche pas au réseau');
const st = readFileSync('src/views/admin/SettingsView.tsx', 'utf8');
ok((st.match(/<NotificationsCard \/>/g) || []).length === 2, 'Réglages : carte présente pour l\'employé et pour le responsable');
const api = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
const beforeAuth = api.slice(0, api.indexOf('const me = await authenticate(req);', api.indexOf('Deno.serve(')));
ok(/action === "push-due"/.test(beforeAuth) && !/push-(key|subscribe|unsubscribe|test)/.test(beforeAuth), 'serveur : seule la route du rappel automatique est avant la connexion (protégée par secret)');
ok(/push-key[\s\S]*push-subscribe[\s\S]*push-unsubscribe[\s\S]*push-test/.test(api.slice(api.indexOf('const me = await authenticate(req);', api.indexOf('Deno.serve(')))), 'serveur : clé, abonnement, désabonnement, test derrière la connexion');
ok(/timingSafeEqual\(a, b\)/.test(api.slice(api.indexOf('async function pushDue'), api.indexOf('async function pushDue') + 700)), 'rappel automatique : secret comparé en temps constant');
ok(!/BEGIN (PRIVATE|EC)|ghp_|ravelosonsandrinah/.test(api + readFileSync('supabase/migrations/20261022_create_df_push.sql', 'utf8') + sw), 'aucune clé privée, jeton ou email personnel dans le code');
const mig = readFileSync('supabase/migrations/20261022_create_df_push.sql', 'utf8');
ok(/enable row level security/.test(mig) && /revoke all on public\.df_push_subs, public\.df_push_log from anon, authenticated/.test(mig), 'migration : RLS et aucun accès public');
ok(/push_cron_secret/.test(mig) && !/x-cron-secret', '[A-Za-z0-9]{20,}/.test(mig), 'migration : le secret du rappel vient du coffre-fort, pas du fichier');
console.log(fails ? `\n${fails} ECHEC(S)` : '\nTout est bon'); process.exit(fails ? 1 : 0);

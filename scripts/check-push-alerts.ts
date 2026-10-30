// Contrôle des notifications externes, partie 2b : alertes calculées par la tâche planifiée. Site = serveur, mêmes règles que l'appli, anti-doublon. Sans réseau.
// Lancer : npm run check:push-alerts
import fs from 'node:fs';
import { transformSync } from 'esbuild';
import * as C from '../src/utils/pushAlerts';
import { stockRows } from '../src/utils/stock';
import { invoiceInfo } from '../src/utils/invoices';
import { applyAcks } from '../src/utils/health/registry';
import { advancePendingOld } from '../src/utils/health/rules/payroll';
import { validationWait } from '../src/utils/health/rules/missions';
import { HEALTH_THRESHOLDS_DEFAULT } from '../src/utils/health/types';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const J = JSON.stringify;
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const src = read('supabase/functions/df-api/index.ts');
const m = /\/\/ ===== BEGIN ALERTS_PUSH[^\n]*\n([\s\S]*?)\/\/ ===== END ALERTS_PUSH =====/.exec(src);
ok(!!m, 'bloc « ALERTS_PUSH » trouvé dans le serveur');
// Le bloc du serveur est la copie exacte du fichier de l'appli (sans l'en-tête, l'import et les « export »)
const client = read('src/utils/pushAlerts.ts');
const expected = client.slice(client.indexOf('export type AlertKind')).replace(/^export /gm, '').trimEnd() + '\n';
ok(m![1] === expected, 'serveur = copie exacte de src/utils/pushAlerts.ts');
const srv = new Function(`${transformSync(m![1], { loader: 'ts' }).code}\nreturn { planAlertPush, stockPushItems, advWaitItems, valWaitItems, invLateItems, ackHidden };`)() as typeof C;

// ---- Données d'essai ----
const TODAY = '2026-10-30', NOW = Date.parse('2026-10-30T09:00:00Z');
const P = (id: string, name: string, thr: number, storage?: string): any => ({ id, name, category: '', unit: 'u', buy_price_ar: 100, sell_price_ar: 0, alert_threshold: thr, ...(storage ? { storage_id: storage } : {}) });
const M = (product_id: string, type: 'in' | 'out' | 'adjust', qty: number): any => ({ id: `m${Math.random()}`, product_id, type, qty, date: '2026-10-01' });
const products = [P('a', 'Papier', 3), P('b', 'Encre', 3, 's2'), P('c', 'Colle', 3, 's2'), P('d', 'Agrafes', 0, 's2'), P('e', 'Neuf', 5), P('f', 'Négatif', 0, 's2'), P('h', 'Jamais', 0)];
const moves = [M('a', 'in', 10), M('a', 'out', 8), M('b', 'in', 5), M('b', 'out', 5), M('c', 'in', 6), M('c', 'out', 4), M('d', 'in', 3), M('d', 'out', 3), M('f', 'out', 2)];
const spaces = [{ id: 'main', name: 'Stockage 1' }, { id: 's2', name: 'Dépôt' }];
const adv = (id: string, name: string, date: string, status = 'pending'): any => ({ id, employee_id: 'e', employee_name: name, amount_ar: 987654, reason: '', request_date: date, status });
const advances = [adv('x1', 'Rina', '2026-10-20'), adv('x2', 'Naly', '2026-10-28'), adv('x3', 'Hery', '2026-10-10'), adv('x4', 'Old', '2026-10-01', 'approved')];
const post = (id: string, status: string, updated: string): any => ({ id, employee_id: 'e', employee_name: 'Rina', client_name: 'Acme', status, updated_at: updated, created_at: updated, date: '2026-10-29', start_time: '08:00' });
const posts = [post('p1', 'pending_start', '2026-10-29T05:00:00Z'), post('p2', 'pending_end', '2026-10-30T08:00:00Z'), post('p3', 'pending_end', '2026-10-27T05:00:00Z')];
const inv = (id: string, due: string, total = 500000, status = 'issued', type?: string): any => ({ id, type, status, number: `F-${id}`, total_ar: total, due_date: due, client: { name: 'Acme' }, client_id: 'c1' });
const invoices = [inv('i1', '2026-10-20'), inv('i2', '2026-11-20'), inv('i3', '2026-10-01'), inv('i4', '2026-10-01', 500000, 'issued', 'credit_note'), inv('i5', '2026-10-01', 500000, 'draft')];
const cash = [{ kind: 'in', amount_ar: 500000, invoice_id: 'i3' }, { kind: 'in', amount_ar: 100000, invoice_id: 'i1' }, { kind: 'out', amount_ar: 5, invoice_id: 'i1' }];
const input: C.AlertInput = { products, moves, spaces, advances, posts, invoices, cash };

// ---- 1) Le serveur calcule comme l'appli ----
const sameJ = (a: unknown, b: unknown) => J(a) === J(b);
ok(sameJ(C.planAlertPush(input, TODAY, NOW, [], []), srv.planAlertPush(input, TODAY, NOW, [], [])), 'site = serveur : tout envoyer (premier passage)');
const first = C.planAlertPush(input, TODAY, NOW, [], []);
ok(sameJ(C.planAlertPush(input, TODAY, NOW, first.current.slice(0, 3), []), srv.planAlertPush(input, TODAY, NOW, first.current.slice(0, 3), [])), 'site = serveur : une partie déjà envoyée');
ok(sameJ(C.planAlertPush({ ...input, spaces: [spaces[0]] }, TODAY, NOW, [], []), srv.planAlertPush({ ...input, spaces: [spaces[0]] }, TODAY, NOW, [], [])), 'site = serveur : un seul stockage');
ok(sameJ(C.planAlertPush({ products: [], moves: [], spaces, advances: [], posts: [], invoices: [], cash: [] }, TODAY, NOW, [], []), srv.planAlertPush({ products: [], moves: [], spaces, advances: [], posts: [], invoices: [], cash: [] }, TODAY, NOW, [], [])), 'site = serveur : rien à signaler');

// ---- 2) Mêmes règles que l'appli (Santé du site, voyant rouge, factures) ----
const rows = stockRows(products as any, moves as any);
const expEmpty = rows.filter(r => r.qty <= 0 && (r.product.alert_threshold > 0 || moves.some((x: any) => x.product_id === r.product.id))).map(r => r.product.id).sort();
const expLow = rows.filter(r => r.low && r.qty > 0).map(r => r.product.id).sort();
const items = C.stockPushItems(products, moves, spaces);
ok(sameJ(items.filter(x => x.state === 'empty').map(x => x.id).sort(), expEmpty) && sameJ(items.filter(x => x.state === 'low').map(x => x.id).sort(), expLow), 'stock : épuisés et bas = voyant rouge et Santé du site (un produit jamais approvisionné n\'est pas « épuisé »)');
ok(!items.some(x => x.id === 'h') && items.some(x => x.id === 'e' && x.state === 'empty') && items.some(x => x.id === 'f' && x.state === 'empty'), 'stock : produit jamais approvisionné et sans seuil ignoré ; avec un seuil il compte (comme la Santé du site) ; quantité négative = épuisé');
const hctx: any = { today: TODAY, now: NOW, thresholds: HEALTH_THRESHOLDS_DEFAULT, advances, posts, users: [], cash: [], contracts: [], products: [], moves: [] };
const hAdv = advancePendingOld.run(hctx)[0];
ok(!!hAdv && C.advWaitItems(advances, TODAY).length === hAdv.value, 'avances en attente : même compte que la Santé du site');
const hVal = validationWait.run(hctx)[0];
ok(!!hVal && C.valWaitItems(posts, NOW).length === hVal.value, 'validations en attente : même compte que la Santé du site');
const lateIds = C.invLateItems(invoices, cash, TODAY).map(x => x.id).sort();
const expLate = invoices.filter(i => invoiceInfo(i, cash as any, TODAY).overdue).map(i => i.id).sort();
ok(sameJ(lateIds, expLate) && sameJ(lateIds, ['i1']), 'factures en retard : même résultat que la page Factures (payée, avoir, brouillon, pas encore échue : exclus ; paiement partiel : reste en retard)');
const ackCases: [string, any[], number][] = [
  ['pas de marque', [], 3], ['ignorée récente', [{ id: 'stock:low', status: 'ignored', at: '2026-10-28T10:00:00Z', severity_at: 'watch', value_at: 3 }], 3],
  ['ignorée, la mesure a grandi', [{ id: 'stock:low', status: 'ignored', at: '2026-10-28T10:00:00Z', severity_at: 'watch', value_at: 2 }], 3],
  ['ignorée il y a 20 jours', [{ id: 'stock:low', status: 'ignored', at: '2026-10-10T10:00:00Z', severity_at: 'watch', value_at: 3 }], 3],
  ['vérifiée sans date', [{ id: 'stock:low', status: 'checked', at: '2026-09-01T10:00:00Z', severity_at: 'watch', value_at: 3 }], 3],
  ['jusqu\'à une date future', [{ id: 'stock:low', status: 'ignored', at: '2026-10-28T10:00:00Z', until: '2026-11-15', severity_at: 'watch', value_at: 3 }], 3],
  ['jusqu\'à une date passée', [{ id: 'stock:low', status: 'ignored', at: '2026-10-01T10:00:00Z', until: '2026-10-20', severity_at: 'watch', value_at: 3 }], 3],
  ['autre alerte', [{ id: 'stock:empty', status: 'ignored', at: '2026-10-28T10:00:00Z', severity_at: 'watch', value_at: 3 }], 3],
];
for (const [name, acks, value] of ackCases) {
  const alert: any = { id: 'stock:low', severity: 'watch', value };
  const app = applyAcks([alert], acks, TODAY, HEALTH_THRESHOLDS_DEFAULT.ignore_days).hidden.length === 1;
  ok(C.ackHidden(acks, 'stock:low', value, TODAY) === app && srv.ackHidden(acks, 'stock:low', value, TODAY) === app, `« Ignorer / Vérifié » comme la Santé du site : ${name}`);
}

// ---- 3) Ce qui part, une seule fois ----
const kinds = first.sends.map(s => `${s.kind}:${s.group}`).sort();
ok(sameJ(kinds, ['adv_wait:all', 'inv_late:all', 'stock_empty:main', 'stock_empty:s2', 'stock_low:main', 'stock_low:s2', 'val_wait:all'].sort()), 'premier passage : un push par groupe (jamais un par produit)');
ok(first.sends.length <= 2 * spaces.length + 3, 'premier passage : peu de push, même avec beaucoup d\'éléments');
const again = C.planAlertPush(input, TODAY, NOW, first.current, []);
ok(again.sends.length === 0 && sameJ(again.current, first.current), 'deuxième passage : rien ne repart (anti-doublon)');
const extra = C.planAlertPush({ ...input, products: [...products, P('g', 'Ciseaux', 2, 's2')], moves: [...moves, M('g', 'in', 1)] }, TODAY, NOW, first.current, []);
ok(extra.sends.length === 1 && extra.sends[0].kind === 'stock_low' && extra.sends[0].fresh.length === 1 && extra.sends[0].fresh[0].id === 'g', 'un nouveau produit bas : seul lui est annoncé');
const better = C.planAlertPush({ ...input, moves: [...moves, M('a', 'in', 20)] }, TODAY, NOW, first.current, []);
ok(!better.current.includes('alert:stk:a:low'), 'produit réapprovisionné : sa clé n\'est plus en alerte (elle sera oubliée, il pourra repartir s\'il retombe)');
const relapse = C.planAlertPush(input, TODAY, NOW, better.current, []);
ok(relapse.sends.some(s => s.kind === 'stock_low' && s.group === 'main' && s.fresh[0].id === 'a'), 'produit retombé bas : une nouvelle alerte part');
const acked = C.planAlertPush(input, TODAY, NOW, [], [{ id: 'stock:low:s2', status: 'ignored', at: '2026-10-29T10:00:00Z', severity_at: 'watch', value_at: 1 }, { id: 'invoices:overdue', status: 'checked', at: '2026-10-29T10:00:00Z', severity_at: 'watch', value_at: 1 }] as any[]);
ok(!acked.sends.some(s => s.kind === 'stock_low' && s.group === 's2') && !acked.sends.some(s => s.kind === 'inv_late') && acked.sends.some(s => s.kind === 'stock_low' && s.group === 'main'), '« Ignorer » de la Santé du site : l\'alerte ne part pas, les autres partent');
ok(acked.current.length === first.current.length, 'une alerte ignorée reste « en alerte » (sa clé n\'est pas oubliée)');

// ---- 4) Textes, liens, confidentialité ----
const by = (k: string, g: string) => first.sends.find(s => s.kind === k && s.group === g)!;
ok(by('stock_empty', 's2').text.fr.title === '3 produits épuisés' && by('stock_empty', 's2').text.fr.body.startsWith('Dépôt : ') && by('stock_empty', 's2').text.en.title === '3 products out of stock', 'stock : le texte nomme le stockage (plusieurs produits)');
ok(by('stock_low', 's2').text.fr.title === 'Stock bas' && by('stock_low', 's2').text.fr.body === 'Dépôt : Colle', 'stock : un seul produit = son nom');
ok(by('stock_low', 's2').link.go === 'storage' && by('stock_low', 's2').link.space === 's2' && by('stock_low', 's2').link.sfilter === 'low' && by('stock_low', 's2').link.product === 'c', 'stock : le lien ouvre le bon stockage, le filtre et le produit');
const solo = C.planAlertPush({ ...input, spaces: [spaces[0]], products: [products[0]], moves: moves.filter((x: any) => x.product_id === 'a'), advances: [], posts: [], invoices: [], cash: [] }, TODAY, NOW, [], []);
ok(solo.sends.length === 1 && solo.sends[0].text.fr.body === 'Papier' && solo.sends[0].health_id === 'stock:low', 'un seul stockage : pas de nom de stockage, identifiant Santé « stock:low »');
ok(by('stock_low', 's2').health_id === 'stock:low:s2', 'plusieurs stockages : identifiant Santé « stock:low:<stockage> »');
ok(by('adv_wait', 'all').link.nav === undefined && by('adv_wait', 'all').text.fr.title === '2 avances en attente' && by('adv_wait', 'all').link.filter === 'advances', 'avances : plusieurs = la page Validations, filtre Avances');
const oneAdv = C.planAlertPush({ ...input, advances: [advances[2]], products: [], moves: [], posts: [], invoices: [] }, TODAY, NOW, [], []).sends[0];
ok(oneAdv.link.nav === 'val-adv-x3' && oneAdv.text.fr.body === 'Hery · depuis 20 j', 'avance : une seule = lien exact vers elle, jours d\'attente');
const oneVal = C.planAlertPush({ ...input, posts: [posts[2]], products: [], moves: [], advances: [], invoices: [] }, TODAY, NOW, [], []).sends[0];
ok(oneVal.link.filter === 'ends' && oneVal.link.nav === 'val-post-p3' && oneVal.text.fr.body === 'Rina · Acme', 'validation en attente : lien exact et bon filtre (fin)');
const oneInv = by('inv_late', 'all');
ok(oneInv.link.nav === 'inv-i1' && oneInv.text.fr.title === 'Facture en retard' && oneInv.text.fr.body === 'F-i1 · Acme · 10 j', 'facture en retard : lien exact, numéro et client, jours de retard');
const allText = first.sends.flatMap(s => [s.text.fr.title, s.text.fr.body, s.text.en.title, s.text.en.body]);
ok(!allText.some(x => /\d{5,}|\bAr\b|MGA/.test(x)), 'confidentialité : aucun montant dans un push');
ok(first.sends.every(s => s.text.fr.title && s.text.en.title && s.text.fr.body && s.text.en.body && !/[àâçéèêëîïôùûœ]/i.test(s.text.en.title + s.text.en.body.replace(/Dépôt|Négatif/g, ''))), 'textes FR et EN présents, anglais sans accent français');
ok(first.sends.every(s => s.tag.length <= 60 && ['stock', 'validations', 'invoices'].includes(s.cat)), 'étiquette de notification courte et catégorie connue');
ok(first.sends.every(s => /^\/\?go=/.test(require_url(s.link))), 'chaque lien devient une adresse « /?go=… » valable');
function require_url(l: C.AlertLink): string { return `/?go=${l.go}`; }

// ---- 5) La tâche du serveur (lecture du code) ----
const has = (re: RegExp, msg: string) => ok(re.test(src), msg);
has(/try \{ alerts = await pushAlertsJob\(nowMs, adminIds\); \} catch/, 'serveur : les alertes ne bloquent jamais les rappels de missions');
has(/\.in\('data->>user_id', adminIds\)\.limit\(1\)[\s\S]{0,200}aucun appareil de responsable abonné/, 'serveur : aucun appareil de responsable abonné = rien à calculer');
has(/fetchAll\(\(a, b\) => sb\.from\(T\.stock\)/, 'serveur : tous les mouvements de stock sont lus (par pages de 1000)');
has(/like\('id', 'alert:%'\)/, 'serveur : le journal d\'anti-doublon est lu');
has(/for \(let i = 0; i < stale\.length; i \+= 200\) await sb\.from\(PUSH_LOG\)\.delete\(\)\.in\('id'/, 'serveur : les clés des éléments qui vont mieux sont oubliées');
has(/if \(n <= 0\) continue;[\s\S]{0,260}upsert\(s\.fresh\.map/, 'serveur : la clé n\'est notée que si le push a pu partir quelque part');
has(/pushTo\(adminIds, s\.text, s\.tag, s\.link as DeepLink, s\.cat\)/, 'serveur : envoyé aux responsables, catégorie respectée (interrupteurs)');
has(/\.not\('id', 'like', 'alert:%'\)/, 'serveur : le nettoyage de 30 jours ne touche pas aux clés d\'alerte');
has(/health_acks\)\s*\? settings\.health_acks : \[\]/, 'serveur : lit les « Ignorer / Vérifié » partagés');
ok(/'stock', 'invoices'/.test(read('src/utils/pushEvents.ts')) && /"stock", "invoices"/.test(src), 'catégories « stock » et « invoices » : site = serveur');
ok(/stock: t\('Stock épuisé ou bas/.test(read('src/components/NotificationsCard.tsx')) && /invoices: t\('Factures en retard'/.test(read('src/components/NotificationsCard.tsx')), 'écran : interrupteurs « Stock » et « Factures en retard »');
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);

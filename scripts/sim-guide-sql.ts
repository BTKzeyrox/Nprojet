// M20.5 : fabrique le SQL des données d'exemple du guide en vidéo (2 fournisseurs, 3 produits dont 1 en stock bas, 1 bon de commande brouillon, 1 devis). N'écrit RIEN lui-même :
// il affiche le SQL, une personne l'exécute (après sauvegarde et accord écrit de BTK). Toutes les lignes ont un identifiant « sim-guide-… » : le SQL commence par supprimer UNIQUEMENT celles-là.
// Les demandes de début et de fin en attente viennent déjà de la simulation M18 (sim-p433, sim-p434) : rien à ajouter. Pas de compte d'exemple (décision de BTK).
// Usage : npx tsx scripts/sim-guide-sql.ts [AAAA-MM-JJ] > sim-guide.sql
const today = process.argv[2] || new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const at = `${today}T09:00:00.000Z`;
const plus = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const by = 'user-admin-1';

export const guideRows = () => {
  const suppliers = [
    { id: 'sim-guide-sup1', name: 'Papeterie Rakoto (exemple)', contact: '034 00 200 01', lead_days: 3, note: 'Exemple pour le guide : papier et fournitures de bureau.', active: true, created_by: by, created_at: at, updated_at: at },
    { id: 'sim-guide-sup2', name: 'Informatique Rasoa (exemple)', contact: '034 00 200 02', lead_days: 7, note: 'Exemple pour le guide : câbles et petit matériel.', active: true, created_by: by, created_at: at, updated_at: at },
  ];
  const products = [
    { id: 'sim-guide-prod1', name: 'Ramette de papier A4 (exemple)', category: 'Bureau', unit: 'ramette', buy_price_ar: 14000, sell_price_ar: 18000, alert_threshold: 5, created_by: by, created_at: at, updated_at: at },
    { id: 'sim-guide-prod2', name: 'Câble réseau 5 m (exemple)', category: 'Informatique', unit: 'unité', buy_price_ar: 6000, sell_price_ar: 9000, alert_threshold: 3, created_by: by, created_at: at, updated_at: at },
    { id: 'sim-guide-prod3', name: 'Stylos bleus, boîte de 50 (exemple)', category: 'Bureau', unit: 'boîte', buy_price_ar: 12000, sell_price_ar: 16000, alert_threshold: 4, created_by: by, created_at: at, updated_at: at },
  ];
  // Entrées de stock : le papier et le câble sont en quantité suffisante ; les stylos (2 boîtes pour un seuil de 4) sont en STOCK BAS : voyant rouge.
  const stock = [
    { id: 'sim-guide-mv1', product_id: 'sim-guide-prod1', type: 'in', qty: 20, date: today, note: 'Stock de départ (exemple)', unit_cost_ar: 14000, created_by: by, created_at: at },
    { id: 'sim-guide-mv2', product_id: 'sim-guide-prod2', type: 'in', qty: 10, date: today, note: 'Stock de départ (exemple)', unit_cost_ar: 6000, created_by: by, created_at: at },
    { id: 'sim-guide-mv3', product_id: 'sim-guide-prod3', type: 'in', qty: 2, date: today, note: 'Stock de départ (exemple)', unit_cost_ar: 12000, created_by: by, created_at: at },
  ];
  const purchases = [
    { id: 'sim-guide-po1', ref: 'BC-0001', supplier_id: 'sim-guide-sup1', date: today, expected_date: plus(today, 3), status: 'draft', lines: [{ product_id: 'sim-guide-prod3', qty: 10, unit_cost_ar: 12000, received_qty: 0 }], note: 'Exemple pour le guide : réapprovisionner les stylos.', created_by: by, created_at: at, updated_at: at },
  ];
  const lines = [{ id: 'sim-guide-ql1', description: 'Saisie de 200 fiches (exemple)', qty: 200, unit_price_ar: 1500, total_ar: 300000 }];
  const quotes = [
    { id: 'sim-guide-q1', ref: 'DV-0001', status: 'draft', client_id: 'sim-cl1', date: today, valid_until: plus(today, 30), lines, subtotal_ar: 300000, tax_rate: 0, tax_ar: 0, total_ar: 300000, note: 'Exemple pour le guide.', created_by: by, created_at: at, updated_at: at },
  ];
  return { suppliers, products, stock, purchases, quotes };
};

const lit = (v: unknown): string => { const j = JSON.stringify(v); if (j.includes('$sg$')) throw new Error('texte interdit'); return `$sg$${j}$sg$::jsonb`; };
if (process.argv[1] && /sim-guide-sql/.test(process.argv[1])) {
  const r = guideRows();
  const tables: [string, { id: string }[]][] = [['df_suppliers', r.suppliers], ['df_products', r.products], ['df_stock_moves', r.stock], ['df_purchase_orders', r.purchases], ['df_quotes', r.quotes]];
  const out = ['begin;'];
  for (const [t] of [...tables].reverse()) out.push(`delete from public.${t} where id like 'sim-guide-%';`);
  for (const [t, rows] of tables) for (const x of rows) out.push(`insert into public.${t} (id, data) values ('${x.id}', ${lit(x)});`);
  out.push('commit;');
  console.log(out.join('\n'));
  console.error(`Données d'exemple du guide : ${tables.map(([t, x]) => `${t.replace('df_', '')} ${x.length}`).join(', ')}`);
}

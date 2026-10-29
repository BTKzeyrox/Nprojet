// Contrôles de la page Factures (module 11, M11.12). Règles pures : elles lisent, ne changent rien.
// Limites écrites : « en retard » = émise, échéance passée, reste à payer > 0 (comme la page Factures) ; les avoirs, brouillons et factures annulées ne comptent pas.
import { alertId, type HealthRule } from '../registry';
import type { HealthAlert } from '../types';
import { invoiceInfo } from '../../invoices';
import { dayDiff, plural } from './common';

const GO = { view: 'invoices' };
const URGENT_DAYS = 30, DRAFT_DAYS = 14;
const ar = (n: number): string => `${Math.round(n).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} Ar`;
const arEn = (n: number): string => `${Math.round(n).toLocaleString('en-US')} Ar`;

export const invoiceOverdue: HealthRule = {
  id: 'invoices.overdue', page: 'invoices',
  run: (ctx) => {
    if (!ctx.invoices) return [];
    const rows = ctx.invoices.map(i => ({ i, info: invoiceInfo(i, ctx.cash, ctx.today) })).filter(x => x.info.overdue);
    if (!rows.length) return [];
    const n = rows.length, total = rows.reduce((t, x) => t + x.info.balance, 0), oldest = Math.max(...rows.map(x => x.info.days_late));
    return [{
      id: alertId('invoices', 'overdue'), page: 'invoices', rule: 'overdue', severity: oldest > URGENT_DAYS ? 'urgent' : 'watch',
      title_fr: `${n} ${plural(n, 'facture en retard de paiement', 'factures en retard de paiement')}`, title_en: `${n} ${plural(n, 'invoice', 'invoices')} overdue`,
      why_fr: `Reste à encaisser : ${ar(total)} ; la plus ancienne a ${oldest} jour(s) de retard.`, why_en: `Left to collect: ${arEn(total)}; the oldest is ${oldest} day(s) late.`,
      todo_fr: 'Relancer les clients concernés (la page Factures prépare le message).', todo_en: 'Remind the clients concerned (the Invoices page prepares the message).',
      since: rows.map(x => x.i.due_date).sort()[0], value: total, go: { ...GO, nav: `inv-${[...rows].sort((a, b) => b.info.days_late - a.info.days_late)[0].i.id}` },
    } as HealthAlert];
  },
};

export const invoiceDraftOld: HealthRule = {
  id: 'invoices.draft-old', page: 'invoices',
  run: (ctx) => {
    if (!ctx.invoices) return [];
    const old = ctx.invoices.filter(i => i.status === 'draft' && i.type !== 'credit_note' && /^\d{4}-\d{2}-\d{2}$/.test(i.issue_date || '') && dayDiff(i.issue_date, ctx.today) > DRAFT_DAYS);
    if (!old.length) return [];
    const n = old.length;
    return [{
      id: alertId('invoices', 'draft-old'), page: 'invoices', rule: 'draft-old', severity: 'info',
      title_fr: `${n} ${plural(n, 'brouillon de facture oublié', 'brouillons de facture oubliés')}`, title_en: `${n} forgotten invoice ${plural(n, 'draft', 'drafts')}`,
      why_fr: `Non émis depuis plus de ${DRAFT_DAYS} jours : l'argent n'est pas encore réclamé au client.`, why_en: `Not issued for more than ${DRAFT_DAYS} days: the client has not been asked to pay yet.`,
      todo_fr: 'Émettre la facture ou supprimer le brouillon.', todo_en: 'Issue the invoice or delete the draft.',
      since: old.map(i => i.issue_date).sort()[0], value: n, go: { ...GO, nav: `inv-${[...old].sort((a, b) => a.issue_date.localeCompare(b.issue_date))[0].id}` },
    } as HealthAlert];
  },
};

export const INVOICE_RULES: HealthRule[] = [invoiceOverdue, invoiceDraftOld];

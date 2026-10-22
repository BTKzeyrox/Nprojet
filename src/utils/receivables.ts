// Créances et relances (module 2, M2.7) : règles pures, sans écran ni serveur. Contrôlé par `npm run check:receivables`.
//  • une facture est « à relancer » quand elle est émise, non annulée, pas soldée et que son échéance est strictement dépassée ;
//  • le texte de relance liste ces factures (numéro, dates, reste à payer, jours de retard) et le total ; il est écrit en FR ou en EN, à copier par le responsable ;
//  • l'alerte de l'accueil compte les clients à relancer et le montant en retard.
import type { CashEntry, Invoice } from '../types';
import { invoiceInfo } from './invoices';
import { ageBucket, type AgeBucket } from './invoices';

export interface OverdueInvoice { id: string; number: string; issue_date: string; due_date: string; total: number; balance: number; days_late: number; bucket: AgeBucket }
export interface ChaseRow { client_id: string; client_name: string; invoices: OverdueInvoice[]; total: number; max_days: number }

/** Factures en retard par client, le plus gros retard d'abord (puis le plus gros montant, puis le nom pour un ordre stable). */
export function toChase(invoices: Invoice[], cash: Pick<CashEntry, 'kind' | 'amount_ar' | 'invoice_id'>[], today: string, names: Record<string, string> = {}): ChaseRow[] {
  const rows = new Map<string, ChaseRow>();
  for (const inv of invoices) {
    if (inv.type === 'credit_note' || inv.status !== 'issued') continue;
    const info = invoiceInfo(inv, cash, today);
    if (!info.overdue || info.balance <= 0) continue;
    const r = rows.get(inv.client_id) || { client_id: inv.client_id, client_name: names[inv.client_id] || inv.client?.name || '—', invoices: [], total: 0, max_days: 0 };
    r.invoices.push({ id: inv.id, number: inv.number || '', issue_date: inv.issue_date, due_date: inv.due_date, total: inv.total_ar, balance: info.balance, days_late: info.days_late, bucket: ageBucket(info.days_late) });
    r.total += info.balance; r.max_days = Math.max(r.max_days, info.days_late);
    rows.set(inv.client_id, r);
  }
  for (const r of rows.values()) r.invoices.sort((a, b) => b.days_late - a.days_late || a.number.localeCompare(b.number));
  return [...rows.values()].sort((a, b) => b.max_days - a.max_days || b.total - a.total || a.client_name.localeCompare(b.client_name));
}

const day = (d: string) => d.split('-').reverse().join('/');
const money = (n: number, cur: string, lang: 'fr' | 'en') => `${Math.round(n).toLocaleString(lang === 'en' ? 'en-GB' : 'fr-FR')} ${cur || 'Ar'}`;

export interface ChaseContext { lang?: 'fr' | 'en'; company_name?: string; currency?: string; payment_methods?: string; penalty?: string }

/** Texte de relance prêt à copier. Poli, factuel : jamais de menace ; la pénalité n'est citée que si la page Conditions en contient une. */
export function chaseText(row: ChaseRow, ctx: ChaseContext = {}): string {
  const lang = ctx.lang === 'en' ? 'en' : 'fr';
  const cur = ctx.currency || 'Ar';
  const m = (n: number) => money(n, cur, lang);
  const items = row.invoices.map(i => lang === 'en'
    ? `- ${i.number} dated ${day(i.issue_date)}, due ${day(i.due_date)}: ${m(i.balance)} (${i.days_late} day${i.days_late > 1 ? 's' : ''} late)`
    : `- ${i.number} du ${day(i.issue_date)}, échue le ${day(i.due_date)} : ${m(i.balance)} (${i.days_late} jour${i.days_late > 1 ? 's' : ''} de retard)`).join('\n');
  const how = ctx.payment_methods ? (lang === 'en' ? ` Payment methods: ${ctx.payment_methods}.` : ` Modes de paiement : ${ctx.payment_methods}.`) : '';
  const pen = ctx.penalty ? `\n${ctx.penalty}` : '';
  const sign = ctx.company_name ? `\n${ctx.company_name}` : '';
  return lang === 'en'
    ? `Hello,\n\nOur records show that the following invoices are past due and still unpaid:\n${items}\n\nTotal to pay: ${m(row.total)}.${how}${pen}\n\nIf this payment has already been made, please disregard this message and accept our thanks.\n\nBest regards,${sign}`
    : `Bonjour,\n\nSauf erreur de notre part, les factures suivantes sont échues et restent impayées :\n${items}\n\nTotal à régler : ${m(row.total)}.${how}${pen}\n\nSi ce paiement a déjà été effectué, merci de ne pas tenir compte de ce message.\n\nCordialement,${sign}`;
}

/** Alerte de l'accueil : clients à relancer et montant en retard. Rien à signaler = null. */
export function receivablesAlert(rows: ChaseRow[]): { level: 'danger' | 'warn'; fr: string; en: string } | null {
  if (!rows.length) return null;
  const total = rows.reduce((t, r) => t + r.total, 0);
  const n = rows.length, count = rows.reduce((t, r) => t + r.invoices.length, 0);
  const worst = Math.max(...rows.map(r => r.max_days));
  const a = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} Ar`;
  const e = (v: number) => `${Math.round(v).toLocaleString('en-GB')} Ar`;
  return {
    level: worst > 60 ? 'danger' : 'warn',
    fr: `Factures en retard : ${count} facture${count > 1 ? 's' : ''} chez ${n} client${n > 1 ? 's' : ''}, ${a(total)} à relancer (retard maximum ${worst} j).`,
    en: `Overdue invoices: ${count} invoice${count > 1 ? 's' : ''} from ${n} client${n > 1 ? 's' : ''}, ${e(total)} to chase (longest delay ${worst} d).`,
  };
}

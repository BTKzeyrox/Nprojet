// Contrôles de la page Comptabilité (module 14, M14.9). Règles pures : elles lisent, ne changent rien.
// Limites écrites : (1) le site ne garde PAS de « déclaration de TVA faite » : un mois fini est considéré comme traité une fois la période close ;
// (2) la clôture est facultative : l'alerte est « à voir », jamais urgente ; (3) la date limite légale de la TVA n'est pas codée (à confirmer avec l'expert-comptable).
import { alertId, type HealthContext, type HealthRule } from '../registry';
import type { HealthAlert } from '../types';
import { totals, vatByMonth, type Entry, type EntryLine } from '../../accounting';
import { entryForCash } from '../../accountingEntries';
import { dayDiff, plural } from './common';

const GO = { view: 'accounting' };
const CLOSE_GRACE_DAYS = 10; // un mois fini a 10 jours pour finir de saisir avant qu'on propose de le clore
const VAT_GRACE_DAYS = 15; // TVA d'un mois fini : rappel après 15 jours
const ar = (n: number): string => `${Math.round(n).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} Ar`;
const arEn = (n: number): string => `${Math.round(n).toLocaleString('en-US')} Ar`;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const entriesOf = (ctx: HealthContext): Entry[] | null => (Array.isArray(ctx.entries) ? ctx.entries.filter(e => e && DATE_RE.test(e.date || '') && Array.isArray(e.lines)) : null);
const closedThrough = (ctx: HealthContext): string => {
  const c = (ctx.settings as { acct_close?: { through?: unknown } }).acct_close?.through;
  return typeof c === 'string' && DATE_RE.test(c) ? c : '';
};
/** Dernier jour du mois « AAAA-MM ». */
const monthEnd = (m: string): string => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };
const fr = (d: string): string => d.split('-').reverse().join('/');

/** Une écriture dont le débit n'égale pas le crédit : le serveur les refuse, donc cela ne peut venir que d'une donnée abîmée (import, ancienne copie). */
export const accountingUnbalanced: HealthRule = {
  id: 'accounting.unbalanced', page: 'accounting',
  run: (ctx) => {
    const list = entriesOf(ctx);
    if (!list) return [];
    const bad = list.filter(e => { const t = totals(e.lines); return t.debit !== t.credit; });
    if (!bad.length) return [];
    const n = bad.length, since = bad.map(e => e.date).sort()[0];
    return [{
      id: alertId('accounting', 'unbalanced'), page: 'accounting', rule: 'unbalanced', severity: 'urgent',
      title_fr: `${n} ${plural(n, 'écriture déséquilibrée', 'écritures déséquilibrées')}`, title_en: `${n} unbalanced ${plural(n, 'entry', 'entries')}`,
      why_fr: `Le total des débits ne vaut pas celui des crédits (la plus ancienne : ${fr(since)}) : la balance et le bilan sont faux tant que ce n'est pas corrigé.`,
      why_en: `Total debits do not equal total credits (oldest: ${since}): the trial balance and balance sheet are wrong until this is fixed.`,
      todo_fr: 'Ouvrir la Comptabilité, annuler l\'écriture (écriture inverse) puis saisir la bonne.', todo_en: 'Open Accounting, reverse the entry (counter-entry), then post the correct one.',
      since, value: n, go: GO,
    } as HealthAlert];
  },
};

/** Des mois finis depuis plus de 10 jours avec des écritures, mais pas encore clos. */
export const accountingPeriodOpen: HealthRule = {
  id: 'accounting.period-open', page: 'accounting',
  run: (ctx) => {
    const list = entriesOf(ctx);
    if (!list || !list.length) return [];
    const through = closedThrough(ctx);
    const months = new Set<string>();
    for (const e of list) {
      if (through && e.date <= through) continue;
      const end = monthEnd(e.date.slice(0, 7));
      if (dayDiff(end, ctx.today) > CLOSE_GRACE_DAYS) months.add(e.date.slice(0, 7));
    }
    if (!months.size) return [];
    const sorted = [...months].sort(), n = sorted.length, since = monthEnd(sorted[0]);
    return [{
      id: alertId('accounting', 'period-open'), page: 'accounting', rule: 'period-open', severity: 'watch',
      title_fr: `${n} ${plural(n, 'mois fini pas encore clos', 'mois finis pas encore clos')}`, title_en: `${n} finished ${plural(n, 'month', 'months')} not closed yet`,
      why_fr: `Des écritures existent jusqu'au ${fr(since)} et au-delà sans clôture${through ? ` (période close jusqu'au ${fr(through)})` : ''} : elles peuvent encore être changées par erreur.`,
      why_en: `Entries exist up to ${since} and beyond with no closing${through ? ` (closed up to ${through})` : ''}: they could still be changed by mistake.`,
      todo_fr: 'Vérifier le mois, puis le clore dans Comptabilité, onglet Clôture.', todo_en: 'Check the month, then close it in Accounting, Closing tab.',
      since, value: n, go: GO,
    } as HealthAlert];
  },
};

/** TVA à payer sur un mois fini depuis plus de 15 jours, pas encore clos (le site ne sait pas si elle est déclarée : voir les limites en tête de fichier). */
export const accountingVatDue: HealthRule = {
  id: 'accounting.vat-due', page: 'accounting',
  run: (ctx) => {
    const list = entriesOf(ctx);
    if (!list || !list.length) return [];
    const through = closedThrough(ctx);
    const rows = vatByMonth(list).months.filter(m => m.due > 0 && monthEnd(m.month) > through && dayDiff(monthEnd(m.month), ctx.today) > VAT_GRACE_DAYS);
    if (!rows.length) return [];
    const n = rows.length, total = rows.reduce((t, m) => t + m.due, 0), since = monthEnd(rows[0].month);
    return [{
      id: alertId('accounting', 'vat-due'), page: 'accounting', rule: 'vat-due', severity: 'watch',
      title_fr: `TVA à déclarer sur ${n} ${plural(n, 'mois fini', 'mois finis')}`, title_en: `VAT to declare for ${n} finished ${plural(n, 'month', 'months')}`,
      why_fr: `TVA à payer : ${ar(total)} (collectée moins déductible), depuis ${fr(since)}. Le site ne sait pas si elle est déjà déclarée : un mois clos n'est plus signalé.`,
      why_en: `VAT due: ${arEn(total)} (collected minus deductible), since ${since}. The site cannot tell whether it is already declared: a closed month is no longer flagged.`,
      todo_fr: 'Ouvrir l\'onglet TVA, préparer le brouillon Excel, vérifier la date limite avec ton comptable.', todo_en: 'Open the VAT tab, prepare the Excel draft, check the deadline with your accountant.',
      since, value: total, go: GO,
    } as HealthAlert];
  },
};


/** Lignes d'une écriture sous une forme comparable (compte, débit, crédit), triées. */
const shape = (lines: EntryLine[]): string => lines.map(l => `${l.account}|${Math.round(Number(l.debit) || 0)}|${Math.round(Number(l.credit) || 0)}`).sort().join(';');
const ENTRY_OF_CASH = /^je-(receipt|expense)-(.+)$/;

/**
 * Une écriture automatique d'une ligne de caisse qui ne correspond plus à cette ligne (montant, date, compte changés) ou dont la ligne a été supprimée.
 * Limites : on ne regarde que les lignes de caisse (pas les factures ni la paie) ; une écriture déjà annulée (`reversed_by`) est ignorée ; le site ne corrige rien tout seul.
 */
export const accountingStale: HealthRule = {
  id: 'accounting.stale', page: 'accounting',
  run: (ctx) => {
    const list = entriesOf(ctx);
    if (!list || !list.length || !Array.isArray(ctx.cash)) return [];
    const byId = new Map(ctx.cash.filter(c => c && typeof c.id === 'string').map(c => [c.id, c] as const));
    const bad: Entry[] = [];
    for (const e of list) {
      const m = ENTRY_OF_CASH.exec(e.id || '');
      if (!m || e.reversed_by || e.reversal_of) continue;
      const c = byId.get(m[2]);
      if (!c) { bad.push(e); continue; } // la ligne de caisse n'existe plus
      const r = entryForCash(c as any);
      if (!r.ok) continue; // la ligne n'est plus comptabilisable : la page Comptabilité le montre déjà
      if (r.entry.date !== e.date || shape(r.entry.lines) !== shape(e.lines)) bad.push(e);
    }
    if (!bad.length) return [];
    const n = bad.length, since = bad.map(e => e.date).sort()[0];
    return [{
      id: alertId('accounting', 'stale'), page: 'accounting', rule: 'stale', severity: 'watch',
      title_fr: `${n} ${plural(n, 'écriture ne correspond plus à sa ligne de caisse', 'écritures ne correspondent plus à leur ligne de caisse')}`, title_en: `${n} ${plural(n, 'entry no longer matches its cash line', 'entries no longer match their cash line')}`,
      why_fr: `Une ligne de caisse a été modifiée ou supprimée après sa comptabilisation (la plus ancienne : ${fr(since)}) : le journal, la balance et le résultat gardent l'ancien chiffre.`,
      why_en: `A cash line was changed or deleted after it was booked (oldest: ${since}): the journal, trial balance and result keep the old figure.`,
      todo_fr: 'Ouvrir la Comptabilité, annuler l\'écriture (écriture inverse) puis saisir la bonne, ou remettre la ligne de caisse comme avant.', todo_en: 'Open Accounting, reverse the entry (counter-entry) then post the correct one, or put the cash line back as it was.',
      since, value: n, go: GO,
    } as HealthAlert];
  },
};

export const ACCOUNTING_RULES: HealthRule[] = [accountingUnbalanced, accountingPeriodOpen, accountingVatDue, accountingStale];

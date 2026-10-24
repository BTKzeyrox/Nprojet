import React from 'react';
import { BadgeCheck, Hourglass, Eye, Boxes } from 'lucide-react';
import type { Bilingual, ClientBadge, ClientBadgeId, ClientBadgeConfig, ClientPerformance } from '../utils/clientBadges';
import { ScoreRing } from './PerformanceBadges';

// Badges et score de relation des clients (module 3, M3.6). Réservé au responsable : la page Clients n'est jamais ouverte à un salarié.
// Chaque badge dit POURQUOI (texte « why » des règles pures).
const pick = (b: Bilingual, lang: string) => (lang === 'en' ? b.en : b.fr);

export const CLIENT_BADGE_NAMES: Record<ClientBadgeId, Bilingual> = {
  good_payer: { fr: 'Bon payeur', en: 'Good payer' },
  slow_payer: { fr: 'Payeur lent', en: 'Slow payer' },
  watch: { fr: 'À surveiller', en: 'To watch' },
  big_volume: { fr: 'Gros volume', en: 'High volume' },
};
const ICONS: Record<ClientBadgeId, React.ElementType> = { good_payer: BadgeCheck, slow_payer: Hourglass, watch: Eye, big_volume: Boxes };
const TONES: Record<ClientBadgeId, string> = {
  good_payer: 'bg-emerald-900/50 text-emerald-100 border-emerald-600/60',
  slow_payer: 'bg-amber-900/50 text-amber-100 border-amber-600/60',
  watch: 'bg-rose-900/50 text-rose-100 border-rose-600/60',
  big_volume: 'bg-sky-900/50 text-sky-100 border-sky-600/60',
};

export const ClientBadgeChip: React.FC<{ badge: ClientBadge; lang: string }> = ({ badge, lang }) => {
  const Icon = ICONS[badge.id];
  const name = pick(CLIENT_BADGE_NAMES[badge.id], lang);
  const why = pick(badge.why, lang);
  return (
    <span title={why} aria-label={`${name} : ${why}`} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold ${TONES[badge.id]}`}>
      <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />{name}
    </span>
  );
};

export const ClientBadgeChips: React.FC<{ badges: ClientBadge[]; lang: string }> = ({ badges, lang }) => (
  badges.length ? <span className="inline-flex flex-wrap items-center gap-1">{badges.map(b => <ClientBadgeChip key={b.id} badge={b} lang={lang} />)}</span> : null
);

const PART: Record<'regularity' | 'payment' | 'volume', { name: Bilingual; help: Bilingual }> = {
  regularity: { name: { fr: 'Régularité des commandes', en: 'Order consistency' }, help: { fr: 'mois avec au moins une mission, sur les derniers mois', en: 'months with at least one mission, over recent months' } },
  payment: { name: { fr: 'Ponctualité de paiement', en: 'Payment punctuality' }, help: { fr: 'factures payées à temps (les factures en retard comptent contre le client)', en: 'invoices paid on time (late open invoices count against the client)' } },
  volume: { name: { fr: 'Volume', en: 'Volume' }, help: { fr: 'rang du chiffre d\'affaires sur 12 mois parmi les clients', en: 'rank of 12-month revenue among clients' } },
};

/** La fiche « relation » d'un client : score, 3 parties avec leur poids, badges avec le pourquoi, chiffres de paiement. */
export const ClientRelationCard: React.FC<{ p: ClientPerformance; cfg: ClientBadgeConfig; lang: string }> = ({ p, cfg, lang }) => {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const pay = p.payment;
  return (
    <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-2.5 space-y-2.5" aria-label={t('Relation client', 'Client relationship')}>
      <div className="flex items-center gap-3">
        <span className="text-white"><ScoreRing score={p.score} size={60} /></span>
        <div className="min-w-0 text-xs space-y-0.5">
          <div className="font-bold text-slate-100">{t('Score de relation', 'Relationship score')}</div>
          {p.score === null ? <div className="text-slate-400">{t('Pas assez de données : il faut au moins 2 des 3 parties ci-dessous.', 'Not enough data: at least 2 of the 3 parts below are needed.')}</div>
            : <div className="text-slate-400">{t('Sur 100, calculé sur les missions et les factures.', 'Out of 100, calculated from missions and invoices.')}</div>}
        </div>
      </div>
      <ul className="space-y-1.5">
        {(['regularity', 'payment', 'volume'] as const).map(k => {
          const v = p.components[k];
          return (
            <li key={k} className="text-xs">
              <div className="flex items-baseline justify-between gap-2"><span className="font-bold text-slate-100">{pick(PART[k].name, lang)} <span className="font-normal text-slate-400">({cfg.weights[k]} %)</span></span><span className="font-mono text-slate-200">{v === null ? t('non calculée', 'not calculated') : `${Math.round(v)} / 100`}</span></div>
              <div className="text-[11px] text-slate-400">{pick(PART[k].help, lang)}</div>
            </li>
          );
        })}
      </ul>
      {p.badges.length > 0 ? (
        <ul className="space-y-1.5">
          {p.badges.map(b => <li key={b.id} className="text-xs flex items-start gap-2"><ClientBadgeChip badge={b} lang={lang} /><span className="text-slate-300 break-words min-w-0">{pick(b.why, lang)}</span></li>)}
        </ul>
      ) : <p className="text-xs text-slate-400">{t('Aucun badge pour l\'instant.', 'No badge yet.')}</p>}
      <p className="text-[11px] text-slate-500 font-mono">
        {pay.paid === 0 && pay.overdue_open === 0
          ? t('Aucune facture soldée sur 12 mois : le comportement de paiement n\'est pas jugé.', 'No invoice settled in 12 months: payment behaviour is not judged.')
          : t(`${pay.paid} facture${pay.paid > 1 ? 's' : ''} soldée${pay.paid > 1 ? 's' : ''} sur ${cfg.payment_months} mois${pay.avg_days_over !== null ? `, écart moyen à l'échéance ${pay.avg_days_over > 0 ? '+' : ''}${pay.avg_days_over} j` : ''}${pay.overdue_open ? ` · ${pay.overdue_open} en retard (plus long : ${pay.max_days_late} j)` : ''}`,
            `${pay.paid} invoice${pay.paid === 1 ? '' : 's'} settled in ${cfg.payment_months} months${pay.avg_days_over !== null ? `, average gap to due date ${pay.avg_days_over > 0 ? '+' : ''}${pay.avg_days_over} d` : ''}${pay.overdue_open ? ` · ${pay.overdue_open} late (longest: ${pay.max_days_late} d)` : ''}`)}
      </p>
    </div>
  );
};

import React from 'react';
import { AlertTriangle, Target, TrendingUp } from 'lucide-react';
import { db } from '../db/store';
import { todayMada } from '../utils/stats';
import { forecastMonth, goalRows, monthFigures, type GoalRow } from '../utils/goals';
import { getAdminAlerts } from '../utils/alertsDb';
import type { AlertItem } from '../utils/alerts';
import { formatCurrencyAr } from '../utils/formatUtils';
import { Gauge } from './charts/Gauge';

// Objectifs du mois, alertes et prévision : réservés à l'admin (les chiffres d'argent ne sont jamais montrés à un employé).
const box = 'bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3';
const isAdmin = () => db.getCurrentUser()?.role === 'admin';

function monthNow() {
  const s = db.getSettings();
  const m = monthFigures({ cash: db.getCash(), posts: db.getPosts(), contracts: db.getContracts(), prices: s, pricePerMission: s.price_per_mission || 0 }, todayMada());
  return { s, m };
}

const NAMES = { missions: ['Missions', 'Missions'], profit: ['Bénéfice', 'Profit'], expenses: ['Dépenses maximum', 'Maximum expenses'] } as const;
const TEXT: Record<GoalRow['state'], { fr: string; en: string }> = {
  good: { fr: 'Objectif atteint', en: 'Goal reached' }, ok: { fr: 'Dans le rythme', en: 'On track' }, warn: { fr: 'À surveiller', en: 'Watch out' }, over: { fr: 'Plafond dépassé', en: 'Limit exceeded' },
};

export const GoalsBars: React.FC<{ lang: 'fr' | 'en'; hideWhenEmpty?: boolean }> = ({ lang, hideWhenEmpty }) => {
  if (!isAdmin()) return null;
  const { s, m } = monthNow();
  const rows = goalRows(s, m);
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  if (!rows.length) {
    if (hideWhenEmpty) return null;
    return <div className={box} data-notranslate=""><h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2"><Target className="w-4 h-4" />{t('Objectifs du mois', 'Monthly goals')}</h2><p className="text-xs text-slate-400">{t('Aucun objectif réglé. Va dans Réglages > Missions > Objectifs et alertes.', 'No goal set. Go to Settings > Missions > Goals and alerts.')}</p></div>;
  }
  return (
    <div className={box} data-notranslate="">
      <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2"><Target className="w-4 h-4" />{t('Objectifs du mois', 'Monthly goals')} <span className="text-[11px] font-normal text-slate-400">{t(`jour ${m.day} sur ${m.daysInMonth}`, `day ${m.day} of ${m.daysInMonth}`)}</span></h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {rows.map(g => {
          const money = g.key !== 'missions';
          const name = NAMES[g.key][lang === 'en' ? 1 : 0];
          const markPct = (m.day / m.daysInMonth) * 100;
          return (
            <Gauge key={g.key} pct={g.pct} state={g.state} label={name} stateText={TEXT[g.state][lang]}
              detail={`${money ? formatCurrencyAr(g.value) : g.value} / ${money ? formatCurrencyAr(g.goal) : g.goal}`}
              markPct={markPct} markText={t(`Rythme attendu aujourd'hui : ${Math.round(markPct)} %`, `Expected pace today: ${Math.round(markPct)} %`)} />
          );
        })}
      </div>
      <p className="text-[11px] text-slate-500">{t('Trait blanc : où vous devriez en être aujourd\'hui. L\'arc doit le dépasser (pour les dépenses : rester en dessous).', 'White mark: where you should be today. The arc should go past it (for expenses: stay below it).')}</p>
    </div>
  );
};

export const ForecastCard: React.FC<{ lang: 'fr' | 'en' }> = ({ lang }) => {
  if (!isAdmin()) return null;
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const { m } = monthNow();
  const f = forecastMonth(m);
  return (
    <div className={box} data-notranslate="">
      <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2"><TrendingUp className="w-4 h-4" />{t('Prévision de fin de mois', 'End-of-month forecast')}</h2>
      {f ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3"><div className="text-[11px] text-slate-400">{t('Missions', 'Missions')}</div><div className="text-base font-bold text-white">{f.missions}</div></div>
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3"><div className="text-[11px] text-slate-400">{t('Bénéfice', 'Profit')}</div><div className={`text-base font-bold ${f.profit < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{formatCurrencyAr(f.profit)}</div></div>
          </div>
          <p className="text-[11px] text-slate-400">{t(`À ce rythme (${f.day} jours sur ${f.daysInMonth}). Calcul simple : ce qui est fait depuis le 1er, répété jusqu'à la fin du mois. Ce n'est pas une certitude.`, `At this pace (${f.day} days of ${f.daysInMonth}). Simple calculation: what was done since the 1st, repeated until month end. Not a certainty.`)}</p>
        </>
      ) : <p className="text-xs text-slate-400">{t('Trop tôt pour prévoir : il faut au moins 3 jours dans le mois.', 'Too early to forecast: at least 3 days into the month are needed.')}</p>}
    </div>
  );
};

export const AlertsList: React.FC<{ lang: 'fr' | 'en'; onGo?: (a: AlertItem) => void; hideWhenEmpty?: boolean }> = ({ lang, onGo, hideWhenEmpty }) => {
  if (!isAdmin()) return null;
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const alerts = getAdminAlerts();
  if (!alerts.length && hideWhenEmpty) return null;
  return (
    <div className={box} data-notranslate="">
      <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{t('Alertes', 'Alerts')} {alerts.length > 0 && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-rose-600 text-white">{alerts.length}</span>}</h2>
      {alerts.length === 0 && <p className="text-xs text-emerald-300">{t('Aucune alerte. Tout est dans les limites réglées.', 'No alert. Everything is within the set limits.')}</p>}
      <ul className="space-y-1.5">
        {alerts.map(a => (
          <li key={a.id}>
            <button type="button" onClick={() => onGo?.(a)} className={`w-full text-left min-h-[44px] rounded-lg border px-3 py-2 text-xs sm:text-sm ${a.level === 'danger' ? 'border-rose-600/70 bg-rose-900/20 text-rose-100' : 'border-amber-600/60 bg-amber-900/20 text-amber-100'}`}>
              {lang === 'en' ? a.en : a.fr}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

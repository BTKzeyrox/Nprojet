// Éléments partagés par les graphiques (couleurs, textes FR/EN, nombres courts).
export const CHART_COLORS = ['#10b981', '#38bdf8', '#f59e0b', '#a78bfa', '#fb7185', '#94a3b8'];
export const GOOD = '#10b981';
export const BAD = '#fb7185';

/** 1 234 → « 1,2 k » · 1 500 000 → « 1,5 M » (court, pour les axes et les petites cartes). */
export const compactNumber = (n: number): string => {
  const a = Math.abs(n);
  const f = (v: number, s: string) => `${(Math.round(v * 10) / 10).toString().replace('.', ',')} ${s}`;
  if (a >= 1_000_000_000) return f(n / 1_000_000_000, 'Md');
  if (a >= 1_000_000) return f(n / 1_000_000, 'M');
  if (a >= 1_000) return f(n / 1_000, 'k');
  return String(Math.round(n));
};

export const safe = (n: number) => (Number.isFinite(n) ? n : 0);

export type ChartLang = 'fr' | 'en';
// Les textes des graphiques sont fournis dans les deux langues ici (les graphiques sont exclus de la traduction automatique : data-notranslate)
export const TXT = {
  fr: { empty: 'Aucune donnée sur cette période', tapChart: 'Touchez le graphique pour voir les valeurs', before: 'avant', prev: 'Période d\'avant', total: 'Total', others: 'Autres', avg: 'Moyenne', best: 'Meilleur', last: 'Dernier', min: 'Min', max: 'Max', vsPrev: 'par rapport à la période d\'avant', value: 'Valeur' },
  en: { empty: 'No data for this period', tapChart: 'Tap the chart to see the values', before: 'before', prev: 'Previous period', total: 'Total', others: 'Others', avg: 'Average', best: 'Best', last: 'Latest', min: 'Min', max: 'Max', vsPrev: 'vs previous period', value: 'Value' },
} as const;

// Onglet Analyses du Stockage : ses graphiques (valeur du stock, produits les plus sortis, fournisseurs, achats les plus chers) sont maintenant dans la page Graphiques.
// Utilisé par : StoragePage.tsx. Contrôlé par : npm run check:purchasing-page, npm run check:stock et npm run check:graphs.
// Pour modifier : lecture seule, responsable seulement. Les calculs (src/utils/stock.ts, purchasing.ts) et les cartes sont utilisés par src/views/admin/graphs/GraphsStock.tsx. Textes FR/EN avec t(fr, en).
import React from 'react';
import { OpenGraphsButton } from '../../components/OpenGraphsButton';
import { DEFAULT_STORAGE_ID } from '../../utils/stock';

interface Props { lang: 'fr' | 'en'; spaceId?: string }

export const StockAnalytics: React.FC<Props> = ({ lang }) => {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  return (
    <div className="space-y-3" data-stock-analytics-moved data-space-default={DEFAULT_STORAGE_ID}>
      <OpenGraphsButton filter="stock" lang={lang} hint={t('Les analyses du stock (valeur par catégorie et dans le temps, produits les plus sortis, fournisseurs, achats les plus chers) sont maintenant dans la page Graphiques, avec la même période que les autres graphiques.', 'The stock analyses (value by category and over time, most used products, suppliers, most expensive purchases) are now in the Charts page, with the same period as the other charts.')} />
    </div>
  );
};

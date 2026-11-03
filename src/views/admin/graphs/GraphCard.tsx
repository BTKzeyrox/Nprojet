// Carte commune de la page Graphiques : titre, outil de choix (facultatif), contenu, note. Même style que les anciennes pages (fond, bordure, couleurs).
// Utilisé par : GraphsMissions, GraphsMoney, GraphsStock. Une carte = un carré sur grand écran (2 × 2), une colonne sur téléphone.
import React from 'react';
import { graphNav } from '../../../utils/graphsPage';

export const graphBox = 'bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4 space-y-3';
export const GraphCard: React.FC<{ id: string; title: string; right?: React.ReactNode; note?: React.ReactNode; children: React.ReactNode }> = ({ id, title, right, note, children }) => (
  <section data-graph={id} data-nav={graphNav(id)} className={`${graphBox} min-w-0 lg:min-h-[340px] flex flex-col`}>
    <div className="flex items-start justify-between gap-2 flex-wrap">
      <h2 data-notranslate="" className="text-sm sm:text-base font-bold text-white min-w-0">{title}</h2>
      {right}
    </div>
    <div className="space-y-3 flex-1 min-w-0">{children}</div>
    {note && <p data-notranslate="" className="text-[11px] text-slate-500">{note}</p>}
  </section>
);
/** Petit choix à deux boutons dans l'en-tête d'une carte (ex. « Avec salaires » / « Caisse »). */
export const GraphToggle: React.FC<{ value: string; onChange: (v: string) => void; options: [string, string][]; label: string }> = ({ value, onChange, options, label }) => (
  <div className="flex gap-1" role="group" aria-label={label}>
    {options.map(([id, text]) => (
      <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}
        className={`min-h-[36px] px-2.5 rounded-lg text-xs font-semibold border ${value === id ? 'bg-emerald-700 border-emerald-500 text-white' : 'bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-800'}`}>{text}</button>
    ))}
  </div>
);

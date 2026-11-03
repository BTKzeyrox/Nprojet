// Barre de filtres commune (M22.7) : une rangée de boutons, même style et même place sur toutes les pages, un chiffre sur chacun ; à 0 le filtre reste visible mais grisé.
// Utilisé par : Validations, Historique, Achats (puis les autres pages, une par une). Règles dans utils/filterBar.ts.
import React from 'react';
import { filterText, type FilterDef } from '../utils/filterBar';

export function FilterBar<T extends string>({ filters, active, onChange, label, className = '', testId }: { filters: FilterDef<T>[]; active: T; onChange: (id: T) => void; label?: string; className?: string; testId?: (id: T) => string }) {
  return (
    <div data-filter-bar role="group" aria-label={label} className={`flex flex-wrap gap-1.5 ${className}`}>
      {filters.map(f => {
        const on = f.id === active, zero = f.count <= 0;
        return (
          <button key={f.id} type="button" data-filter={f.id} data-testid={testId ? testId(f.id) : undefined} aria-pressed={on} onClick={() => onChange(f.id)}
            style={on ? { backgroundColor: '#059669', color: '#ffffff', borderColor: '#059669' } : undefined}
            className={`min-h-[44px] px-3.5 rounded-lg border text-sm font-semibold cursor-pointer transition-colors ${on ? '' : 'bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-800'} ${zero && !on ? 'opacity-50' : ''}`}>
            {filterText(f.label, f.count)}
          </button>
        );
      })}
    </div>
  );
}

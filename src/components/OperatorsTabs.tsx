import React from 'react';
import { Users, ClipboardList } from 'lucide-react';
import { useApp } from '../context/AppContext';

/** Barre à deux onglets de la page « Opérateurs et sessions » : la liste des opérateurs et le suivi des sessions en une seule entrée du menu (module « combiner »). */
export const OperatorsTabs: React.FC<{ active: 'operators' | 'sessions'; onChange: (view: 'employees' | 'active-post') => void }> = ({ active, onChange }) => {
  const en = useApp().lang === 'en';
  const tab = (id: 'operators' | 'sessions', label: string, Icon: typeof Users, view: 'employees' | 'active-post') => (
    <button type="button" role="tab" aria-selected={active === id} onClick={() => onChange(view)} data-testid={`ops-tab-${id}`}
      className={`min-h-[44px] px-4 rounded-lg border font-semibold text-sm flex items-center gap-2 cursor-pointer transition-colors ${active === id ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'}`}>
      <Icon className="w-4 h-4" aria-hidden="true" /> {label}
    </button>
  );
  return (
    <div role="tablist" aria-label={en ? 'Operators and sessions' : 'Opérateurs et sessions'} className="flex flex-wrap gap-2 px-1.5 sm:px-3 lg:px-4 pt-4 sm:pt-5" data-testid="ops-tabs">
      {tab('operators', en ? 'Operators' : 'Opérateurs', Users, 'employees')}
      {tab('sessions', en ? 'Session tracking' : 'Suivi des sessions', ClipboardList, 'active-post')}
    </div>
  );
};

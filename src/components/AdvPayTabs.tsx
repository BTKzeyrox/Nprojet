import React from 'react';

// Filtre de la page Avances : « Avances » ou « Paie » (pas de nouvelle page)
export const AdvPayTabs: React.FC<{ value: 'advances' | 'payroll'; onChange: (v: 'advances' | 'payroll') => void; payLabel: string }> = ({ value, onChange, payLabel }) => (
  <div className="inline-flex rounded-full p-1 gap-1 border border-slate-700 bg-[#0f1722] mb-3" role="tablist">
    {([['advances', 'Avances'], ['payroll', payLabel]] as const).map(([k, l]) => (
      <button key={k} type="button" role="tab" aria-selected={value === k} onClick={() => onChange(k)}
        className={`rounded-full px-4 py-2 text-xs font-bold cursor-pointer ${value === k ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-white/10'}`}>{l}</button>
    ))}
  </div>
);

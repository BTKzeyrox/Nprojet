import React from 'react';

// Filtre de la page Avances : « Avances » ou « Paie » (pas de nouvelle page)
export const AdvPayTabs: React.FC<{ value: 'advances' | 'payroll'; onChange: (v: 'advances' | 'payroll') => void; payLabel: string }> = ({ value, onChange, payLabel }) => (
  <div className="inline-flex border border-slate-700 bg-[#0f1722] mb-3" role="tablist">
    {([['advances', 'Avances'], ['payroll', payLabel]] as const).map(([k, l]) => (
      <button key={k} type="button" role="tab" aria-selected={value === k} onClick={() => onChange(k)}
        className={`px-4 py-2 text-xs font-mono font-bold cursor-pointer ${value === k ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-[#141e2a]'}`}>{l}</button>
    ))}
  </div>
);

import React from 'react';

// Page « squelette » : s'affiche tout de suite pendant qu'une page se charge (on voit que ça réagit)
export const PageSkeleton: React.FC = () => (
  <div data-skeleton className="animate-pulse space-y-3 p-1" aria-busy="true" aria-label="Chargement de la page">
    <div className="h-8 w-48 rounded bg-slate-700/50" />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {[0, 1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-slate-700/40" />)}
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="h-40 rounded-xl bg-slate-700/30" />)}
    </div>
  </div>
);

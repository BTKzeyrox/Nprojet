import React, { useEffect, useState } from 'react';
import { FlaskConical, LogOut, RotateCcw } from 'lucide-react';
import { db } from '../db/store';

/** Petit bandeau permanent en mode démo : données fictives, réinitialiser, quitter. */
export const DemoBanner: React.FC = () => {
  const [, force] = useState(0);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);
  if (!db.isDemo()) return null;
  const role = db.getCurrentUser()?.role === 'admin' ? 'admin' : 'employee';
  return (
    <div className="fixed z-[9990] right-2 flex items-center gap-1 pl-3 pr-1 py-1 rounded-full bg-amber-500 text-white text-[11px] font-bold shadow-lg" style={{ top: 'calc(64px + env(safe-area-inset-top, 0px))' }}>
      <FlaskConical className="w-3.5 h-3.5 shrink-0" />
      <span className="mr-1">Mode démo : données fictives</span>
      <button type="button" onClick={() => { window.location.href = `/?demo=${role}`; }} className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/35 flex items-center justify-center cursor-pointer" title="Réinitialiser la démo"><RotateCcw className="w-3.5 h-3.5" /></button>
      <button type="button" onClick={() => { db.logout(); window.location.href = '/'; }} className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/35 flex items-center justify-center cursor-pointer" title="Quitter la démo"><LogOut className="w-3.5 h-3.5" /></button>
    </div>
  );
};

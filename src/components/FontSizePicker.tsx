import React, { useState } from 'react';
import { FONT_SIZES, getFontSize, setFontSize } from '../utils/fontSize';

export const FontSizePicker: React.FC = () => {
  const [cur, setCur] = useState(getFontSize());
  return (
    <div className="space-y-2 pt-1">
      <p className="text-sm font-semibold text-slate-200">Taille du texte</p>
      <div className="grid grid-cols-4 gap-2">
        {FONT_SIZES.map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => { setFontSize(f.id); setCur(f.id); }}
            className={`px-1 py-2 rounded-xl border text-xs font-semibold cursor-pointer ${cur === f.id ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-600 text-slate-300'}`}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
};

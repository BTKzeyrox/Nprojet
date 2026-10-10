import React, { useEffect, useRef, useState } from 'react';

// Champ de score : espaces automatiques (20 467 000) et abréviations (20.467M, 12k)
const parseScore = (raw: string): number => {
  const txt = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!txt) return 0;
  const m = txt.match(/^(\d*\.?\d*)([kKmM]?)$/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (isNaN(n)) return 0;
  const mult = m[2].toLowerCase() === 'm' ? 1_000_000 : m[2].toLowerCase() === 'k' ? 1_000 : 1;
  return Math.round(n * mult);
};

const groupDigits = (n: number): string => (n ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : '');

interface Props {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
}

export const ScoreInput: React.FC<Props> = ({ value, onChange, className, placeholder, required }) => {
  const [raw, setRaw] = useState<string>(groupDigits(value));
  const last = useRef<number>(value);

  // Valeur changée de l'extérieur (remise à zéro, ouverture d'une autre fenêtre...)
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setRaw(groupDigits(value));
    }
  }, [value]);

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const txt = e.target.value;
    // Seulement chiffres, espaces, point/virgule et un suffixe k ou M à la fin
    if (!/^[\d\s]*[.,]?[\d\s]*[kKmM]?$/.test(txt)) return;
    const hasSuffixOrDecimal = /[.,kKmM]/.test(txt);
    const n = parseScore(txt);
    setRaw(hasSuffixOrDecimal ? txt : groupDigits(n));
    last.current = n;
    onChange(n);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={raw}
      onChange={handle}
      required={required}
      placeholder={placeholder}
      className={className}
    />
  );
};

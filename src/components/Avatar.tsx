import React from 'react';

interface AvatarProps {
  src?: string;
  name: string;
  className?: string;
}

// Photo de profil, ou initiales si aucune photo
export const Avatar: React.FC<AvatarProps> = ({ src, name, className = 'w-8 h-8' }) => {
  if (src) {
    return <img src={src} alt={name} className={`${className} object-cover border border-slate-700 shrink-0`} />;
  }
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(w => w[0]?.toUpperCase())
      .join('') || '?';
  return (
    <div
      className={`${className} shrink-0 flex items-center justify-center bg-emerald-900/60 text-emerald-300 border border-emerald-700/50 font-bold text-xs`}
      aria-label={name}
    >
      {initials}
    </div>
  );
};

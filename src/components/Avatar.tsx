import React from 'react';

interface AvatarProps {
  src?: string;
  name: string;
  className?: string;
}

// Photo de profil, ou initiales si aucune photo
export const Avatar: React.FC<AvatarProps> = ({ src, name, className = 'w-8 h-8' }) => {
  if (src) {
    return <img src={src} alt={name} className={`${className} rounded-full object-cover border border-slate-300/60 shrink-0`} />;
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
      className={`${className} rounded-full shrink-0 flex items-center justify-center bg-blue-600/15 text-blue-600 border border-blue-500/30 font-bold text-xs`}
      aria-label={name}
    >
      {initials}
    </div>
  );
};

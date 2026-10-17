import { useSyncExternalStore } from 'react';

// Couleur d'une personne = couleur dominante de sa photo de profil (rouge sur photo rouge, etc.).
// Sans photo exploitable (noir/blanc/gris, image bloquée) : une teinte stable tirée du nom.
type RGB = [number, number, number];
const cache = new Map<string, RGB>();
const loading = new Set<string>();
let version = 0;
const listeners = new Set<() => void>();
const bump = () => { version++; listeners.forEach(l => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

const hslToRgb = (h: number, s: number, l: number): RGB => {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1))); };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
};
const rgbToHsl = ([r, g, b]: RGB): [number, number, number] => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
};
const fromName = (name: string): RGB => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return hslToRgb(h, 0.62, 0.5);
};

function dominant(img: HTMLImageElement): RGB | null {
  const S = 24;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, S, S);
  const px = ctx.getImageData(0, 0, S, S).data; // lève une erreur si l'image est « tainted » (CORS)
  const bins: { w: number; r: number; g: number; b: number }[] = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 200) continue;
    const [h, s, l] = rgbToHsl([px[i], px[i + 1], px[i + 2]]);
    if (s < 0.28 || l < 0.14 || l > 0.9) continue; // gris, noir, blanc : sans couleur
    const bin = bins[Math.floor(h / 30) % 12];
    const w = s * (1 - Math.abs(l - 0.5));
    bin.w += w; bin.r += px[i] * w; bin.g += px[i + 1] * w; bin.b += px[i + 2] * w;
  }
  const best = bins.reduce((a, b) => (b.w > a.w ? b : a));
  if (best.w < 0.6) return null; // pas assez de couleur
  const rgb: RGB = [best.r / best.w, best.g / best.w, best.b / best.w];
  const [h, s] = rgbToHsl(rgb);
  return hslToRgb(h, Math.max(0.55, Math.min(0.85, s)), 0.5); // couleur franche, lisible
}

const load = (url: string, name: string) => {
  const key = url;
  if (cache.has(key) || loading.has(key)) return;
  loading.add(key);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    let rgb: RGB | null = null;
    try { rgb = dominant(img); } catch { rgb = null; }
    cache.set(key, rgb || fromName(name));
    loading.delete(key);
    bump();
  };
  img.onerror = () => { cache.set(key, fromName(name)); loading.delete(key); bump(); };
  img.src = url;
};

/** Couleur de la personne (immédiate : teinte du nom ; remplacée par la couleur de sa photo dès qu'elle est lue). */
export function accentOf(p?: { avatar_url?: string; name?: string } | null): RGB {
  const name = p?.name || '?';
  if (!p?.avatar_url) return fromName(name);
  const hit = cache.get(p.avatar_url);
  if (hit) return hit;
  load(p.avatar_url, name);
  return fromName(name);
}

/** À appeler dans un composant : il se redessine quand une couleur de photo vient d'être calculée. */
export function useAccentVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => 0);
}

const rgba = ([r, g, b]: RGB, a: number) => `rgba(${r}, ${g}, ${b}, ${a})`;
const shade = ([r, g, b]: RGB, k: number): RGB => [Math.round(r * k), Math.round(g * k), Math.round(b * k)];
const mixWhite = ([r, g, b]: RGB, k: number): RGB => [Math.round(r + (255 - r) * k), Math.round(g + (255 - g) * k), Math.round(b + (255 - b) * k)];

/** Couleurs prêtes à l'emploi : barre, nom, fond léger de la citation, fond léger de la bulle reçue. */
export function accentStyles(rgb: RGB, light: boolean) {
  return {
    bar: rgba(rgb, 1),
    name: rgba(light ? shade(rgb, 0.78) : mixWhite(rgb, 0.35), 1),
    quoteBg: rgba(rgb, light ? 0.13 : 0.2),
    bubbleBg: light ? `rgb(${mixWhite(rgb, 0.9).join(',')})` : `rgb(${Math.round(22 + rgb[0] * 0.12)}, ${Math.round(33 + rgb[1] * 0.12)}, ${Math.round(46 + rgb[2] * 0.12)})`,
    bubbleBorder: rgba(rgb, light ? 0.25 : 0.3),
  };
}

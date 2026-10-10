import { useEffect, useState } from 'react';

// Préférence du son, gardée sur CET appareil (pas sur le serveur) : chaque téléphone règle le sien
export interface SoundPrefs { on: boolean; volume: number } // volume 0.1 à 1
const KEY = 'df_notif_sound';
const EVT = 'df-notif-sound';

export const getSoundPrefs = (): SoundPrefs => {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (p && typeof p.on === 'boolean') return { on: p.on, volume: Math.min(1, Math.max(0.1, Number(p.volume) || 0.5)) };
  } catch { /* ignore */ }
  return { on: true, volume: 0.5 };
};

export const setSoundPrefs = (p: SoundPrefs) => {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* stockage indisponible */ }
  window.dispatchEvent(new Event(EVT));
};

export const useSoundPrefs = (): [SoundPrefs, (p: SoundPrefs) => void] => {
  const [p, setP] = useState<SoundPrefs>(getSoundPrefs);
  useEffect(() => {
    const on = () => setP(getSoundPrefs());
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  return [p, setSoundPrefs];
};

// Les navigateurs bloquent le son avant le premier clic de la personne : on le « débloque » au 1er toucher
let ctx: AudioContext | null = null;
const getCtx = (): AudioContext | null => {
  try {
    if (!ctx) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    return ctx;
  } catch { return null; }
};
export const unlockSound = () => {
  const c = getCtx();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
};
if (typeof window !== 'undefined') {
  const once = () => { unlockSound(); window.removeEventListener('pointerdown', once); window.removeEventListener('keydown', once); };
  window.addEventListener('pointerdown', once);
  window.addEventListener('keydown', once);
}

// Bip court (2 notes)
export const playBeep = (volumeOverride?: number): boolean => {
  const c = getCtx();
  if (!c || c.state !== 'running') return false; // bloqué par le navigateur : pas de son, sans erreur
  const vol = volumeOverride ?? getSoundPrefs().volume;
  const t0 = c.currentTime;
  [880, 1175].forEach((f, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    const s = t0 + i * 0.13;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, 0.25 * vol), s + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.12);
    o.connect(g).connect(c.destination);
    o.start(s);
    o.stop(s + 0.13);
  });
  return true;
};

// Appelé quand une nouvelle notification arrive
export const beepIfEnabled = () => { if (getSoundPrefs().on) playBeep(); };

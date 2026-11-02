// Bip de notification et préférence du son (activé, volume) gardée sur cet appareil ; utilise l'audio et le stockage du navigateur.
// Utilisé par : TopBar.tsx et SettingsView.tsx.
// Pour modifier : le réglage est dans localStorage (df_notif_sound), propre à chaque téléphone ; avant le premier toucher le navigateur bloque le son et playBeep renvoie false.
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

// Nouveau son (BTK, 2026-11-01) : petite cloche claire à 3 notes montantes (do - mi - sol), douce, avec une résonance ; remplace l'ancien bip à 2 notes.
export const CHIME_NOTES = [1046.5, 1318.5, 1568]; // do6, mi6, sol6
export const CHIME_GAP = 0.11; // secondes entre deux notes
export const playBeep = (volumeOverride?: number): boolean => {
  const c = getCtx();
  if (!c || c.state !== 'running') return false; // bloqué par le navigateur : pas de son, sans erreur
  const vol = volumeOverride ?? getSoundPrefs().volume;
  const t0 = c.currentTime;
  CHIME_NOTES.forEach((f, i) => {
    const s = t0 + i * CHIME_GAP;
    const last = i === CHIME_NOTES.length - 1;
    const dur = last ? 0.55 : 0.28; // la dernière note résonne plus longtemps
    // note principale (sinus) + harmonique douce (octave, plus faible) = timbre de cloche
    [[f, 0.22], [f * 2, 0.07]].forEach(([freq, amp]) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, amp * vol), s + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
      o.connect(g).connect(c.destination);
      o.start(s);
      o.stop(s + dur + 0.02);
    });
  });
  return true;
};

// Appelé quand de nouvelles notifications arrivent dans l'appli ouverte : le MÊME son à CHAQUE notification (jusqu'à 3 d'affilée, espacés, pour ne pas faire un vacarme)
export const MAX_CHIMES = 3;
export const CHIME_SPACING_MS = 900;
export const chimeCount = (n: number): number => Math.min(MAX_CHIMES, Math.max(0, Math.floor(Number(n)) || 0));
export const beepIfEnabled = (n = 1) => {
  if (!getSoundPrefs().on) return;
  for (let i = 0; i < chimeCount(n); i++) { if (i === 0) playBeep(); else setTimeout(() => { playBeep(); }, i * CHIME_SPACING_MS); }
};

// Petits sons de l'appli (BTK, 2026-11-02) : envoyer, « J'adore », publication envoyée. Même réglage (son oui/non + volume) que la cloche.
export type UiSound = 'send' | 'like' | 'published';
export const UI_SOUNDS: Record<UiSound, { notes: [number, number][]; gap: number; dur: number; amp: number }> = {
  send: { notes: [[660, 0], [988, 0]], gap: 0.07, dur: 0.16, amp: 0.16 }, // petit « pop » montant, court
  like: { notes: [[1175, 0], [1568, 0]], gap: 0.06, dur: 0.14, amp: 0.14 }, // « tic-tic » aigu, léger
  published: { notes: [[784, 0], [988, 0], [1318.5, 0]], gap: 0.09, dur: 0.22, amp: 0.18 }, // 3 notes montantes, un peu plus longues
};
export const playUiSound = (kind: UiSound): boolean => {
  if (!getSoundPrefs().on) return false;
  const c = getCtx();
  if (!c || c.state !== 'running') return false;
  const { notes, gap, dur, amp } = UI_SOUNDS[kind];
  const vol = getSoundPrefs().volume, t0 = c.currentTime;
  notes.forEach(([f], i) => {
    const s = t0 + i * gap, d = i === notes.length - 1 ? dur * 1.6 : dur;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, amp * vol), s + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, s + d);
    o.connect(g).connect(c.destination);
    o.start(s); o.stop(s + d + 0.02);
  });
  return true;
};

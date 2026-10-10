// Rapports d'erreur : construction, mémoire locale (20 derniers), envoi limité au journal, texte à copier.
import { db } from '../db/store';

export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

export type ErrorKind = 'crash' | 'error' | 'server';
export interface ErrorReport {
  id: string; // numéro d'incident montré à l'utilisateur
  kind: ErrorKind;
  message: string;
  stack: string;
  page: string;
  role: string;
  userId: string;
  device: string;
  version: string;
  time: string;
  fingerprint: string; // regroupe les erreurs identiques dans le journal
}

let currentPage = '';
export const setCurrentPage = (p: string) => { currentPage = p; };
export const getCurrentPage = () => currentPage;

const LOCAL_KEY = 'df_errors_local';

// Retire ce qui ne doit jamais sortir du téléphone : jetons, mots de passe dans une adresse, paramètres d'URL
const scrub = (s: string) =>
  s
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer ***')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, '***')
    .replace(/ghp_[A-Za-z0-9]{10,}/g, '***')
    .replace(/https?:\/\/[^\s)]+/g, u => u.split('?')[0].split('#')[0]);

const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, '0');
};

export const deviceInfo = (): string => {
  try {
    const ua = navigator.userAgent;
    const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Autre';
    const nav = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navigateur';
    return `${os} · ${nav} · ${window.innerWidth}x${window.innerHeight}`.slice(0, 140);
  } catch {
    return 'inconnu';
  }
};

export const isChunkError = (msg: string) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(msg);

// Erreurs sans intérêt : on ne les enregistre pas
const isNoise = (msg: string) =>
  /ResizeObserver loop|^Script error|Non-Error promise rejection|^Failed to fetch$|^Load failed$|^NetworkError|AbortError|^The operation was aborted/i.test(msg.trim());

// Après une mise à jour, une page ouverte peut échouer à charger un morceau du site : on recharge UNE fois
export function autoReloadForUpdate(): boolean {
  try {
    if (sessionStorage.getItem('df_update_reload')) return false;
    sessionStorage.setItem('df_update_reload', '1');
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

export function buildReport(error: unknown, kind: ErrorKind, componentStack?: string): ErrorReport {
  const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : (() => { try { return JSON.stringify(error); } catch { return String(error); } })());
  const message = scrub(`${err.name && err.name !== 'Error' ? err.name + ': ' : ''}${err.message || 'Erreur inconnue'}`).slice(0, 300);
  const stackLines = scrub(err.stack || '').split('\n').slice(0, 8);
  const comp = componentStack ? scrub(componentStack).split('\n').filter(Boolean).slice(0, 4) : [];
  const stack = [...stackLines, ...(comp.length ? ['-- composants --', ...comp] : [])].join('\n').slice(0, 1500);
  // Empreinte stable : sans numéros de ligne ni noms de fichiers générés
  const firstLine = (stackLines.find(l => /\S/.test(l) && !l.startsWith(err.name)) || '').replace(/\/assets\/[^\s:)]+/g, 'asset').replace(/:\d+:\d+/g, '');
  const user = db.getCurrentUser();
  return {
    id: `INC-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 36).toString(36).toUpperCase()}`,
    kind,
    message,
    stack,
    page: currentPage || (typeof location !== 'undefined' ? location.pathname : ''),
    role: user?.role || 'visiteur',
    userId: user?.id || '',
    device: deviceInfo(),
    version: APP_VERSION,
    time: new Date().toISOString(),
    fingerprint: hash(`${kind}|${message.slice(0, 100)}|${firstLine}`),
  };
}

export const getLocalReports = (): ErrorReport[] => {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
  } catch {
    return [];
  }
};
const rememberLocal = (r: ErrorReport) => {
  try {
    const list = getLocalReports().filter(x => x.id !== r.id);
    list.push(r);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(-20)));
  } catch { /* stockage plein ou bloqué : tant pis */ }
};

// Envoi automatique au journal, avec des limites pour ne pas user le quota d'appels gratuit
const sentPrints = new Set<string>();
let sentCount = 0;
export function recordAndSend(report: ErrorReport) {
  rememberLocal(report);
  const cfg = db.getSettings();
  if (cfg.err_report_enabled === false) return;
  if (sentPrints.has(report.fingerprint)) return;
  if (sentCount >= Math.max(0, Number(cfg.err_max_per_session ?? 3))) return;
  sentPrints.add(report.fingerprint);
  sentCount++;
  void db.sendErrorReport({
    kind: report.kind,
    message: report.message,
    stack: report.stack,
    page: report.page,
    role: report.role,
    device: report.device,
    version: report.version,
    fingerprint: report.fingerprint,
  });
}

// Plantage d'un écran (appelé par ErrorBoundary)
export function captureCrash(error: unknown, componentStack?: string): ErrorReport {
  const report = buildReport(error, 'crash', componentStack);
  recordAndSend(report);
  return report;
}

export function reportToText(r: ErrorReport): string {
  return [
    `Rapport d'incident ${r.id}`,
    `Type : ${r.kind === 'crash' ? 'plantage d\'un écran' : r.kind === 'server' ? 'erreur du serveur' : 'erreur'}`,
    `Message : ${r.message}`,
    `Page : ${r.page}`,
    `Compte : ${r.role}${r.userId ? ' (' + r.userId + ')' : ''}`,
    `Appareil : ${r.device}`,
    `Version du site : ${r.version}`,
    `Heure : ${r.time}`,
    '',
    r.stack,
  ].join('\n');
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

// Vide le cache du navigateur (pas la connexion) puis recharge
export async function clearCacheAndReload() {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    sessionStorage.removeItem('df_update_reload');
  } catch { /* ignore */ }
  window.location.replace(`${window.location.pathname}?r=${Date.now()}`);
}

// Erreurs hors écran (réseau, promesses refusées, échec de chargement d'une page)
let installed = false;
export function installGlobalErrorHandlers() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const handle = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err ?? '');
    if (isChunkError(msg)) {
      if (autoReloadForUpdate()) return;
    } else if (isNoise(msg)) {
      return;
    }
    recordAndSend(buildReport(err, 'error'));
  };
  window.addEventListener('error', e => handle(e.error || e.message));
  window.addEventListener('unhandledrejection', e => handle(e.reason));
  window.addEventListener('vite:preloadError', (e: Event) => {
    e.preventDefault();
    if (!autoReloadForUpdate()) recordAndSend(buildReport(new Error("Échec de chargement d'une page après mise à jour"), 'error'));
  });
  // Erreurs du serveur (5xx) vues par le site
  db.serverErrorHook = (path, status) => recordAndSend(buildReport(new Error(`Erreur serveur ${status} sur ${path}`), 'server'));
}

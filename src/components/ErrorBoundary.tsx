import React from 'react';
import { AlertTriangle, RefreshCw, RotateCcw, LogOut, Copy, LifeBuoy } from 'lucide-react';
import { db } from '../db/store';
import { hideSplash } from '../utils/splash';
import { captureCrash, reportToText, copyText, clearCacheAndReload, isChunkError, autoReloadForUpdate, ErrorReport } from '../utils/errorReport';

interface Props {
  scope: 'app' | 'page'; // « app » : écran entier ; « page » : le menu reste utilisable
  children: React.ReactNode;
}
interface State {
  hasError: boolean;
  report: ErrorReport | null;
  copied: boolean;
}

// Remplace la page blanche par un écran de secours avec le numéro d'incident
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, report: null, copied: false };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true, report: null, copied: false };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    hideSplash(true); // l'écran de secours doit être visible tout de suite
    // Après une mise à jour du site, une page peut échouer à charger : on recharge une seule fois
    if (isChunkError(error?.message || '') && autoReloadForUpdate()) return;
    const report = captureCrash(error, info?.componentStack || undefined);
    this.setState({ report });
  }

  private retry = () => this.setState({ hasError: false, report: null, copied: false });

  private copy = async () => {
    if (!this.state.report) return;
    const ok = await copyText(reportToText(this.state.report));
    this.setState({ copied: ok });
    setTimeout(() => this.setState({ copied: false }), 2500);
  };

  private logout = () => {
    try { db.logout(); } catch { /* ignore */ }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const report = this.state.report;
    const cfg = db.getSettings();
    const user = db.getCurrentUser();
    const showDetails = user?.role === 'admin' || cfg.err_hide_details === false;
    const full = this.props.scope === 'app';

    const card = (
      <div role="alert" className="w-full max-w-lg bg-[#0f1722] border border-red-500/50 p-5 sm:p-6 space-y-4 text-slate-200">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-7 h-7 text-red-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h2 className="font-tactical font-bold text-lg text-white">Un problème est survenu</h2>
            <p className="text-sm text-slate-400 mt-1">
              {full ? "L'application a rencontré une erreur." : 'Cette page a rencontré une erreur. Le menu reste utilisable.'} Le problème a été noté pour être corrigé.
            </p>
          </div>
        </div>

        {report && (
          <div className="bg-[#0a0f16] border border-slate-700 p-3 text-xs font-mono space-y-1">
            <div>
              Numéro d'incident : <strong className="text-white select-all">{report.id}</strong>
            </div>
            {showDetails && <div className="text-red-300 break-words">{report.message}</div>}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <button type="button" onClick={this.retry} className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-2 cursor-pointer">
            <RefreshCw className="w-4 h-4" /> Réessayer
          </button>
          <button type="button" onClick={() => void clearCacheAndReload()} className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold flex items-center justify-center gap-2 cursor-pointer">
            <RotateCcw className="w-4 h-4" /> Vider le cache et recharger
          </button>
          <button type="button" onClick={this.copy} disabled={!report} className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40">
            <Copy className="w-4 h-4" /> {this.state.copied ? 'Rapport copié ✓' : 'Copier le rapport'}
          </button>
          <button type="button" onClick={this.logout} className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold flex items-center justify-center gap-2 cursor-pointer">
            <LogOut className="w-4 h-4" /> Se déconnecter
          </button>
        </div>

        <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
          <LifeBuoy className="w-3.5 h-3.5" />
          <span>
            Si ça continue : copie le rapport et envoie-le à l'administrateur, ou ouvre la{' '}
            <a href="/secours.html" className="underline text-slate-300">page de secours</a>.
          </span>
        </div>
      </div>
    );

    return full ? (
      <div className="min-h-screen flex items-center justify-center bg-[#070b11] p-4">{card}</div>
    ) : (
      <div className="flex justify-center p-3 sm:p-6">{card}</div>
    );
  }
}

import React from 'react';
import { X, ArrowLeft, Calendar, Clock, Trophy, Eye, CheckCircle2, AlertTriangle, Lock } from 'lucide-react';
import { PostSession, AttendanceRow } from '../types';
import { formatDuration } from '../utils/presence';
import { useLockBodyScroll } from '../utils/useLockBodyScroll';
import { formatScoreM } from '../utils/formatUtils';
import { proofsOf } from '../utils/proofs';
import { db } from '../db/store';

interface DayDetailsModalProps {
  isOpen: boolean;
  dateStr: string | null;
  onClose: () => void;
  onBack?: () => void;
  shifts: PostSession[];
  attendance?: AttendanceRow[]; // arrivées du jour (première connexion, temps connecté)
  onOpenProofLightbox: (params: {
    imageUrl: string;
    gallery?: string[];
    title: string;
    subtitle?: string;
    score?: number;
    clientTag?: string;
    operatorName?: string;
    timestamp?: string;
  }) => void;
}

export const DayDetailsModal: React.FC<DayDetailsModalProps> = ({
  isOpen,
  dateStr,
  onClose,
  onBack,
  shifts,
  attendance = [],
  onOpenProofLightbox,
}) => {
  useLockBodyScroll(isOpen);

  if (!isOpen || !dateStr) return null;

  const currentUser = db.getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';

  const [year, month, day] = dateStr.split('-');
  const formattedDate = `${day}/${month}/${year}`;

  const totalScoreGained = shifts.reduce((acc, s) => {
    const final = s.final_score ?? s.current_score;
    return acc + Math.max(0, final - s.initial_score);
  }, 0);

  const totalPayrollAr = shifts.reduce((acc, s) => acc + (s.calculated_ar || 0), 0);

  // Présence du jour : arrivée = première connexion ; départ = fin de la dernière session ; connecté = temps cumulé
  const hm = (iso: string) => new Date(new Date(iso).getTime() + 3 * 3600 * 1000).toISOString().slice(11, 16); // heure de Madagascar
  const presenceIds = Array.from(new Set([...attendance.map(a => a.user_id), ...shifts.map(s => s.employee_id)]));
  const presenceRows = presenceIds.map(id => {
    const att = attendance.find(a => a.user_id === id);
    const mine = shifts.filter(s => s.employee_id === id).sort((a, b) => a.start_time.localeCompare(b.start_time));
    const last = mine[mine.length - 1];
    const departure = !last ? '—' : !last.end_time ? 'En cours' : last.end_time.slice(0, 5);
    return {
      id,
      name: db.getUsers().find(u => u.id === id)?.name || mine[0]?.employee_name || '—',
      arrival: att ? hm(att.first_seen) : 'non enregistrée',
      departure,
      online: att ? formatDuration(att.online_sec) : '—',
    };
  });

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-2.5 sm:p-4 overflow-y-auto overscroll-contain"
    >
      <div className="bg-[#0e1622] border border-slate-700 w-full max-w-4xl rounded-xl shadow-2xl overflow-hidden my-auto max-h-[calc(100dvh-57px-2.5rem-env(safe-area-inset-bottom))] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* Top Header */}
        <div className="bg-[#131d2b] px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-700/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 sm:gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors flex items-center gap-1.5 text-xs font-mono font-bold cursor-pointer border border-slate-700"
                title="Retour au calendrier"
              >
                <ArrowLeft className="w-4 h-4 text-emerald-400" />
                <span>Retour</span>
              </button>
            )}
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
            <div>
              <h3 className="font-tactical font-bold text-white text-sm sm:text-base tracking-wide flex items-center gap-2">
                Rapport du Jour: {formattedDate}
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-400 font-mono">
                {shifts.length} mission(s) · {formatScoreM(totalScoreGained)} pts boostés {isAdmin ? `· +${totalPayrollAr.toLocaleString()} Ar` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-red-600/80 hover:bg-red-600 text-white rounded-lg text-xs font-tactical font-bold uppercase transition-colors cursor-pointer flex items-center gap-1"
            >
              <X className="w-4 h-4" />
              <span className="hidden sm:inline">Fermer</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-3.5 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto flex-1">
          {presenceRows.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-700/80 rounded-lg p-3 space-y-1.5">
              <div className="text-[11px] font-mono font-bold text-emerald-400 uppercase">Présence du jour</div>
              {presenceRows.map(r => (
                <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs font-mono text-slate-300">
                  {isAdmin && <span className="font-bold text-white">{r.name}</span>}
                  <span>Arrivée : <strong className="text-slate-100">{r.arrival}</strong></span>
                  <span>Départ : <strong className="text-slate-100">{r.departure}</strong></span>
                  <span>Connecté : <strong className="text-slate-100">{r.online}</strong></span>
                </div>
              ))}
            </div>
          )}

          {shifts.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl bg-slate-900/30">
              <Clock className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-300">Aucun shift de boost enregistré pour cette date</p>
              <p className="text-xs text-slate-500 font-mono mt-1">
                Journée sans mission active ou absence signalée (Pas de Poste).
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {shifts.map((shift, idx) => {
                const finalScore = shift.final_score ?? shift.current_score;
                const scoreDiff = Math.max(0, finalScore - shift.initial_score);
                const objectiveReached = finalScore >= shift.target_score;

                return (
                  <div
                    key={shift.id}
                    className="bg-[#121b27] border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors space-y-4"
                  >
                    {/* Shift Card Top Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs font-mono font-bold text-slate-300 border border-slate-700">
                          #{idx + 1}
                        </span>
                        <div>
                          <div className="font-semibold text-white text-sm flex items-center gap-2">
                            <span>{shift.employee_name}</span>
                            <span className="text-xs font-mono uppercase bg-slate-800 px-2 py-0.5 rounded text-slate-300 border border-slate-700">
                              Shift {shift.shift_type.toUpperCase()}
                            </span>
                            <span
                              className={`text-[11px] font-mono px-2 py-0.5 rounded uppercase font-semibold border ${
                                shift.status === 'completed'
                                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400'
                                  : shift.status === 'rejected'
                                  ? 'bg-red-950/60 border-red-500/40 text-red-400'
                                  : shift.status === 'force_released'
                                  ? 'bg-amber-950/60 border-amber-500/40 text-amber-400'
                                  : 'bg-cyan-950/60 border-cyan-500/40 text-cyan-400'
                              }`}
                            >
                              {shift.status}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 font-mono mt-0.5">
                            Client: <span className="text-cyan-300 font-semibold">{shift.client_name}</span> ({shift.account_tag})
                          </div>
                        </div>
                      </div>

                      {/* Timestamps */}
                      <div className="text-right text-xs font-mono bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
                        <div className="text-slate-400 flex items-center justify-end gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          <span>Début: <strong className="text-slate-200">{shift.start_time}</strong></span>
                        </div>
                        <div className="text-slate-400">
                          Fin: <strong className="text-slate-200">{shift.end_time || 'En cours...'}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Scores & Objectives Grid with formatScoreM (1M abbreviations) */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                      <div className="bg-[#0b1018] p-2.5 rounded-lg border border-slate-800/80">
                        <span className="text-slate-500 text-[10px] uppercase block">Score Départ</span>
                        <span className="text-slate-200 font-bold text-sm font-mono-numbers">
                          {formatScoreM(shift.initial_score)} pts
                        </span>
                      </div>
                      <div className="bg-[#0b1018] p-2.5 rounded-lg border border-slate-800/80">
                        <span className="text-slate-500 text-[10px] uppercase block">Score Final</span>
                        <span className="text-emerald-400 font-bold text-sm font-mono-numbers">
                          {formatScoreM(finalScore)} pts
                        </span>
                      </div>
                      <div className="bg-[#0b1018] p-2.5 rounded-lg border border-slate-800/80">
                        <span className="text-slate-500 text-[10px] uppercase block">Objectif</span>
                        <span className="text-cyan-300 font-bold text-sm font-mono-numbers">
                          {formatScoreM(Math.max(0, shift.target_score - shift.initial_score))}
                        </span>
                      </div>
                      <div className="bg-[#0b1018] p-2.5 rounded-lg border border-slate-800/80">
                        <span className="text-slate-500 text-[10px] uppercase block">
                          {isAdmin ? 'Progression / Paie' : 'Progression Score'}
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-amber-400 font-bold text-sm font-mono-numbers">
                            +{formatScoreM(scoreDiff)} pts
                          </span>
                          {isAdmin && shift.calculated_ar ? (
                            <span className="text-[11px] text-emerald-400 font-semibold bg-emerald-950/60 px-1 rounded">
                              +{shift.calculated_ar.toLocaleString()} Ar
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {/* Proof Photo Thumbnails with Click to Expand */}
                    <div className="pt-2">
                      <span className="text-xs uppercase font-mono font-semibold text-slate-400 block mb-2">
                        Preuves Captures d'écran (Cliquez pour agrandir en plein écran)
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Start Proof */}
                        <div
                          onClick={() =>
                            onOpenProofLightbox({
                              imageUrl: shift.start_proof_url,
                              gallery: proofsOf(shift),
                              title: `Preuve de Début - ${shift.client_name}`,
                              subtitle: `Booster: ${shift.employee_name} · Score initial: ${formatScoreM(shift.initial_score)} pts`,
                              score: shift.initial_score,
                              clientTag: shift.client_name,
                              operatorName: shift.employee_name,
                              timestamp: `${shift.date} ${shift.start_time}`,
                            })
                          }
                          className="group relative cursor-pointer bg-slate-900 border border-slate-700/80 rounded-lg overflow-hidden p-1.5 hover:border-emerald-500 transition-all hover:shadow-lg"
                        >
                          <div className="text-[10px] font-mono text-slate-400 mb-1 flex items-center justify-between px-1">
                            <span className="text-emerald-400 font-bold">1. CAPTURE DÉBUT</span>
                            <span className="text-slate-500">{shift.start_time}</span>
                          </div>
                          <div className="relative aspect-video rounded overflow-hidden bg-black/60">
                            <img
                              src={shift.start_proof_url}
                              alt="Capture Début"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-mono">
                              <Eye className="w-4 h-4 text-emerald-400" />
                              <span>Inspecter Plein Écran</span>
                            </div>
                          </div>
                        </div>

                        {/* End Proof */}
                        {shift.end_proof_url ? (
                          <div
                            onClick={() =>
                              onOpenProofLightbox({
                                imageUrl: shift.end_proof_url!,
                                title: `Preuve de Fin - ${shift.client_name}`,
                                subtitle: `Booster: ${shift.employee_name} · Score final: ${formatScoreM(finalScore)} pts`,
                                score: finalScore,
                                clientTag: shift.client_name,
                                operatorName: shift.employee_name,
                                timestamp: `${shift.date} ${shift.end_time || ''}`,
                              })
                            }
                            className="group relative cursor-pointer bg-slate-900 border border-slate-700/80 rounded-lg overflow-hidden p-1.5 hover:border-emerald-500 transition-all hover:shadow-lg"
                          >
                            <div className="text-[10px] font-mono text-slate-400 mb-1 flex items-center justify-between px-1">
                              <span className="text-cyan-400 font-bold">2. CAPTURE FIN</span>
                              <span className="text-slate-500">{shift.end_time || 'Terminé'}</span>
                            </div>
                            <div className="relative aspect-video rounded overflow-hidden bg-black/60">
                              <img
                                src={shift.end_proof_url}
                                alt="Capture Fin"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-mono">
                                <Eye className="w-4 h-4 text-cyan-400" />
                                <span>Inspecter Plein Écran</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-lg p-4 flex flex-col items-center justify-center text-center">
                            <span className="text-xs font-mono text-slate-500">
                              Capture de fin en attente de soumission
                            </span>
                            <span className="text-[10px] text-slate-600 mt-1">
                              Session en cours ou en attente d'achèvement
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Notes & Rejections if any */}
                    {shift.notes && (
                      <div className="text-xs text-slate-400 font-mono bg-slate-950/60 p-2.5 rounded border border-slate-800">
                        <span className="text-slate-500 uppercase">Notes de mission: </span>
                        {shift.notes}
                      </div>
                    )}
                    {shift.admin_notes && (
                      <div className="text-xs text-emerald-200 font-mono bg-emerald-950/40 p-2.5 rounded border border-emerald-800/60">
                        <strong className="uppercase">Note de l'admin: </strong>
                        {shift.admin_notes}
                      </div>
                    )}
                    {shift.rejection_reason && (
                      <div className="text-xs text-red-300 font-mono bg-red-950/40 p-2.5 rounded border border-red-800/60 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="uppercase">Motif du rejet: </strong>
                          {shift.rejection_reason}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-[#131d2b] px-6 py-3 border-t border-slate-700/80 flex items-center justify-between">
          <span className="text-xs text-slate-400 font-mono">
            Rapport certifié Delta Force Tactical Operations
          </span>
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-mono transition-colors flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Retour
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold transition-colors"
            >
              Fermer (ESC)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

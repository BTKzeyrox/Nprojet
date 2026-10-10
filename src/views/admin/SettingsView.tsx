import React, { useEffect, useState } from 'react';
import { Settings, Plus, X, Save } from 'lucide-react';
import { db } from '../../db/store';
import { AppSettings } from '../../types';
import { ScoreInput } from '../../components/ScoreInput';
import { RestoreSection } from '../../components/RestoreSection';
import { askConfirm } from '../../components/ConfirmModal';
import { useSoundPrefs, playBeep, unlockSound } from '../../utils/notifSound';

const inputCls = 'w-full bg-[#141e2a] border border-slate-600 p-2.5 text-white font-mono text-sm focus:border-emerald-500 focus:outline-none';
const labelCls = 'block text-slate-300 uppercase text-xs font-mono mb-1';

export const SettingsView: React.FC = () => {
  const [sound, setSound] = useSoundPrefs();
  const [soundMsg, setSoundMsg] = useState('');
  const [s, setS] = useState<AppSettings>(db.getSettings());
  const [newType, setNewType] = useState('');
  const [saved, setSaved] = useState(false);
  const [demoMsg, setDemoMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Si les réglages changent ailleurs (autre appareil), on les recharge tant qu'on n'a rien modifié
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    const unsub = db.subscribe(() => {
      if (!touched) setS(db.getSettings());
    });
    return unsub;
  }, [touched]);

  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => {
    setTouched(true);
    setSaved(false);
    setS(prev => ({ ...prev, [k]: v }));
  };

  const addType = () => {
    const t = newType.trim().toUpperCase();
    if (!t) return;
    if (s.post_types.some(x => x.toUpperCase() === t)) {
      setError('Ce type existe déjà.');
      return;
    }
    setError(null);
    set('post_types', [...s.post_types, t]);
    setNewType('');
  };

  const save = () => {
    setError(null);
    if (!s.price_per_million || s.price_per_million < 1) return setError('Le prix du 1M doit être supérieur à 0.');
    for (const k of ['auto_pen_late1_min', 'auto_pen_late2_min'] as const) if (s[k] !== undefined && !(Number(s[k]) >= 1)) return setError('Pénalités automatiques : les minutes de retard doivent être 1 ou plus.');
    for (const k of ['auto_pen_late1_m', 'auto_pen_late2_m', 'auto_pen_absent_m'] as const) if (s[k] !== undefined && !(Number(s[k]) >= 0)) return setError('Pénalités automatiques : le nombre de M de score ne peut pas être négatif.');
    if (s.retention_days < 1) return setError('Conservation des photos : 1 jour minimum.');
    if ((s.advance_cap_pct ?? 0) < 0 || (s.advance_cap_pct ?? 0) > 100) return setError('Plafond des avances : entre 0 et 100 %.');
    if ((s.advance_repay_pct ?? 100) < 0 || (s.advance_repay_pct ?? 100) > 100) return setError('Remboursement des avances : entre 0 et 100 %.');
    if (!(s.pay_methods || []).length) return setError('Ajoute au moins un mode de paiement.');
    if (s.late_tolerance_min < 0) return setError('La tolérance ne peut pas être négative.');
    if (s.access_before_min < 0 || s.access_after_min < 0) return setError("La tolérance d'accès ne peut pas être négative.");
    if (s.alert_idle_1_min < 1) return setError('La 1re alerte doit être de 1 minute ou plus.');
    if (s.alert_idle_2_min <= s.alert_idle_1_min) return setError('La 2e alerte doit être plus longue que la 1re.');
    if (s.err_max_per_session < 0 || s.err_max_per_session > 20) return setError('Rapports par session : entre 0 et 20.');
    if (s.retry_seconds < 5) return setError('Le délai entre deux tentatives doit être de 5 secondes ou plus.');
    db.updateSettings({
      ...s,
      price_per_million: Math.round(s.price_per_million),
      retention_days: Math.round(s.retention_days),
      late_tolerance_min: Math.round(s.late_tolerance_min),
      access_before_min: Math.round(s.access_before_min),
      access_after_min: Math.round(s.access_after_min),
      alert_idle_1_min: Math.round(s.alert_idle_1_min),
      alert_idle_2_min: Math.round(s.alert_idle_2_min),
      err_max_per_session: Math.round(s.err_max_per_session),
      retry_seconds: Math.round(s.retry_seconds),
      maintenance_message: (s.maintenance_message || '').trim().slice(0, 300),
    });
    setTouched(false);
    setSaved(true);
  };

  return (
    <div className="max-w-3xl mx-auto px-1.5 sm:px-3 py-3 space-y-4">
      <div className="flex items-center gap-2.5">
        <Settings className="w-6 h-6 text-emerald-500 shrink-0" />
        <div>
          <h2 className="font-tactical font-black text-lg text-white">Réglages</h2>
          <p className="text-xs font-mono text-slate-400">Valable pour toute l'équipe, dès l'enregistrement.</p>
        </div>
      </div>

      {error && <div className="p-3 bg-red-950 border border-red-500/60 text-red-200 text-sm font-semibold">{error}</div>}
      {saved && <div className="p-3 bg-emerald-950 border border-emerald-500/60 text-emerald-200 text-sm font-semibold">Réglages enregistrés.</div>}

      <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3">
        <h3 className="font-tactical font-bold text-white">Paie</h3>
        <div>
          <label className={labelCls}>Prix du 1M de score (en Ar)</label>
          <ScoreInput value={s.price_per_million} onChange={n => set('price_per_million', n)} className={inputCls} placeholder="ex: 800" />
          <p className="text-[11px] text-slate-500 mt-1">S'applique aux sessions validées à partir de maintenant. Les paies déjà calculées ne changent pas.</p>
        </div>
      </section>

      <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3">
        <h3 className="font-tactical font-bold text-white">Shifts</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Jour : début</label>
            <input type="time" value={s.day_shift_start} onChange={e => set('day_shift_start', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Jour : fin</label>
            <input type="time" value={s.day_shift_end} onChange={e => set('day_shift_end', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Nuit : début</label>
            <input type="time" value={s.night_shift_start} onChange={e => set('night_shift_start', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Nuit : fin</label>
            <input type="time" value={s.night_shift_end} onChange={e => set('night_shift_end', e.target.value)} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Tolérance de retard (minutes)</label>
          <input type="number" min={0} value={s.late_tolerance_min} onChange={e => set('late_tolerance_min', Number(e.target.value))} className={inputCls} />
        </div>
      </section>

      <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3">
        <h3 className="font-tactical font-bold text-white">Accès et suivi des boosters</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Connexion permise avant le shift (min)</label>
            <input type="number" min={0} value={s.access_before_min} onChange={e => set('access_before_min', Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Connexion permise après le shift (min)</label>
            <input type="number" min={0} value={s.access_after_min} onChange={e => set('access_after_min', Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>1re alerte « sans poste » (min)</label>
            <input type="number" min={1} value={s.alert_idle_1_min} onChange={e => set('alert_idle_1_min', Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>2e alerte « sans poste » (min)</label>
            <input type="number" min={2} value={s.alert_idle_2_min} onChange={e => set('alert_idle_2_min', Number(e.target.value))} className={inputCls} />
          </div>
        </div>
        <p className="text-[11px] text-slate-500">Un booster hors de son shift est refusé à la connexion et déconnecté, sauf s'il a une session en cours. Chaque booster peut aussi avoir « toute heure » ou « bloqué » sur la page Employés. Ces durées sont appliquées par le serveur en environ 1 minute.</p>

        <div className="pt-1 space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
            <input type="checkbox" checked={s.show_activity_column} onChange={e => set('show_activity_column', e.target.checked)} className="w-4 h-4 accent-emerald-500" />
            Afficher la colonne « Activité » sur la page Employés
          </label>
          <div className="pl-6 space-y-2">
            <div className="text-xs font-mono text-slate-400 uppercase">Pastilles « à valider » à afficher</div>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['badge_start', 'Début de session'],
                ['badge_end', 'Fin de session'],
                ['badge_advance', 'Avance'],
                ['badge_profile', 'Profil'],
              ] as const).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
                  <input type="checkbox" checked={s[k]} onChange={e => set(k, e.target.checked)} className="w-4 h-4 accent-emerald-500" />
                  {label}
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
              <input type="checkbox" checked={s.badges_clickable} onChange={e => set('badges_clickable', e.target.checked)} className="w-4 h-4 accent-emerald-500" />
              Pastilles cliquables (ouvre la page Validations)
            </label>
          </div>
        </div>
      </section>

      <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3">
        <h3 className="font-tactical font-bold text-white">Secours et maintenance</h3>
        <label className={`flex items-center gap-2 text-sm cursor-pointer ${s.maintenance_on ? 'text-amber-300 font-bold' : 'text-slate-200'}`}>
          <input type="checkbox" checked={s.maintenance_on} onChange={e => set('maintenance_on', e.target.checked)} className="w-4 h-4 accent-amber-500" />
          Site en maintenance (les boosters sont déconnectés et refusés, toi tu entres toujours)
        </label>
        <div>
          <label className={labelCls}>Message affiché aux boosters</label>
          <textarea rows={2} maxLength={300} value={s.maintenance_message} onChange={e => set('maintenance_message', e.target.value)} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Rapports d'erreur par session (0 à 20)</label>
            <input type="number" min={0} max={20} value={s.err_max_per_session} onChange={e => set('err_max_per_session', Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Nouvelle tentative si connexion perdue (s)</label>
            <input type="number" min={5} value={s.retry_seconds} onChange={e => set('retry_seconds', Number(e.target.value))} className={inputCls} />
          </div>
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
            <input type="checkbox" checked={s.err_report_enabled} onChange={e => set('err_report_enabled', e.target.checked)} className="w-4 h-4 accent-emerald-500" />
            Envoyer automatiquement les erreurs au Journal des erreurs
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
            <input type="checkbox" checked={s.err_hide_details} onChange={e => set('err_hide_details', e.target.checked)} className="w-4 h-4 accent-emerald-500" />
            Cacher le détail technique aux boosters (ils ne voient que le numéro d'incident)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
            <input type="checkbox" checked={s.err_report_button} onChange={e => set('err_report_button', e.target.checked)} className="w-4 h-4 accent-emerald-500" />
            Afficher le bouton « Signaler un problème »
          </label>
        </div>
        <p className="text-[11px] text-slate-500">Chaque rapport est un appel au serveur gratuit : garde une limite basse. La maintenance s'applique en environ 1 minute.</p>
      </section>

      <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3">
        <h3 className="font-tactical font-bold text-white">Types de poste</h3>
        <div className="flex flex-wrap gap-2">
          {s.post_types.map(t => (
            <span key={t} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-900 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold">
              {t}
              <button type="button" onClick={() => set('post_types', s.post_types.filter(x => x !== t))} className="text-slate-400 hover:text-red-400 cursor-pointer" title="Retirer">
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
          {s.post_types.length === 0 && <span className="text-xs text-slate-500">Aucun type.</span>}
        </div>
        <div className="flex gap-2">
          <input
            type="text" value={newType} onChange={e => setNewType(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addType(); } }}
            placeholder="Nouveau type, ex: NO READ" className={inputCls}
          />
          <button type="button" onClick={addType} className="px-3 bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shrink-0" title="Ajouter">
            <Plus className="w-5 h-5" />
          </button>
        </div>
        <p className="text-[11px] text-slate-500">Retirer un type de la liste ne change pas les postes qui l'utilisent déjà.</p>
      </section>

      <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3">
        <h3 className="font-tactical font-bold text-white">Paie et avances</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Période de paie</label>
            <select value={s.pay_period || 'month'} onChange={e => set('pay_period', e.target.value === 'half' ? 'half' : 'month')} className={inputCls}>
              <option value="month">Mensuelle</option>
              <option value="half">Par quinzaine (1-15 et 16-fin)</option>
            </select>
            <p className="text-[11px] text-slate-500 mt-1">Les périodes déjà clôturées gardent leur format.</p>
          </div>
          <div>
            <label className={labelCls}>Plafond des avances (%)</label>
            <input type="number" min={0} max={100} value={s.advance_cap_pct ?? 0} onChange={e => set('advance_cap_pct', Number(e.target.value))} className={inputCls} />
            <p className="text-[11px] text-slate-500 mt-1">% de ce que le booster a gagné dans la période. 0 = pas de plafond.</p>
          </div>
          <div>
            <label className={labelCls}>Remboursement des avances (%)</label>
            <input type="number" min={0} max={100} value={s.advance_repay_pct ?? 100} onChange={e => set('advance_repay_pct', Number(e.target.value))} className={inputCls} />
            <p className="text-[11px] text-slate-500 mt-1">Part maximale de la paie retenue à la clôture. Le net n'est jamais négatif, le reste est reporté.</p>
          </div>
          <div>
            <label className={labelCls}>Modes de paiement (séparés par une virgule)</label>
            <input type="text" value={(s.pay_methods || []).join(', ')} onChange={e => set('pay_methods', e.target.value.split(',').map(x => x.trim()).filter(Boolean))} className={inputCls} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
          <input type="checkbox" checked={s.penalties_enabled === true} onChange={e => set('penalties_enabled', e.target.checked)} className="w-4 h-4 accent-emerald-500" />
          Activer les retenues / pénalités (désactivé par défaut)
        </label>
        <p className="text-[11px] text-amber-300">Les règles de Madagascar sur les retenues de salaire n'ont pas été vérifiées. Demande à un comptable ou à l'Inspection du travail avant de les activer. Chaque retenue est saisie à la main avec un motif.</p>
        <div className="pt-3 mt-1 border-t border-slate-700 space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
            <input type="checkbox" checked={s.auto_pen_enabled !== false} onChange={e => set('auto_pen_enabled', e.target.checked)} className="w-4 h-4 accent-emerald-500" />
            Pénalités automatiques en score (retards et absences), calculées dans la paie de chaque employé
          </label>
          <p className="text-[11px] text-slate-400">Chaque 1M de score retiré = le prix du 1M réglé plus haut. Calculé à chaque fiche de paie, avec les mêmes règles que le calendrier (dimanche = repos). Un employé qui n'a rien gagné n'aura pas de net négatif.</p>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelCls}>Retard : à partir de (min)</label><input type="number" min={1} value={s.auto_pen_late1_min ?? 15} onChange={e => set('auto_pen_late1_min', Number(e.target.value))} className={inputCls} /></div>
            <div><label className={labelCls}>Retard : pénalité (M de score)</label><input type="number" min={0} step="0.5" value={s.auto_pen_late1_m ?? 1} onChange={e => set('auto_pen_late1_m', Number(e.target.value))} className={inputCls} /></div>
            <div><label className={labelCls}>Gros retard : à partir de (min)</label><input type="number" min={1} value={s.auto_pen_late2_min ?? 30} onChange={e => set('auto_pen_late2_min', Number(e.target.value))} className={inputCls} /></div>
            <div><label className={labelCls}>Gros retard : pénalité (M de score)</label><input type="number" min={0} step="0.5" value={s.auto_pen_late2_m ?? 2} onChange={e => set('auto_pen_late2_m', Number(e.target.value))} className={inputCls} /></div>
            <div className="col-span-2"><label className={labelCls}>Absence non annoncée : pénalité (M de score)</label><input type="number" min={0} step="0.5" value={s.auto_pen_absent_m ?? 5} onChange={e => set('auto_pen_absent_m', Number(e.target.value))} className={inputCls} /></div>
          </div>
        </div>
      </section>

      <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3">
        <h3 className="font-tactical font-bold text-white">Règles et options</h3>
        <div>
          <label className={labelCls}>Règles pour les boosters (affichées sur leur grille)</label>
          <textarea value={s.rules} onChange={e => set('rules', e.target.value)} rows={5} className={inputCls + ' font-sans'} placeholder="ex: pas de lecture de messages, photo de début obligatoire..." />
        </div>
        <div>
          <label className={labelCls}>Conserver les photos de preuve (jours)</label>
          <input type="number" min={1} value={s.retention_days} onChange={e => set('retention_days', Number(e.target.value))} className={inputCls} />
          <p className="text-[11px] text-slate-500 mt-1">Après ce délai, les photos des sessions terminées sont supprimées automatiquement.</p>
        </div>
        <div>
          <label className={labelCls}>Grille des postes : nombre de colonnes</label>
          <select value={s.grid_columns || 2} onChange={e => set('grid_columns', Number(e.target.value))} className={inputCls}>
            {[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
              <option key={n} value={n}>{n} colonnes (grille {n}x)</option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500 mt-1">Plus il y a de colonnes, plus les cartes sont petites. Sur téléphone, 2 ou 3 reste le plus lisible.</p>
        </div>
      </section>

      <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3">
        <h3 className="font-tactical font-bold text-white">Son des notifications</h3>
        <p className="text-[11px] text-slate-400">Un bip court à chaque nouvelle notification. Réglé sur cet appareil, enregistré tout de suite.</p>
        <label className="flex items-center gap-2.5 text-sm text-slate-200 cursor-pointer">
          <input type="checkbox" checked={sound.on} onChange={e => setSound({ ...sound, on: e.target.checked })} className="w-4 h-4 accent-emerald-500" />
          Son activé
        </label>
        <div className={sound.on ? '' : 'opacity-40 pointer-events-none'}>
          <label className={labelCls}>Volume</label>
          <input type="range" min={1} max={10} step={1} value={Math.round(sound.volume * 10)} onChange={e => setSound({ ...sound, volume: Number(e.target.value) / 10 })} className="w-full accent-emerald-500" />
        </div>
        <button
          type="button"
          onClick={() => {
            unlockSound();
            setTimeout(() => setSoundMsg(playBeep(sound.volume) ? '' : "Le navigateur bloque le son : touche l'écran puis réessaie."), 60);
          }}
          className="px-3 py-2 border border-slate-600 text-slate-200 text-xs font-mono hover:border-emerald-500 cursor-pointer"
        >
          Tester le son
        </button>
        {soundMsg && <p className="text-[11px] text-amber-300">{soundMsg}</p>}
      </section>

      <section className="bg-[#0f1722] border border-red-900/60 p-4 space-y-3">
        <h3 className="font-tactical font-bold text-white">Données de démonstration</h3>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Les sessions et les demandes d'avance de démonstration comptent dans la paie et les totaux. Les comptes des boosters ne sont pas supprimés.
        </p>
        <button
          type="button"
          onClick={() =>
            askConfirm({
              title: 'Supprimer les données de démonstration ?',
              message: 'Toutes les sessions et avances de démonstration seront supprimées. Cette action ne peut pas être annulée.',
              confirmLabel: 'Supprimer',
              danger: true,
              onConfirm: () => {
                const n = db.removeDemoData();
                setDemoMsg(n > 0 ? `${n} éléments de démonstration supprimés.` : 'Aucune donnée de démonstration à supprimer.');
              },
            })
          }
          className="w-full px-4 py-2.5 bg-red-950/60 hover:bg-red-900 border border-red-800 text-red-200 font-semibold text-sm"
        >
          Supprimer les données de démonstration
        </button>
        {demoMsg && <div className="text-sm text-emerald-300">{demoMsg}</div>}
      </section>

      <RestoreSection />

      <button type="button" onClick={save} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm cursor-pointer">
        <Save className="w-4 h-4" /> Enregistrer
      </button>
    </div>
  );
};

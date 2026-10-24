import React, { useEffect, useState } from 'react';
import { Settings, Plus, X, Save } from 'lucide-react';
import { db } from '../../db/store';
import { AppSettings } from '../../types';
import { ScoreInput } from '../../components/ScoreInput';
import { RestoreSection } from '../../components/RestoreSection';
import { BackupsSection } from '../../components/BackupsSection';
import { AuditSection } from '../../components/AuditSection';
import { askConfirm } from '../../components/ConfirmModal';
import { useApp } from '../../context/AppContext';
import { FontSizePicker } from '../../components/FontSizePicker';
import { TwoStepDialog } from '../../components/TwoStepDialog';
import { setModeSwitchHidden, useModeSwitchHidden } from '../../utils/modeSwitch';
import { useSoundPrefs, playBeep, unlockSound } from '../../utils/notifSound';
import { CompanyConditions, CompanyForEmployee } from '../../components/CompanyConditions';
import { PerformanceSettings } from '../../components/PerformanceSettings';
import { MissionTemplatesSection } from '../../components/MissionTemplatesSection';
import { NotificationsCard } from '../../components/NotificationsCard';
import { AiSettingsSection } from '../../components/AiSettingsSection';
import { WatchSettingsSection } from '../../components/WatchSettingsSection';

const inputCls = 'w-full bg-[#141e2a] border border-slate-600 p-2.5 text-white font-mono text-sm focus:border-emerald-500 focus:outline-none';
const labelCls = 'block text-slate-300 uppercase text-xs font-mono mb-1';

// Bouton « Vue opérateur » du menu : l'afficher ou le masquer demande une procédure en 2 étapes
const ModeSwitchSection: React.FC = () => {
  const L = useApp().theme === 'light';
  const hidden = useModeSwitchHidden();
  const [open, setOpen] = useState(false);
  return (
    <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3 rounded-2xl">
      <h3 className="font-tactical font-bold text-white">Mode responsable / opérateur</h3>
      <p className="text-sm text-slate-300">Le bouton « Vue opérateur » du menu de gauche est actuellement <b className={hidden ? 'text-amber-500' : 'text-emerald-500'}>{hidden ? 'masqué' : 'visible'}</b>.</p>
      <p className="text-[11px] text-slate-400">Il permet au responsable de voir le site comme un opérateur. Réglé sur cet appareil. Pour {hidden ? 'l\'afficher' : 'le masquer'}, il faut une procédure en 2 étapes.</p>
      <button type="button" onClick={() => setOpen(true)} className={`w-full min-h-[46px] rounded-full text-sm font-bold cursor-pointer border ${hidden ? 'bg-blue-600 hover:bg-blue-500 text-white border-blue-600' : L ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100' : 'bg-amber-500/10 text-amber-300 border-amber-500/40 hover:bg-amber-500/20'}`}>
        {hidden ? 'Afficher le bouton…' : 'Masquer le bouton…'}
      </button>
      {open && (hidden ? (
        <TwoStepDialog
          title="Afficher le bouton « Vue opérateur »"
          intro={['Le bouton « Vue opérateur » reviendra en bas du menu de gauche.', 'Il permet de voir le site comme un opérateur, puis de revenir en mode responsable.']}
          word="AFFICHER"
          confirmLabel="Afficher le bouton"
          onConfirm={() => setModeSwitchHidden(false)}
          onClose={() => setOpen(false)}
        />
      ) : (
        <TwoStepDialog
          title="Masquer le bouton « Vue opérateur »"
          intro={['Le bouton « Vue opérateur » disparaîtra du menu de gauche, sur cet appareil.', 'Si vous êtes en vue opérateur, vous revenez automatiquement en mode responsable.', 'Pour le faire revenir : Réglages, Général, « Afficher le bouton… », puis la même procédure en 2 étapes.']}
          word="MASQUER"
          confirmLabel="Masquer le bouton"
          onConfirm={() => setModeSwitchHidden(true)}
          onClose={() => setOpen(false)}
        />
      ))}
    </section>
  );
};

export const SettingsView: React.FC<{ personalOnly?: boolean }> = ({ personalOnly = false }) => {
  const { theme, toggleTheme, lang, setLang } = useApp();
  const [sound, setSound] = useSoundPrefs();
  const [soundMsg, setSoundMsg] = useState('');
  const [s, setS] = useState<AppSettings>(db.getSettings());
  const [newType, setNewType] = useState('');
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<'general' | 'team' | 'missions' | 'company' | 'performance' | 'data'>('general');
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
    if (!(s.price_per_mission >= 0)) return setError('Le tarif par mission ne peut pas être négatif.');
    if (!((s.client_price_default_ar ?? 0) >= 0)) return setError('Le prix client par défaut ne peut pas être négatif.');
    for (const v of Object.values(s.client_prices_by_type || {})) if (!(Number(v) >= 0)) return setError('Un prix client par type ne peut pas être négatif.');
    for (const k of ['goal_missions', 'goal_profit_ar', 'goal_max_expenses_ar', 'alert_low_cash_ar'] as const) if (s[k] !== undefined && !(Number(s[k]) >= 0)) return setError('Objectifs et alertes : un montant ne peut pas être négatif.');
    if (s.alert_unpaid_days !== undefined && !(Number(s.alert_unpaid_days) >= 1)) return setError('Alerte « client qui n\'a pas payé » : 1 jour ou plus.');
    if (!s.price_per_million || s.price_per_million < 1) return setError('Le prix du 1M doit être supérieur à 0.');
    for (const k of ['auto_pen_late1_min', 'auto_pen_late2_min'] as const) if (s[k] !== undefined && !(Number(s[k]) >= 1)) return setError('Pénalités automatiques : les minutes de retard doivent être 1 ou plus.');
    for (const k of ['auto_pen_late1_m', 'auto_pen_late2_m', 'auto_pen_absent_m'] as const) if (s[k] !== undefined && !(Number(s[k]) >= 0)) return setError('Pénalités automatiques : le nombre de M de volume ne peut pas être négatif.');
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
    const { company: _keepCompany, company_log: _keepLog, ...general } = s; // les Conditions ont leur propre bouton : jamais de vieille copie renvoyée ici
    delete (general as { mission_templates?: unknown }).mission_templates; // les modèles de mission s'enregistrent tout de suite (jamais écrasés par une vieille copie)
    db.updateSettings({
      ...general,
      price_per_million: Math.round(s.price_per_million),
      price_per_mission: Math.round(s.price_per_mission),
      client_price_default_ar: Math.round(s.client_price_default_ar ?? 0),
      goal_missions: Math.round(Number(s.goal_missions) || 0),
      goal_profit_ar: Math.round(Number(s.goal_profit_ar) || 0),
      goal_max_expenses_ar: Math.round(Number(s.goal_max_expenses_ar) || 0),
      alert_unpaid_days: Math.round(Number(s.alert_unpaid_days) || 30),
      alert_low_cash_ar: Math.round(Number(s.alert_low_cash_ar) || 0),
      client_prices_by_type: Object.fromEntries(Object.entries(s.client_prices_by_type || {}).filter(([, v]) => isFinite(Number(v))).map(([k, v]) => [k, Math.round(Number(v))])),
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

  if (personalOnly) {
    return (
      <div className="max-w-3xl mx-auto px-1.5 sm:px-3 py-3 space-y-4">
        <div className="flex items-center gap-2.5">
          <Settings className="w-6 h-6 text-emerald-500 shrink-0" />
          <h2 className="font-tactical font-black text-lg text-white">Réglages</h2>
        </div>
      <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3 rounded-2xl">
        <h3 className="font-tactical font-bold text-white">Apparence et langue</h3>
        <p className="text-[11px] text-slate-400">Réglé sur cet appareil, enregistré tout de suite.</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => theme !== 'light' && toggleTheme()} className={`px-3 py-2.5 rounded-full border text-sm font-semibold cursor-pointer ${theme === 'light' ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-600 text-slate-300'}`}>Thème clair</button>
          <button type="button" onClick={() => theme !== 'dark' && toggleTheme()} className={`px-3 py-2.5 rounded-full border text-sm font-semibold cursor-pointer ${theme === 'dark' ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-600 text-slate-300'}`}>Thème sombre</button>
          <button type="button" onClick={() => setLang('fr')} className={`px-3 py-2.5 rounded-full border text-sm font-semibold cursor-pointer ${lang === 'fr' ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-600 text-slate-300'}`}>Français</button>
          <button type="button" onClick={() => setLang('en')} className={`px-3 py-2.5 rounded-full border text-sm font-semibold cursor-pointer ${lang === 'en' ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-600 text-slate-300'}`}>English</button>
        </div>
        <FontSizePicker />
      </section>

      {!db.isDemo() && <NotificationsCard />}

      <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3 rounded-2xl">
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
          className="px-4 py-2 rounded-full border border-slate-600 text-slate-200 text-xs font-mono hover:border-emerald-500 cursor-pointer"
        >
          Tester le son
        </button>
        {soundMsg && <p className="text-[11px] text-amber-300">{soundMsg}</p>}
      </section>
      <CompanyForEmployee lang={lang} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-1.5 sm:px-3 py-3 space-y-4">
      <div className="flex items-center gap-2.5">
        <Settings className="w-6 h-6 text-emerald-500 shrink-0" />
        <div>
          <h2 className="font-tactical font-black text-lg text-white">Réglages</h2>
          <p className="text-xs font-mono text-slate-400">Équipe, vacations, règles et apparence.</p>
        </div>
      </div>

      {error && <div className={`p-3 rounded-2xl border text-sm font-semibold ${theme === 'light' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-red-950 border-red-500/60 text-red-200'}`}>{error}</div>}
      {saved && <div className={`p-3 rounded-2xl border text-sm font-semibold ${theme === 'light' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-emerald-950 border-emerald-500/60 text-emerald-200'}`}>Réglages enregistrés.</div>}

      <div className="flex gap-1 overflow-x-auto border-b border-slate-700/60">
        {([['general', 'Général'], ['team', 'Équipe'], ['missions', 'Missions'], ['company', 'Conditions'], ['performance', 'Performance'], ['data', 'Données']] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px cursor-pointer whitespace-nowrap ${tab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>{label}</button>
        ))}
      </div>


      {tab === 'company' && <CompanyConditions lang={lang} />}
      {tab === 'performance' && <PerformanceSettings lang={lang} />}

      {tab === 'general' && (
      <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3 rounded-2xl">
        <h3 className="font-tactical font-bold text-white">Apparence et langue</h3>
        <p className="text-[11px] text-slate-400">Réglé sur cet appareil, enregistré tout de suite.</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => theme !== 'light' && toggleTheme()} className={`px-3 py-2.5 rounded-full border text-sm font-semibold cursor-pointer ${theme === 'light' ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-600 text-slate-300'}`}>Thème clair</button>
          <button type="button" onClick={() => theme !== 'dark' && toggleTheme()} className={`px-3 py-2.5 rounded-full border text-sm font-semibold cursor-pointer ${theme === 'dark' ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-600 text-slate-300'}`}>Thème sombre</button>
          <button type="button" onClick={() => setLang('fr')} className={`px-3 py-2.5 rounded-full border text-sm font-semibold cursor-pointer ${lang === 'fr' ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-600 text-slate-300'}`}>Français</button>
          <button type="button" onClick={() => setLang('en')} className={`px-3 py-2.5 rounded-full border text-sm font-semibold cursor-pointer ${lang === 'en' ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-600 text-slate-300'}`}>English</button>
        </div>
        <FontSizePicker />
      </section>
      )}

      {tab === 'general' && <ModeSwitchSection />}
      {tab === 'general' && !db.isDemo() && <NotificationsCard />}
      {tab === 'general' && <WatchSettingsSection />}
      {tab === 'general' && !db.isDemo() && <AiSettingsSection />}

      {tab === 'team' && (
      <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3 rounded-2xl">
        <h3 className="font-tactical font-bold text-white">Vacations</h3>
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
      )}

      {tab === 'team' && (
      <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3 rounded-2xl">
        <h3 className="font-tactical font-bold text-white">Accès et suivi des opérateurs</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Connexion permise avant la vacation (min)</label>
            <input type="number" min={0} value={s.access_before_min} onChange={e => set('access_before_min', Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Connexion permise après la vacation (min)</label>
            <input type="number" min={0} value={s.access_after_min} onChange={e => set('access_after_min', Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>1re alerte « sans mission » (min)</label>
            <input type="number" min={1} value={s.alert_idle_1_min} onChange={e => set('alert_idle_1_min', Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>2e alerte « sans mission » (min)</label>
            <input type="number" min={2} value={s.alert_idle_2_min} onChange={e => set('alert_idle_2_min', Number(e.target.value))} className={inputCls} />
          </div>
        </div>
        <p className="text-[11px] text-slate-500">Un opérateur hors de sa vacation est refusé à la connexion et déconnecté, sauf s'il a une session en cours. Chaque opérateur peut aussi avoir « toute heure » ou « bloqué » sur la page Employés. Ces durées sont appliquées par le serveur en environ 1 minute.</p>

        <div className="pt-1 space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
            <input type="checkbox" checked={s.show_activity_column} onChange={e => set('show_activity_column', e.target.checked)} className="w-4 h-4 accent-emerald-500" />
            Afficher la colonne « Activité » sur la page Équipe
          </label>
          <div className="pl-6 space-y-2">
            <div className="text-xs font-mono text-slate-400 uppercase">Pastilles « à valider » à afficher</div>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['badge_start', 'Début de mission'],
                ['badge_end', 'Fin de mission'],
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
      )}

      {tab === 'data' && (
      <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3 rounded-2xl">
        <h3 className="font-tactical font-bold text-white">Secours et maintenance</h3>
        <label className={`flex items-center gap-2 text-sm cursor-pointer ${s.maintenance_on ? 'text-amber-300 font-bold' : 'text-slate-200'}`}>
          <input type="checkbox" checked={s.maintenance_on} onChange={e => set('maintenance_on', e.target.checked)} className="w-4 h-4 accent-amber-500" />
          Site en maintenance (les opérateurs sont déconnectés et refusés, toi tu entres toujours)
        </label>
        <div>
          <label className={labelCls}>Message affiché aux opérateurs</label>
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
            Cacher le détail technique aux opérateurs (ils ne voient que le numéro d'incident)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
            <input type="checkbox" checked={s.err_report_button} onChange={e => set('err_report_button', e.target.checked)} className="w-4 h-4 accent-emerald-500" />
            Afficher le bouton « Signaler un problème »
          </label>
        </div>
        <p className="text-[11px] text-slate-500">Chaque rapport est un appel au serveur gratuit : garde une limite basse. La maintenance s'applique en environ 1 minute.</p>
      </section>
      )}

      {tab === 'missions' && (
      <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3 rounded-2xl">
        <h3 className="font-tactical font-bold text-white">Paie</h3>
        <div>
          <label className={labelCls}>Tarif par mission (Ar)</label>
          <input type="number" min={0} step={100} value={s.price_per_mission} onChange={e => set('price_per_mission', Number(e.target.value))} className={inputCls} />
          <p className="text-[11px] text-slate-400 mt-1">Montant versé pour chaque mission validée. Il est figé au moment de la validation : changer le tarif ne modifie pas les missions déjà validées.</p>
        </div>
      </section>
      )}

      {tab === 'missions' && (
      <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3 rounded-2xl">
        <h3 className="font-tactical font-bold text-white">Prix client</h3>
        <div>
          <label className={labelCls}>Prix par défaut d'une mission (Ar)</label>
          <input type="number" min={0} step={100} value={s.client_price_default_ar ?? 0} onChange={e => set('client_price_default_ar', Number(e.target.value))} className={inputCls} />
          <p className="text-[11px] text-slate-400 mt-1">Ce que le client paie pour une mission validée. 0 = pas encore réglé. Il est figé au moment de la validation : changer un prix ne modifie pas les missions déjà validées.</p>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-300">Exceptions par type de mission</p>
          {s.post_types.length === 0 && <p className="text-xs text-slate-500">Aucun type : ajoute-en un plus bas.</p>}
          {s.post_types.map(t => (
            <div key={t} className="flex items-center gap-2">
              <span className="flex-1 min-w-0 truncate text-xs font-mono font-bold text-emerald-300" title={t}>{t}</span>
              <input
                type="number" min={0} step={100}
                value={s.client_prices_by_type?.[t] ?? ''}
                placeholder={String(s.client_price_default_ar ?? 0)}
                onChange={e => {
                  const next = { ...(s.client_prices_by_type || {}) };
                  if (e.target.value === '') delete next[t]; else next[t] = Number(e.target.value);
                  set('client_prices_by_type', next);
                }}
                className={`${inputCls} !w-32 shrink-0`}
              />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">Laisse vide pour utiliser le prix par défaut. Tu peux aussi fixer un prix pour une seule mission, dans ses options avancées.</p>
      </section>
      )}

      {tab === 'missions' && (
      <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3 rounded-2xl">
        <h3 className="font-tactical font-bold text-white">Objectifs et alertes</h3>
        <p className="text-[11px] text-slate-400">Objectifs du mois : 0 ou vide = pas d'objectif. Les montants sont vus par le responsable seulement.</p>
        <div>
          <label className={labelCls}>Objectif de missions validées (par mois)</label>
          <input type="number" min={0} step={1} value={s.goal_missions ?? ''} onChange={e => set('goal_missions', e.target.value === '' ? 0 : Number(e.target.value))} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Objectif de bénéfice (Ar par mois)</label>
          <input type="number" min={0} step={1000} value={s.goal_profit_ar ?? ''} onChange={e => set('goal_profit_ar', e.target.value === '' ? 0 : Number(e.target.value))} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Dépenses maximum (Ar par mois)</label>
          <input type="number" min={0} step={1000} value={s.goal_max_expenses_ar ?? ''} onChange={e => set('goal_max_expenses_ar', e.target.value === '' ? 0 : Number(e.target.value))} className={inputCls} />
          <p className="text-[11px] text-slate-400 mt-1">Dépenses saisies + salaires. Une alerte apparaît à 90 % du plafond, puis au dépassement.</p>
        </div>
        <div>
          <label className={labelCls}>Alerte « client qui n'a pas payé » (jours)</label>
          <input type="number" min={1} step={1} value={s.alert_unpaid_days ?? 30} onChange={e => set('alert_unpaid_days', Number(e.target.value))} className={inputCls} />
          <p className="text-[11px] text-slate-400 mt-1">Alerte si un client n'a rien payé depuis ce nombre de jours et qu'il reste de l'argent à encaisser. 30 par défaut.</p>
        </div>
        <div>
          <label className={labelCls}>Alerte trésorerie basse (Ar)</label>
          <input type="number" min={0} step={1000} value={s.alert_low_cash_ar ?? 0} onChange={e => set('alert_low_cash_ar', Number(e.target.value))} className={inputCls} />
          <p className="text-[11px] text-slate-400 mt-1">0 = alerte seulement si la trésorerie est négative.</p>
        </div>
      </section>
      )}

      {tab === 'missions' && (
      <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3 rounded-2xl">
        <h3 className="font-tactical font-bold text-white">Types de mission</h3>
        <div className="flex flex-wrap gap-2">
          {s.post_types.map(t => (
            <span key={t} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold">
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
          <button type="button" onClick={addType} className="px-4 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shrink-0" title="Ajouter">
            <Plus className="w-5 h-5" />
          </button>
        </div>
        <p className="text-[11px] text-slate-500">Retirer un type de la liste ne change pas les missions qui l'utilisent déjà.</p>
      </section>
      )}

      {tab === 'missions' && <MissionTemplatesSection />}


      {tab === 'missions' && (
      <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3 rounded-2xl">
        <h3 className="font-tactical font-bold text-white">Règles et options</h3>
        <div>
          <label className={labelCls}>Règles pour les opérateurs (affichées sur leur grille)</label>
          <textarea value={s.rules} onChange={e => set('rules', e.target.value)} rows={5} className={inputCls + ' font-sans'} placeholder="ex: pas de lecture de messages, photo de début obligatoire..." />
        </div>
        <div>
          <label className={labelCls}>Conserver les photos de justificatif (jours)</label>
          <input type="number" min={1} value={s.retention_days} onChange={e => set('retention_days', Number(e.target.value))} className={inputCls} />
          <p className="text-[11px] text-slate-500 mt-1">Après ce délai, les photos des sessions terminées sont supprimées automatiquement.</p>
        </div>
      </section>
      )}

      {tab === 'general' && (
      <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3 rounded-2xl">
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
          className="px-4 py-2 rounded-full border border-slate-600 text-slate-200 text-xs font-mono hover:border-emerald-500 cursor-pointer"
        >
          Tester le son
        </button>
        {soundMsg && <p className="text-[11px] text-amber-300">{soundMsg}</p>}
      </section>
      )}

      {tab === 'data' && (
      <section className="bg-[#0f1722] border border-red-900/60 p-4 space-y-3 rounded-2xl">
        <h3 className="font-tactical font-bold text-white">Données de démonstration</h3>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Les sessions et les demandes d'avance de démonstration comptent dans la paie et les totaux. Les comptes des opérateurs ne sont pas supprimés.
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
          className="w-full px-4 py-2.5 rounded-full bg-red-950/60 hover:bg-red-900 border border-red-800 text-red-200 font-semibold text-sm"
        >
          Supprimer les données de démonstration
        </button>
        {demoMsg && <div className="text-sm text-emerald-300">{demoMsg}</div>}
      </section>
      )}

      {/* Démo : sauvegardes, restauration, remise à zéro et journal d'audit sont cachés (rien de réel à sauvegarder ni à effacer) */}
      {tab === 'data' && !db.isDemo() && <BackupsSection />}
      {tab === 'data' && !db.isDemo() && <AuditSection lang={lang} />}

      {!db.isDemo() && <RestoreSection />}

      <button type="button" onClick={save} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm cursor-pointer">
        <Save className="w-4 h-4" /> Enregistrer
      </button>
    </div>
  );
};

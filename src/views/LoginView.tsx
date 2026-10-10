import React, { useState } from 'react';
import {
  Shield,
  Lock,
  User as UserIcon,
  AlertOctagon,
  ArrowRight,
  Eye,
  EyeOff,
  Sun,
  Moon,
  Globe,
  Download
} from 'lucide-react';
import { db } from '../db/store';
import { User } from '../types';
import { formatPhone, phoneIsEmpty, phoneIsComplete } from '../utils/phoneUtils';
import { useApp } from '../context/AppContext';

interface LoginViewProps {
  onLoginSuccess: (user: User) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginSuccess,
}) => {
  const { theme, toggleTheme, lang, setLang, t } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(() => {
    // Message laissé par une déconnexion (shift terminé, accès bloqué)
    try {
      const n = sessionStorage.getItem('df_login_notice');
      if (n) sessionStorage.removeItem('df_login_notice');
      return n;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(false);

  // Mot de passe oublié
  const [forgotOpen, setForgotOpen] = useState(false);
  const [fgUser, setFgUser] = useState('');
  const [fgPass, setFgPass] = useState('');
  const [fgPass2, setFgPass2] = useState('');
  const [fgNote, setFgNote] = useState('');
  const [fgShow, setFgShow] = useState(false);
  const [fgBusy, setFgBusy] = useState(false);
  const [fgError, setFgError] = useState<string | null>(null);
  const [fgDone, setFgDone] = useState(false);

  const closeForgot = () => {
    setForgotOpen(false);
    setFgUser(''); setFgPass(''); setFgPass2('');
    setFgError(null); setFgDone(false); setFgShow(false);
  };

  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setFgError(null);
    if (!fgUser.trim()) return setFgError('Entre ton pseudo.');
    if (fgPass.length < 6) return setFgError('Mot de passe : 6 caractères minimum.');
    if (fgPass !== fgPass2) return setFgError('Les deux mots de passe ne sont pas identiques.');
    setFgBusy(true);
    const r = await db.requestPasswordReset(fgUser.trim(), fgPass, fgNote.trim());
    setFgBusy(false);
    if (!r.success) return setFgError(r.error || 'Envoi impossible. Réessaie.');
    setFgDone(true);
  };

  // Inscription (validée ensuite par l'admin)
  const [signupOpen, setSignupOpen] = useState(false);
  const [sgName, setSgName] = useState('');
  const [sgUser, setSgUser] = useState('');
  const [sgPhone, setSgPhone] = useState('261 ');
  const [sgShift, setSgShift] = useState<'day' | 'night'>('day');
  const [sgPass, setSgPass] = useState('');
  const [sgPass2, setSgPass2] = useState('');
  const [sgNote, setSgNote] = useState('');
  const [sgShow, setSgShow] = useState(false);
  const [sgBusy, setSgBusy] = useState(false);
  const [sgError, setSgError] = useState<string | null>(null);
  const [sgDone, setSgDone] = useState(false);

  const closeSignup = () => {
    setSignupOpen(false);
    setSgName(''); setSgUser(''); setSgPhone('261 '); setSgShift('day');
    setSgPass(''); setSgPass2(''); setSgError(null); setSgDone(false); setSgShow(false);
  };

  const submitSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSgError(null);
    if (sgName.trim().length < 2) return setSgError('Nom complet manquant.');
    if (!/^[a-z0-9_.-]{3,30}$/.test(sgUser.trim().toLowerCase())) return setSgError('Pseudo invalide (3 à 30 lettres ou chiffres, sans espace).');
    if (!phoneIsEmpty(sgPhone) && !phoneIsComplete(sgPhone)) return setSgError('Téléphone incomplet. Format : 261 34 12 345 67');
    if (sgPass.length < 6) return setSgError('Mot de passe : 6 caractères minimum.');
    if (sgPass !== sgPass2) return setSgError('Les deux mots de passe ne sont pas identiques.');
    setSgBusy(true);
    const r = await db.requestSignup({
      name: sgName.trim(),
      username: sgUser.trim().toLowerCase(),
      password: sgPass,
      phone: phoneIsEmpty(sgPhone) ? '' : sgPhone,
      shift: sgShift,
      note: sgNote.trim(),
    });
    setSgBusy(false);
    if (!r.success) return setSgError(r.error || 'Envoi impossible. Réessaie.');
    setSgDone(true);
  };

  const isLight = theme === 'light';

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);

    if (!username.trim() || !password) {
      setErrorMsg(lang === 'zh' ? '请输入账号和密码。' : 'Veuillez saisir votre pseudo et votre mot de passe.');
      return;
    }

    setIsLoading(true);
    const result = await db.login(username.trim(), password);
    setIsLoading(false);

    if (!result.success || !result.user) {
      setErrorMsg(result.error || (lang === 'zh' ? '身份验证失败' : "Erreur d'authentification"));
      return;
    }

    onLoginSuccess(result.user);
  };

  return (
    <div className={`min-h-screen flex flex-col justify-between py-6 px-4 sm:px-8 max-w-6xl mx-auto w-full relative transition-colors ${
      isLight ? 'text-slate-900' : 'text-slate-100'
    }`}>
      {/* Background Ambience */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header */}
      <header className={`flex flex-col sm:flex-row items-center justify-between gap-4 py-3 border-b relative z-10 ${
        isLight ? 'border-slate-200' : 'border-slate-800/80'
      }`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 p-0.5 shadow-lg flex items-center justify-center">
            <div className={`w-full h-full rounded-[10px] flex items-center justify-center ${
              isLight ? 'bg-white' : 'bg-[#080d14]'
            }`}>
              <Shield className="w-5 h-5 text-emerald-500" />
            </div>
          </div>
          <div>
            <h1 className="font-tactical font-black text-lg sm:text-xl tracking-wider flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">
              {t('brand_title')}
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                isLight
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-emerald-950 text-emerald-300 border-emerald-500/40'
              }`}>
                {t('brand_version')}
              </span>
            </h1>
            <p className="text-xs opacity-60 font-mono">
              {t('brand_sub')}
            </p>
          </div>
        </div>

        {/* Controls: Theme Toggle + Language Switcher */}
        <div className="flex items-center gap-2.5">
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-xl border transition-colors cursor-pointer ${
              isLight
                ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                : 'bg-[#0e1724] border-slate-700 text-slate-300 hover:bg-[#132032]'
            }`}
            title={isLight ? t('theme_switch_dark') : t('theme_switch_light')}
          >
            {isLight ? <Moon className="w-4 h-4 text-indigo-500" /> : <Sun className="w-4 h-4 text-amber-400" />}
          </button>

          {/* Language Toggle */}
          <button
            onClick={() => setLang(lang === 'fr' ? 'zh' : 'fr')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-mono font-semibold transition-colors cursor-pointer ${
              isLight
                ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                : 'bg-[#0e1724] border-slate-700 text-slate-300 hover:bg-[#132032]'
            }`}
            title="Changer de langue / 切换语言"
          >
            <Globe className="w-3.5 h-3.5 text-teal-400" />
            <span>{lang === 'fr' ? '🇨🇳 中文' : '🇫🇷 FR'}</span>
          </button>
        </div>
      </header>

      {/* Zone centrale : formulaire de connexion */}
      <div className="my-auto py-8 flex justify-center relative z-10">
        
        {/* Left Column: Modern Login Card */}
        <div className="w-full max-w-md space-y-6">
          <div className={`border rounded-2xl p-6 sm:p-8 shadow-2xl transition-all relative overflow-hidden ${
            isLight
              ? 'bg-white border-slate-200 text-slate-900 shadow-slate-200/50'
              : 'bg-[#0b131e]/90 backdrop-blur-xl border-slate-700/80 text-white shadow-emerald-950/20'
          }`}>
            {/* Top Tactical Light Line */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500" />

            <div className="mb-6">
              <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border font-bold ${
                isLight
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-emerald-950 text-emerald-400 border-emerald-500/30'
              }`}>
                {t('login_operator')}
              </span>
              <h2 className="text-2xl font-tactical font-black tracking-wide mt-2 bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">
                {t('login_title')}
              </h2>
            </div>

            {/* Error Message Alert */}
            {errorMsg && (
              <div className="mb-4 p-3 rounded-xl bg-red-950/80 border border-red-500/60 text-red-200 text-xs font-mono flex items-start gap-2.5 animate-in fade-in">
                <AlertOctagon className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1 font-semibold">{errorMsg}</div>
              </div>
            )}

            {/* Modern Form */}
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-mono opacity-80 font-semibold mb-1.5 uppercase">
                  {t('username_label')}
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    autoCapitalize="off" autoCorrect="off" spellCheck={false}
                    autoComplete="username"
                    placeholder={t('username_placeholder')}
                    className={`w-full border rounded-xl pl-10 pr-3.5 py-2.5 text-xs font-mono focus:outline-none focus:border-emerald-500 transition-all ${
                      isLight
                        ? 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                        : 'bg-[#070c13] border-slate-700 text-white placeholder-slate-500'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono opacity-80 font-semibold mb-1.5 uppercase">
                  {t('password_label')}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoCapitalize="off" autoCorrect="off" spellCheck={false}
                    autoComplete="current-password"
                    placeholder="••••••••••••"
                    className={`w-full border rounded-xl pl-10 pr-10 py-2.5 text-xs font-mono focus:outline-none focus:border-emerald-500 transition-all ${
                      isLight
                        ? 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                        : 'bg-[#070c13] border-slate-700 text-white placeholder-slate-500'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-emerald-500 transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:to-teal-500 text-white font-tactical font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                {isLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    <span>{t('auth_in_progress')}</span>
                  </span>
                ) : (
                  <>
                    <span>{t('btn_connect')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <button
              type="button"
              onClick={() => setForgotOpen(true)}
              className="w-full mt-3 text-center text-xs font-mono text-emerald-500 hover:text-emerald-400 underline underline-offset-2 cursor-pointer"
            >
              Mot de passe oublié ?
            </button>

            <div className="mt-4 pt-4 border-t border-slate-700/60 text-center text-xs font-mono">
              <span className="opacity-70">Pas encore de compte ?</span>{' '}
              <button
                type="button"
                onClick={() => setSignupOpen(true)}
                className="text-emerald-500 hover:text-emerald-400 font-bold underline underline-offset-2 cursor-pointer"
              >
                Créer un compte
              </button>
            </div>

          </div>
        </div>

      </div>

      {/* Bottom Footer */}
      <footer className={`py-3 border-t flex items-center justify-center text-xs font-mono opacity-60 relative z-10 ${
        isLight ? 'border-slate-200' : 'border-slate-800/80'
      }`}>
        <div className="text-center">Delta Force : Hawk Ops · 2026</div>
      </footer>

      {forgotOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 bg-black/80" onClick={closeForgot} role="dialog" aria-modal="true">
          <div className="w-full max-w-sm bg-[#0d1624] border border-slate-600 p-5 space-y-4 text-slate-100" onClick={e => e.stopPropagation()}>
            <h3 className="font-tactical font-bold text-base">Mot de passe oublié</h3>
            {fgDone ? (
              <>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Demande envoyée. Si ce pseudo existe, l'administrateur va la voir. Après sa validation, connecte-toi avec ton nouveau mot de passe.
                </p>
                <button type="button" onClick={closeForgot} className="w-full px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-sm font-bold text-white cursor-pointer">
                  Fermer
                </button>
              </>
            ) : (
              <form onSubmit={submitForgot} className="space-y-3 text-xs font-mono">
                <p className="text-sm text-slate-300 leading-relaxed font-sans">
                  Entre ton pseudo et le nouveau mot de passe que tu veux. Il sera actif quand l'administrateur aura validé.
                </p>
                {fgError && <div className="p-2.5 bg-red-950 border border-red-500/60 text-red-200 font-semibold">{fgError}</div>}
                <div>
                  <label className="block text-slate-300 uppercase mb-1">Pseudo</label>
                  <input
                    type="text" value={fgUser} onChange={e => setFgUser(e.target.value)}
                    autoCapitalize="off" autoCorrect="off" spellCheck={false}
                    className="w-full bg-[#141e2a] border border-slate-600 p-2.5 text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 uppercase mb-1">Nouveau mot de passe</label>
                  <div className="relative">
                    <input
                      type={fgShow ? 'text' : 'password'} value={fgPass} onChange={e => setFgPass(e.target.value)}
                      autoComplete="new-password"
                      className="w-full bg-[#141e2a] border border-slate-600 p-2.5 pr-10 text-white focus:border-emerald-500 focus:outline-none"
                    />
                    <button type="button" onClick={() => setFgShow(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer">
                      {fgShow ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-slate-300 uppercase mb-1">Répète le mot de passe</label>
                  <input
                    type={fgShow ? 'text' : 'password'} value={fgPass2} onChange={e => setFgPass2(e.target.value)}
                    autoComplete="new-password"
                    className="w-full bg-[#141e2a] border border-slate-600 p-2.5 text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 uppercase mb-1">Description (facultatif)</label>
                  <textarea
                    rows={2}
                    maxLength={300}
                    value={fgNote}
                    onChange={e => setFgNote(e.target.value)}
                    placeholder="Un mot pour l'admin (facultatif)"
                    className="w-full bg-[#141e2a] border border-slate-600 p-2.5 text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button type="button" onClick={closeForgot} className="px-3 py-2.5 bg-[#141e2a] hover:bg-[#1b2f44] border border-slate-600 text-sm font-semibold cursor-pointer">
                    Annuler
                  </button>
                  <button type="submit" disabled={fgBusy} className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-sm font-bold text-white cursor-pointer disabled:opacity-60">
                    {fgBusy ? 'Envoi…' : 'Envoyer'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {signupOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm overflow-y-auto" onClick={closeSignup}>
          <div className="w-full max-w-sm my-auto bg-[#0d1624] border border-slate-700 p-5 space-y-4 text-slate-100 text-xs font-mono" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-tactical font-bold text-base text-white">Créer un compte booster</h3>
              <button type="button" onClick={closeSignup} className="p-1 text-slate-400 hover:text-white" aria-label="Fermer">✕</button>
            </div>
            {sgDone ? (
              <div className="space-y-4">
                <div className="p-3 border border-emerald-600/60 bg-emerald-950/40 text-emerald-200 text-sm leading-relaxed">
                  Demande envoyée. L'administrateur doit la valider avant que vous puissiez vous connecter.
                </div>
                <button type="button" onClick={closeSignup} className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm">
                  Fermer
                </button>
              </div>
            ) : (
              <form onSubmit={submitSignup} className="space-y-3">
                {sgError && <div className="p-2.5 border border-red-500/60 bg-red-950/60 text-red-200 text-xs font-semibold">{sgError}</div>}
                <div>
                  <label className="block text-slate-300 uppercase mb-1">Nom complet</label>
                  <input type="text" value={sgName} onChange={e => setSgName(e.target.value)} autoComplete="name"
                    className="w-full bg-[#141e2a] border border-slate-600 p-2.5 text-white focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-slate-300 uppercase mb-1">Pseudo</label>
                  <input type="text" value={sgUser} onChange={e => setSgUser(e.target.value)}
                    autoCapitalize="off" autoCorrect="off" spellCheck={false} autoComplete="username"
                    className="w-full bg-[#141e2a] border border-slate-600 p-2.5 text-white focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-slate-300 uppercase mb-1">Téléphone</label>
                  <input type="tel" inputMode="numeric" maxLength={16} placeholder="261 34 12 345 67"
                    value={sgPhone} onChange={e => setSgPhone(formatPhone(e.target.value))}
                    className="w-full bg-[#141e2a] border border-slate-600 p-2.5 text-white focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-slate-300 uppercase mb-1">Shift souhaité</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setSgShift('day')}
                      className={`flex items-center justify-center gap-1.5 py-2.5 border font-bold ${sgShift === 'day' ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-[#141e2a] border-slate-600 text-slate-300'}`}>
                      <Sun className="w-4 h-4" /> Jour
                    </button>
                    <button type="button" onClick={() => setSgShift('night')}
                      className={`flex items-center justify-center gap-1.5 py-2.5 border font-bold ${sgShift === 'night' ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-[#141e2a] border-slate-600 text-slate-300'}`}>
                      <Moon className="w-4 h-4" /> Nuit
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-slate-300 uppercase mb-1">Mot de passe (6 caractères min.)</label>
                  <div className="relative">
                    <input type={sgShow ? 'text' : 'password'} value={sgPass} onChange={e => setSgPass(e.target.value)}
                      autoCapitalize="off" autoCorrect="off" spellCheck={false} autoComplete="new-password"
                      className="w-full bg-[#141e2a] border border-slate-600 p-2.5 pr-10 text-white focus:border-emerald-500" />
                    <button type="button" onClick={() => setSgShow(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-emerald-500" aria-label="Afficher le mot de passe">
                      {sgShow ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-slate-300 uppercase mb-1">Répète le mot de passe</label>
                  <input type={sgShow ? 'text' : 'password'} value={sgPass2} onChange={e => setSgPass2(e.target.value)}
                    autoCapitalize="off" autoCorrect="off" spellCheck={false} autoComplete="new-password"
                    className="w-full bg-[#141e2a] border border-slate-600 p-2.5 text-white focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-slate-300 uppercase mb-1">Description (facultatif)</label>
                  <textarea
                    rows={2}
                    maxLength={300}
                    value={sgNote}
                    onChange={e => setSgNote(e.target.value)}
                    placeholder="Un mot pour l'admin (facultatif)"
                    className="w-full bg-[#141e2a] border border-slate-600 p-2.5 text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button type="button" onClick={closeSignup} className="px-3 py-2.5 bg-[#141e2a] hover:bg-[#1b2f44] border border-slate-600 font-semibold text-sm">
                    Annuler
                  </button>
                  <button type="submit" disabled={sgBusy} className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm disabled:opacity-60">
                    {sgBusy ? 'Envoi…' : 'Envoyer la demande'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

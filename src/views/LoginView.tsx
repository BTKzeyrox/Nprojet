import React, { useEffect, useState } from 'react';
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
  Phone,
  ArrowLeft,
  CheckCircle2,
  FlaskConical,
} from 'lucide-react';
import { isKeyboardOpen } from '../utils/keyboard';
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

  // Clavier ouvert : on ajoute de l'espace sous le formulaire pour pouvoir le faire défiler au-dessus du clavier
  const [kb, setKb] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    const on = () => setKb(isKeyboardOpen(vv));
    const onFocus = () => { on(); setTimeout(on, 150); setTimeout(on, 450); };
    on();
    vv?.addEventListener('resize', on);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onFocus);
    return () => {
      vv?.removeEventListener('resize', on);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', onFocus);
    };
  }, []);

  // Démo sans compte : données inventées, tout se passe dans le navigateur
  const [demoChoice, setDemoChoice] = useState(false);
  const startDemo = (role: 'admin' | 'employee') => onLoginSuccess(db.enterDemo(role));
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('demo');
    if (q === 'admin' || q === 'employee') startDemo(q);
    else if (q) setDemoChoice(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);

    if (!username.trim() || !password) {
      setErrorMsg(lang === 'en' ? 'Please enter your username and password.' : 'Veuillez saisir votre pseudo et votre mot de passe.');
      return;
    }

    setIsLoading(true);
    const result = await db.login(username.trim(), password);
    setIsLoading(false);

    if (!result.success || !result.user) {
      setErrorMsg(result.error || (lang === 'en' ? 'Authentication failed' : "Erreur d'authentification"));
      return;
    }

    onLoginSuccess(result.user);
  };

  // ---------- Aspect : carte flottante sur fond bleu ----------
  // Couleurs en « style » direct : elles ne dépendent pas des règles de thème du site
  const C = isLight
    ? { card: '#ffffff', text: '#0f172a', sub: '#64748b', field: '#f1f5f9', line: '#cbd5e1', ico: '#94a3b8', errBg: '#fef2f2', errLine: '#fecaca', errText: '#b91c1c', okBg: '#ecfdf5', okLine: '#a7f3d0', okText: '#047857' }
    : { card: '#0f1e3a', text: '#f1f5f9', sub: '#94a3b8', field: '#0a1424', line: '#2a3d63', ico: '#64748b', errBg: '#2a1215', errLine: '#7f1d1d', errText: '#fca5a5', okBg: '#0b2a22', okLine: '#065f46', okText: '#6ee7b7' };
  // Fond : formes douces en dégradés radiaux (aucun flou calculé : l'écran reste fluide)
  const bgPage = isLight
    ? 'radial-gradient(circle at 0% 0%, rgba(96,165,250,0.40) 0, transparent 38%), radial-gradient(circle at 100% 40%, rgba(147,197,253,0.25) 0, transparent 40%), radial-gradient(circle at 30% 100%, rgba(37,99,235,0.35) 0, transparent 45%), linear-gradient(160deg, #1e3a8a 0%, #1d4ed8 55%, #3b82f6 100%)'
    : 'radial-gradient(circle at 0% 0%, rgba(59,130,246,0.22) 0, transparent 38%), radial-gradient(circle at 100% 40%, rgba(96,165,250,0.12) 0, transparent 40%), radial-gradient(circle at 30% 100%, rgba(37,99,235,0.22) 0, transparent 45%), linear-gradient(160deg, #050b18 0%, #0b1a38 55%, #12306b 100%)';
  const btnGrad = 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)';
  const fieldCls = 'w-full h-12 rounded-2xl border pl-11 pr-4 text-[15px] outline-none transition-shadow focus:ring-2 focus:ring-blue-500/50';
  const fieldStyle: React.CSSProperties = { backgroundColor: C.field, borderColor: C.line, color: C.text, borderRadius: 16 };
  const labelCls = 'block text-[13px] font-semibold mb-1.5';
  const iconCls = 'w-[18px] h-[18px] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none';
  const eyeBtn = (shown: boolean, toggle: () => void) => (
    <button type="button" onClick={toggle} className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center cursor-pointer" style={{ color: C.ico }} aria-label={shown ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
      {shown ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
    </button>
  );
  const primaryBtn = 'w-full h-12 rounded-2xl font-bold text-[15px] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 shadow-lg transition-transform active:scale-[0.99]';
  const ghostBtn = 'w-full h-12 rounded-2xl font-semibold text-[15px] border cursor-pointer';
  const errBox = (msg: string) => (
    <div className="mb-4 p-3 rounded-2xl border text-[13px] font-semibold flex items-start gap-2.5" style={{ backgroundColor: C.errBg, borderColor: C.errLine, color: C.errText }}>
      <AlertOctagon className="w-4 h-4 shrink-0 mt-0.5" /><div className="flex-1">{msg}</div>
    </div>
  );
  const okBox = (msg: string) => (
    <div className="p-4 rounded-2xl border text-[14px] leading-relaxed flex items-start gap-2.5" style={{ backgroundColor: C.okBg, borderColor: C.okLine, color: C.okText }}>
      <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" /><div className="flex-1">{msg}</div>
    </div>
  );
  const circleBtn = 'w-10 h-10 rounded-full flex items-center justify-center cursor-pointer';
  const mode: 'login' | 'signup' | 'forgot' = signupOpen ? 'signup' : forgotOpen ? 'forgot' : 'login';
  const heading = mode === 'signup' ? 'Créer un compte' : mode === 'forgot' ? 'Mot de passe oublié' : t('login_title');
  const subheading = mode === 'signup' ? "L'administrateur doit valider ta demande" : mode === 'forgot' ? 'Choisis un nouveau mot de passe' : t('brand_sub');

  return (
    <div className="df-login fixed inset-0 z-40 overflow-y-auto overflow-x-hidden" style={{ background: bgPage, touchAction: 'pan-y', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
      {/* Thème et langue */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        <button onClick={toggleTheme} className={circleBtn} style={{ backgroundColor: 'rgba(255,255,255,0.16)', color: '#ffffff' }} title={isLight ? t('theme_switch_dark') : t('theme_switch_light')}>
          {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>
        <button onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')} className="h-10 px-3 rounded-full flex items-center gap-1.5 text-xs font-semibold cursor-pointer" style={{ backgroundColor: 'rgba(255,255,255,0.16)', color: '#ffffff' }} title="Change language">
          <Globe className="w-3.5 h-3.5" /><span>{lang === 'fr' ? 'EN' : 'FR'}</span>
        </button>
      </div>

      <div className="relative min-h-full flex flex-col items-center justify-center px-4 pt-20 pb-8" style={{ paddingBottom: kb ? '60vh' : undefined }}>
        <div className="relative w-full max-w-md rounded-[28px] px-5 sm:px-8 pt-14 pb-6 shadow-xl" style={{ backgroundColor: C.card, color: C.text }}>
          {/* Logo qui dépasse en haut de la carte */}
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-20 h-20 rounded-full flex items-center justify-center shadow-xl" style={{ backgroundColor: C.card, border: `4px solid ${isLight ? '#dbeafe' : '#1e3a8a'}` }}>
            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: btnGrad }}>
              <Shield className="w-7 h-7" style={{ color: '#ffffff' }} />
            </div>
          </div>

          <div className="text-center mb-6">
            <div className="text-[11px] font-bold tracking-[0.18em] uppercase" style={{ color: isLight ? '#2563eb' : '#60a5fa' }}>{t('brand_title')}</div>
            <h1 className="text-2xl font-extrabold mt-1">{heading}</h1>
            <p className="text-[13px] mt-1" style={{ color: C.sub }}>{subheading}</p>
          </div>

          {/* ---------- Connexion ---------- */}
          {mode === 'login' && (
            <>
              {errorMsg && errBox(errorMsg)}
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className={labelCls}>{t('username_label')}</label>
                  <div className="relative">
                    <UserIcon className={iconCls} style={{ color: C.ico }} />
                    <input type="text" value={username} onChange={e => setUsername(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} autoComplete="username" placeholder={t('username_placeholder')} className={fieldCls} style={fieldStyle} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>{t('password_label')}</label>
                  <div className="relative">
                    <Lock className={iconCls} style={{ color: C.ico }} />
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} autoComplete="current-password" placeholder="••••••••" className={`${fieldCls} pr-12`} style={fieldStyle} />
                    {eyeBtn(showPassword, () => setShowPassword(!showPassword))}
                  </div>
                </div>
                <button type="button" onClick={() => setForgotOpen(true)} className="block ml-auto text-[13px] font-semibold cursor-pointer" style={{ color: isLight ? '#2563eb' : '#60a5fa' }}>
                  Mot de passe oublié ?
                </button>
                <button type="submit" disabled={isLoading} className={primaryBtn} style={{ background: btnGrad, color: '#ffffff' }}>
                  {isLoading ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
              <div className="mt-4">
                {!demoChoice ? (
                  <button type="button" onClick={() => setDemoChoice(true)} className="w-full min-h-[48px] rounded-full border-2 font-bold text-[15px] cursor-pointer inline-flex items-center justify-center gap-2" style={{ borderColor: isLight ? '#2563eb' : '#60a5fa', color: isLight ? '#2563eb' : '#93c5fd' }}>
                    <FlaskConical className="w-4 h-4" /> Voir la démo, sans compte
                  </button>
                ) : (
                  <div className="rounded-2xl border p-3 space-y-2" style={{ borderColor: C.line }}>
                    <p className="text-[13px] text-center" style={{ color: C.sub }}>Données fictives, rien n'est enregistré. Voir le site en tant que :</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => startDemo('admin')} className="min-h-[44px] rounded-full font-bold text-sm text-white cursor-pointer" style={{ background: btnGrad }}>Responsable</button>
                      <button type="button" onClick={() => startDemo('employee')} className="min-h-[44px] rounded-full font-bold text-sm text-white cursor-pointer" style={{ background: btnGrad }}>Opérateur</button>
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-5 pt-4 border-t text-center text-[14px]" style={{ borderColor: C.line }}>
                <span style={{ color: C.sub }}>Pas encore de compte ?</span>{' '}
                <button type="button" onClick={() => setSignupOpen(true)} className="font-bold cursor-pointer" style={{ color: isLight ? '#2563eb' : '#60a5fa' }}>
                  Créer un compte
                </button>
              </div>
            </>
          )}

          {/* ---------- Mot de passe oublié ---------- */}
          {mode === 'forgot' && (
            fgDone ? (
              <div className="space-y-4">
                {okBox("Demande envoyée. Si ce pseudo existe, l'administrateur va la voir. Après sa validation, connecte-toi avec ton nouveau mot de passe.")}
                <button type="button" onClick={closeForgot} className={primaryBtn} style={{ background: btnGrad, color: '#ffffff' }}>Retour à la connexion</button>
              </div>
            ) : (
              <form onSubmit={submitForgot} className="space-y-4">
                <p className="text-[13px] leading-relaxed" style={{ color: C.sub }}>
                  Entre ton pseudo et le nouveau mot de passe que tu veux. Il sera actif quand l'administrateur aura validé.
                </p>
                {fgError && errBox(fgError)}
                <div>
                  <label className={labelCls}>Pseudo</label>
                  <div className="relative">
                    <UserIcon className={iconCls} style={{ color: C.ico }} />
                    <input type="text" value={fgUser} onChange={e => setFgUser(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} className={fieldCls} style={fieldStyle} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Nouveau mot de passe</label>
                  <div className="relative">
                    <Lock className={iconCls} style={{ color: C.ico }} />
                    <input type={fgShow ? 'text' : 'password'} value={fgPass} onChange={e => setFgPass(e.target.value)} autoComplete="new-password" className={`${fieldCls} pr-12`} style={fieldStyle} />
                    {eyeBtn(fgShow, () => setFgShow(v => !v))}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Répète le mot de passe</label>
                  <div className="relative">
                    <Lock className={iconCls} style={{ color: C.ico }} />
                    <input type={fgShow ? 'text' : 'password'} value={fgPass2} onChange={e => setFgPass2(e.target.value)} autoComplete="new-password" className={`${fieldCls} pr-12`} style={fieldStyle} />
                    {eyeBtn(fgShow, () => setFgShow(v => !v))}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Description (facultatif)</label>
                  <textarea rows={2} maxLength={300} value={fgNote} onChange={e => setFgNote(e.target.value)} placeholder="Un mot pour le responsable (facultatif)" className="w-full rounded-2xl border px-4 py-3 text-[15px] outline-none focus:ring-2 focus:ring-blue-500/50" style={fieldStyle} />
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button type="button" onClick={closeForgot} className={ghostBtn} style={{ borderColor: C.line, color: C.text, backgroundColor: 'transparent' }}>
                    <span className="inline-flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" />Retour</span>
                  </button>
                  <button type="submit" disabled={fgBusy} className={primaryBtn} style={{ background: btnGrad, color: '#ffffff' }}>
                    {fgBusy ? 'Envoi…' : 'Envoyer'}
                  </button>
                </div>
              </form>
            )
          )}

          {/* ---------- Inscription ---------- */}
          {mode === 'signup' && (
            sgDone ? (
              <div className="space-y-4">
                {okBox("Demande envoyée. L'administrateur doit la valider avant que vous puissiez vous connecter.")}
                <button type="button" onClick={closeSignup} className={primaryBtn} style={{ background: btnGrad, color: '#ffffff' }}>Retour à la connexion</button>
              </div>
            ) : (
              <form onSubmit={submitSignup} className="space-y-4">
                {sgError && errBox(sgError)}
                <div>
                  <label className={labelCls}>Nom complet</label>
                  <div className="relative">
                    <UserIcon className={iconCls} style={{ color: C.ico }} />
                    <input type="text" value={sgName} onChange={e => setSgName(e.target.value)} autoComplete="name" className={fieldCls} style={fieldStyle} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Pseudo</label>
                  <div className="relative">
                    <UserIcon className={iconCls} style={{ color: C.ico }} />
                    <input type="text" value={sgUser} onChange={e => setSgUser(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} autoComplete="username" className={fieldCls} style={fieldStyle} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Téléphone</label>
                  <div className="relative">
                    <Phone className={iconCls} style={{ color: C.ico }} />
                    <input type="tel" inputMode="numeric" maxLength={16} placeholder="261 34 12 345 67" value={sgPhone} onChange={e => setSgPhone(formatPhone(e.target.value))} className={fieldCls} style={fieldStyle} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Mot de passe (6 caractères min.)</label>
                  <div className="relative">
                    <Lock className={iconCls} style={{ color: C.ico }} />
                    <input type={sgShow ? 'text' : 'password'} value={sgPass} onChange={e => setSgPass(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} autoComplete="new-password" className={`${fieldCls} pr-12`} style={fieldStyle} />
                    {eyeBtn(sgShow, () => setSgShow(v => !v))}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Répète le mot de passe</label>
                  <div className="relative">
                    <Lock className={iconCls} style={{ color: C.ico }} />
                    <input type={sgShow ? 'text' : 'password'} value={sgPass2} onChange={e => setSgPass2(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} autoComplete="new-password" className={`${fieldCls} pr-12`} style={fieldStyle} />
                    {eyeBtn(sgShow, () => setSgShow(v => !v))}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Description (facultatif)</label>
                  <textarea rows={2} maxLength={300} value={sgNote} onChange={e => setSgNote(e.target.value)} placeholder="Un mot pour le responsable (facultatif)" className="w-full rounded-2xl border px-4 py-3 text-[15px] outline-none focus:ring-2 focus:ring-blue-500/50" style={fieldStyle} />
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button type="button" onClick={closeSignup} className={ghostBtn} style={{ borderColor: C.line, color: C.text, backgroundColor: 'transparent' }}>
                    <span className="inline-flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" />Retour</span>
                  </button>
                  <button type="submit" disabled={sgBusy} className={primaryBtn} style={{ background: btnGrad, color: '#ffffff' }}>
                    {sgBusy ? 'Envoi…' : 'Envoyer la demande'}
                  </button>
                </div>
              </form>
            )
          )}
        </div>

        <div className="mt-6 text-center text-xs" style={{ color: 'rgba(255,255,255,0.75)' }}>Gestion Pro · 2026</div>
      </div>
    </div>
  );
};

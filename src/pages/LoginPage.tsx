import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { loginSchema, type LoginFormData } from '@/types/forms';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
import { Eye, EyeOff, ArrowRight, Mail, Lock } from 'lucide-react';

const REMEMBER_EMAIL_KEY = 'sunmax_remember_email';
const REMEMBER_FLAG_KEY  = 'sunmax_remember_me';


export function LoginPage() {
  const { t } = useTranslation('auth');
  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const { data: settings } = useSettings();
  const logoUrl = settings?.logo_url;
  const companyName = settings?.company_name ?? 'SunPlus';

  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(
    () => localStorage.getItem(REMEMBER_FLAG_KEY) === 'true',
  );

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } =
    useForm<LoginFormData>({ resolver: zodResolver(loginSchema) });

  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_EMAIL_KEY);
    if (saved) setValue('email', saved);
  }, [setValue]);

  // If user becomes authenticated (onAuthStateChange race), redirect to dashboard
  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  async function onSubmit(data: LoginFormData) {
    setError('');
    try {
      await signIn(data.email, data.password);
      if (rememberMe) {
        localStorage.setItem(REMEMBER_EMAIL_KEY, data.email);
        localStorage.setItem(REMEMBER_FLAG_KEY, 'true');
      } else {
        localStorage.removeItem(REMEMBER_EMAIL_KEY);
        localStorage.removeItem(REMEMBER_FLAG_KEY);
      }
      sessionStorage.setItem('authenticated', 'true');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.error.generic'));
    }
  }

  return (
    /* ── Outer wrapper: mobile = column, desktop = centered card ── */
    <div className="min-h-screen flex flex-col md:flex-row md:items-center md:justify-center md:p-6"
      style={{ background: '#f1f5f9' }}>

      {/* Desktop bg circles */}
      <div className="hidden md:block fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-20 bg-red-600" />
        <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full opacity-10 bg-red-600" />
      </div>

      {/* ── Card shell ─────────────────────────────────────────── */}
      <div className="relative flex flex-col md:flex-row md:rounded-3xl md:shadow-2xl md:overflow-hidden w-full md:max-w-4xl"
        style={{ minHeight: 'min(520px, 100vh)' }}>

        {/* ── Mobile red header (hidden on desktop) ── */}
        <div className="md:hidden relative flex flex-col items-center justify-end pb-10 pt-16 overflow-hidden flex-shrink-0"
          style={{
            background: 'radial-gradient(ellipse at 70% 30%, #ef4444 0%, #dc2626 45%, #991b1b 100%)',
            minHeight: '38vh',
          }}>
          <div className="absolute top-[-60px] right-[-60px] w-56 h-56 rounded-full opacity-20 bg-white" />
          <div className="absolute bottom-[-40px] left-[-40px] w-40 h-40 rounded-full opacity-10 bg-white" />

          {logoUrl ? (
            <img src={logoUrl} alt={companyName} className="w-40 h-24 object-contain"
              style={{ filter: 'brightness(0) invert(1)' }} />
          ) : (
            <span className="text-white font-black text-6xl">{companyName.charAt(0)}</span>
          )}
          <p className="text-white/60 text-[11px] font-bold uppercase tracking-widest mt-3">
            Trade Management
          </p>
        </div>

        {/* ── Desktop illustration panel (hidden on mobile) ── */}
        <div className="hidden md:flex flex-col items-center justify-center flex-1 p-10 bg-gray-50/80 relative overflow-hidden">
          <div className="absolute inset-0 opacity-30"
            style={{ backgroundImage: 'radial-gradient(circle, #e2e8f0 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
          <div className="relative z-10 w-full max-w-sm">
            <img src="/images/login-illustration.png" alt="Trade operations" className="w-full object-contain" />
          </div>
          <p className="relative z-10 text-center text-[12px] text-gray-400 mt-4 max-w-xs">
            Ticaret operasyonlarınızı tek platformdan yönetin
          </p>
        </div>

        {/* ── Form section — ONE form, responsive styles ─────────── */}
        <div className="flex-1 md:flex-none md:w-[380px] md:shrink-0
                        bg-white md:bg-red-600
                        rounded-t-3xl md:rounded-none -mt-5 md:mt-0
                        px-6 md:px-10 pt-8 pb-10 flex flex-col justify-center">

          {/* Desktop logo row */}
          <div className="hidden md:flex items-center gap-2.5 mb-8">
            {logoUrl
              ? <img src={logoUrl} alt={companyName} className="h-10 object-contain"
                  style={{ filter: 'brightness(0) invert(1)' }} />
              : <span className="text-white font-black text-xl">{companyName}</span>}
          </div>

          <h1 className="text-[24px] font-extrabold tracking-tight leading-tight mb-1
                         text-red-600 md:text-white">
            {t('login.title')}
          </h1>
          <p className="text-[13px] mb-7 text-gray-400 md:text-white/60">
            {t('login.subtitle')}
          </p>

          {/* ── THE ONE AND ONLY FORM ── */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">

            {/* Email */}
            <div>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type="email"
                  autoComplete="email"
                  placeholder={t('login.usernamePlaceholder')}
                  className="w-full h-12 pl-10 pr-4 rounded-2xl text-[13px] text-gray-700 placeholder-gray-400 outline-none transition-all
                             border border-gray-100 bg-gray-50 focus:border-red-300 focus:ring-2 focus:ring-red-50 focus:bg-white
                             md:border-0 md:bg-white md:focus:ring-2 md:focus:ring-white/50"
                  {...register('email')}
                />
              </div>
              {errors.email && (
                <p className="text-[11px] mt-1 pl-1 text-red-500 md:text-white/80">
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full h-12 pl-10 pr-11 rounded-2xl text-[13px] text-gray-700 placeholder-gray-400 outline-none transition-all
                             border border-gray-100 bg-gray-50 focus:border-red-300 focus:ring-2 focus:ring-red-50 focus:bg-white
                             md:border-0 md:bg-white md:focus:ring-2 md:focus:ring-white/50"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-[11px] mt-1 pl-1 text-red-500 md:text-white/80">
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Remember + Forgot */}
            <div className="flex items-center justify-between pt-0.5">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-red-600 cursor-pointer"
                />
                <span className="text-[11px] text-gray-400 md:text-white/70">
                  {t('login.rememberMe')}
                </span>
              </label>
              <span className="text-[11px] cursor-pointer transition-colors text-gray-400 hover:text-gray-600 md:text-white/60 md:hover:text-white">
                {t('login.forgotPassword')}
              </span>
            </div>

            {/* Error */}
            {error && (
              <div className="text-[11px] rounded-xl px-4 py-3
                              text-red-600 bg-red-50 border border-red-100
                              md:text-white md:bg-white/20 md:border-white/20">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-12 mt-1 rounded-full text-[13px] font-bold tracking-wide
                         flex items-center justify-center gap-2
                         hover:opacity-90 disabled:opacity-60 transition-all shadow-md
                         bg-red-600 text-white
                         md:bg-white md:text-red-600 md:shadow-sm"
            >
              {isSubmitting ? t('login.submitting') : (
                <>{t('login.submit')} <ArrowRight className="h-4 w-4" /></>
              )}
            </button>
          </form>

          <p className="text-center text-[10px] mt-8 text-gray-300 md:text-white/30">
            © {new Date().getFullYear()} {companyName}
          </p>
        </div>
      </div>
    </div>
  );
}

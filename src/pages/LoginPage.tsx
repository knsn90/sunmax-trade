import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { loginSchema, type LoginFormData } from '@/types/forms';
import { useAuth } from '@/hooks/useAuth';
import { tenantService } from '@/services/tenantService';
import { supabase } from '@/services/supabase';
import { Eye, EyeOff, ArrowRight, Mail, Lock, Building2, ChevronRight } from 'lucide-react';

const REMEMBER_EMAIL_KEY = 'sunmax_remember_email';
const REMEMBER_FLAG_KEY  = 'sunmax_remember_me';

interface TenantBranding {
  id: string;
  name: string;
  logo_url: string;
  login_bg_url: string;
  primary_color: string;
  favicon_url: string;
}

const DEFAULT_BRANDING: TenantBranding = {
  id: '',
  name: 'Trade Management',
  logo_url: '',
  login_bg_url: '',
  primary_color: '#dc2626',
  favicon_url: '',
};

/** Tenant adından URL slug üretir: "SUNPLUS KIMYA SAN..." → "sunplus" */
function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
    .split(/\s+/)[0] ?? '';
}

/** Login sayfası için tenant branding'i çözer */
async function resolveBranding(tenantSlug?: string): Promise<TenantBranding | null> {
  try {
    // 1. URL slug param: /login/esenkim
    if (tenantSlug) {
      const list = await tenantService.getPublicList();
      const found = list.find(t => nameToSlug(t.name) === tenantSlug.toLowerCase());
      if (found) {
        const info = await tenantService.getPublicInfo(found.id);
        if (info) return { ...DEFAULT_BRANDING, ...info };
      }
      return null; // slug bulunamadı
    }

    // 2. ?tenant= URL parametresi
    const params = new URLSearchParams(window.location.search);
    const tenantParam = params.get('tenant');
    if (tenantParam) {
      const info = await tenantService.getPublicInfo(tenantParam);
      if (info) return { ...DEFAULT_BRANDING, ...info };
    }

    // 3. Custom domain (production)
    const hostname = window.location.hostname;
    if (hostname !== 'localhost' && !hostname.includes('127.0.0.1')) {
      const info = await tenantService.resolveByDomain(hostname);
      if (info) return { ...DEFAULT_BRANDING, ...info };
    }
  } catch {
    // sessizce varsayılana düş
  }
  return null; // → firma seçici göster
}

// ─── Firma Seçici ─────────────────────────────────────────────────────────────

interface TenantOption {
  id: string;
  name: string;
  primary_color: string;
  logo_url: string;
}

function TenantSelector() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    tenantService.getPublicList()
      .then(list => setTenants(list as TenantOption[]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-10 bg-gray-400" />
        <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full opacity-5 bg-gray-400" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-white shadow-sm border border-gray-100 flex items-center justify-center mx-auto mb-4">
            <Building2 className="h-7 w-7 text-gray-400" />
          </div>
          <h1 className="text-[22px] font-extrabold text-gray-900 tracking-tight">Giriş Yapın</h1>
          <p className="text-[13px] text-gray-400 mt-1">Hangi firma hesabına giriş yapacaksınız?</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
            </div>
          ) : tenants.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-[13px] text-gray-400">Aktif firma bulunamadı</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {tenants.map(t => (
                <button
                  key={t.id}
                  onClick={() => navigate(`/login/${nameToSlug(t.name)}`)}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors group text-left"
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm overflow-hidden bg-white border border-gray-100">
                    {t.logo_url
                      ? <img src={t.logo_url} alt={t.name} className="w-full h-full object-contain" />
                      : <span className="text-[14px] font-black" style={{ color: t.primary_color || '#dc2626' }}>{t.name.charAt(0)}</span>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-gray-900 truncate">{t.name}</p>
                    <p className="text-[10px] text-gray-400 font-mono">
                      /login/{nameToSlug(t.name)}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="text-center text-[10px] text-gray-300 mt-6">Trade Management Platform</p>
      </div>
    </div>
  );
}

// ─── Login Form ───────────────────────────────────────────────────────────────

export function LoginPage() {
  const { t } = useTranslation('auth');
  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  // AuthGuard'ın geçtiği "nereden gelindi" bilgisi — login sonrası oraya dön
  const from = (location.state as { from?: string } | null)?.from || '/dashboard';

  const [branding, setBranding] = useState<TenantBranding | null>(null);
  const [brandingLoaded, setBrandingLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(
    () => localStorage.getItem(REMEMBER_FLAG_KEY) === 'true',
  );

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } =
    useForm<LoginFormData>({ resolver: zodResolver(loginSchema) });

  useEffect(() => {
    resolveBranding(tenantSlug).then(b => {
      if (b) {
        setBranding(b);
      } else if (tenantSlug) {
        setNotFound(true);
      }
      setBrandingLoaded(true);
    });
  }, [tenantSlug]);

  useEffect(() => {
    if (!branding?.favicon_url) return;
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
      ?? Object.assign(document.createElement('link'), { rel: 'icon' });
    link.href = branding.favicon_url;
    document.head.appendChild(link);
  }, [branding?.favicon_url]);

  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_EMAIL_KEY);
    if (saved) setValue('email', saved);
  }, [setValue]);

  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [user, navigate, from]);

  async function onSubmit(data: LoginFormData) {
    setError('');
    try {
      await signIn(data.email, data.password);

      // Belirli bir firmadan giriş yapılıyorsa üyelik kontrolü yap
      if (branding?.id) {
        const { data: { user: currentUser } } = await supabase.auth.getUser();

        // 1. profiles.tenant_id kontrolü (mevcut sistem)
        const { data: prof } = await supabase
          .from('profiles')
          .select('is_super_admin, tenant_id')
          .eq('id', currentUser?.id ?? '')
          .single();

        const isSuperAdmin = prof?.is_super_admin === true;
        const isProfileMember = prof?.tenant_id === branding.id;

        // 2. user_tenants kontrolü (yeni sistem — tablo yoksa atla)
        let isUserTenantMember = false;
        if (!isSuperAdmin && !isProfileMember) {
          const { data: membership, error: membershipError } = await supabase
            .from('user_tenants')
            .select('user_id')
            .eq('tenant_id', branding.id)
            .eq('user_id', currentUser?.id ?? '')
            .eq('is_active', true)
            .maybeSingle();

          const tableNotFound =
            !!membershipError &&
            (membershipError.code === '42P01' ||
              membershipError.message?.includes('does not exist') ||
              membershipError.message?.includes('relation'));

          isUserTenantMember = tableNotFound || !!membership;
        }

        if (!isSuperAdmin && !isProfileMember && !isUserTenantMember) {
          await supabase.auth.signOut();
          setError('Bu firmada hesabınız bulunmuyor.');
          return;
        }

        sessionStorage.setItem('login_target_tenant', branding.id);

        // TenantContext cache'ini doldur — dashboard açılışında logo/renk anında görünsün
        try {
          localStorage.setItem('sunmax_current_tenant', JSON.stringify({
            id: branding.id,
            name: branding.name,
            logo_url: branding.logo_url,
            primary_color: branding.primary_color,
            favicon_url: branding.favicon_url,
          }));
        } catch { /* ignore */ }
      }

      if (rememberMe) {
        localStorage.setItem(REMEMBER_EMAIL_KEY, data.email);
        localStorage.setItem(REMEMBER_FLAG_KEY, 'true');
      } else {
        localStorage.removeItem(REMEMBER_EMAIL_KEY);
        localStorage.removeItem(REMEMBER_FLAG_KEY);
      }
      sessionStorage.setItem('authenticated', 'true');

      // Hard reload KULLANMA — React Router navigate kullan.
      // window.location.href tüm auth state'i sıfırlayıp isLoading=true'ya
      // döndürür ve race condition'a yol açar.
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.error.generic'));
    }
  }

  if (!brandingLoaded) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#f1f5f9' }}>
        <div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-gray-500 animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-sm w-full text-center">
          <Building2 className="h-10 w-10 text-gray-200 mx-auto mb-4" />
          <p className="text-[15px] font-bold text-gray-700">Firma bulunamadı</p>
          <p className="text-[12px] text-gray-400 mt-1 mb-5">
            "<span className="font-mono">{tenantSlug}</span>" adresine ait aktif bir firma yok.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="h-9 px-4 rounded-xl bg-gray-100 text-[12px] font-semibold text-gray-600 hover:bg-gray-200 transition-colors"
          >
            ← Firma listesine dön
          </button>
        </div>
      </div>
    );
  }

  // Firma seçici (slug yok + özel domain yok + ?tenant yok)
  if (!branding) {
    return <TenantSelector />;
  }

  const accent = branding.primary_color || '#dc2626';
  // Koyu panel: marka renginin çok koyu tonu (Kickflow tarzı)
  const panelBg = `linear-gradient(165deg, color-mix(in srgb, ${accent} 30%, #0d0a16) 0%, #0d0a16 70%)`;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-10 relative overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${accent} 0%, color-mix(in srgb, ${accent} 75%, #7c3aed) 100%)` }}>

      {/* ── Yüzen geometrik şekiller ── */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        {/* büyük çember konturları */}
        <div className="absolute -left-40 top-1/2 -translate-y-1/2 w-[560px] h-[560px] rounded-full border border-white/15" />
        <div className="absolute -right-48 -bottom-48 w-[640px] h-[640px] rounded-full border border-white/10" />
        <div className="absolute right-[12%] top-[8%] w-40 h-40 rounded-full border border-white/10" />
        {/* küçük şekiller */}
        <div className="absolute left-[6%] top-[18%] w-4 h-4 bg-white/25 rounded-[3px]" />
        <div className="absolute left-[12%] bottom-[14%] w-5 h-5 bg-white/15 rounded-md rotate-45" />
        <div className="absolute right-[8%] top-[12%] w-5 h-5 bg-white/20 rounded-md rotate-45" />
        <div className="absolute right-[5%] bottom-[28%] w-4 h-4 rounded-[3px] bg-emerald-400/70" />
        <div className="absolute left-[45%] bottom-[6%] w-3 h-3 rounded-full bg-white/20" />
        <div className="absolute right-[30%] top-[5%] w-2.5 h-2.5 rounded-full bg-white/25" />
      </div>

      {/* ── Koyu ana panel ── */}
      <div className="relative w-full max-w-5xl rounded-[2rem] px-5 pt-9 pb-7 md:px-14 md:pt-12 md:pb-12 shadow-2xl overflow-hidden"
        style={{ background: panelBg }}>

        {/* panel içi hafif parıltı */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden
          style={{ background: `radial-gradient(ellipse 60% 50% at 50% -10%, color-mix(in srgb, ${accent} 35%, transparent), transparent)` }} />

        {/* Marka adı */}
        <div className="relative flex items-center justify-center mb-7 md:mb-9">
          {branding.logo_url ? (
            <img src={branding.logo_url} alt={branding.name} className="h-9 md:h-10 object-contain"
              style={{ filter: 'brightness(0) invert(1)' }} />
          ) : (
            <span className="text-white text-[24px] md:text-[26px] tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
              <strong className="font-black">{branding.name.split(' ')[0]}</strong>
              <span className="font-light opacity-80">{branding.name.split(' ').slice(1).join(' ') && ' ' + branding.name.split(' ').slice(1).join(' ')}</span>
            </span>
          )}
        </div>

        {/* ── Beyaz kart: sol form + sağ illüstrasyon ── */}
        <div className="relative bg-white rounded-3xl shadow-xl flex overflow-hidden" style={{ minHeight: 480 }}>

          {/* SOL — Form */}
          <div className="w-full md:w-[46%] md:border-r border-gray-100 px-7 py-9 md:px-10 md:py-11 flex flex-col justify-center">
            <h1 className="text-[21px] font-extrabold text-gray-900 tracking-tight leading-snug"
              style={{ fontFamily: 'Manrope, sans-serif' }}>
              {t('login.title')}
              <span className="inline-block ml-2 align-middle">
                {branding.logo_url && <img src={branding.logo_url} alt="" className="h-6 object-contain inline-block" />}
              </span>
            </h1>
            <p className="text-[13px] text-gray-400 mt-1 mb-8">
              {branding.name} hesabınızla devam edin
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
              <div>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input type="email" autoComplete="email" placeholder={t('login.usernamePlaceholder')}
                    className="w-full h-12 pl-11 pr-4 rounded-full text-[13px] text-gray-700 placeholder-gray-400 outline-none transition-all bg-gray-100/80 border border-transparent focus:bg-white focus:border-gray-200 focus:shadow-sm"
                    {...register('email')} />
                </div>
                {errors.email && <p className="text-[11px] mt-1 pl-3 text-red-500">{errors.email.message}</p>}
              </div>

              <div>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder={t('login.passwordPlaceholder', { defaultValue: 'Şifre' })}
                    className="w-full h-12 pl-11 pr-12 rounded-full text-[13px] text-gray-700 placeholder-gray-400 outline-none transition-all bg-gray-100/80 border border-transparent focus:bg-white focus:border-gray-200 focus:shadow-sm"
                    {...register('password')} />
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-[11px] mt-1 pl-3 text-red-500">{errors.password.message}</p>}
              </div>

              <div className="flex items-center justify-between pt-1 px-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)}
                    className="w-3.5 h-3.5 rounded cursor-pointer" style={{ accentColor: accent }} />
                  <span className="text-[11px] text-gray-500">{t('login.rememberMe')}</span>
                </label>
                <span className="text-[11px] cursor-pointer text-gray-400 hover:text-gray-600 transition-colors">
                  {t('login.forgotPassword')}
                </span>
              </div>

              {error && (
                <div className="text-[11px] rounded-xl px-4 py-3 text-red-600 bg-red-50 border border-red-100">{error}</div>
              )}

              <button type="submit" disabled={isSubmitting}
                className="w-full h-12 mt-2 rounded-xl text-[14px] font-bold tracking-wide flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.99] disabled:opacity-60 transition-all shadow-lg text-white"
                style={{ background: accent, boxShadow: `0 8px 24px -6px ${accent}80` }}>
                {isSubmitting ? t('login.submitting') : <>{t('login.submit')} <ArrowRight className="h-4 w-4" /></>}
              </button>
            </form>

            <div className="border-t border-gray-100 mt-8 pt-5 text-center">
              <span className="text-[12px] text-gray-500 font-medium">Başka bir firma mı arıyorsunuz? </span>
              <button onClick={() => navigate('/login')} className="text-[12px] font-bold hover:underline" style={{ color: accent }}>
                Firma Seç
              </button>
            </div>
          </div>

          {/* SAĞ — İllüstrasyon (Kickflow tarzı) */}
          <div className="hidden md:flex flex-1 items-center justify-center relative p-10">
            {branding.login_bg_url && (
              <img src={branding.login_bg_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.06]" />
            )}
            <div className="relative w-[340px] h-[340px] flex items-center justify-center">
              {/* dış kesikli halka */}
              <div className="absolute inset-0 rounded-full border-2 border-dashed border-gray-200" style={{ animation: 'spin 60s linear infinite' }} />
              {/* iç dolgu daire */}
              <div className="absolute inset-10 rounded-full bg-gray-50" />

              {/* dönüş okları */}
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 340 340" fill="none" aria-hidden>
                <path d="M 96 52 A 150 150 0 0 1 254 58" stroke="#cbd5e1" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M 96 52 l 12 -8 m -12 8 l 14 4" stroke="#cbd5e1" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M 244 288 A 150 150 0 0 1 86 282" stroke="#cbd5e1" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M 244 288 l -12 8 m 12 -8 l -14 -4" stroke="#cbd5e1" strokeWidth="2.5" strokeLinecap="round" />
              </svg>

              {/* merkez rozet — logo */}
              <div className="relative z-10 w-36 h-36 rounded-full flex items-center justify-center shadow-xl"
                style={{ background: `linear-gradient(145deg, color-mix(in srgb, ${accent} 18%, #ffffff), #ffffff)` , boxShadow: `0 16px 40px -8px ${accent}40, inset 0 0 0 8px color-mix(in srgb, ${accent} 10%, #ffffff)` }}>
                <div className="w-24 h-24 rounded-full bg-white shadow-inner flex items-center justify-center overflow-hidden border border-gray-100">
                  {branding.logo_url
                    ? <img src={branding.logo_url} alt={branding.name} className="w-16 h-16 object-contain" />
                    : <span className="text-[32px] font-black" style={{ color: accent }}>{branding.name.charAt(0)}</span>
                  }
                </div>
              </div>

              {/* yan avatar daireleri */}
              <div className="absolute left-[-14px] top-1/2 -translate-y-1/2 w-24 h-24 rounded-full bg-gray-100 border-4 border-white shadow-lg flex items-end justify-center overflow-hidden">
                <svg viewBox="0 0 64 64" className="w-16 h-16" aria-hidden>
                  <circle cx="32" cy="22" r="11" fill="#1f2937" />
                  <path d="M 10 64 Q 12 42 32 42 Q 52 42 54 64 Z" fill="#ec4899" />
                  <circle cx="32" cy="24" r="9" fill="#fcd9c4" />
                  <path d="M 22 20 Q 24 10 34 12 Q 44 13 42 24 Q 41 15 33 15 Q 25 15 24 24 Z" fill="#1f2937" />
                </svg>
              </div>
              <div className="absolute right-[-14px] top-1/2 -translate-y-1/2 w-24 h-24 rounded-full bg-gray-100 border-4 border-white shadow-lg flex items-end justify-center overflow-hidden">
                <svg viewBox="0 0 64 64" className="w-16 h-16" aria-hidden>
                  <path d="M 10 64 Q 12 42 32 42 Q 52 42 54 64 Z" fill="#34d399" />
                  <circle cx="32" cy="24" r="9" fill="#fcd9c4" />
                  <path d="M 22 22 Q 21 12 32 12 Q 43 12 42 22 Q 40 16 32 16 Q 24 16 22 22 Z" fill="#374151" />
                </svg>
              </div>

              {/* dekoratif noktalar */}
              <span className="absolute left-[10%] top-[6%] w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="absolute right-[4%] bottom-[18%] w-2 h-2 rounded-full bg-pink-500" />
              <span className="absolute left-[2%] bottom-[10%] w-2 h-2 rounded-full" style={{ background: accent }} />
              <span className="absolute right-[16%] top-[2%] w-1.5 h-1.5 rounded-full bg-gray-300" />
            </div>
          </div>
        </div>

        <p className="relative text-center text-[10px] text-white/40 mt-6">© {new Date().getFullYear()} {branding.name} · Trade Management Platform</p>
      </div>
    </div>
  );
}

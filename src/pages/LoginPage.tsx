import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();

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
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  async function onSubmit(data: LoginFormData) {
    setError('');
    try {
      await signIn(data.email, data.password);

      // Belirli bir firmadan giriş yapılıyorsa üyelik kontrolü yap
      if (branding?.id) {
        // Oturum açan kullanıcının ID'sini al
        const { data: { user: currentUser } } = await supabase.auth.getUser();

        const { data: membership, error: membershipError } = await supabase
          .from('user_tenants')
          .select('user_id')
          .eq('tenant_id', branding.id)
          .eq('user_id', currentUser?.id ?? '')
          .eq('is_active', true)
          .maybeSingle();

        // Süper admin değilse ve bu firmada üye değilse → giriş reddet
        const { data: prof } = await supabase
          .from('profiles')
          .select('is_super_admin')
          .single();

        // user_tenants tablosu henüz oluşturulmamışsa kontrolü atla
        const tableNotFound =
          membershipError?.code === '42P01' ||
          membershipError?.message?.includes('does not exist') ||
          membershipError?.message?.includes('relation') ||
          membershipError?.code === 'PGRST116';

        if (!tableNotFound && !membership && !prof?.is_super_admin) {
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

      window.location.href = '/dashboard';
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
  const heroBg = branding.login_bg_url
    ? `url(${branding.login_bg_url}) center/cover no-repeat`
    : `radial-gradient(ellipse at 70% 30%, ${accent}dd 0%, ${accent} 45%, ${accent}cc 100%)`;

  return (
    <div className="min-h-screen flex flex-col md:flex-row md:items-center md:justify-center md:p-6"
      style={{ background: '#f1f5f9' }}>

      <div className="hidden md:block fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-20" style={{ background: accent }} />
        <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full opacity-10" style={{ background: accent }} />
      </div>

      <div className="relative flex flex-col md:flex-row md:rounded-3xl md:shadow-2xl md:overflow-hidden w-full md:max-w-4xl"
        style={{ minHeight: 'min(520px, 100vh)' }}>

        {/* Mobil üst alan */}
        <div className="md:hidden relative flex flex-col items-center justify-end pb-10 pt-16 overflow-hidden flex-shrink-0"
          style={{ background: heroBg, minHeight: '38vh' }}>
          <div className="absolute top-[-60px] right-[-60px] w-56 h-56 rounded-full opacity-20 bg-white" />
          <div className="absolute bottom-[-40px] left-[-40px] w-40 h-40 rounded-full opacity-10 bg-white" />
          {branding.logo_url ? (
            <img src={branding.logo_url} alt={branding.name} className="w-40 h-24 object-contain"
              style={{ filter: 'brightness(0) invert(1)' }} />
          ) : (
            <span className="text-white font-black text-6xl" style={{ fontFamily: 'Manrope, sans-serif' }}>
              {branding.name.charAt(0)}
            </span>
          )}
          <p className="text-white/60 text-[11px] font-bold uppercase tracking-widest mt-3">{branding.name}</p>
        </div>

        {/* Desktop illüstrasyon paneli */}
        <div className="hidden md:flex flex-col items-center justify-center flex-1 p-10 bg-gray-50/80 relative overflow-hidden">
          {branding.login_bg_url ? (
            <img src={branding.login_bg_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />
          ) : (
            <div className="absolute inset-0 opacity-30"
              style={{ backgroundImage: 'radial-gradient(circle, #e2e8f0 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
          )}
          <div className="relative z-10 w-full max-w-sm">
            {branding.logo_url
              ? <img src={branding.logo_url} alt={branding.name} className="w-48 object-contain mx-auto" />
              : <img src="/images/login-illustration.png" alt="Trade operations" className="w-full object-contain" />
            }
          </div>
          <p className="relative z-10 text-center text-[12px] text-gray-400 mt-4 max-w-xs">
            Ticaret operasyonlarınızı tek platformdan yönetin
          </p>
          <button onClick={() => navigate('/login')}
            className="relative z-10 mt-4 text-[11px] text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1">
            ← Diğer firmalar
          </button>
        </div>

        {/* Form bölümü */}
        <div className="flex-1 md:flex-none md:w-[380px] md:shrink-0 bg-white rounded-t-3xl md:rounded-none -mt-5 md:mt-0 px-6 md:px-10 pt-8 pb-10 flex flex-col justify-center">
          <div className="hidden md:flex items-center gap-2.5 mb-8 px-1 py-3 -mx-1 rounded-2xl" style={{ background: accent }}>
            <div className="flex-1 flex items-center justify-center gap-3 px-2">
              {branding.logo_url
                ? <img src={branding.logo_url} alt={branding.name} className="h-9 object-contain"
                    style={{ filter: 'brightness(0) invert(1)' }} />
                : <span className="text-white font-black text-lg" style={{ fontFamily: 'Manrope, sans-serif' }}>{branding.name}</span>
              }
            </div>
          </div>

          <h1 className="text-[24px] font-extrabold tracking-tight leading-tight mb-1"
            style={{ fontFamily: 'Manrope, sans-serif', color: accent }}>
            {t('login.title')}
          </h1>
          <p className="text-[13px] mb-7 text-gray-400">{t('login.subtitle')}</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
            <div>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <Mail className="h-4 w-4" />
                </div>
                <input type="email" autoComplete="email" placeholder={t('login.usernamePlaceholder')}
                  className="w-full h-12 pl-10 pr-4 rounded-2xl text-[13px] text-gray-700 placeholder-gray-400 outline-none transition-all border border-gray-100 bg-gray-50 focus:bg-white"
                  {...register('email')} />
              </div>
              {errors.email && <p className="text-[11px] mt-1 pl-1 text-red-500">{errors.email.message}</p>}
            </div>

            <div>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <Lock className="h-4 w-4" />
                </div>
                <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••"
                  className="w-full h-12 pl-10 pr-11 rounded-2xl text-[13px] text-gray-700 placeholder-gray-400 outline-none transition-all border border-gray-100 bg-gray-50 focus:bg-white"
                  {...register('password')} />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-[11px] mt-1 pl-1 text-red-500">{errors.password.message}</p>}
            </div>

            <div className="flex items-center justify-between pt-0.5">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)}
                  className="w-3.5 h-3.5 rounded cursor-pointer" style={{ accentColor: accent }} />
                <span className="text-[11px] text-gray-400">{t('login.rememberMe')}</span>
              </label>
              <span className="text-[11px] cursor-pointer text-gray-400 hover:text-gray-600 transition-colors">
                {t('login.forgotPassword')}
              </span>
            </div>

            {error && (
              <div className="text-[11px] rounded-xl px-4 py-3 text-red-600 bg-red-50 border border-red-100">{error}</div>
            )}

            <button type="submit" disabled={isSubmitting}
              className="w-full h-12 mt-1 rounded-full text-[13px] font-bold tracking-wide flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-60 transition-all shadow-md text-white"
              style={{ background: `linear-gradient(135deg, ${accent}cc, ${accent})` }}>
              {isSubmitting ? t('login.submitting') : <>{t('login.submit')} <ArrowRight className="h-4 w-4" /></>}
            </button>
          </form>

          <p className="text-center text-[10px] mt-8 text-gray-300">© {new Date().getFullYear()} {branding.name}</p>
        </div>
      </div>
    </div>
  );
}

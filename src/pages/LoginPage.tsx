import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { loginSchema, type LoginFormData } from '@/types/forms';
import { useAuth } from '@/hooks/useAuth';
import { tenantService } from '@/services/tenantService';
import { supabase } from '@/services/supabase';
import { Eye, EyeOff, ArrowRight, Building2, ChevronRight } from 'lucide-react';

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

  const fontUi = 'Inter, -apple-system, BlinkMacSystemFont, sans-serif';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: '#F9F9F9', fontFamily: fontUi }}>
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-7">
          <div className="w-11 h-11 rounded-lg bg-white border border-[#E5E5E5] shadow-[0_1px_4px_rgba(0,0,0,0.08)] flex items-center justify-center mx-auto mb-4">
            <Building2 className="h-5 w-5 text-[#6F6F6F]" />
          </div>
          <h1 className="text-[26px] font-bold text-[#1A1A1A] tracking-[-0.02em] leading-[1.15]">Giriş Yapın</h1>
          <p className="text-[14px] text-[#6F6F6F] mt-1.5">Hangi firma hesabına giriş yapacaksınız?</p>
        </div>

        <div className="bg-white rounded-xl border border-[#E5E5E5] shadow-[0_1px_4px_rgba(0,0,0,0.08)] overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-14">
              <div className="w-5 h-5 border-2 border-[#E5E5E5] border-t-[#6F6F6F] rounded-full animate-spin" />
            </div>
          ) : tenants.length === 0 ? (
            <div className="py-14 text-center">
              <p className="text-[14px] text-[#6F6F6F]">Aktif firma bulunamadı</p>
            </div>
          ) : (
            <div className="divide-y divide-[#F2F2F2]">
              {tenants.map(t => (
                <button
                  key={t.id}
                  onClick={() => navigate(`/login/${nameToSlug(t.name)}`)}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-[#F9F9F9] transition-colors group text-left"
                >
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden bg-white border border-[#E5E5E5]">
                    {t.logo_url
                      ? <img src={t.logo_url} alt={t.name} className="w-full h-full object-contain" />
                      : <span className="text-[15px] font-bold" style={{ color: t.primary_color || '#FF5151' }}>{t.name.charAt(0)}</span>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-[#1A1A1A] truncate">{t.name}</p>
                    <p className="text-[12px] text-[#9CA3AF] font-mono">/login/{nameToSlug(t.name)}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-[#D1D5DB] group-hover:text-[#6F6F6F] transition-colors shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="text-center text-[12px] text-[#9CA3AF] mt-5">Trade Management Platform</p>
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
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#F9F9F9' }}>
        <div className="w-7 h-7 rounded-full border-[3px] border-[#E5E5E5] border-t-[#6F6F6F] animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: '#F9F9F9', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}>
        <div className="bg-white rounded-xl border border-[#E5E5E5] shadow-[0_1px_4px_rgba(0,0,0,0.08)] p-8 max-w-[400px] w-full text-center">
          <Building2 className="h-9 w-9 text-[#D1D5DB] mx-auto mb-4" />
          <p className="text-[16px] font-bold text-[#1A1A1A]">Firma bulunamadı</p>
          <p className="text-[13px] text-[#6F6F6F] mt-1.5 mb-5">
            "<span className="font-mono">{tenantSlug}</span>" adresine ait aktif bir firma yok.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="h-9 px-4 rounded-lg bg-[#F2F2F2] text-[13px] font-medium text-[#1A1A1A] hover:bg-[#E5E5E5] transition-colors"
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

  const accent = branding.primary_color || '#FF5151';
  const fontUi = 'Inter, -apple-system, BlinkMacSystemFont, sans-serif';
  // Coda input: minimal chrome — ince kenarlık; focus aksan rengiyle (style bloğu)
  const inputBase =
    'coda-input w-full h-11 rounded-lg text-[14px] text-[#1A1A1A] placeholder-[#9CA3AF] bg-white outline-none transition-colors border border-[#E5E5E5]';

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: '#F9F9F9', fontFamily: fontUi, ['--accent' as string]: accent, ['--accent-ring' as string]: accent + '26' }}
    >
      <style>{`
        .coda-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-ring); }
      `}</style>
      <div className="w-full max-w-[400px]">

        {/* ── Marka — Coda doc-icon tarzı ── */}
        <div className="flex flex-col items-center mb-7">
          {branding.logo_url ? (
            <img src={branding.logo_url} alt={branding.name} className="h-10 object-contain" />
          ) : (
            <div
              className="w-11 h-11 rounded-lg flex items-center justify-center text-white text-[20px] font-bold shadow-[0_1px_4px_rgba(0,0,0,0.08)]"
              style={{ background: accent }}
            >
              {branding.name.charAt(0)}
            </div>
          )}
        </div>

        {/* ── Kart ── */}
        <div className="bg-white rounded-xl border border-[#E5E5E5] shadow-[0_1px_4px_rgba(0,0,0,0.08)] px-8 py-9">
          <h1 className="text-[26px] font-bold text-[#1A1A1A] tracking-[-0.02em] leading-[1.15]">
            {t('login.title')}
          </h1>
          <p className="text-[14px] text-[#6F6F6F] mt-1.5 mb-7 leading-[1.5]">
            {branding.name} hesabınızla devam edin
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* E-posta */}
            <div>
              <label className="block text-[13px] font-medium text-[#1A1A1A] mb-1.5">
                {t('login.usernamePlaceholder')}
              </label>
              <input
                type="email"
                autoComplete="email"
                placeholder="ornek@firma.com"
                className={`${inputBase} px-3.5`}
                {...register('email')}
              />
              {errors.email && <p className="text-[12px] mt-1.5 text-[#FF5151]">{errors.email.message}</p>}
            </div>

            {/* Şifre */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[13px] font-medium text-[#1A1A1A]">
                  {t('login.passwordPlaceholder', { defaultValue: 'Şifre' })}
                </label>
                <button
                  type="button"
                  className="text-[12px] text-[#6F6F6F] hover:text-[#1A1A1A] transition-colors"
                >
                  {t('login.forgotPassword')}
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={`${inputBase} pl-3.5 pr-11`}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#1A1A1A] transition-colors"
                  aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                >
                  {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </div>
              {errors.password && <p className="text-[12px] mt-1.5 text-[#FF5151]">{errors.password.message}</p>}
            </div>

            {/* Beni hatırla */}
            <label className="flex items-center gap-2 cursor-pointer select-none pt-0.5">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded-[4px] cursor-pointer"
                style={{ accentColor: accent }}
              />
              <span className="text-[13px] text-[#6F6F6F]">{t('login.rememberMe')}</span>
            </label>

            {error && (
              <div className="text-[13px] rounded-lg px-3.5 py-2.5 text-[#1A1A1A] bg-[#FFF1F1] border border-[#FFD4D4]">
                {error}
              </div>
            )}

            {/* CTA — tek aksan rengi */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-11 mt-1 rounded-lg text-[14px] font-semibold text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
              style={{ background: accent }}
              onMouseEnter={e => { (e.currentTarget.style.background = `color-mix(in srgb, ${accent} 88%, #000)`); }}
              onMouseLeave={e => { (e.currentTarget.style.background = accent); }}
            >
              {isSubmitting ? t('login.submitting') : <>{t('login.submit')} <ArrowRight className="h-4 w-4" /></>}
            </button>
          </form>
        </div>

        {/* ── Kart altı ── */}
        <div className="text-center mt-5">
          <span className="text-[13px] text-[#6F6F6F]">Başka bir firma mı arıyorsunuz? </span>
          <button onClick={() => navigate('/login')} className="text-[13px] font-semibold hover:underline" style={{ color: accent }}>
            Firma Seç
          </button>
        </div>
        <p className="text-center text-[12px] text-[#9CA3AF] mt-3">
          © {new Date().getFullYear()} {branding.name}
        </p>
      </div>
    </div>
  );
}

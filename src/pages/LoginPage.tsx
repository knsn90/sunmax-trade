import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { loginSchema, type LoginFormData } from '@/types/forms';
import { useAuth } from '@/hooks/useAuth';
import { User, Lock } from 'lucide-react';

const REMEMBER_EMAIL_KEY = 'sunmax_remember_email';
const REMEMBER_FLAG_KEY = 'sunmax_remember_me';

export function LoginPage() {
  const { t } = useTranslation('auth');
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem(REMEMBER_FLAG_KEY) === 'true');

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    const savedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY);
    if (savedEmail) setValue('email', savedEmail);
  }, [setValue]);

  async function onSubmit(data: LoginFormData) {
    setError('');
    try {
      await signIn(data.email, data.password);
      if (rememberMe) {
        localStorage.setItem(REMEMBER_EMAIL_KEY, data.email);
        localStorage.setItem(REMEMBER_FLAG_KEY, 'true');
        sessionStorage.setItem('authenticated', 'true');
      } else {
        localStorage.removeItem(REMEMBER_EMAIL_KEY);
        localStorage.removeItem(REMEMBER_FLAG_KEY);
        sessionStorage.setItem('authenticated', 'true');
      }
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.error.generic'));
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-200 via-pink-100 to-orange-50">
      {/* Outer wrapper: extra top padding so avatar has room to float above */}
      <div className="w-full max-w-sm px-4 pt-12">
        <div className="relative bg-white rounded-3xl shadow-2xl px-8 pt-14 pb-8">

          {/* Floating avatar circle */}
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-20 h-20 rounded-full bg-red-500 shadow-lg flex items-center justify-center">
            <User size={38} color="white" strokeWidth={1.5} />
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Email input */}
            <div>
              <div className="flex items-center gap-3 bg-gray-100 rounded-full px-4 py-3">
                <User size={16} className="text-gray-400 shrink-0" />
                <input
                  type="email"
                  placeholder={t('login.usernamePlaceholder')}
                  autoComplete="email"
                  className="flex-1 bg-transparent text-sm text-gray-600 placeholder-gray-400 outline-none"
                  {...register('email')}
                />
              </div>
              {errors.email && (
                <p className="text-xs text-red-500 mt-1 px-4">{errors.email.message}</p>
              )}
            </div>

            {/* Password input */}
            <div>
              <div className="flex items-center gap-3 bg-gray-100 rounded-full px-4 py-3">
                <Lock size={16} className="text-gray-400 shrink-0" />
                <input
                  type="password"
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  className="flex-1 bg-transparent text-sm text-gray-600 placeholder-gray-400 outline-none"
                  {...register('password')}
                />
              </div>
              {errors.password && (
                <p className="text-xs text-red-500 mt-1 px-4">{errors.password.message}</p>
              )}
            </div>

            {/* Remember me + Forgot password */}
            <div className="flex items-center justify-between px-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded accent-red-500 cursor-pointer"
                />
                <span className="text-xs text-gray-400">{t('login.rememberMe')}</span>
              </label>
              <span className="text-xs text-gray-400 italic cursor-pointer hover:text-gray-600">
                {t('login.forgotPassword')}
              </span>
            </div>

            {/* Error message */}
            {error && (
              <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            {/* Login button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-full bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white font-bold tracking-widest text-sm py-3 transition-colors"
            >
              {isSubmitting ? t('login.submitting') : t('login.submit')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

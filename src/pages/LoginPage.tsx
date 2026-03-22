import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginFormData } from '@/types/forms';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormGroup } from '@/components/ui/shared';

const REMEMBER_EMAIL_KEY = 'sunmax_remember_email';
const REMEMBER_FLAG_KEY = 'sunmax_remember_me';

export function LoginPage() {
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
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl border border-border shadow-sm p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-extrabold text-brand-500 tracking-tight">SunPlus</h1>
            <p className="text-xs text-muted-foreground mt-1">Trade Management System</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormGroup label="Email" error={errors.email?.message}>
              <Input
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
                {...register('email')}
              />
            </FormGroup>

            <FormGroup label="Password" error={errors.password?.message}>
              <Input
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                {...register('password')}
              />
            </FormGroup>

            <div className="flex items-center gap-2">
              <input
                id="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-border accent-brand-500 cursor-pointer"
              />
              <label htmlFor="remember-me" className="text-xs text-muted-foreground cursor-pointer select-none">
                Remember me
              </label>
            </div>

            {error && (
              <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in…' : 'Sign In'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

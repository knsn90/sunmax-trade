import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginFormData } from '@/types/forms';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormGroup } from '@/components/ui/shared';

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginFormData) {
    setError('');
    try {
      await signIn(data.email, data.password);
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

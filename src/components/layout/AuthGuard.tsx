import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { LoadingSpinner } from '@/components/ui/shared';
import type { UserRole } from '@/types/enums';

interface AuthGuardProps {
  children: React.ReactNode;
  requiredRoles?: UserRole[];
}

export function AuthGuard({ children, requiredRoles }: AuthGuardProps) {
  const { user, profile, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <LoadingSpinner />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const isAdmin = profile?.role === 'admin';

  // Role-based check (e.g. settings page admin-only)
  if (requiredRoles && profile && !requiredRoles.includes(profile.role)) {
    return <AccessDenied />;
  }

  // Permission-based check — skip for admins
  if (!isAdmin && profile?.permissions && profile.permissions.length > 0) {
    const segment = location.pathname.split('/')[1];
    if (segment && !profile.permissions.includes(segment)) {
      return <AccessDenied />;
    }
  }

  return <>{children}</>;
}

function AccessDenied() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center p-8">
        <div className="text-4xl mb-3">🔒</div>
        <h2 className="text-base font-semibold text-gray-800">Erişim Yok</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Bu sayfaya erişim yetkiniz bulunmuyor.
        </p>
      </div>
    </div>
  );
}

import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { LoadingSpinner } from '@/components/ui/shared';
import type { UserRole } from '@/types/enums';

interface AuthGuardProps {
  children: React.ReactNode;
  requiredRoles?: UserRole[];
}

export function AuthGuard({ children, requiredRoles }: AuthGuardProps) {
  const { user, profile, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <LoadingSpinner />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRoles && profile && !requiredRoles.includes(profile.role)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="text-base font-semibold">Access Denied</h2>
          <p className="text-xs text-muted-foreground mt-1">
            You don't have permission to view this page.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

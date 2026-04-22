import { createBrowserRouter, Navigate, useParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { PipelinePage } from '@/pages/PipelinePage';
import { TradeFilesPage } from '@/pages/TradeFilesPage';
import { TradeFileDetailPage } from '@/pages/TradeFileDetailPage';
import { AccountingPage } from '@/pages/AccountingPage';
import { FinancialReportsPage } from '@/pages/FinancialReportsPage';
import { ContactsPage } from '@/pages/ContactsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { ActivityPage } from '@/pages/ActivityPage';
import {
  ProductsPage,
  ReportsPage,
} from '@/pages/StubPages';
import { DocumentsPage } from '@/pages/DocumentsPage';
import { PriceListPage } from '@/pages/PriceListPage';
import { TenantManagementPage } from '@/pages/TenantManagementPage';
import { ViewAsPage } from '@/pages/ViewAsPage';

function TradeFileDetailRoute() {
  const { id } = useParams();
  return <TradeFileDetailPage key={id} />;
}

export const router = createBrowserRouter([
  {
    path: '/view-as',
    element: (
      <AuthGuard>
        <ViewAsPage />
      </AuthGuard>
    ),
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/login/:tenantSlug',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: (
      <AuthGuard>
        <AppLayout />
      </AuthGuard>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'pipeline', element: <PipelinePage /> },
      { path: 'files', element: <TradeFilesPage /> },
      { path: 'files/:id', element: <TradeFileDetailRoute /> },
      { path: 'documents', element: <DocumentsPage /> },
      { path: 'accounting', element: <AccountingPage /> },
      { path: 'fin-reports', element: <FinancialReportsPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'contacts', element: <ContactsPage /> },
      { path: 'products', element: <ProductsPage /> },
      { path: 'price-list', element: <PriceListPage /> },
      { path: 'profile', element: <ProfilePage /> },
      {
        path: 'activity',
        element: (
          <AuthGuard requiredRoles={['admin']}>
            <ActivityPage />
          </AuthGuard>
        ),
      },
      {
        path: 'settings',
        element: (
          <AuthGuard requiredRoles={['admin']}>
            <SettingsPage />
          </AuthGuard>
        ),
      },
      {
        path: 'admin/tenants',
        element: (
          <AuthGuard requiredRoles={['admin']}>
            <TenantManagementPage />
          </AuthGuard>
        ),
      },
    ],
  },
]);

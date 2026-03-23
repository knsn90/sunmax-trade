import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { PipelinePage } from '@/pages/PipelinePage';
import { TradeFilesPage } from '@/pages/TradeFilesPage';
import { TradeFileDetailPage } from '@/pages/TradeFileDetailPage';
import { AccountingPage } from '@/pages/AccountingPage';
import { CustomersPage } from '@/pages/CustomersPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { ActivityPage } from '@/pages/ActivityPage';
import {
  SuppliersPage,
  ServiceProvidersPage,
  ProductsPage,
  InvoicesPage,
  PackingListsPage,
  ProformasPage,
  ReportsPage,
} from '@/pages/StubPages';

export const router = createBrowserRouter([
  {
    path: '/login',
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
      { path: 'files/:id', element: <TradeFileDetailPage /> },
      { path: 'invoices', element: <InvoicesPage /> },
      { path: 'packing-lists', element: <PackingListsPage /> },
      { path: 'proformas', element: <ProformasPage /> },
      { path: 'accounting', element: <AccountingPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'customers', element: <CustomersPage /> },
      { path: 'suppliers', element: <SuppliersPage /> },
      { path: 'service-providers', element: <ServiceProvidersPage /> },
      { path: 'products', element: <ProductsPage /> },
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
    ],
  },
]);

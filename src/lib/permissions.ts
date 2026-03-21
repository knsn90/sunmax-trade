import type { UserRole } from '@/types/enums';

type Permission =
  | 'files:create' | 'files:edit' | 'files:delete'
  | 'documents:create' | 'documents:edit' | 'documents:delete'
  | 'transactions:create' | 'transactions:edit' | 'transactions:delete'
  | 'entities:create' | 'entities:edit' | 'entities:delete'
  | 'settings:manage' | 'users:manage' | 'audit:view'
  | 'data:export' | 'data:import';

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    'files:create', 'files:edit', 'files:delete',
    'documents:create', 'documents:edit', 'documents:delete',
    'transactions:create', 'transactions:edit', 'transactions:delete',
    'entities:create', 'entities:edit', 'entities:delete',
    'settings:manage', 'users:manage', 'audit:view',
    'data:export', 'data:import',
  ],
  manager: [
    'files:create', 'files:edit',
    'documents:create', 'documents:edit',
    'transactions:create', 'transactions:edit',
    'entities:create', 'entities:edit',
    'data:export',
  ],
  accountant: [
    'transactions:create', 'transactions:edit',
    'data:export',
  ],
  viewer: [],
};

export function hasPermission(role: UserRole | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function canWrite(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'manager';
}

export function canWriteTransactions(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'manager' || role === 'accountant';
}

export function isAdmin(role: UserRole | undefined): boolean {
  return role === 'admin';
}

import { useState, useEffect } from 'react';
import { supabase } from '@/services/supabase';
import { useUsers } from '@/hooks/useUsers';
import { Card, PageHeader, LoadingSpinner } from '@/components/ui/shared';
import { NativeSelect } from '@/components/ui/form-elements';
import { Input } from '@/components/ui/input';
import type { AuditLog, Profile } from '@/types/database';
import { Search, LogIn, LogOut, Plus, Pencil, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── Types ────────────────────────────────────────────────────────────────────
interface LoginEvent {
  id: string;
  user_id: string | null;
  event: 'login' | 'logout';
  created_at: string;
  user?: Profile;
}

type LogEntry =
  | { kind: 'audit'; data: AuditLog }
  | { kind: 'login'; data: LoginEvent };

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TABLE_LABELS: Record<string, string> = {
  trade_files:       'Trade File',
  proformas:         'Proforma',
  invoices:          'Invoice',
  packing_lists:     'Packing List',
  transactions:      'Transaction',
  customers:         'Customer',
  suppliers:         'Supplier',
  service_providers: 'Service Provider',
  products:          'Product',
  profiles:          'User',
  company_settings:  'Settings',
  bank_accounts:     'Bank Account',
};

function tableLabel(t: string) { return TABLE_LABELS[t] ?? t; }

function actionIcon(action: string) {
  if (action === 'create') return <Plus className="h-3.5 w-3.5 text-green-600" />;
  if (action === 'update') return <Pencil className="h-3.5 w-3.5 text-blue-600" />;
  if (action === 'delete') return <Trash2 className="h-3.5 w-3.5 text-red-600" />;
  return null;
}

function actionLabel(action: string) {
  if (action === 'create') return 'Oluşturdu';
  if (action === 'update') return 'Güncelledi';
  if (action === 'delete') return 'Sildi';
  return action;
}

function actionBg(action: string) {
  if (action === 'create') return 'bg-green-50 text-green-700 border-green-200';
  if (action === 'update') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (action === 'delete') return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-gray-50 text-gray-700 border-gray-200';
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function initials(name?: string) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function recordTitle(log: AuditLog) {
  const v = log.new_values ?? log.old_values ?? {};
  return (v['proforma_no'] || v['invoice_no'] || v['file_no'] ||
    v['name'] || v['full_name'] || v['company_name'] || '') as string;
}

function changedFields(log: AuditLog): string[] {
  if (!log.old_values || !log.new_values) return [];
  return Object.keys(log.new_values).filter(
    k => JSON.stringify(log.new_values![k]) !== JSON.stringify(log.old_values![k])
  ).slice(0, 4);
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function ActivityPage() {
  const { data: users = [] } = useUsers();
  const [auditLogs, setAuditLogs]   = useState<AuditLog[]>([]);
  const [loginLogs, setLoginLogs]   = useState<LoginEvent[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filterUser, setFilterUser] = useState('all');
  const [filterTable, setFilterTable] = useState('all');
  const [filterAction, setFilterAction] = useState('all');
  const [search, setSearch]         = useState('');
  const [page, setPage]             = useState(0);
  const PER_PAGE = 50;

  async function fetchLogs() {
    setLoading(true);
    try {
      const [auditRes, loginRes] = await Promise.all([
        supabase
          .from('audit_logs')
          .select('*, user:profiles(id,full_name,email,role,is_active,created_at,updated_at,permissions,deleted_at)')
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('user_logins')
          .select('*, user:profiles(id,full_name,email,role,is_active,created_at,updated_at,permissions,deleted_at)')
          .order('created_at', { ascending: false })
          .limit(200),
      ]);
      if (auditRes.data) setAuditLogs(auditRes.data as AuditLog[]);
      if (loginRes.data) setLoginLogs(loginRes.data as LoginEvent[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchLogs(); }, []);
  useEffect(() => { setPage(0); }, [filterUser, filterTable, filterAction, search]);

  // Merge & sort all entries newest-first
  const allEntries: LogEntry[] = [
    ...auditLogs.map(d => ({ kind: 'audit' as const, data: d, ts: d.created_at })),
    ...loginLogs.map(d => ({ kind: 'login' as const, data: d, ts: d.created_at })),
  ].sort((a, b) => b.ts.localeCompare(a.ts));

  // Filter
  const filtered = allEntries.filter(entry => {
    if (filterUser !== 'all') {
      const uid = entry.kind === 'audit' ? entry.data.user_id : entry.data.user_id;
      if (uid !== filterUser) return false;
    }
    if (entry.kind === 'audit') {
      if (filterTable !== 'all' && entry.data.table_name !== filterTable) return false;
      if (filterAction !== 'all' && entry.data.action !== filterAction) return false;
    } else {
      if (filterTable !== 'all') return false;
      if (filterAction !== 'all' && entry.data.event !== filterAction) return false;
    }
    if (search) {
      const s = search.toLowerCase();
      const name = entry.kind === 'audit'
        ? (entry.data.user as Profile | undefined)?.full_name ?? ''
        : (entry.data.user as Profile | undefined)?.full_name ?? '';
      const detail = entry.kind === 'audit' ? recordTitle(entry.data) : '';
      if (!name.toLowerCase().includes(s) && !detail.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const paged = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

  // Unique tables for filter dropdown
  const tables = Array.from(new Set(auditLogs.map(l => l.table_name))).sort();

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <PageHeader title={`İşlem Geçmişi  —  ${filtered.length} kayıt`} />
        <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              className="pl-8 h-8 text-xs"
              placeholder="Kullanıcı veya kayıt ara…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <NativeSelect className="h-8 text-xs w-40"
            value={filterUser} onChange={e => setFilterUser(e.target.value)}>
            <option value="all">Tüm Kullanıcılar</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
          </NativeSelect>
          <NativeSelect className="h-8 text-xs w-36"
            value={filterTable} onChange={e => setFilterTable(e.target.value)}>
            <option value="all">Tüm Modüller</option>
            {tables.map(t => <option key={t} value={t}>{tableLabel(t)}</option>)}
          </NativeSelect>
          <NativeSelect className="h-8 text-xs w-32"
            value={filterAction} onChange={e => setFilterAction(e.target.value)}>
            <option value="all">Tüm İşlemler</option>
            <option value="create">Oluşturma</option>
            <option value="update">Güncelleme</option>
            <option value="delete">Silme</option>
            <option value="login">Giriş</option>
            <option value="logout">Çıkış</option>
          </NativeSelect>
        </div>
      </Card>

      {/* Log List */}
      {loading ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : paged.length === 0 ? (
        <Card className="py-12 text-center text-sm text-gray-400">Kayıt bulunamadı</Card>
      ) : (
        <Card className="divide-y divide-gray-100 overflow-hidden">
          {paged.map(entry => (
            entry.kind === 'audit'
              ? <AuditRow key={entry.data.id} log={entry.data} />
              : <LoginRow key={entry.data.id} log={entry.data} />
          ))}
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            ← Önceki
          </Button>
          <span className="text-xs text-gray-500">{page + 1} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
            Sonraki →
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Audit Row ────────────────────────────────────────────────────────────────
function AuditRow({ log }: { log: AuditLog }) {
  const [open, setOpen] = useState(false);
  const user = log.user as Profile | undefined;
  const title = recordTitle(log);
  const changed = log.action === 'update' ? changedFields(log) : [];

  return (
    <div className="px-4 py-3 hover:bg-gray-50 transition-colors">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-white text-[10px] font-bold">{initials(user?.full_name)}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-800">
              {user?.full_name || 'Bilinmeyen Kullanıcı'}
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${actionBg(log.action)}`}>
              {actionIcon(log.action)}
              {actionLabel(log.action)}
            </span>
            <span className="text-xs text-gray-500">
              <span className="font-medium text-gray-700">{tableLabel(log.table_name)}</span>
              {title && <span className="ml-1 text-gray-400">— {title}</span>}
            </span>
          </div>

          {changed.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {changed.map(f => (
                <span key={f} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                  {f}
                </span>
              ))}
              {changedFields(log).length > 4 && (
                <span className="text-[10px] text-gray-400">+{changedFields(log).length - 4} daha</span>
              )}
            </div>
          )}
        </div>

        {/* Time + expand */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-[10px] text-gray-400 whitespace-nowrap">{fmtDate(log.created_at)}</span>
          {(log.old_values || log.new_values) && (
            <button
              onClick={() => setOpen(o => !o)}
              className="text-[10px] text-blue-500 hover:text-blue-700"
            >
              {open ? 'Gizle' : 'Detay'}
            </button>
          )}
        </div>
      </div>

      {/* Expanded diff */}
      {open && (
        <div className="mt-2 ml-11 grid grid-cols-2 gap-2">
          {log.old_values && (
            <div>
              <div className="text-[10px] font-bold text-red-500 mb-1">Önceki</div>
              <pre className="text-[10px] bg-red-50 border border-red-100 rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap break-all">
                {JSON.stringify(log.old_values, null, 2)}
              </pre>
            </div>
          )}
          {log.new_values && (
            <div>
              <div className="text-[10px] font-bold text-green-500 mb-1">Sonraki</div>
              <pre className="text-[10px] bg-green-50 border border-green-100 rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap break-all">
                {JSON.stringify(log.new_values, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Login Row ────────────────────────────────────────────────────────────────
function LoginRow({ log }: { log: LoginEvent }) {
  const user = log.user as Profile | undefined;
  const isLogin = log.event === 'login';

  return (
    <div className="px-4 py-3 hover:bg-gray-50 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
          isLogin ? 'bg-green-100' : 'bg-gray-100'
        }`}>
          {isLogin
            ? <LogIn className="h-4 w-4 text-green-600" />
            : <LogOut className="h-4 w-4 text-gray-500" />}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-800">
              {user?.full_name || 'Bilinmeyen'}
            </span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
              isLogin ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-600 border-gray-200'
            }`}>
              {isLogin ? 'Giriş Yaptı' : 'Çıkış Yaptı'}
            </span>
            {user?.email && (
              <span className="text-[10px] text-gray-400">{user.email}</span>
            )}
          </div>
        </div>
        <span className="text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0">
          {fmtDate(log.created_at)}
        </span>
      </div>
    </div>
  );
}

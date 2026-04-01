import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/services/supabase';
import { useUsers } from '@/hooks/useUsers';
import { LoadingSpinner } from '@/components/ui/shared';
import { Input } from '@/components/ui/input';
import type { AuditLog, Profile } from '@/types/database';
import { Search, LogIn, LogOut, Plus, Pencil, Trash2, RefreshCw, Activity, ChevronDown, ChevronUp } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface LoginEvent {
  id: string;
  user_id: string | null;
  event: 'login' | 'logout';
  created_at: string;
  user?: Profile;
}

type LogEntry =
  | { kind: 'audit'; data: AuditLog; ts: string }
  | { kind: 'login'; data: LoginEvent; ts: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ACTION_ICONS = {
  create: Plus,
  update: Pencil,
  delete: Trash2,
  login:  LogIn,
  logout: LogOut,
};
const ACTION_STYLES: Record<string, { bg: string; dot: string }> = {
  create: { bg: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  update: { bg: 'bg-blue-100 text-blue-700',       dot: 'bg-blue-500' },
  delete: { bg: 'bg-red-100 text-red-700',         dot: 'bg-red-500' },
  login:  { bg: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  logout: { bg: 'bg-gray-100 text-gray-600',       dot: 'bg-gray-400' },
};

function fmtDate(iso: string, t: (k: string, opts?: { count?: number }) => string, lang: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return t('time.justNow');
  if (diff < 3_600_000) return t('time.minutesAgo', { count: Math.floor(diff / 60_000) });
  if (diff < 86_400_000) return t('time.hoursAgo', { count: Math.floor(diff / 3_600_000) });
  return d.toLocaleDateString(lang, { day: '2-digit', month: 'short' })
    + ' ' + d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
}

function fmtDateFull(iso: string, lang: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(lang, { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
}

function initials(name?: string) {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function avatarColor(name?: string): string {
  const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4'];
  const idx = (name ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  return colors[idx];
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
  ).slice(0, 5);
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function ActivityPage() {
  const { t } = useTranslation('activity');
  const { t: tc } = useTranslation('common');
  const { data: users = [] } = useUsers();
  const [auditLogs, setAuditLogs]   = useState<AuditLog[]>([]);
  const [loginLogs, setLoginLogs]   = useState<LoginEvent[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filterUser, setFilterUser] = useState('all');
  const [filterAction, setFilterAction] = useState('all');
  const [search, setSearch]         = useState('');
  const [page, setPage]             = useState(0);
  const PER_PAGE = 30;

  const ACTION_PILLS = [
    { key: 'all',    label: t('filters.all') },
    { key: 'create', label: t('filters.created') },
    { key: 'update', label: t('filters.updated') },
    { key: 'delete', label: t('filters.deleted') },
    { key: 'login',  label: t('filters.login') },
    { key: 'logout', label: t('filters.logout') },
  ];

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
  useEffect(() => { setPage(0); }, [filterUser, filterAction, search]);

  const allEntries: LogEntry[] = [
    ...auditLogs.map(d => ({ kind: 'audit' as const, data: d, ts: d.created_at })),
    ...loginLogs.map(d => ({ kind: 'login' as const, data: d, ts: d.created_at })),
  ].sort((a, b) => b.ts.localeCompare(a.ts));

  const filtered = allEntries.filter(entry => {
    if (filterUser !== 'all') {
      const uid = entry.kind === 'audit' ? entry.data.user_id : entry.data.user_id;
      if (uid !== filterUser) return false;
    }
    if (filterAction !== 'all') {
      const act = entry.kind === 'audit' ? entry.data.action : entry.data.event;
      if (act !== filterAction) return false;
    }
    if (search) {
      const s = search.toLowerCase();
      const user = entry.kind === 'audit'
        ? (entry.data.user as Profile | undefined)
        : (entry.data.user as Profile | undefined);
      const name = user?.full_name ?? user?.email ?? '';
      const detail = entry.kind === 'audit' ? recordTitle(entry.data) : '';
      if (!name.toLowerCase().includes(s) && !detail.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const paged = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
            <Activity className="h-4.5 w-4.5 text-violet-600" style={{ width: 18, height: 18 }} />
          </div>
          <div>
            <h1 className="text-[15px] font-bold text-gray-900">{t('title')}</h1>
            <p className="text-[11px] text-gray-400">{filtered.length} {tc('entries')}</p>
          </div>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 h-8 rounded-full border border-gray-200 text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {t('buttons.refresh')}
        </button>
      </div>

      {/* Search + user filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            className="pl-9 h-9 text-[13px] rounded-xl border-gray-200 bg-white"
            placeholder={t('search')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          value={filterUser}
          onChange={e => setFilterUser(e.target.value)}
          className="h-9 px-3 rounded-xl border border-gray-200 text-[12px] text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20"
        >
          <option value="all">{t('allUsers')}</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
        </select>
      </div>

      {/* Action filter pills */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl w-fit overflow-x-auto scrollbar-none">
        {ACTION_PILLS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilterAction(key)}
            className={`shrink-0 px-3.5 h-8 rounded-xl text-[12px] font-semibold transition-all whitespace-nowrap ${
              filterAction === key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Log list */}
      {loading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : paged.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
          <div className="text-3xl mb-2">📋</div>
          <p className="text-sm text-gray-400">{t('empty.noEntries')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
          {paged.map(entry => (
            entry.kind === 'audit'
              ? <AuditRow key={entry.data.id} log={entry.data} />
              : <LoginRow key={entry.data.id} log={entry.data} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5">
          <button
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
            className="px-3.5 h-8 rounded-full text-[12px] font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t('buttons.prev')}
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            const p = totalPages <= 7 ? i : Math.max(0, Math.min(page - 3, totalPages - 7)) + i;
            return (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-8 h-8 rounded-full text-[12px] font-semibold transition-all ${
                  p === page
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {p + 1}
              </button>
            );
          })}
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => p + 1)}
            className="px-3.5 h-8 rounded-full text-[12px] font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t('buttons.next')}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Audit Row ────────────────────────────────────────────────────────────────
function AuditRow({ log }: { log: AuditLog }) {
  const { t, i18n } = useTranslation('activity');
  const [open, setOpen] = useState(false);
  const user = log.user as Profile | undefined;
  const title = recordTitle(log);
  const changed = log.action === 'update' ? changedFields(log) : [];
  const styles = ACTION_STYLES[log.action as keyof typeof ACTION_STYLES] ?? ACTION_STYLES.update;
  const Icon = ACTION_ICONS[log.action as keyof typeof ACTION_ICONS] ?? Pencil;
  const color = avatarColor(user?.full_name);

  return (
    <div className="px-4 py-3.5 hover:bg-gray-50/60 transition-colors">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 text-white text-[11px] font-bold"
          style={{ background: color }}
        >
          {initials(user?.full_name)}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-gray-800">
              {user?.full_name || t('unknown')}
            </span>
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${styles.bg}`}>
              <Icon className="h-3 w-3" />
              {t(`actions.${log.action}` as `actions.${string}`, { defaultValue: log.action })}
            </span>
            <span className="text-[12px] text-gray-500">
              <span className="font-medium text-gray-700">
                {t(`tables.${log.table_name}` as `tables.${string}`, { defaultValue: log.table_name })}
              </span>
              {title && <span className="text-gray-400"> — {title}</span>}
            </span>
          </div>

          {changed.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {changed.map(f => (
                <span key={f} className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                  {f}
                </span>
              ))}
              {changedFields(log).length > 5 && (
                <span className="text-[10px] text-gray-400">+{changedFields(log).length - 5} more</span>
              )}
            </div>
          )}
        </div>

        {/* Time + expand */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-[11px] text-gray-400" title={fmtDateFull(log.created_at, i18n.language)}>
            {fmtDate(log.created_at, t, i18n.language)}
          </span>
          {(log.old_values || log.new_values) && (
            <button
              onClick={() => setOpen(o => !o)}
              className="flex items-center gap-0.5 text-[11px] text-violet-500 hover:text-violet-700 font-medium"
            >
              {open
                ? <><ChevronUp className="h-3 w-3" /> {t('buttons.hide')}</>
                : <><ChevronDown className="h-3 w-3" /> {t('buttons.detail')}</>
              }
            </button>
          )}
        </div>
      </div>

      {/* Expanded diff */}
      {open && (
        <div className="mt-3 ml-11 grid grid-cols-1 md:grid-cols-2 gap-2">
          {log.old_values && (
            <div>
              <div className="text-[10px] font-bold text-red-500 mb-1 uppercase tracking-wide">{t('diff.before')}</div>
              <pre className="text-[10px] bg-red-50 border border-red-100 rounded-xl p-2.5 overflow-auto max-h-40 whitespace-pre-wrap break-all text-gray-700">
                {JSON.stringify(log.old_values, null, 2)}
              </pre>
            </div>
          )}
          {log.new_values && (
            <div>
              <div className="text-[10px] font-bold text-emerald-600 mb-1 uppercase tracking-wide">{t('diff.after')}</div>
              <pre className="text-[10px] bg-emerald-50 border border-emerald-100 rounded-xl p-2.5 overflow-auto max-h-40 whitespace-pre-wrap break-all text-gray-700">
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
  const { t, i18n } = useTranslation('activity');
  const user = log.user as Profile | undefined;
  const isLogin = log.event === 'login';
  const color = avatarColor(user?.full_name);

  return (
    <div className="px-4 py-3.5 hover:bg-gray-50/60 transition-colors">
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-white text-[11px] font-bold"
          style={{ background: color }}
        >
          {initials(user?.full_name)}
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-gray-800">
              {user?.full_name || t('unknown')}
            </span>
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              isLogin ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {isLogin ? <LogIn className="h-3 w-3" /> : <LogOut className="h-3 w-3" />}
              {t(isLogin ? 'actions.login' : 'actions.logout')}
            </span>
            {user?.email && (
              <span className="text-[11px] text-gray-400">{user.email}</span>
            )}
          </div>
        </div>

        <span className="text-[11px] text-gray-400 whitespace-nowrap shrink-0" title={fmtDateFull(log.created_at, i18n.language)}>
          {fmtDate(log.created_at, t, i18n.language)}
        </span>
      </div>
    </div>
  );
}

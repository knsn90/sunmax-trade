import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/supabase';

export interface Notification {
  id: string;
  type: 'danger' | 'warning' | 'info';
  title: string;
  description: string;
  href: string;
  timestamp: string;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr + 'T00:00:00').getTime() - new Date(new Date().toDateString()).getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ── Lightweight queries used ONLY for notifications ───────────────────────────
// Previously this hook called useTradeFiles() and useTransactions() which share
// query keys with page-level hooks. Since pages apply their own filters, the
// query keys differ → React Query fires SEPARATE network requests for each.
// Fix: dedicated Supabase queries with their own keys and longer staleTime,
// fetching only the columns notifications actually need (minimal payload).

function useNotificationFiles() {
  return useQuery({
    queryKey: ['notifications', 'trade-files'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trade_files')
        .select('id, file_no, status, eta, created_at, customer:customers(name)')
        .in('status', ['sale', 'delivery'])
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 1000 * 60 * 10,  // 10 min — notifications don't need realtime freshness
    retry: false,
  });
}

function useNotificationTransactions() {
  return useQuery({
    queryKey: ['notifications', 'transactions'],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const cutoff = thirtyDaysAgo.toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from('transactions')
        .select('id, transaction_date, transaction_type, payment_status, party_name, amount')
        .eq('payment_status', 'open')
        .in('transaction_type', ['purchase_inv', 'svc_inv', 'receipt'])
        .lt('transaction_date', cutoff)
        .order('transaction_date', { ascending: true })
        .limit(50);                              // Cap at 50 — we only show a badge count
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 1000 * 60 * 10,
    retry: false,
  });
}

// ─────────────────────────────────────────────────────────────────────────────

export function useNotifications() {
  const { data: files = [] }        = useNotificationFiles();
  const { data: transactions = [] } = useNotificationTransactions();

  const notifications = useMemo<Notification[]>(() => {
    const list: Notification[] = [];

    // 1. ETA overdue
    files
      .filter(f => f.eta)
      .forEach(f => {
        const days = daysUntil(f.eta);
        if (days !== null && days < 0) {
          list.push({
            id: `eta-overdue-${f.id}`,
            type: 'danger',
            title: `ETA Overdue — ${f.file_no}`,
            description: `${Math.abs(days)} day(s) late • ${(f.customer as { name?: string } | null)?.name ?? ''}`,
            href: `/files/${f.id}`,
            timestamp: f.eta!,
          });
        }
      });

    // 2. ETA approaching (within 7 days)
    files
      .filter(f => f.eta)
      .forEach(f => {
        const days = daysUntil(f.eta);
        if (days !== null && days >= 0 && days <= 7) {
          list.push({
            id: `eta-soon-${f.id}`,
            type: 'warning',
            title: `ETA Approaching — ${f.file_no}`,
            description: `${days === 0 ? 'Today' : `In ${days} day(s)`} • ${(f.customer as { name?: string } | null)?.name ?? ''}`,
            href: `/files/${f.id}`,
            timestamp: f.eta!,
          });
        }
      });

    // 3. Overdue invoices (open transactions older than 30 days — already filtered in query)
    transactions.forEach(t => {
      const days = daysUntil(t.transaction_date);
      if (days !== null && days < -30) {
        const label = t.transaction_type === 'receipt' ? 'Customer payment overdue' : 'Invoice unpaid';
        list.push({
          id: `txn-overdue-${t.id}`,
          type: 'warning',
          title: `${label} — ${t.party_name}`,
          description: `${Math.abs(days)} day(s) overdue • $${(t.amount ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
          href: '/accounting',
          timestamp: t.transaction_date,
        });
      }
    });

    // 4. Files stuck in delivery for >30 days
    files
      .filter(f => f.status === 'delivery')
      .forEach(f => {
        const days = daysUntil(f.created_at?.slice(0, 10) ?? null);
        if (days !== null && days < -30) {
          list.push({
            id: `delivery-long-${f.id}`,
            type: 'info',
            title: `Delivery pending — ${f.file_no}`,
            description: `In delivery for ${Math.abs(days)} day(s) • ${(f.customer as { name?: string } | null)?.name ?? ''}`,
            href: `/files/${f.id}`,
            timestamp: f.created_at?.slice(0, 10) ?? '',
          });
        }
      });

    // Sort: danger first, then warning, then info
    const order = { danger: 0, warning: 1, info: 2 };
    return list.sort((a, b) => order[a.type] - order[b.type]);
  }, [files, transactions]);

  return {
    notifications,
    count: notifications.length,
    dangerCount: notifications.filter(n => n.type === 'danger').length,
  };
}

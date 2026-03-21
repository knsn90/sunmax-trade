import { useMemo } from 'react';
import { useTradeFiles } from '@/hooks/useTradeFiles';
import { useTransactions } from '@/hooks/useTransactions';

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

export function useNotifications() {
  const { data: files = [] } = useTradeFiles();
  const { data: transactions = [] } = useTransactions();

  const notifications = useMemo<Notification[]>(() => {
    const list: Notification[] = [];

    // 1. ETA overdue
    files
      .filter(f => ['sale', 'delivery'].includes(f.status) && f.eta)
      .forEach(f => {
        const days = daysUntil(f.eta);
        if (days !== null && days < 0) {
          list.push({
            id: `eta-overdue-${f.id}`,
            type: 'danger',
            title: `ETA Overdue — ${f.file_no}`,
            description: `${Math.abs(days)} day(s) late • ${f.customer?.name ?? ''}`,
            href: `/files/${f.id}`,
            timestamp: f.eta!,
          });
        }
      });

    // 2. ETA approaching (within 7 days)
    files
      .filter(f => ['sale', 'delivery'].includes(f.status) && f.eta)
      .forEach(f => {
        const days = daysUntil(f.eta);
        if (days !== null && days >= 0 && days <= 7) {
          list.push({
            id: `eta-soon-${f.id}`,
            type: 'warning',
            title: `ETA Approaching — ${f.file_no}`,
            description: `${days === 0 ? 'Today' : `In ${days} day(s)`} • ${f.customer?.name ?? ''}`,
            href: `/files/${f.id}`,
            timestamp: f.eta!,
          });
        }
      });

    // 3. Overdue invoices (open transactions older than 30 days)
    transactions
      .filter(t => t.payment_status === 'open' && ['purchase_inv', 'svc_inv', 'receipt'].includes(t.transaction_type))
      .forEach(t => {
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
            description: `In delivery for ${Math.abs(days)} day(s) • ${f.customer?.name ?? ''}`,
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

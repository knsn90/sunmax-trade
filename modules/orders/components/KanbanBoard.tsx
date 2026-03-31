import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { WorkOrder, WorkOrderStatus } from '../types';
import { STATUS_CONFIG, isOrderOverdue, getNextStatus } from '../constants';
import { C } from '../../../core/theme/colors';
import { F } from '../../../core/theme/typography';

interface Props {
  orders: WorkOrder[];
  userGroup: '(lab)' | '(doctor)' | '(admin)';
  onStatusAdvance?: (order: WorkOrder) => void;
}

const COLUMNS: WorkOrderStatus[] = [
  'alindi',
  'uretimde',
  'kalite_kontrol',
  'teslim_edildi',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_PALETTE = ['#6C63FF', '#FF6B9D', '#00C9A7', '#F59E0B', '#3B82F6', '#EF4444'];

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xff;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function getInitials(name: string) {
  const p = name.trim().split(/\s+/);
  return p.length >= 2
    ? (p[0][0] + p[p.length - 1][0]).toUpperCase()
    : name.substring(0, 2).toUpperCase();
}

function dateLabel(deliveryDate: string, status: WorkOrderStatus): { text: string; color: string } {
  if (status === 'teslim_edildi') return { text: 'Teslim edildi', color: '#94A3B8' };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(deliveryDate + 'T00:00:00');
  const diff  = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  if (diff <  0) return { text: `${Math.abs(diff)}g gecikti`, color: '#EF4444' };
  if (diff === 0) return { text: 'Bugün',                     color: '#8B5CF6' };
  if (diff === 1) return { text: 'Yarın',                     color: '#F59E0B' };
  if (diff <=  3) return { text: `${diff} gün kaldı`,         color: '#F59E0B' };
  if (diff <=  7) return { text: `${diff} gün kaldı`,         color: '#6366F1' };
  return { text: due.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }), color: '#94A3B8' };
}

// ── Board ────────────────────────────────────────────────────────────────────

export function KanbanBoard({ orders, userGroup, onStatusAdvance }: Props) {
  const router = useRouter();

  const byStatus = COLUMNS.reduce<Record<WorkOrderStatus, WorkOrder[]>>(
    (acc, s) => { acc[s] = orders.filter((o) => o.status === s); return acc; },
    {} as Record<WorkOrderStatus, WorkOrder[]>
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.board}
    >
      {COLUMNS.map((status) => {
        const cfg = STATUS_CONFIG[status];
        const col = byStatus[status];
        return (
          <View key={status} style={styles.column}>

            {/* Column header */}
            <View style={styles.colHeader}>
              <Text style={styles.colTitle}>{cfg.label.toUpperCase()}</Text>
              <View style={[styles.colCountBadge, { backgroundColor: cfg.bgColor }]}>
                <Text style={[styles.colCount, { color: cfg.color }]}>{col.length}</Text>
              </View>
            </View>

            {/* Thin colored divider */}
            <View style={[styles.colDivider, { backgroundColor: cfg.color }]} />

            {/* Cards */}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.colCards}>
              {col.length === 0 ? (
                <View style={styles.emptyCol}>
                  <Text style={styles.emptyText}>Sipariş yok</Text>
                </View>
              ) : (
                col.map((order) => (
                  <KanbanCard
                    key={order.id}
                    order={order}
                    userGroup={userGroup}
                    status={status}
                    onPress={() => router.push(`/${userGroup}/order/${order.id}` as any)}
                    onAdvance={onStatusAdvance ? () => onStatusAdvance(order) : undefined}
                  />
                ))
              )}
            </ScrollView>
          </View>
        );
      })}
    </ScrollView>
  );
}

// ── Card — identical visual language to WorkOrderCard (list view) ─────────────

function KanbanCard({
  order,
  userGroup,
  status,
  onPress,
  onAdvance,
}: {
  order: WorkOrder;
  userGroup: string;
  status: WorkOrderStatus;
  onPress: () => void;
  onAdvance?: () => void;
}) {
  const overdue    = isOrderOverdue(order.delivery_date, order.status);
  const nextStatus = getNextStatus(order.status);
  const { text: dateText, color: dateColor } = dateLabel(order.delivery_date, order.status);
  const cfg = STATUS_CONFIG[status];

  const doctorName = order.doctor?.full_name ?? '';
  const initials   = doctorName ? getInitials(doctorName) : '??';
  const bgColor    = doctorName ? avatarColor(doctorName) : '#94A3B8';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.78} style={styles.card}>

      {/* Status dot + order number + urgent badge + status label */}
      <View style={styles.topMeta}>
        <View style={[styles.statusDot, { backgroundColor: overdue ? '#EF4444' : cfg.color }]} />
        <Text style={styles.orderNum}>{order.order_number}</Text>
        {order.is_urgent && (
          <View style={styles.urgentBadge}>
            <Text style={styles.urgentText}>ACİL</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <Text style={[styles.statusLabel, { color: overdue ? '#EF4444' : cfg.color }]}>
          {overdue ? 'Gecikti' : cfg.label}
        </Text>
      </View>

      {/* Work type — main title */}
      <Text style={styles.workType} numberOfLines={2}>{order.work_type}</Text>

      {/* Doctor */}
      {order.doctor && (
        <Text style={styles.doctorLine} numberOfLines={1}>{order.doctor.full_name}</Text>
      )}

      {/* Patient */}
      {order.patient_name ? (
        <Text style={styles.patientLine} numberOfLines={1}>{order.patient_name}</Text>
      ) : null}

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <View style={[styles.avatar, { backgroundColor: bgColor }]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          {order.tooth_numbers.length > 0 && (
            <Text style={styles.teethCount}>
              {order.tooth_numbers.slice(0, 3).join(', ')}
              {order.tooth_numbers.length > 3 ? ` +${order.tooth_numbers.length - 3}` : ''}
            </Text>
          )}
        </View>
        <Text style={[styles.dateText, { color: overdue ? '#EF4444' : dateColor }]}>
          {dateText}
        </Text>
      </View>

      {/* Advance button */}
      {(userGroup === '(lab)' || userGroup === '(admin)') && nextStatus && onAdvance && (
        <TouchableOpacity
          style={styles.advanceBtn}
          onPress={(e) => { e.stopPropagation?.(); onAdvance(); }}
        >
          <Text style={styles.advanceBtnText}>
            {order.status === 'alindi' ? 'Başlat' : 'İlerlet →'}
          </Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const COL_WIDTH = 210;

const styles = StyleSheet.create({
  board: {
    padding: 12,
    gap: 10,
    alignItems: 'flex-start',
  },

  column: {
    width: COL_WIDTH,
    flexShrink: 0,
  },

  // Column header — centered uppercase
  colHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 8,
  },
  colTitle: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: F.bold,
    color: '#64748B',
    letterSpacing: 1.2,
  },
  colCountBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  colCount: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: F.bold,
  },

  colDivider: {
    height: 2,
    borderRadius: 1,
    marginBottom: 10,
    opacity: 0.45,
  },

  colCards: { gap: 7, paddingBottom: 20 },

  emptyCol: {
    alignItems: 'center',
    paddingVertical: 32,
    borderWidth: 1.5,
    borderColor: C.border,
    borderStyle: 'dashed',
    borderRadius: 14,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: F.regular,
    color: C.textMuted,
  },

  // ── Card — same language as WorkOrderCard ──
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    gap: 3,
    borderWidth: 1,
    borderColor: '#E8ECF2',
  },

  topMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  orderNum: {
    fontSize: 10,
    fontFamily: F.medium,
    fontWeight: '500',
    color: C.textMuted,
    letterSpacing: 0.2,
  },
  urgentBadge: {
    backgroundColor: '#FEF2F2',
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  urgentText: {
    fontSize: 8,
    fontWeight: '700',
    fontFamily: F.bold,
    color: '#EF4444',
    letterSpacing: 0.4,
  },
  statusLabel: {
    fontSize: 10,
    fontFamily: F.medium,
    fontWeight: '500',
  },

  workType: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: F.bold,
    color: '#0F172A',
    letterSpacing: -0.1,
    lineHeight: 16,
  },

  doctorLine: {
    fontSize: 11,
    fontFamily: F.regular,
    color: '#64748B',
  },
  patientLine: {
    fontSize: 10,
    fontFamily: F.regular,
    color: '#94A3B8',
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: F.bold,
    color: '#FFFFFF',
  },
  teethCount: {
    fontSize: 10,
    fontFamily: F.regular,
    color: '#94A3B8',
  },
  dateText: {
    fontSize: 10,
    fontFamily: F.medium,
    fontWeight: '500',
  },

  advanceBtn: {
    marginTop: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingVertical: 4,
    alignItems: 'center',
  },
  advanceBtnText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: F.semibold,
    color: '#475569',
  },
});

import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, useWindowDimensions, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useAuthStore } from '../../../core/store/authStore';
import { useTodayOrders } from '../../orders/hooks/useTodayOrders';
import { isOrderOverdue } from '../../orders/constants';
import { fetchTodayProvas } from '../../provas/api';
import { PROVA_TYPES } from '../../provas/types';
import { C } from '../../../core/theme/colors';
import { supabase } from '../../../core/api/supabase';

// ─── Lab accent (blue) ───────────────────────────────────────────────────────
const P = '#2563EB';

// ─── iOS System Colors ────────────────────────────────────────────────────────
const CLR = {
  blue:     '#007AFF',  blueBg:   '#EFF6FF',
  green:    '#34C759',  greenBg:  '#F0FFF4',
  orange:   '#FF9500',  orangeBg: '#FFF8F0',
  red:      '#FF3B30',  redBg:    '#FFF1F0',
  purple:   '#AF52DE',  purpleBg: '#F8F0FF',
  teal:     '#30B0C7',  tealBg:   '#E8FFFE',
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface TodayProva {
  id: string;
  prova_number: number;
  prova_type: string | null;
  scheduled_date: string | null;
  status: string;
  order_item_name: string | null;
  work_order: {
    id: string;
    order_number: string;
    patient_name: string | null;
    doctor?: { full_name: string; clinic_name?: string | null; clinic?: { name: string } | null };
  } | null;
}

interface MonthBar { month: string; count: number; }

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  alindi:          { label: 'Alındı',         color: '#6C6C70', bg: '#F4F4F8' },
  uretimde:        { label: 'Üretimde',        color: CLR.orange, bg: CLR.orangeBg },
  kalite_kontrol:  { label: 'Kalite Kontrol',  color: CLR.purple, bg: CLR.purpleBg },
  teslimata_hazir: { label: 'Teslimata Hazır', color: CLR.green,  bg: CLR.greenBg },
  teslim_edildi:   { label: 'Teslim Edildi',   color: '#AEAEB2',  bg: '#F4F4F8' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(date: string) {
  const d = new Date(date);
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

function todayStr() { return new Date().toISOString().split('T')[0]; }

// ─── StatusBadge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[status] ?? { label: status, color: '#6C6C70', bg: '#F4F4F8' };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, backgroundColor: c.bg, gap: 5 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.color }} />
      <Text style={{ fontSize: 11, fontWeight: '600', color: c.color }}>{c.label}</Text>
    </View>
  );
}

// ─── KpiCard ──────────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, color, bgColor }: {
  icon: string; label: string; value: number | string; color: string; bgColor: string;
}) {
  return (
    <View style={kc.card}>
      <View style={kc.top}>
        <View style={[kc.iconBox, { backgroundColor: bgColor }]}>
          <MaterialCommunityIcons name={icon as any} size={20} color={color} />
        </View>
      </View>
      <Text style={kc.value}>{value}</Text>
      <Text style={kc.label}>{label}</Text>
    </View>
  );
}
const kc = StyleSheet.create({
  card: {
    flex: 1, minWidth: 150, backgroundColor: '#FFFFFF',
    borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: '#F1F5F9',
    // @ts-ignore
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  top: { marginBottom: 14 },
  iconBox: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: 28, fontWeight: '800', color: '#1C1C1E', letterSpacing: -0.5, marginBottom: 2 },
  label: { fontSize: 13, fontWeight: '500', color: '#6C6C70' },
});

// ─── Card ─────────────────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[crd.wrap, style]}>{children}</View>;
}
function CardHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <View style={crd.header}>
      <View style={{ flex: 1 }}>
        <Text style={crd.title}>{title}</Text>
        {sub && <Text style={crd.sub}>{sub}</Text>}
      </View>
      {right}
    </View>
  );
}
const crd = StyleSheet.create({
  wrap: {
    backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: '#F1F5F9',
    // @ts-ignore
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  title: { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  sub: { fontSize: 12, color: '#AEAEB2', marginTop: 2 },
});

// ─── VerticalBarChart ─────────────────────────────────────────────────────────
function MonthlyChart({ data }: { data: MonthBar[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 150, gap: 10, paddingHorizontal: 20, paddingBottom: 16, paddingTop: 12 }}>
      {data.map((d, i) => {
        const pct = Math.max((d.count / max) * 100, 4);
        const isLast = i === data.length - 1;
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#1C1C1E', marginBottom: 6 }}>
              {d.count > 0 ? d.count : ''}
            </Text>
            <View style={{ width: '70%', height: '75%', justifyContent: 'flex-end', borderRadius: 10, backgroundColor: '#F8FAFC', overflow: 'hidden' }}>
              <View style={{ width: '100%', borderRadius: 10, backgroundColor: isLast ? P : `${P}40`, height: `${pct}%` as any }} />
            </View>
            <Text style={{ fontSize: 10, color: '#AEAEB2', marginTop: 8, fontWeight: '600' }}>{d.month}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────
function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={sh.row}>
      <Text style={sh.title}>{title}</Text>
      {action && (
        <TouchableOpacity onPress={onAction} style={sh.actionBtn}>
          <Text style={sh.action}>{action}</Text>
          <MaterialCommunityIcons name="chevron-right" size={14} color={P} />
        </TouchableOpacity>
      )}
    </View>
  );
}
const sh = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 8 },
  title: { fontSize: 11, fontWeight: '700', color: '#AEAEB2', textTransform: 'uppercase', letterSpacing: 0.8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  action: { fontSize: 13, color: P, fontWeight: '600' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export function LabDashboardScreen() {
  const router  = useRouter();
  const { profile } = useAuthStore();
  const { orders, loading, refetch } = useTodayOrders();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 769;

  const [provas, setProvas]               = useState<TodayProva[]>([]);
  const [provasLoading, setProvasLoading] = useState(true);
  const [monthly, setMonthly]             = useState<MonthBar[]>([]);
  const [allOrders, setAllOrders]         = useState<any[]>([]);
  const [refreshing, setRefreshing]       = useState(false);
  const [hovered, setHovered]             = useState<string | null>(null);

  const today         = todayStr();
  const overdueOrders = orders.filter(o => isOrderOverdue(o.delivery_date, o.status));
  const readyCount    = orders.filter(o => o.status === 'teslimata_hazir').length;
  const inProdCount   = orders.filter(o => o.status === 'uretimde').length;

  const loadExtra = async () => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    const { data } = await supabase
      .from('work_orders')
      .select('id, order_number, work_type, status, delivery_date, created_at, doctor:doctor_id(full_name)')
      .gte('created_at', sixMonthsAgo.toISOString())
      .order('created_at', { ascending: false });

    if (data) {
      setAllOrders(data.slice(0, 10));
      const monthNames = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
      const bars: MonthBar[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const y = d.getFullYear(), m = d.getMonth();
        const count = data.filter(o => {
          const c = new Date(o.created_at);
          return c.getFullYear() === y && c.getMonth() === m;
        }).length;
        bars.push({ month: monthNames[m], count });
      }
      setMonthly(bars);
    }
  };

  const loadProvas = async () => {
    setProvasLoading(true);
    const { data } = await fetchTodayProvas();
    setProvas((data as TodayProva[]) ?? []);
    setProvasLoading(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetch(), loadProvas(), loadExtra()]);
    setRefreshing(false);
  };

  useEffect(() => { loadProvas(); loadExtra(); }, []);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing || loading} onRefresh={handleRefresh} />}
      >
        {/* ── Header ── */}
        <View style={s.pageHeader}>
          <View>
            <Text style={s.greeting}>Merhaba, {profile?.full_name?.split(' ')[0]}</Text>
          </View>
          <TouchableOpacity style={s.refreshBtn} onPress={handleRefresh} activeOpacity={0.7}>
            <MaterialCommunityIcons name="refresh" size={16} color={P} />
          </TouchableOpacity>
        </View>

        {/* ── Overdue Alert ── */}
        {overdueOrders.length > 0 && (
          <TouchableOpacity
            style={s.alertCard}
            onPress={() => router.push('/(lab)/all-orders' as any)}
            activeOpacity={0.7}
          >
            <View style={s.alertIcon}>
              <MaterialCommunityIcons name="alert-circle" size={20} color={CLR.red} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.alertTitle}>{overdueOrders.length} geciken iş</Text>
              <Text style={s.alertSub}>Teslim tarihi geçmiş siparişler mevcut</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={18} color="#AEAEB2" />
          </TouchableOpacity>
        )}

        {/* ── KPI Cards ── */}
        <SectionHeader title="Bugün" />
        <View style={s.kpiRow}>
          <KpiCard icon="package-variant" label="Bugün Teslim" value={orders.length} color={P} bgColor={CLR.blueBg} />
          <KpiCard icon="check-circle-outline" label="Hazır" value={readyCount} color={CLR.green} bgColor={CLR.greenBg} />
          <KpiCard icon="cog-outline" label="Üretimde" value={inProdCount} color={CLR.orange} bgColor={CLR.orangeBg} />
          <KpiCard icon="clock-alert-outline" label="Geciken" value={overdueOrders.length} color={overdueOrders.length > 0 ? CLR.red : '#AEAEB2'} bgColor={overdueOrders.length > 0 ? CLR.redBg : '#F8FAFC'} />
        </View>

        {/* ── Charts ── */}
        <SectionHeader title="İş Akışı" />
        <View style={[s.chartsRow, isDesktop && s.chartsRowDesktop]}>
          <Card style={isDesktop ? { flex: 2 } : {}}>
            <CardHeader title="Aylık Trend" sub="Son 6 ay" />
            {monthly.length > 0
              ? <MonthlyChart data={monthly} />
              : <View style={{ height: 150, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#AEAEB2', fontSize: 13 }}>Yükleniyor...</Text>
                </View>
            }
          </Card>

          <Card style={isDesktop ? { flex: 1 } : {}}>
            <CardHeader title="Statü Dağılımı" />
            <View style={{ padding: 20, gap: 10 }}>
              {Object.entries(STATUS_CFG).map(([key, cfg]) => {
                const count = allOrders.filter(o => o.status === key).length;
                const total = allOrders.length || 1;
                const pct   = Math.round((count / total) * 100);
                return (
                  <View key={key}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cfg.color, marginRight: 8 }} />
                      <Text style={{ flex: 1, fontSize: 13, color: '#6C6C70' }}>{cfg.label}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#1C1C1E' }}>{count}</Text>
                    </View>
                    <View style={{ height: 5, backgroundColor: '#F8FAFC', borderRadius: 3, overflow: 'hidden' }}>
                      <View style={{ height: 5, borderRadius: 3, backgroundColor: cfg.color, width: `${pct}%` as any }} />
                    </View>
                  </View>
                );
              })}
            </View>
          </Card>
        </View>

        {/* ── Today's Provas ── */}
        {(provas.length > 0 || provasLoading) && (
          <>
            <SectionHeader title="Bugünün Provaları" />
            <Card style={{ marginBottom: 20 }}>
              <CardHeader
                title="Provalar"
                right={
                  <View style={{ backgroundColor: P, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, minWidth: 26, alignItems: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{provas.length}</Text>
                  </View>
                }
              />
              {provasLoading
                ? <Text style={s.loadingText}>Yükleniyor...</Text>
                : provas.map((p, idx) => {
                    const typeCfg = PROVA_TYPES.find(t => t.value === p.prova_type);
                    const isLast = idx === provas.length - 1;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[s.tableRow, !isLast && s.tableRowBorder]}
                        onPress={() => p.work_order && router.push(`/(lab)/order/${p.work_order.id}` as any)}
                      >
                        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: CLR.blueBg, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 16 }}>{typeCfg?.emoji ?? '🦷'}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.cellMain}>
                            {p.work_order?.order_number ?? '—'}
                            {p.work_order?.patient_name ? ` · ${p.work_order.patient_name}` : ''}
                          </Text>
                          <Text style={s.cellSub}>
                            {typeCfg?.label ?? 'Prova'} #{p.prova_number}
                            {p.order_item_name ? ` — ${p.order_item_name}` : ''}
                          </Text>
                        </View>
                        <StatusBadge status={p.status} />
                      </TouchableOpacity>
                    );
                  })
              }
            </Card>
          </>
        )}

        {/* ── Recent Orders — Transactions style ── */}
        <SectionHeader
          title="Son İşler"
          action="Tümünü Gör"
          onAction={() => router.push('/(lab)/all-orders' as any)}
        />
        <Card>
          {/* Table header */}
          <View style={s.tableHead}>
            <Text style={[s.thCell, { flex: 2 }]}>Sipariş No</Text>
            {isDesktop && <Text style={[s.thCell, { flex: 2 }]}>Hekim</Text>}
            <Text style={[s.thCell, { flex: 2 }]}>İş Tipi</Text>
            <Text style={[s.thCell, { flex: 1.2 }]}>Statü</Text>
            {isDesktop && <Text style={[s.thCell, { flex: 0.8, textAlign: 'right' }]}>Teslim</Text>}
          </View>

          {allOrders.length === 0
            ? <Text style={s.loadingText}>Yükleniyor...</Text>
            : allOrders.map((order, idx) => {
                const overdue = order.delivery_date < today && order.status !== 'teslim_edildi';
                const isLast = idx === allOrders.length - 1;
                return (
                  <TouchableOpacity
                    key={order.id}
                    style={[s.tableRow, !isLast && s.tableRowBorder, hovered === order.id && s.tableRowHover]}
                    onPress={() => router.push(`/(lab)/order/${order.id}` as any)}
                    // @ts-ignore
                    onMouseEnter={() => setHovered(order.id)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: STATUS_CFG[order.status]?.color ?? '#AEAEB2' }} />
                      <Text style={s.cellMain} numberOfLines={1}>{order.order_number}</Text>
                    </View>
                    {isDesktop && (
                      <Text style={[s.cellSub, { flex: 2 }]} numberOfLines={1}>
                        {(order.doctor as any)?.full_name ?? '—'}
                      </Text>
                    )}
                    <Text style={[s.cellSub, { flex: 2 }]} numberOfLines={1}>{order.work_type}</Text>
                    <View style={{ flex: 1.2 }}>
                      <StatusBadge status={order.status} />
                    </View>
                    {isDesktop && (
                      <Text style={[s.cellDate, { flex: 0.8, textAlign: 'right' }, overdue && s.cellDateOverdue]}>
                        {fmtDate(order.delivery_date)}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })
          }
        </Card>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { padding: 24, paddingBottom: 40 },

  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greeting: { fontSize: 14, color: '#AEAEB2', fontWeight: '500' },
  refreshBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#F8FAFC',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#F1F5F9',
  },

  // Alert
  alertCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, gap: 14,
    marginBottom: 20, borderWidth: 1, borderColor: `${CLR.red}22`,
    // @ts-ignore
    boxShadow: '0 1px 3px rgba(255,59,48,0.08)',
  },
  alertIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: CLR.redBg,
    alignItems: 'center', justifyContent: 'center',
  },
  alertTitle: { fontSize: 14, fontWeight: '700', color: '#1C1C1E' },
  alertSub:   { fontSize: 12, color: '#AEAEB2', marginTop: 2 },

  // KPI
  kpiRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 24 },

  // Charts
  chartsRow:        { gap: 16, marginBottom: 20 },
  chartsRowDesktop: { flexDirection: 'row' },

  // Table
  tableHead: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    backgroundColor: '#FAFBFC',
  },
  thCell: { fontSize: 11, fontWeight: '700', color: '#AEAEB2', textTransform: 'uppercase', letterSpacing: 0.5 },

  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14, gap: 10,
  },
  tableRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  tableRowHover:  { backgroundColor: '#FAFBFC' },

  cellMain: { fontSize: 13, fontWeight: '700', color: '#1C1C1E' },
  cellSub:  { fontSize: 12, color: '#6C6C70' },
  cellDate: { fontSize: 12, color: '#AEAEB2', fontWeight: '500' },
  cellDateOverdue: { color: CLR.red, fontWeight: '700' },

  loadingText: { fontSize: 13, color: '#AEAEB2', padding: 20, textAlign: 'center' },
});

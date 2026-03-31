import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  Platform,
  TextInput,
} from 'react-native';
import { Slot, usePathname, useRouter } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useOrders } from '../../modules/orders/hooks/useOrders';

// ─── Tokens ───────────────────────────────────────────────────────────────────
const C = {
  primary:       '#2563EB',
  primaryLight:  '#EFF6FF',
  bg:            '#FFFFFF',
  surface:       '#FFFFFF',
  border:        '#F1F5F9',
  borderMid:     '#E2E8F0',
  textPrimary:   '#0F172A',
  textSecondary: '#64748B',
  textMuted:     '#94A3B8',
  danger:        '#DC2626',
  dangerBg:      '#FEF2F2',
  navHover:      '#EFF6FF',
  tooltipBg:     '#1E293B',
  // keep old aliases used by other files
  background:    '#FFFFFF',
  statsBg:       '#F8FAFC',
  logoutHover:   '#FEF2F2',
};

const SIDEBAR_W = 224;
const RIGHT_W   = 272;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface NavItem {
  label: string;
  emoji: string;                   // fallback (still required for mobile tabs)
  href: string;
  matchPrefix?: boolean;
  badge?: boolean;
  iconName?: string;               // MaterialCommunityIcons name
  iconSet?: 'ionicons' | 'mci';   // mci = MaterialCommunityIcons
  subtitle?: string;               // shown in top header when this page is active
}

interface Props {
  navItems: NavItem[];
  accentColor?: string;
}

function getInitials(name?: string | null) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function NavIcon({ item, active, color }: { item: NavItem; active: boolean; color: string }) {
  const iconColor = active ? '#FFFFFF' : C.textMuted;
  const size = 18;
  if (item.iconName) {
    return <MaterialCommunityIcons name={item.iconName as any} size={size} color={iconColor} />;
  }
  return <Text style={[s.navEmoji, active && s.navEmojiActive]}>{item.emoji}</Text>;
}

// ─── Right panel ──────────────────────────────────────────────────────────────
function RightPanel({ accentColor, profile }: {
  accentColor: string;
  profile: any;
}) {
  const isManager    = profile?.user_type === 'lab' && profile?.role === 'manager';
  const isTechnician = profile?.user_type === 'lab' && profile?.role === 'technician';
  const { orders } = useOrders('lab');

  const myOrders = isTechnician && profile?.id
    ? orders.filter((o: any) => o.assigned_to === profile.id)
    : orders;

  const today      = new Date().toISOString().split('T')[0];
  const active     = myOrders.filter((o: any) => o.status === 'uretimde').length;
  const overdue    = myOrders.filter((o: any) => o.delivery_date < today && o.status !== 'teslim_edildi').length;
  const unassigned = isManager ? orders.filter((o: any) => o.status === 'alindi' && !o.assigned_to).length : 0;
  const kk         = myOrders.filter((o: any) => o.status === 'kalite_kontrol').length;

  const stats = [
    { label: 'Toplam',                          value: myOrders.length, alert: false },
    { label: 'Üretimde',                        value: active,          alert: false },
    { label: 'Geciken',                         value: overdue,         alert: overdue > 0 },
    isManager
      ? { label: 'Atanmamış', value: unassigned, alert: unassigned > 0 }
      : { label: 'KK',        value: kk,         alert: false },
  ];

  const pending = [...myOrders]
    .filter((o: any) => o.status !== 'teslim_edildi')
    .sort((a: any, b: any) => a.delivery_date.localeCompare(b.delivery_date))
    .slice(0, 8);

  const STATUS_COLOR: Record<string, string> = {
    alindi:          '#CBD5E1',
    uretimde:        '#60A5FA',
    kalite_kontrol:  '#A78BFA',
    teslimata_hazir: '#34D399',
    teslim_edildi:   '#6EE7B7',
  };

  const initials  = profile?.full_name
    ? profile.full_name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';
  const fullName  = profile?.full_name ?? 'Kullanıcı';
  const roleLabel = profile?.role === 'manager'    ? 'Mesul Müdür'
                  : profile?.role === 'technician' ? 'Teknisyen'
                  : profile?.user_type === 'lab'   ? 'Lab'
                  : profile?.user_type ?? 'Kullanıcı';

  function daysUntil(deliveryDate: string) {
    const d    = new Date(deliveryDate + 'T00:00:00');
    const t    = new Date(); t.setHours(0, 0, 0, 0);
    const diff = Math.ceil((d.getTime() - t.getTime()) / 86_400_000);
    if (diff <  0) return { text: `${Math.abs(diff)}g geç`, overdue: true };
    if (diff === 0) return { text: 'Bugün',                  overdue: false };
    if (diff === 1) return { text: 'Yarın',                  overdue: false };
    return           { text: `${diff} gün`,                  overdue: false };
  }

  return (
    <View style={rp.panel}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={rp.scroll}>

        {/* ── Profile ── */}
        <View style={rp.profileRow}>
          <View style={[rp.avatar, { backgroundColor: accentColor }]}>
            <Text style={rp.avatarText}>{initials}</Text>
          </View>
          <View style={rp.profileMeta}>
            <Text style={rp.profileName} numberOfLines={1}>{fullName}</Text>
            <Text style={rp.roleLabel}>{roleLabel}</Text>
          </View>
        </View>

        <View style={rp.divider} />

        {/* ── Stats row ── */}
        <View style={rp.statsRow}>
          {stats.map((st, i) => (
            <View key={st.label} style={[rp.statCell, i < stats.length - 1 && rp.statCellBorder]}>
              <Text style={[rp.statValue, st.alert && rp.statValueAlert]}>{st.value}</Text>
              <Text style={rp.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>

        <View style={rp.divider} />

        {/* ── Active orders ── */}
        <Text style={rp.sectionTitle}>
          {isTechnician ? 'İşlerim' : 'Aktif İşler'}
        </Text>

        {pending.length === 0 ? (
          <Text style={rp.emptyText}>Aktif iş bulunmuyor</Text>
        ) : (
          pending.map((order: any, idx: number) => {
            const { text, overdue: isOverdue } = daysUntil(order.delivery_date);
            return (
              <View key={order.id} style={[rp.orderRow, idx < pending.length - 1 && rp.orderRowBorder]}>
                <View style={[rp.statusDot, { backgroundColor: STATUS_COLOR[order.status] ?? '#CBD5E1' }]} />
                <View style={rp.orderInfo}>
                  <Text style={rp.orderType} numberOfLines={1}>{order.work_type}</Text>
                  <Text style={rp.orderNum}>{order.order_number}</Text>
                </View>
                <Text style={[rp.dateText, isOverdue && rp.dateTextAlert]}>{text}</Text>
              </View>
            );
          })
        )}

      </ScrollView>
    </View>
  );
}

const rp = StyleSheet.create({
  panel: {
    width: RIGHT_W,
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 1,
    borderLeftColor: '#F1F5F9',
  },
  scroll: {
    paddingTop: 20,
    paddingBottom: 32,
  },

  // Profile
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    gap: 12,
    marginBottom: 18,
  },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  profileMeta: { flex: 1 },
  profileName: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  roleLabel:   { fontSize: 11, color: '#94A3B8', marginTop: 1 },

  // Divider
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginBottom: 18,
  },

  // Stats row (4 cells inline)
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    marginBottom: 18,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
  },
  statCellBorder: {
    borderRightWidth: 1,
    borderRightColor: '#F1F5F9',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  statValueAlert: {
    color: '#DC2626',
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 2,
  },

  // Section title
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 18,
    marginBottom: 4,
  },

  // Order rows — flat list, no cards
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    gap: 10,
  },
  orderRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginTop: 1 },
  orderInfo: { flex: 1 },
  orderType: { fontSize: 12, fontWeight: '600', color: '#1E293B' },
  orderNum:  { fontSize: 10, color: '#94A3B8', marginTop: 1 },
  dateText:  { fontSize: 11, color: '#64748B', fontWeight: '500' },
  dateTextAlert: { color: '#DC2626', fontWeight: '700' },

  // Empty
  emptyText: {
    fontSize: 12,
    color: '#94A3B8',
    paddingHorizontal: 18,
    paddingTop: 8,
  },
});

// ─── Shell ────────────────────────────────────────────────────────────────────
export function DesktopShell({ navItems, accentColor = C.primary }: Props) {
  const router   = useRouter();
  const pathname = usePathname();
  const { profile, signOut } = useAuthStore();
  const { width } = useWindowDimensions();

  const [hovered, setHovered] = useState<string | null>(null);
  const [search, setSearch]   = useState('');

  const initials  = getInitials(profile?.full_name);
  const firstName = profile?.full_name?.split(' ')[0] ?? 'Kullanıcı';
  const fullName  = profile?.full_name ?? 'Kullanıcı';

  // expo-router strips route groups from pathname: '/(lab)/new-order' → '/new-order'
  const normalizeHref = (href: string) => href.replace(/^\/\([^)]+\)/, '') || '/';

  const isActive = (item: NavItem) => {
    const h = normalizeHref(item.href);
    return item.matchPrefix
      ? pathname.startsWith(h)
      : pathname === h || pathname === h + '/';
  };

  // Right panel on all pages except dashboard
  const isDashboard = pathname === '/' || pathname === '';
  const showRight = width >= 1200 && !isDashboard;

  // Current page label + subtitle for header
  const activeItem   = navItems.find(n => isActive(n));
  const activeLabel  = activeItem?.label    ?? 'Dashboard';
  const activeSubtitle = activeItem?.subtitle ?? null;

  return (
    <View style={s.shell}>

      {/* ── Sidebar ── */}
      <View style={s.sidebar}>
        {/* Logo */}
        <View style={s.logoRow}>
          <View style={[s.logoIcon, { backgroundColor: accentColor }]}>
            <Text style={s.logoEmoji}>🦷</Text>
          </View>
          <Text style={[s.logoText, { color: accentColor }]}>DENTAL LAB</Text>
        </View>

        {/* Nav items */}
        <ScrollView style={s.navScroll} showsVerticalScrollIndicator={false}>
          {navItems.map(item => {
            const active = isActive(item);
            const hover  = hovered === item.href;
            return (
              <TouchableOpacity
                key={item.href}
                style={[
                  s.navItem,
                  active && [s.navItemActive, { backgroundColor: accentColor }],
                  !active && hover && s.navItemHover,
                ]}
                onPress={() => router.push(item.href as any)}
                // @ts-ignore
                onMouseEnter={() => setHovered(item.href)}
                onMouseLeave={() => setHovered(null)}
                accessibilityLabel={item.label}
              >
                <NavIcon item={item} active={active} color={accentColor} />
                <Text style={[s.navLabel, active && s.navLabelActive]}>{item.label}</Text>
                {item.badge && (
                  <View style={[s.navBadge, { backgroundColor: active ? '#fff' : accentColor }]} />
                )}
              </TouchableOpacity>
            );
          })}

          {/* Logout */}
          <TouchableOpacity
            style={[s.navItem, hovered === '__out' && s.navItemLogout]}
            onPress={signOut}
            // @ts-ignore
            onMouseEnter={() => setHovered('__out')}
            onMouseLeave={() => setHovered(null)}
          >
            <MaterialCommunityIcons name="logout" size={18} color={hovered === '__out' ? C.danger : C.textMuted} />
            <Text style={[s.navLabel, hovered === '__out' && { color: C.danger }]}>Çıkış Yap</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* User card */}
        <View style={s.userCard}>
          <View style={[s.userAvatar, { backgroundColor: accentColor }]}>
            <Text style={s.userAvatarText}>{initials}</Text>
          </View>
          <View style={s.userInfo}>
            <Text style={s.userName} numberOfLines={1}>{firstName}</Text>
            <Text style={s.userRole} numberOfLines={1}>
              {(profile as any)?.role ?? (profile as any)?.user_type ?? 'Kullanıcı'}
            </Text>
          </View>
          <Text style={s.userChevron}>▾</Text>
        </View>
      </View>

      {/* ── Main ── */}
      <View style={s.main}>
        {/* Top header */}
        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>{activeLabel}</Text>
            {activeSubtitle && (
              <Text style={s.headerSubtitle}>{activeSubtitle}</Text>
            )}
          </View>
          <View style={s.headerRight}>
            <View style={s.searchBar}>
              <MaterialCommunityIcons name="magnify" size={14} color={C.textMuted} />
              <TextInput
                style={s.searchInput}
                placeholder="Sipariş ara..."
                placeholderTextColor={C.textMuted}
                value={search}
                onChangeText={setSearch}
              />
            </View>
            <TouchableOpacity style={s.iconBtn}>
              <MaterialCommunityIcons name="bell-outline" size={18} color={C.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Page content */}
        <View style={s.page}>
          <Slot />
        </View>
      </View>

      {/* ── Right panel ── */}
      {showRight && (
        <RightPanel
          accentColor={accentColor}
          profile={profile}
        />
      )}
    </View>
  );
}

// ─── useIsDesktop ─────────────────────────────────────────────────────────────
export function useIsDesktop() {
  const { width } = useWindowDimensions();
  return width >= 769;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  shell: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: C.bg,
  },

  /* Sidebar */
  sidebar: {
    width: SIDEBAR_W,
    backgroundColor: C.surface,
    flexDirection: 'column',
    paddingTop: 20,
    borderRightWidth: 1,
    borderRightColor: C.border,
    // @ts-ignore
    boxShadow: '1px 0 6px rgba(0,0,0,0.04)',
    zIndex: 20,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    marginBottom: 24,
    gap: 10,
  },
  logoIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoEmoji: { fontSize: 17 },
  logoText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },

  navScroll: { flex: 1, paddingHorizontal: 10 },

  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 2,
    gap: 10,
  },
  navItemActive: {},   // backgroundColor set inline
  navItemHover:  { backgroundColor: C.navHover },
  navItemLogout: { backgroundColor: C.dangerBg },

  navEmoji:      { fontSize: 16, opacity: 0.4, width: 20, textAlign: 'center' },
  navEmojiActive:{ opacity: 1 },
  navLabel:      { flex: 1, fontSize: 13, fontWeight: '500', color: C.textSecondary },
  navLabelActive:{ color: '#FFFFFF', fontWeight: '700' },
  navBadge:      { width: 7, height: 7, borderRadius: 4 },

  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: C.border,
    gap: 10,
  },
  userAvatar: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  userAvatarText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  userInfo: { flex: 1 },
  userName:  { fontSize: 13, fontWeight: '700', color: C.textPrimary },
  userRole:  { fontSize: 11, color: C.textMuted, textTransform: 'capitalize' },
  userChevron: { fontSize: 11, color: C.textMuted },

  /* Main */
  main: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: C.bg,
    overflow: 'hidden',
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 14,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    // @ts-ignore
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: C.textPrimary,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: C.textMuted,
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.borderMid,
    paddingHorizontal: 12,
    paddingVertical: 8,
    width: 210,
    gap: 8,
  },
  searchInput: {
    flex: 1, fontSize: 13, color: C.textPrimary,
    // @ts-ignore
    outlineStyle: 'none',
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.bg,
    borderWidth: 1, borderColor: C.borderMid,
  },

  /* Page */
  page: { flex: 1 },
});

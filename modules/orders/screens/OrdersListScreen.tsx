import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useOrders } from '../hooks/useOrders';
import { WorkOrderCard } from '../components/WorkOrderCard';
import { KanbanBoard } from '../components/KanbanBoard';
import { StatusUpdateModal } from '../components/StatusUpdateModal';
import { STATUS_CONFIG } from '../constants';
import { advanceOrderStatus } from '../api';
import { WorkOrder, WorkOrderStatus } from '../types';
import { useAuthStore } from '../../../core/store/authStore';
import { C } from '../../../core/theme/colors';
import { F } from '../../../core/theme/typography';
import { useAssignTechnician } from '../../admin/orders/hooks';

const STATUS_FILTERS: { value: WorkOrderStatus | 'all'; label: string }[] = [
  { value: 'all',              label: 'Tümü' },
  { value: 'alindi',           label: 'Alındı' },
  { value: 'uretimde',         label: 'Üretimde' },
  { value: 'kalite_kontrol',   label: 'KK' },
  { value: 'teslimata_hazir',  label: 'Hazır' },
  { value: 'teslim_edildi',    label: 'Teslim' },
];

type ViewMode = 'kanban' | 'list';
type MachineFilter = 'all' | 'milling' | '3d_printing';

export function OrdersListScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const isTechnician = profile?.user_type === 'lab' && (profile as any)?.role === 'technician';
  const isManager = profile?.user_type === 'lab' && (profile as any)?.role === 'manager';
  const { orders, loading, refetch } = useOrders('lab');

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [statusFilter, setStatusFilter] = useState<WorkOrderStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Extra filters
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [machineFilter, setMachineFilter] = useState<MachineFilter>('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);

  const activeFilterCount = [urgentOnly, machineFilter !== 'all', overdueOnly].filter(Boolean).length;

  // Assignment (mesul müdür only)
  const [assignTarget, setAssignTarget] = useState<WorkOrder | null>(null);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const { technicians, loadingTechs, assigning, loadTechnicians, assign } =
    useAssignTechnician(refetch);

  // Teknisyenler sadece kendilerine atanan iş emirlerini görür
  const visibleOrders = useMemo(() => {
    if (isTechnician && profile?.id) {
      return orders.filter((o) => o.assigned_to === profile.id);
    }
    return orders;
  }, [orders, isTechnician, profile?.id]);

  const today = new Date().toISOString().split('T')[0];

  const filtered = useMemo(() => {
    return visibleOrders.filter((o) => {
      const matchStatus = statusFilter === 'all' || o.status === statusFilter;
      const searchLower = search.toLowerCase();
      const matchSearch =
        !search ||
        o.order_number.toLowerCase().includes(searchLower) ||
        (o.doctor?.full_name ?? '').toLowerCase().includes(searchLower) ||
        (o.doctor?.clinic?.name ?? '').toLowerCase().includes(searchLower) ||
        o.work_type.toLowerCase().includes(searchLower);
      const matchUrgent = !urgentOnly || o.is_urgent;
      const matchMachine = machineFilter === 'all' || o.machine_type === machineFilter;
      const matchOverdue = !overdueOnly || (o.delivery_date < today && o.status !== 'teslim_edildi');
      return matchStatus && matchSearch && matchUrgent && matchMachine && matchOverdue;
    });
  }, [visibleOrders, statusFilter, search, urgentOnly, machineFilter, overdueOnly, today]);

  const unassignedAlindi = useMemo(
    () => orders.filter((o) => o.status === 'alindi' && !o.assigned_to),
    [orders]
  );

  const handleStatusAdvance = (order: WorkOrder) => {
    setSelectedOrder(order);
    setModalVisible(true);
  };

  const handleStatusConfirm = async (newStatus: WorkOrderStatus, note: string) => {
    if (!selectedOrder || !profile) return;
    const { error } = await advanceOrderStatus(
      selectedOrder.id, newStatus, profile.id, note || undefined
    );
    if (error) Alert.alert('Hata', (error as any).message);
    else refetch();
    setModalVisible(false);
    setSelectedOrder(null);
  };

  const openAssignModal = (order: WorkOrder) => {
    setAssignTarget(order);
    setAssignModalVisible(true);
    loadTechnicians();
  };

  const handleAssign = async (techId: string) => {
    if (!assignTarget) return;
    try {
      await assign(assignTarget.id, techId);
      setAssignModalVisible(false);
      setAssignTarget(null);
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    }
  };

  const clearFilters = () => {
    setUrgentOnly(false);
    setMachineFilter('all');
    setOverdueOnly(false);
  };

  const pendingCount = visibleOrders.filter(o => o.status === 'alindi').length;

  return (
    <SafeAreaView style={s.safe}>

      {/* ── Unassigned Banner (manager only) ── */}
      {isManager && unassignedAlindi.length > 0 && (
        <View style={s.unassignedBanner}>
          <View style={s.bannerLeft}>
            <View style={s.bannerIconWrap}>
              <MaterialCommunityIcons name={'account-clock-outline' as any} size={16} color="#D97706" />
            </View>
            <Text style={s.bannerText} numberOfLines={1}>
              <Text style={s.bannerCount}>{unassignedAlindi.length}</Text>
              {' '}iş emri teknisyen bekliyor
            </Text>
          </View>
          <TouchableOpacity
            style={s.bannerBtn}
            onPress={() => { setStatusFilter('alindi'); setViewMode('list'); }}
            activeOpacity={0.75}
          >
            <Text style={s.bannerBtnText}>Göster</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Active filter chips ── */}
      {activeFilterCount > 0 && (
        <View style={s.activeFiltersRow}>
          {urgentOnly && (
            <View style={s.activeChip}>
              <MaterialCommunityIcons name={'lightning-bolt' as any} size={12} color="#B45309" />
              <Text style={s.activeChipText}>Acil</Text>
              <TouchableOpacity onPress={() => setUrgentOnly(false)}>
                <MaterialCommunityIcons name={'close' as any} size={12} color="#B45309" />
              </TouchableOpacity>
            </View>
          )}
          {machineFilter !== 'all' && (
            <View style={s.activeChip}>
              <MaterialCommunityIcons
                name={machineFilter === 'milling' ? 'cog-outline' as any : 'printer-3d' as any}
                size={12}
                color="#1D4ED8"
              />
              <Text style={[s.activeChipText, { color: '#1D4ED8' }]}>
                {machineFilter === 'milling' ? 'Frezeleme' : '3D Baskı'}
              </Text>
              <TouchableOpacity onPress={() => setMachineFilter('all')}>
                <MaterialCommunityIcons name={'close' as any} size={12} color="#1D4ED8" />
              </TouchableOpacity>
            </View>
          )}
          {overdueOnly && (
            <View style={[s.activeChip, s.activeChipDanger]}>
              <MaterialCommunityIcons name={'clock-alert-outline' as any} size={12} color="#DC2626" />
              <Text style={[s.activeChipText, { color: '#DC2626' }]}>Geciken</Text>
              <TouchableOpacity onPress={() => setOverdueOnly(false)}>
                <MaterialCommunityIcons name={'close' as any} size={12} color="#DC2626" />
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity onPress={clearFilters} style={s.clearFiltersBtn}>
            <Text style={s.clearFiltersText}>Temizle</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Toolbar: status tabs + fixed right actions ── */}
      <View style={s.toolbarRow}>
        {/* Status tab bar — only in list mode */}
        {viewMode === 'list' ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.statusTabsScroll}
            contentContainerStyle={s.statusTabsContent}
          >
            <View style={s.statusTabBar}>
              {STATUS_FILTERS.map((item) => {
                const active = statusFilter === item.value;
                return (
                  <TouchableOpacity
                    key={item.value}
                    onPress={() => setStatusFilter(item.value)}
                    style={[s.statusTab, active && s.statusTabActive]}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.statusTabText, active && s.statusTabTextActive]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }} />
        )}

        {/* Fixed right group — never shifts between modes */}
        <View style={s.rightGroup}>
          {/* iOS Segmented Control — view mode */}
          <View style={s.segControl}>
            <TouchableOpacity
              onPress={() => setViewMode('list')}
              style={[s.segBtn, viewMode === 'list' && s.segBtnActive]}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons
                name={'format-list-text' as any}
                size={16}
                color={viewMode === 'list' ? '#0F172A' : '#94A3B8'}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setViewMode('kanban')}
              style={[s.segBtn, viewMode === 'kanban' && s.segBtnActive]}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons
                name={'view-column' as any}
                size={16}
                color={viewMode === 'kanban' ? '#0F172A' : '#94A3B8'}
              />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <TouchableOpacity
            style={[s.iconBtn, (searchExpanded || search.length > 0) && s.iconBtnActive]}
            onPress={() => setSearchExpanded(!searchExpanded)}
            activeOpacity={0.75}
          >
            <MaterialCommunityIcons
              name={'magnify' as any}
              size={18}
              color={(searchExpanded || search.length > 0) ? '#0F172A' : '#94A3B8'}
            />
          </TouchableOpacity>

          {/* Filter */}
          <TouchableOpacity
            style={[s.iconBtn, activeFilterCount > 0 && s.iconBtnActive]}
            onPress={() => setFilterSheetVisible(true)}
            activeOpacity={0.75}
          >
            <MaterialCommunityIcons
              name={'tune-variant' as any}
              size={18}
              color={activeFilterCount > 0 ? '#0F172A' : '#94A3B8'}
            />
            {activeFilterCount > 0 && (
              <View style={s.filterBadge}>
                <Text style={s.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {viewMode !== 'kanban' && (searchExpanded || search.length > 0) && (
        <View style={s.searchRow}>
          <View style={[s.searchWrap, searchFocused && s.inputWrapFocused]}>
            <MaterialCommunityIcons
              name={'magnify' as any}
              size={17}
              color={searchFocused ? '#0F172A' : C.textMuted}
            />
            <TextInput
              style={s.searchInput}
              placeholder="Sipariş no, hekim, hasta, iş türü..."
              placeholderTextColor={C.textMuted}
              value={search}
              onChangeText={setSearch}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              autoFocus={searchExpanded && search.length === 0}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => { setSearch(''); setSearchExpanded(false); }}>
                <MaterialCommunityIcons name={'close-circle' as any} size={16} color={C.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* ── Content ── */}
      {viewMode === 'kanban' ? (
        <KanbanBoard
          orders={visibleOrders}
          userGroup="(lab)"
          onStatusAdvance={handleStatusAdvance}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.listContent}
          renderItem={({ item }) => (
            <WorkOrderCard
              order={item}
              onPress={() => router.push(`/(lab)/order/${item.id}`)}
              showDoctor
              onAssign={isManager && item.status === 'alindi' && !item.assigned_to
                ? () => openAssignModal(item)
                : undefined}
            />
          )}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} />}
          ListEmptyComponent={<EmptyState search={search} hasFilters={activeFilterCount > 0} />}
        />
      )}

      {/* ── Status Modal ── */}
      {selectedOrder && (
        <StatusUpdateModal
          visible={modalVisible}
          currentStatus={selectedOrder.status}
          onConfirm={handleStatusConfirm}
          onClose={() => { setModalVisible(false); setSelectedOrder(null); }}
        />
      )}

      {/* ── Filter Sheet ── */}
      <Modal
        visible={filterSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterSheetVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.filterSheet}>
            {/* Sheet header */}
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Filtrele</Text>
              {activeFilterCount > 0 && (
                <TouchableOpacity onPress={clearFilters}>
                  <Text style={s.sheetClear}>Temizle</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Acil */}
            <Text style={s.sheetSectionLabel}>Öncelik</Text>
            <View style={s.sheetOptions}>
              <TouchableOpacity
                style={[s.optionChip, !urgentOnly && s.optionChipActive]}
                onPress={() => setUrgentOnly(false)}
              >
                <Text style={[s.optionChipText, !urgentOnly && s.optionChipTextActive]}>Tümü</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.optionChip, urgentOnly && s.optionChipUrgent]}
                onPress={() => setUrgentOnly(true)}
              >
                <MaterialCommunityIcons
                  name={'lightning-bolt' as any}
                  size={13}
                  color={urgentOnly ? '#92400E' : C.textMuted}
                />
                <Text style={[s.optionChipText, urgentOnly && s.optionChipTextUrgent]}>Sadece Acil</Text>
              </TouchableOpacity>
            </View>

            {/* Makine tipi */}
            <Text style={s.sheetSectionLabel}>Makine Tipi</Text>
            <View style={s.sheetOptions}>
              {([
                { value: 'all',          label: 'Tümü',      icon: null },
                { value: 'milling',      label: 'Frezeleme', icon: 'cog-outline' },
                { value: '3d_printing',  label: '3D Baskı',  icon: 'printer-3d' },
              ] as const).map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[s.optionChip, machineFilter === opt.value && s.optionChipActive]}
                  onPress={() => setMachineFilter(opt.value)}
                >
                  {opt.icon && (
                    <MaterialCommunityIcons
                      name={opt.icon as any}
                      size={13}
                      color={machineFilter === opt.value ? C.primary : C.textMuted}
                    />
                  )}
                  <Text style={[s.optionChipText, machineFilter === opt.value && s.optionChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Geciken */}
            <Text style={s.sheetSectionLabel}>Teslimat</Text>
            <View style={s.sheetOptions}>
              <TouchableOpacity
                style={[s.optionChip, !overdueOnly && s.optionChipActive]}
                onPress={() => setOverdueOnly(false)}
              >
                <Text style={[s.optionChipText, !overdueOnly && s.optionChipTextActive]}>Tümü</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.optionChip, overdueOnly && s.optionChipDanger]}
                onPress={() => setOverdueOnly(true)}
              >
                <MaterialCommunityIcons
                  name={'clock-alert-outline' as any}
                  size={13}
                  color={overdueOnly ? '#DC2626' : C.textMuted}
                />
                <Text style={[s.optionChipText, overdueOnly && s.optionChipTextDanger]}>Sadece Geciken</Text>
              </TouchableOpacity>
            </View>

            {/* Apply */}
            <TouchableOpacity
              style={s.applyBtn}
              onPress={() => setFilterSheetVisible(false)}
            >
              <Text style={s.applyBtnText}>
                Uygula{activeFilterCount > 0 ? ` (${activeFilterCount} filtre)` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Assign Modal (manager only) ── */}
      <Modal
        visible={assignModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAssignModalVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Teknisyen Seç</Text>
              <TouchableOpacity onPress={() => { setAssignModalVisible(false); setAssignTarget(null); }}>
                <MaterialCommunityIcons name={'close' as any} size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>
            {assignTarget && (
              <Text style={s.modalSubtitle}>
                #{assignTarget.order_number} · {assignTarget.work_type}
              </Text>
            )}
            {loadingTechs ? (
              <ActivityIndicator style={{ padding: 32 }} color={C.primary} />
            ) : technicians.length === 0 ? (
              <Text style={s.noTechs}>Aktif teknisyen bulunamadı</Text>
            ) : (
              <FlatList
                data={technicians}
                keyExtractor={(t) => t.id}
                contentContainerStyle={{ paddingBottom: 16 }}
                renderItem={({ item: tech }) => (
                  <TouchableOpacity
                    style={s.techRow}
                    onPress={() => handleAssign(tech.id)}
                    disabled={assigning}
                  >
                    <View style={s.techAvatar}>
                      <Text style={s.techAvatarText}>
                        {tech.full_name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={s.techInfo}>
                      <Text style={s.techName}>{tech.full_name}</Text>
                      {tech.role && <Text style={s.techRole}>{tech.role}</Text>}
                    </View>
                    <MaterialCommunityIcons name={'chevron-right' as any} size={20} color={C.textMuted} />
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function EmptyState({ search, hasFilters }: { search: string; hasFilters: boolean }) {
  const noResults = search || hasFilters;
  return (
    <View style={s.empty}>
      <View style={s.emptyIconWrap}>
        <MaterialCommunityIcons
          name={noResults ? 'magnify-close' as any : 'clipboard-text-off-outline' as any}
          size={36}
          color={C.textMuted}
        />
      </View>
      <Text style={s.emptyTitle}>
        {noResults ? 'Sonuç bulunamadı' : 'Henüz iş emri yok'}
      </Text>
      <Text style={s.emptySub}>
        {noResults
          ? 'Arama veya filtre kriterlerini değiştirmeyi deneyin.'
          : 'Yeni bir iş emri oluşturulduğunda burada görünecek.'}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F0F2F7',
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    backgroundColor: '#F0F2F7',
  },
  headerLeft: { flex: 1 },
  title: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: F.bold,
    color: C.textPrimary,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: F.regular,
    color: C.textSecondary,
    marginTop: 2,
  },
  subtitleWarn: {
    color: C.warning,
    fontFamily: F.medium,
    fontWeight: '600',
  },

  // ── View mode tabs — expandable pill ──
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
    borderRadius: 100,
    padding: 3,
    gap: 2,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 100,
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    // @ts-ignore
    boxShadow: '0 1px 6px rgba(15,23,42,0.12)',
  },
  tabLabel: {
    fontSize: 13,
    fontFamily: F.semibold,
    fontWeight: '600',
    color: '#0F172A',
  },

  // ── Active filter chips row ──
  activeFiltersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
    backgroundColor: '#F0F2F7',
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  activeChipDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  activeChipText: {
    fontSize: 12,
    fontFamily: F.medium,
    fontWeight: '500',
    color: '#B45309',
  },
  clearFiltersBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  clearFiltersText: {
    fontSize: 12,
    fontFamily: F.medium,
    color: C.textMuted,
    textDecorationLine: 'underline',
  },

  // ── Toolbar row — fixed height so buttons never shift between modes ──
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    backgroundColor: '#F0F2F7',
  },

  // Fixed right actions — always same position
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingRight: 12,
    paddingLeft: 4,
  },

  // iOS Segmented Control — view mode toggle
  segControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
    padding: 2,
    gap: 1,
    marginRight: 4,
  },
  segBtn: {
    width: 32,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segBtnActive: {
    backgroundColor: '#FFFFFF',
    // @ts-ignore
    boxShadow: '0 1px 3px rgba(15,23,42,0.14)',
  },

  // Icon buttons (search, filter)
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnActive: {
    backgroundColor: '#E2E8F0',
  },

  // ── Search (expandable below toolbar) ──
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    backgroundColor: '#F0F2F7',
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    // @ts-ignore
    boxShadow: '0 1px 4px rgba(15,23,42,0.06)',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: F.regular,
    color: C.textPrimary,
  },
  inputWrapFocused: {
    // @ts-ignore
    boxShadow: '0 0 0 2px rgba(15,23,42,0.15)',
  },

  filterBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    fontSize: 8,
    fontFamily: F.bold,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ── Status tab bar — expandable pill ──
  statusTabsScroll: {
    flex: 1,
    backgroundColor: '#F0F2F7',
  },
  statusTabsContent: {
    paddingLeft: 16,
    paddingRight: 4,
    alignItems: 'center',
  },
  statusTabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
    borderRadius: 100,
    padding: 3,
    gap: 2,
  },
  statusTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 100,
  },
  statusTabActive: {
    backgroundColor: '#FFFFFF',
    // @ts-ignore
    boxShadow: '0 1px 6px rgba(15,23,42,0.12)',
  },
  statusTabText: {
    fontSize: 13,
    fontFamily: F.medium,
    fontWeight: '500',
    color: '#94A3B8',
  },
  statusTabTextActive: {
    fontSize: 13,
    fontFamily: F.semibold,
    fontWeight: '600',
    color: '#0F172A',
  },

  // ── Content ──
  listContent: {
    padding: 16,
    paddingTop: 14,
    gap: 10,
  },

  // ── Unassigned banner ──
  unassignedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 2,
    paddingHorizontal: 12,
    paddingVertical: 9,
    // @ts-ignore
    boxShadow: '0 1px 4px rgba(217,119,6,0.08)',
  },
  bannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  bannerIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerText: {
    fontSize: 13,
    fontFamily: F.medium,
    fontWeight: '500',
    color: '#92400E',
    flex: 1,
  },
  bannerCount: {
    fontFamily: F.bold,
    fontWeight: '700',
    color: '#D97706',
  },
  bannerBtn: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 20,
  },
  bannerBtnText: {
    fontSize: 12,
    fontFamily: F.semibold,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },

  // ── Assign button ──
  assignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#D97706',
    marginTop: -4,
    marginBottom: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  assignBtnText: {
    fontSize: 12,
    fontFamily: F.bold,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ── Empty state ──
  empty: {
    alignItems: 'center',
    paddingVertical: 64,
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    // @ts-ignore
    boxShadow: '0 2px 8px rgba(15,23,42,0.07)',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: F.bold,
    color: C.textPrimary,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 14,
    fontFamily: F.regular,
    color: C.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },

  // ── Filter sheet ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  filterSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 32,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: F.bold,
    color: C.textPrimary,
  },
  sheetClear: {
    fontSize: 13,
    fontFamily: F.medium,
    color: C.primary,
  },
  sheetSectionLabel: {
    fontSize: 12,
    fontFamily: F.semibold,
    fontWeight: '600',
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
  },
  sheetOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 8,
  },
  optionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  optionChipActive: {
    borderColor: C.primary,
    backgroundColor: C.primaryBg,
  },
  optionChipUrgent: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  optionChipDanger: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  optionChipText: {
    fontSize: 13,
    fontFamily: F.medium,
    fontWeight: '500',
    color: C.textSecondary,
  },
  optionChipTextActive: {
    color: C.primary,
    fontFamily: F.semibold,
    fontWeight: '600',
  },
  optionChipTextUrgent: {
    color: '#92400E',
    fontFamily: F.semibold,
    fontWeight: '600',
  },
  optionChipTextDanger: {
    color: '#DC2626',
    fontFamily: F.semibold,
    fontWeight: '600',
  },
  applyBtn: {
    marginHorizontal: 20,
    marginTop: 24,
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  applyBtnText: {
    fontSize: 15,
    fontFamily: F.bold,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ── Assign modal ──
  modalSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingTop: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: F.bold,
    color: C.textPrimary,
  },
  modalSubtitle: {
    fontSize: 13,
    fontFamily: F.regular,
    color: C.textSecondary,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
  },
  noTechs: {
    fontSize: 14,
    fontFamily: F.regular,
    color: C.textMuted,
    textAlign: 'center',
    padding: 32,
  },
  techRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 12,
  },
  techAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  techAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: F.bold,
    color: C.primary,
  },
  techInfo: { flex: 1 },
  techName: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: F.semibold,
    color: C.textPrimary,
  },
  techRole: {
    fontSize: 12,
    fontFamily: F.regular,
    color: C.textSecondary,
    marginTop: 2,
  },
});

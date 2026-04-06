import React from 'react';
import {
  View, Text, StyleSheet, FlatList,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { usePendingApprovals } from './hooks/usePendingApprovals';
import { ApprovalCard } from './components/ApprovalCard';
import { useAuthStore } from '../../core/store/authStore';
import { C } from '../../core/theme/colors';
import { F } from '../../core/theme/typography';

export function DesignApprovalsScreen() {
  const { profile } = useAuthStore();
  const { approvals, loading, refetch } = usePendingApprovals();
  const isAdmin = profile?.user_type === 'admin';

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={s.headerIcon}>
            <MaterialCommunityIcons name="draw-pen" size={20} color="#FFFFFF" />
          </View>
          <View>
            <Text style={s.headerTitle}>Tasarım Onayları</Text>
            <Text style={s.headerSub}>
              {loading
                ? 'Yükleniyor…'
                : approvals.length > 0
                  ? `${approvals.length} bekleyen onay`
                  : 'Bekleyen onay yok'}
            </Text>
          </View>
        </View>
        {isAdmin && (
          <View style={s.adminBadge}>
            <Text style={s.adminBadgeText}>Admin</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : approvals.length === 0 ? (
        <View style={s.empty}>
          <MaterialCommunityIcons name="check-all" size={52} color={C.success} />
          <Text style={s.emptyTitle}>Bekleyen Onay Yok</Text>
          <Text style={s.emptySub}>
            Tasarım adımı tamamlandığında onay istekleri burada görünür.
          </Text>
        </View>
      ) : (
        <FlatList
          data={approvals}
          keyExtractor={a => a.id}
          contentContainerStyle={s.list}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={refetch} />
          }
          renderItem={({ item }) => (
            <ApprovalCard
              approval={item}
              canApprove={isAdmin}
              onResolved={refetch}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', fontFamily: F.bold, color: '#0F172A' },
  headerSub: { fontSize: 12, fontFamily: F.regular, color: '#94A3B8', marginTop: 1 },

  adminBadge: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: '#0F172A',
  },
  adminBadgeText: { fontSize: 11, fontWeight: '700', fontFamily: F.bold, color: '#FFFFFF' },

  list: { padding: 16, gap: 12 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', fontFamily: F.bold, color: '#0F172A' },
  emptySub: {
    fontSize: 14, fontFamily: F.regular, color: '#94A3B8',
    textAlign: 'center', lineHeight: 20,
  },
});

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { PendingApprovalsScreen } from './PendingApprovalsScreen';
import { DesignApprovalsScreen } from './DesignApprovalsScreen';
import { usePendingApprovals as useDesignApprovals } from './hooks/usePendingApprovals';
import { C } from '../../core/theme/colors';
import { F } from '../../core/theme/typography';

type Tab = 'doctors' | 'design';

export function AdminApprovalsScreen() {
  const [tab, setTab]         = useState<Tab>('doctors');
  const { approvals }         = useDesignApprovals();
  const designPending         = approvals.length;

  return (
    <SafeAreaView style={s.safe}>
      {/* Tab bar */}
      <View style={s.tabs}>
        <TouchableOpacity
          style={[s.tab, tab === 'doctors' && s.tabActive]}
          onPress={() => setTab('doctors')}
        >
          <MaterialCommunityIcons
            name="account-clock-outline"
            size={16}
            color={tab === 'doctors' ? '#0F172A' : '#94A3B8'}
          />
          <Text style={[s.tabLabel, tab === 'doctors' && s.tabLabelActive]}>
            Hekim Kayıtları
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.tab, tab === 'design' && s.tabActive]}
          onPress={() => setTab('design')}
        >
          <MaterialCommunityIcons
            name="draw-pen"
            size={16}
            color={tab === 'design' ? '#0F172A' : '#94A3B8'}
          />
          <Text style={[s.tabLabel, tab === 'design' && s.tabLabelActive]}>
            Tasarım Onayları
          </Text>
          {designPending > 0 && (
            <View style={s.badge}>
              <Text style={s.badgeText}>{designPending}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={s.content}>
        {tab === 'doctors' ? (
          <PendingApprovalsScreen />
        ) : (
          <DesignApprovalsScreen />
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },

  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#0F172A',
  },
  tabLabel: {
    fontSize: 13,
    fontFamily: F.semibold,
    fontWeight: '600',
    color: '#94A3B8',
  },
  tabLabelActive: {
    color: '#0F172A',
  },
  badge: {
    backgroundColor: '#DC2626',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '700', fontFamily: F.bold, color: '#FFFFFF' },

  content: { flex: 1 },
});

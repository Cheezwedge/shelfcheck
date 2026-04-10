import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  StockStatus,
  STATUS_COLORS,
  STATUS_LABELS,
  formatTimeAgo,
} from '../../data';
import { fetchItems, fetchStoreName } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import type { LiveItem } from '../../lib/types';

const PRIMARY = '#1D9E75';

export default function HomeScreen() {
  const router = useRouter();
  const [items, setItems] = useState<LiveItem[]>([]);
  const [storeName, setStoreName] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [itemData, name] = await Promise.all([fetchItems(), fetchStoreName()]);
      setItems(itemData);
      setStoreName(name);
    } catch (e) {
      setError('Could not load inventory. Tap to retry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();

    // Realtime: re-fetch whenever any report is inserted so badges update live
    const channel = supabase
      .channel('reports-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reports' },
        () => load()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const filtered = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  const renderItem = ({ item }: { item: LiveItem }) => (
    <TouchableOpacity
      style={styles.itemCard}
      onPress={() => router.push(`/item/${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.itemLeft}>
        <Text style={styles.itemName}>{item.name}</Text>
        <View style={styles.itemMeta}>
          <Text style={styles.itemCategory}>{item.category}</Text>
          <Text style={styles.dot}>·</Text>
          <Ionicons name="time-outline" size={12} color="#9CA3AF" />
          <Text style={styles.itemTime}>{formatTimeAgo(item.lastReportedAt)}</Text>
        </View>
      </View>
      <View style={styles.itemRight}>
        <StatusBadge status={item.status} />
        <Ionicons name="chevron-forward" size={16} color="#D1D5DB" style={styles.chevron} />
      </View>
    </TouchableOpacity>
  );

  const inStock    = items.filter((i) => i.status === 'in-stock').length;
  const outOfStock = items.filter((i) => i.status === 'out-of-stock').length;
  const uncertain  = items.filter((i) => i.status === 'uncertain').length;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerLabel}>Checking inventory at</Text>
          <Text style={styles.storeName} numberOfLines={1}>
            {storeName || '…'}
          </Text>
        </View>
        <View style={styles.headerBadge}>
          <View style={[styles.liveDot, loading && styles.liveDotLoading]} />
          <Text style={styles.headerBadgeText}>{loading ? 'Syncing' : 'Live'}</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color="#9CA3AF" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search items…"
          placeholderTextColor="#9CA3AF"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Stats row */}
      {!loading && !error && (
        <View style={styles.statsRow}>
          <StatChip color="#1D9E75" label="In Stock"  count={inStock} />
          <StatChip color="#E53935" label="Out"        count={outOfStock} />
          <StatChip color="#F59E0B" label="Uncertain"  count={uncertain} />
        </View>
      )}

      {/* List / Loading / Error */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={PRIMARY} />
          <Text style={styles.loadingText}>Loading inventory…</Text>
        </View>
      ) : error ? (
        <TouchableOpacity style={styles.centered} onPress={load} activeOpacity={0.7}>
          <Ionicons name="cloud-offline-outline" size={42} color="#D1D5DB" />
          <Text style={styles.errorText}>{error}</Text>
          <View style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="search-outline" size={40} color="#D1D5DB" />
              <Text style={styles.emptyText}>No items match "{search}"</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function StatusBadge({ status }: { status: StockStatus }) {
  const color = STATUS_COLORS[status];
  const label = STATUS_LABELS[status];
  return (
    <View style={[styles.badge, { backgroundColor: color + '18', borderColor: color + '40' }]}>
      <View style={[styles.badgeDot, { backgroundColor: color }]} />
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function StatChip({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <View style={styles.statChip}>
      <View style={[styles.statDot, { backgroundColor: color }]} />
      <Text style={styles.statCount}>{count}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerLeft: {
    flex: 1,
    marginRight: 12,
  },
  headerLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
    marginBottom: 2,
  },
  storeName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 5,
    marginTop: 2,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: PRIMARY,
  },
  liveDotLoading: {
    backgroundColor: '#F59E0B',
  },
  headerBadgeText: {
    fontSize: 12,
    color: '#1D9E75',
    fontWeight: '700',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 5,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statCount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    justifyContent: 'space-between',
  },
  itemLeft: {
    flex: 1,
    marginRight: 12,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  itemCategory: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  dot: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  itemTime: {
    fontSize: 12,
    color: '#9CA3AF',
    marginLeft: 1,
  },
  itemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    gap: 4,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  chevron: {
    marginLeft: 2,
  },
  separator: {
    height: 8,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingBottom: 60,
  },
  loadingText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  errorText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  retryBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginTop: 4,
  },
  retryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
});

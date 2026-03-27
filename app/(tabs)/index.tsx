import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  StockStatus,
  STATUS_COLORS,
  STATUS_LABELS,
  formatTimeAgo,
} from '../../data';
import { fetchItems, fetchStoreName, DEFAULT_STORE_ID } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import type { LiveItem } from '../../lib/types';
import { getSavedStore, type SelectedStore } from '../../lib/stores';
import { getList, type GroceryListItem } from '../../lib/groceryList';
import StorePicker from '../../components/StorePicker';

const PRIMARY = '#1D9E75';

// Display item: merges Supabase LiveItem shape + grocery list metadata
type HomeItem = {
  id: string;           // Supabase item ID, empty string if no match
  name: string;
  category: string;
  status: StockStatus | null;
  lastReportedAt: string | null;
  onList: boolean;      // true when item is on the user's active grocery list
};

type HomeSection = { key: string; title: string; data: HomeItem[] };

function storeKey(store: SelectedStore | null): string {
  return store?.osmId ?? store?.name ?? '__default__';
}

export default function HomeScreen() {
  const router = useRouter();
  const [items, setItems] = useState<LiveItem[]>([]);
  const [storeName, setStoreName] = useState('');
  const [search, setSearch] = useState('');
  const [pickerVisible, setPickerVisible] = useState(false);
  const [selectedStore, setSelectedStore] = useState<SelectedStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listItems, setListItems] = useState<GroceryListItem[]>([]);

  const activeStoreId = selectedStore?.supabaseId ?? DEFAULT_STORE_ID;
  const activeStoreName = selectedStore?.name ?? null;
  const sk = storeKey(selectedStore);

  const load = useCallback(async () => {
    setError(null);
    try {
      const storeId = activeStoreId;
      if (activeStoreName && !selectedStore?.supabaseId) {
        // Store selected from map but not yet in our DB
        setItems([]);
        setStoreName(activeStoreName);
        setLoading(false);
        return;
      }
      const [itemData, name] = await Promise.all([
        fetchItems(storeId),
        fetchStoreName(storeId),
      ]);
      setItems(itemData);
      setStoreName(name);
    } catch (e) {
      setError('Could not load inventory. Tap to retry.');
    } finally {
      setLoading(false);
    }
  }, [activeStoreId, activeStoreName, selectedStore]);

  // Load saved store on mount
  useEffect(() => {
    const saved = getSavedStore();
    if (saved) setSelectedStore(saved);
  }, []);

  useEffect(() => {
    setLoading(true);
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

  // Reload grocery list whenever the selected store changes
  useEffect(() => {
    setListItems(getList(sk));
  }, [sk]);

  // Active (unchecked) grocery list items
  const listItemsActive = useMemo(
    () => listItems.filter((i) => !i.checked),
    [listItems]
  );

  // Names of items on the list (for filtering the "All Items" section)
  const listNameSet = useMemo(
    () => new Set(listItemsActive.map((i) => i.name.toLowerCase())),
    [listItemsActive]
  );

  // "My List" section: grocery list items merged with Supabase availability data
  const myListSection = useMemo((): HomeItem[] => {
    if (!listItemsActive.length) return [];
    return listItemsActive
      .filter((li) => !search || li.name.toLowerCase().includes(search.toLowerCase()))
      .map((li) => {
        const match = items.find((i) => i.name.toLowerCase() === li.name.toLowerCase());
        return {
          id: match?.id ?? '',
          name: li.name,
          category: li.category,
          status: match?.status ?? null,
          lastReportedAt: match?.lastReportedAt ?? null,
          onList: true,
        };
      });
  }, [listItemsActive, items, search]);

  // "All Items" section: Supabase items NOT on the grocery list
  const allItemsSection = useMemo((): HomeItem[] => {
    return items
      .filter((i) => !listNameSet.has(i.name.toLowerCase()))
      .filter((i) => !search || i.name.toLowerCase().includes(search.toLowerCase()))
      .map((i) => ({ ...i, onList: false }));
  }, [items, listNameSet, search]);

  const sections = useMemo((): HomeSection[] => {
    const s: HomeSection[] = [];
    if (myListSection.length > 0)
      s.push({ key: 'list', title: 'My List', data: myListSection });
    if (allItemsSection.length > 0)
      s.push({ key: 'all', title: listItemsActive.length > 0 ? 'All Items' : '', data: allItemsSection });
    return s;
  }, [myListSection, allItemsSection, listItemsActive]);

  const inStock    = items.filter((i) => i.status === 'in-stock').length;
  const outOfStock = items.filter((i) => i.status === 'out-of-stock').length;
  const uncertain  = items.filter((i) => i.status === 'uncertain').length;

  const noStoreSelected = !loading && !error && !activeStoreName;
  const noItemsYet = !loading && !error && !!activeStoreName && items.length === 0 && listItemsActive.length === 0;
  const searchEmpty = !loading && !error && !noItemsYet && search.length > 0 && sections.length === 0;

  // All items with an ID are reportable; grocery list items are always tappable
  const canReport = (item: HomeItem) => !!item.id || item.onList;

  const handleItemPress = (item: HomeItem) => {
    if (item.id) {
      router.push(`/report/${item.id}`);
    } else if (item.onList) {
      if (!selectedStore?.supabaseId) {
        Alert.alert(
          'Store not in database',
          `${selectedStore?.name ?? 'This store'} isn't in our database yet. Reports can only be submitted for stores we track.`,
          [{ text: 'OK' }]
        );
        return;
      }
      router.push({
        pathname: '/report/[id]',
        params: {
          id: 'new',
          name: item.name,
          category: item.category,
          storeId: selectedStore.supabaseId,
        },
      });
    }
  };

  const renderItem = ({ item }: { item: HomeItem }) => (
    <TouchableOpacity
      style={[styles.itemCard, item.onList && styles.itemCardOnList]}
      onPress={() => handleItemPress(item)}
      activeOpacity={canReport(item) ? 0.7 : 1}
    >
      <View style={styles.itemLeft}>
        {item.onList && (
          <View style={styles.onListRow}>
            <Ionicons name="cart" size={11} color={PRIMARY} />
            <Text style={styles.onListLabel}>On my list</Text>
          </View>
        )}
        <Text style={styles.itemName}>{item.name}</Text>
        <View style={styles.itemMeta}>
          <Text style={styles.itemCategory}>{item.category}</Text>
          {item.lastReportedAt && (
            <>
              <Text style={styles.dot}>·</Text>
              <Ionicons name="time-outline" size={12} color="#9CA3AF" />
              <Text style={styles.itemTime}>{formatTimeAgo(item.lastReportedAt)}</Text>
            </>
          )}
        </View>
      </View>
      <View style={styles.itemRight}>
        {item.status ? (
          <StatusBadge status={item.status} />
        ) : item.onList ? (
          <View style={styles.noDataBadge}>
            <Text style={styles.noDataText}>No data</Text>
          </View>
        ) : null}
        {canReport(item) ? (
          <Ionicons name="chevron-forward" size={16} color="#D1D5DB" style={styles.chevron} />
        ) : null}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <TouchableOpacity style={styles.header} onPress={() => setPickerVisible(true)} activeOpacity={0.75}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerLabel}>Checking inventory at</Text>
          <View style={styles.storeNameRow}>
            <Text style={styles.storeName} numberOfLines={1}>
              {storeName || '…'}
            </Text>
            <Ionicons name="chevron-down" size={16} color="#9CA3AF" style={{ marginTop: 2 }} />
          </View>
        </View>
        <View style={styles.headerBadge}>
          <View style={[styles.liveDot, loading && styles.liveDotLoading]} />
          <Text style={styles.headerBadgeText}>{loading ? 'Syncing' : 'Live'}</Text>
        </View>
      </TouchableOpacity>

      <StorePicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={(name, supabaseId) => {
          setSelectedStore({ name, supabaseId });
        }}
      />

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
      {!loading && !error && items.length > 0 && (
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
      ) : noStoreSelected ? (
        <TouchableOpacity style={styles.centered} onPress={() => setPickerVisible(true)} activeOpacity={0.8}>
          <Ionicons name="storefront-outline" size={48} color="#D1D5DB" />
          <Text style={styles.emptyStoreTitle}>No store selected</Text>
          <Text style={styles.emptyStoreSub}>Tap to find nearby grocery stores.</Text>
          <View style={styles.changeStoreBtn}>
            <Ionicons name="location-outline" size={15} color={PRIMARY} />
            <Text style={styles.changeStoreBtnText}>Find stores near me</Text>
          </View>
        </TouchableOpacity>
      ) : error ? (
        <TouchableOpacity style={styles.centered} onPress={load} activeOpacity={0.7}>
          <Ionicons name="cloud-offline-outline" size={42} color="#D1D5DB" />
          <Text style={styles.errorText}>{error}</Text>
          <View style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </View>
        </TouchableOpacity>
      ) : noItemsYet ? (
        <TouchableOpacity style={styles.centered} onPress={() => setPickerVisible(true)} activeOpacity={0.8}>
          <Ionicons name="storefront-outline" size={48} color="#D1D5DB" />
          <Text style={styles.emptyStoreTitle}>No items tracked yet</Text>
          <Text style={styles.emptyStoreSub}>
            Be the first to report stock at {activeStoreName}.
          </Text>
          <View style={styles.changeStoreBtn}>
            <Ionicons name="location-outline" size={15} color={PRIMARY} />
            <Text style={styles.changeStoreBtnText}>Choose a different store</Text>
          </View>
        </TouchableOpacity>
      ) : searchEmpty ? (
        <View style={styles.empty}>
          <Ionicons name="search-outline" size={40} color="#D1D5DB" />
          <Text style={styles.emptyText}>No items match "{search}"</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id || item.name}
          renderItem={renderItem}
          renderSectionHeader={({ section }) =>
            section.title ? (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
              </View>
            ) : null
          }
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          stickySectionHeadersEnabled={false}
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
  storeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  sectionHeader: {
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    justifyContent: 'space-between',
  },
  itemCardOnList: {
    borderLeftWidth: 3,
    borderLeftColor: PRIMARY,
    paddingLeft: 11,
  },
  onListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 2,
  },
  onListLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: PRIMARY,
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
  noDataBadge: {
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  noDataText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
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
  emptyStoreTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  emptyStoreSub: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 20,
  },
  changeStoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  changeStoreBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: PRIMARY,
  },
});

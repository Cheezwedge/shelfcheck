import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchItems, DEFAULT_STORE_ID } from '../../lib/api';
import { getSavedStore, type SelectedStore } from '../../lib/stores';
import { getSampleItems } from '../../lib/sampleItems';
import {
  getList,
  addItem,
  toggleItem,
  removeItem,
  reAddItem,
  clearHistory,
  type GroceryListItem,
} from '../../lib/groceryList';
import StorePicker from '../../components/StorePicker';
import type { LiveItem } from '../../lib/types';
import type { StockStatus } from '../../data';
import { STATUS_COLORS, STATUS_LABELS } from '../../data';

const PRIMARY = '#1D9E75';

// storeKey is supabaseId if available, else store name
function storeKey(store: SelectedStore | null): string {
  return store?.supabaseId ?? store?.name ?? '__default__';
}

export default function ListScreen() {
  const [selectedStore, setSelectedStore] = useState<SelectedStore | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [listItems, setListItems] = useState<GroceryListItem[]>([]);
  const [storeItems, setStoreItems] = useState<LiveItem[]>([]);
  const [storeItemsLoading, setStoreItemsLoading] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [historyOpen, setHistoryOpen] = useState(true);
  const addRef = useRef<TextInput>(null);

  const key = storeKey(selectedStore);

  // Load saved store on mount
  useEffect(() => {
    const saved = getSavedStore();
    if (saved) setSelectedStore(saved);
  }, []);

  // Reload list whenever store changes
  useEffect(() => {
    setListItems(getList(key));
  }, [key]);

  // Fetch store's Supabase items for stock status + catalog
  useEffect(() => {
    const sid = selectedStore?.supabaseId ?? DEFAULT_STORE_ID;
    if (!sid) return;
    setStoreItemsLoading(true);
    fetchItems(sid)
      .then(setStoreItems)
      .catch(() => setStoreItems([]))
      .finally(() => setStoreItemsLoading(false));
  }, [selectedStore]);

  const refresh = useCallback(() => setListItems(getList(key)), [key]);

  // Build stock-status lookup by name (lowercase)
  const statusByName = useMemo(() => {
    const m = new Map<string, StockStatus>();
    storeItems.forEach((i) => m.set(i.name.toLowerCase(), i.status));
    return m;
  }, [storeItems]);

  // Suggestions for the add-item search
  const allSuggestions = useMemo(() => {
    const chainKey = selectedStore?.supabaseId
      ? null // if has supabase ID, we show storeItems instead
      : null; // will be looked up below
    const samples = getSampleItems(null);
    // Merge: Supabase items first (real stock data), then sample items
    const supabaseNames = new Set(storeItems.map((i) => i.name.toLowerCase()));
    const merged = [
      ...storeItems.map((i) => ({ name: i.name, category: i.category, itemId: i.id })),
      ...samples
        .filter((s) => !supabaseNames.has(s.name.toLowerCase()))
        .map((s) => ({ name: s.name, category: s.category, itemId: null as string | null })),
    ];
    return merged;
  }, [storeItems, selectedStore]);

  // Get sample items for the current chain (used when no supabase items)
  const chainSuggestions = useMemo(() => {
    // Determine chain from store name
    if (storeItems.length > 0) return allSuggestions;
    if (!selectedStore) return getSampleItems(null).map((s) => ({ ...s, itemId: null as string | null }));
    // Try to get chain from CHAINS list by matching store name
    return getSampleItems(null).map((s) => ({ ...s, itemId: null as string | null }));
  }, [storeItems, selectedStore, allSuggestions]);

  const filteredSuggestions = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    if (!q) return chainSuggestions.slice(0, 10);
    return chainSuggestions.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 10);
  }, [addQuery, chainSuggestions]);

  const activeItems = listItems.filter((i) => !i.checked);
  const historyItems = listItems.filter((i) => i.checked);

  function handleAdd(name: string, category: string, itemId: string | null) {
    addItem(key, { name, category: category || 'General', itemId });
    setAddQuery('');
    refresh();
  }

  function handleAddCustom() {
    const name = addQuery.trim();
    if (!name) return;
    handleAdd(name, 'General', null);
  }

  function handleToggle(id: string) {
    toggleItem(key, id);
    refresh();
  }

  function handleRemove(id: string) {
    removeItem(key, id);
    refresh();
  }

  function handleReAdd(id: string) {
    reAddItem(key, id);
    refresh();
  }

  function handleClearHistory() {
    Alert.alert('Clear History', 'Remove all checked items from history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => { clearHistory(key); refresh(); },
      },
    ]);
  }

  function getStatus(item: GroceryListItem): StockStatus | null {
    return statusByName.get(item.name.toLowerCase()) ?? null;
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderActiveItem({ item }: { item: GroceryListItem }) {
    const status = getStatus(item);
    return (
      <View style={styles.listRow}>
        <TouchableOpacity onPress={() => handleToggle(item.id)} style={styles.checkbox} hitSlop={8}>
          <View style={styles.checkboxBox} />
        </TouchableOpacity>
        <View style={styles.rowInfo}>
          <Text style={styles.rowName}>{item.name}</Text>
          <Text style={styles.rowCategory}>{item.category}</Text>
        </View>
        {status ? (
          <StatusBadge status={status} />
        ) : (
          <View style={styles.unknownBadge}><Text style={styles.unknownText}>No data</Text></View>
        )}
        <TouchableOpacity onPress={() => handleRemove(item.id)} style={styles.iconBtn} hitSlop={8}>
          <Ionicons name="close" size={16} color="#9CA3AF" />
        </TouchableOpacity>
      </View>
    );
  }

  function renderHistoryItem({ item }: { item: GroceryListItem }) {
    const status = getStatus(item);
    return (
      <View style={[styles.listRow, styles.historyRow]}>
        <TouchableOpacity onPress={() => handleToggle(item.id)} style={styles.checkbox} hitSlop={8}>
          <View style={styles.checkboxBoxChecked}>
            <Ionicons name="checkmark" size={12} color="#fff" />
          </View>
        </TouchableOpacity>
        <View style={styles.rowInfo}>
          <Text style={[styles.rowName, styles.rowNameChecked]}>{item.name}</Text>
          <Text style={styles.rowCategory}>{item.category}</Text>
        </View>
        {status ? <StatusBadge status={status} /> : null}
        <TouchableOpacity onPress={() => handleReAdd(item.id)} style={styles.reAddBtn} hitSlop={8}>
          <Ionicons name="add" size={14} color={PRIMARY} />
          <Text style={styles.reAddText}>Re-add</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Layout ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      {/* Store header */}
      <TouchableOpacity style={styles.header} onPress={() => setPickerVisible(true)} activeOpacity={0.75}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerLabel}>Shopping at</Text>
          <View style={styles.storeNameRow}>
            <Text style={styles.storeName} numberOfLines={1}>
              {selectedStore?.name ?? 'Select a store…'}
            </Text>
            <Ionicons name="chevron-down" size={16} color="#9CA3AF" style={{ marginTop: 2 }} />
          </View>
        </View>
        <View style={styles.headerRight}>
          <Ionicons name="location-outline" size={18} color={PRIMARY} />
        </View>
      </TouchableOpacity>

      <StorePicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={(name, supabaseId) => setSelectedStore({ name, supabaseId })}
      />

      {/* Add item input */}
      <View style={styles.addSection}>
        <View style={styles.addRow}>
          <Ionicons name="add-circle" size={20} color={PRIMARY} style={{ marginRight: 8 }} />
          <TextInput
            ref={addRef}
            style={styles.addInput}
            placeholder="Add an item…"
            placeholderTextColor="#9CA3AF"
            value={addQuery}
            onChangeText={setAddQuery}
            onSubmitEditing={handleAddCustom}
            returnKeyType="done"
          />
          {addQuery.length > 0 && (
            <TouchableOpacity onPress={handleAddCustom} style={styles.addBtn}>
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Suggestions */}
        {filteredSuggestions.length > 0 && (
          <View style={styles.suggestions}>
            {storeItemsLoading && (
              <ActivityIndicator size="small" color={PRIMARY} style={{ marginBottom: 4 }} />
            )}
            {filteredSuggestions.map((s) => (
              <TouchableOpacity
                key={s.name}
                style={styles.suggestion}
                onPress={() => handleAdd(s.name, s.category, s.itemId)}
              >
                <Text style={styles.suggestionName}>{s.name}</Text>
                <View style={styles.suggestionRight}>
                  <Text style={styles.suggestionCategory}>{s.category}</Text>
                  {s.itemId && statusByName.has(s.name.toLowerCase()) && (
                    <StatusBadge status={statusByName.get(s.name.toLowerCase())!} small />
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Active list */}
      {activeItems.length === 0 && historyItems.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="cart-outline" size={52} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>Your list is empty</Text>
          <Text style={styles.emptySub}>
            Type an item above or pick from the suggestions to get started.
          </Text>
        </View>
      ) : (
        <FlatList
          data={activeItems}
          keyExtractor={(i) => i.id}
          renderItem={renderActiveItem}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            activeItems.length === 0 ? (
              <View style={styles.allDone}>
                <Ionicons name="checkmark-circle" size={28} color={PRIMARY} />
                <Text style={styles.allDoneText}>All items checked off!</Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            historyItems.length > 0 ? (
              <View style={styles.historySection}>
                <TouchableOpacity
                  style={styles.historyHeader}
                  onPress={() => setHistoryOpen((o) => !o)}
                >
                  <View style={styles.historyHeaderLeft}>
                    <Ionicons
                      name={historyOpen ? 'chevron-down' : 'chevron-forward'}
                      size={14}
                      color="#9CA3AF"
                    />
                    <Text style={styles.historyTitle}>
                      History ({historyItems.length})
                    </Text>
                  </View>
                  <TouchableOpacity onPress={handleClearHistory}>
                    <Text style={styles.clearHistoryText}>Clear</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
                {historyOpen &&
                  historyItems.map((item, idx) => (
                    <View key={item.id}>
                      {renderHistoryItem({ item })}
                      {idx < historyItems.length - 1 && <View style={styles.sep} />}
                    </View>
                  ))}
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

function StatusBadge({ status, small }: { status: StockStatus; small?: boolean }) {
  const color = STATUS_COLORS[status];
  const label = STATUS_LABELS[status];
  return (
    <View style={[styles.badge, { backgroundColor: color + '18', borderColor: color + '40' }, small && styles.badgeSmall]}>
      <View style={[styles.badgeDot, { backgroundColor: color }, small && styles.badgeDotSmall]} />
      <Text style={[styles.badgeText, { color }, small && styles.badgeTextSmall]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#F9FAFB' },

  header:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  headerLeft:         { flex: 1 },
  headerLabel:        { fontSize: 12, color: '#9CA3AF', fontWeight: '500', marginBottom: 2 },
  storeNameRow:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  storeName:          { fontSize: 17, fontWeight: '700', color: '#111827' },
  headerRight:        { padding: 4 },

  addSection:         { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  addRow:             { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  addInput:           { flex: 1, fontSize: 15, color: '#111827' },
  addBtn:             { backgroundColor: PRIMARY, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6, marginLeft: 8 },
  addBtnText:         { color: '#fff', fontSize: 13, fontWeight: '700' },

  suggestions:        { paddingHorizontal: 8, paddingBottom: 8 },
  suggestion:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8, justifyContent: 'space-between' },
  suggestionName:     { fontSize: 14, color: '#111827', fontWeight: '500', flex: 1, marginRight: 8 },
  suggestionRight:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  suggestionCategory: { fontSize: 11, color: '#9CA3AF' },

  list:               { paddingHorizontal: 16, paddingBottom: 24, paddingTop: 8 },
  sep:                { height: 1, backgroundColor: '#F3F4F6', marginLeft: 52 },

  listRow:            { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, gap: 10 },
  historyRow:         { opacity: 0.75 },
  checkbox:           { padding: 2 },
  checkboxBox:        { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#D1D5DB' },
  checkboxBoxChecked: { width: 22, height: 22, borderRadius: 6, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center' },
  rowInfo:            { flex: 1, gap: 2 },
  rowName:            { fontSize: 15, fontWeight: '600', color: '#111827' },
  rowNameChecked:     { textDecorationLine: 'line-through', color: '#9CA3AF', fontWeight: '400' },
  rowCategory:        { fontSize: 11, color: '#9CA3AF' },
  iconBtn:            { padding: 4 },

  unknownBadge:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  unknownText:        { fontSize: 10, color: '#9CA3AF', fontWeight: '600' },

  reAddBtn:           { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0' },
  reAddText:          { fontSize: 12, color: PRIMARY, fontWeight: '700' },

  badge:              { flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, gap: 4 },
  badgeSmall:         { paddingHorizontal: 6, paddingVertical: 2 },
  badgeDot:           { width: 6, height: 6, borderRadius: 3 },
  badgeDotSmall:      { width: 5, height: 5 },
  badgeText:          { fontSize: 11, fontWeight: '700' },
  badgeTextSmall:     { fontSize: 10 },

  historySection:     { marginTop: 16 },
  historyHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 4, marginBottom: 4 },
  historyHeaderLeft:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  historyTitle:       { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },
  clearHistoryText:   { fontSize: 12, color: '#EF4444', fontWeight: '600' },

  allDone:            { alignItems: 'center', paddingTop: 32, gap: 8 },
  allDoneText:        { fontSize: 15, fontWeight: '600', color: PRIMARY },

  empty:              { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 60, paddingHorizontal: 32 },
  emptyTitle:         { fontSize: 17, fontWeight: '700', color: '#111827' },
  emptySub:           { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
});

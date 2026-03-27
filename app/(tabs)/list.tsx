import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  SectionList,
  TouchableOpacity,
  Modal,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchItems, upsertItem, DEFAULT_STORE_ID } from '../../lib/api';
import { getSavedStore, matchChain, type SelectedStore } from '../../lib/stores';
import { getSampleItems } from '../../lib/sampleItems';
import {
  getList,
  addItem,
  changeQuantity,
  toggleItem,
  removeItem,
  reAddItem,
  clearHistory,
  type GroceryListItem,
} from '../../lib/groceryList';
import StorePicker from '../../components/StorePicker';
import type { LiveItem } from '../../lib/types';
import type { StockStatus } from '../../data';
import { STATUS_COLORS } from '../../data';

const PRIMARY = '#1D9E75';

function storeKey(store: SelectedStore | null): string {
  return store?.osmId ?? store?.name ?? '__default__';
}

type Suggestion = { name: string; category: string; itemId: string | null };

// ─── Add-Items bottom sheet ────────────────────────────────────────────────────
function AddSheet({
  visible,
  suggestions,
  activeItems,
  statusByName,
  loading,
  onAdd,
  onChangeQty,
  onClose,
}: {
  visible: boolean;
  suggestions: Suggestion[];
  activeItems: GroceryListItem[];
  statusByName: Map<string, StockStatus>;
  loading: boolean;
  onAdd: (name: string, category: string, itemId: string | null) => void;
  onChangeQty: (name: string, delta: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<TextInput>(null);

  // name (lowercase) → quantity already in active list
  const inListMap = useMemo(() => {
    const m = new Map<string, number>();
    activeItems.forEach((i) => m.set(i.name.toLowerCase(), i.quantity));
    return m;
  }, [activeItems]);

  useEffect(() => {
    if (visible) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [visible]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suggestions;
    return suggestions.filter((s) => s.name.toLowerCase().includes(q));
  }, [query, suggestions]);

  const showCustomAdd =
    query.trim().length > 0 &&
    !suggestions.some((s) => s.name.toLowerCase() === query.trim().toLowerCase());

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={sheet.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={sheet.header}>
          <View style={sheet.handle} />
          <View style={sheet.titleRow}>
            <Text style={sheet.title}>Add Items</Text>
            <TouchableOpacity onPress={onClose} style={sheet.doneBtn}>
              <Text style={sheet.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
          <View style={sheet.searchRow}>
            <Ionicons name="search" size={16} color="#9CA3AF" style={{ marginRight: 8 }} />
            <TextInput
              ref={inputRef}
              style={sheet.searchInput}
              placeholder="Search or type a custom item…"
              placeholderTextColor="#9CA3AF"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => {
                if (showCustomAdd) onAdd(query.trim(), 'General', null);
              }}
              returnKeyType="done"
              clearButtonMode="while-editing"
            />
          </View>
        </View>

        {loading ? (
          <View style={sheet.centered}>
            <ActivityIndicator color={PRIMARY} />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(s) => s.name}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={sheet.list}
            ItemSeparatorComponent={() => <View style={sheet.sep} />}
            ListHeaderComponent={
              showCustomAdd ? (
                <TouchableOpacity
                  style={sheet.customRow}
                  onPress={() => { onAdd(query.trim(), 'General', null); setQuery(''); }}
                >
                  <View style={sheet.customIcon}>
                    <Ionicons name="add" size={18} color={PRIMARY} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={sheet.customLabel}>Add "{query.trim()}"</Text>
                    <Text style={sheet.customSub}>Custom item · tap to add to list</Text>
                  </View>
                </TouchableOpacity>
              ) : null
            }
            ListEmptyComponent={
              !showCustomAdd ? (
                <View style={sheet.centered}>
                  <Text style={sheet.emptyText}>No matching items found.</Text>
                </View>
              ) : null
            }
            renderItem={({ item: s }) => {
              const qty = inListMap.get(s.name.toLowerCase()) ?? 0;
              const inList = qty > 0;
              const status = s.itemId ? statusByName.get(s.name.toLowerCase()) : undefined;

              return (
                <View style={[sheet.row, inList && sheet.rowInList]}>
                  {/* Name + category */}
                  <View style={sheet.rowLeft}>
                    <Text style={sheet.rowName}>{s.name}</Text>
                    <Text style={sheet.rowCategory}>{s.category}</Text>
                  </View>

                  <View style={sheet.rowRight}>
                    {/* Stock status dot */}
                    {status ? <StatusDot status={status} /> : null}

                    {inList ? (
                      /* Quantity stepper — shown when item is already on the list */
                      <View style={sheet.stepper}>
                        <TouchableOpacity
                          onPress={() => onChangeQty(s.name, -1)}
                          hitSlop={8}
                          style={[sheet.stepBtn, qty <= 1 && sheet.stepBtnDim]}
                          disabled={qty <= 1}
                        >
                          <Ionicons name="remove" size={14} color={qty <= 1 ? '#C7D2DA' : '#6B7280'} />
                        </TouchableOpacity>
                        <Text style={sheet.stepQty}>{qty}</Text>
                        <TouchableOpacity
                          onPress={() => onChangeQty(s.name, 1)}
                          hitSlop={8}
                          style={sheet.stepBtn}
                        >
                          <Ionicons name="add" size={14} color={PRIMARY} />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      /* Add button — shown when item is not yet on the list */
                      <TouchableOpacity
                        onPress={() => onAdd(s.name, s.category, s.itemId)}
                        style={sheet.addBtn}
                        hitSlop={8}
                      >
                        <Ionicons name="add" size={17} color={PRIMARY} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            }}
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main List Screen ─────────────────────────────────────────────────────────
export default function ListScreen() {
  const [selectedStore, setSelectedStore] = useState<SelectedStore | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [addSheetVisible, setAddSheetVisible] = useState(false);
  const [listItems, setListItems] = useState<GroceryListItem[]>([]);
  const [storeItems, setStoreItems] = useState<LiveItem[]>([]);
  const [storeItemsLoading, setStoreItemsLoading] = useState(false);

  const key = storeKey(selectedStore);

  useEffect(() => {
    const saved = getSavedStore();
    if (saved) setSelectedStore(saved);
  }, []);

  useEffect(() => {
    setListItems(getList(key));
  }, [key]);

  useEffect(() => {
    const sid = selectedStore?.supabaseId ?? DEFAULT_STORE_ID;
    setStoreItemsLoading(true);
    fetchItems(sid)
      .then(setStoreItems)
      .catch(() => setStoreItems([]))
      .finally(() => setStoreItemsLoading(false));
  }, [selectedStore]);

  const refresh = useCallback(() => setListItems(getList(key)), [key]);

  const statusByName = useMemo(() => {
    const m = new Map<string, StockStatus>();
    storeItems.forEach((i) => m.set(i.name.toLowerCase(), i.status));
    return m;
  }, [storeItems]);

  const suggestions = useMemo<Suggestion[]>(() => {
    const chainKey = matchChain(selectedStore?.name ?? '');
    const samples = getSampleItems(chainKey).map((s) => ({ ...s, itemId: null as string | null }));
    const supabaseNames = new Set(storeItems.map((i) => i.name.toLowerCase()));
    return [
      ...storeItems.map((i) => ({ name: i.name, category: i.category, itemId: i.id })),
      ...samples.filter((s) => !supabaseNames.has(s.name.toLowerCase())),
    ];
  }, [storeItems, selectedStore]);

  const activeItems = useMemo(() => listItems.filter((i) => !i.checked), [listItems]);

  // Deduplicate history by name (keeps first occurrence — most recently added)
  const historyItems = useMemo(() => {
    const seen = new Set<string>();
    return listItems.filter((i) => i.checked).filter((i) => {
      const k = i.name.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [listItems]);

  const sections = useMemo(() => {
    const s: { key: string; data: GroceryListItem[] }[] = [];
    if (activeItems.length > 0)
      s.push({ key: 'active', data: activeItems });
    if (historyItems.length > 0)
      s.push({ key: 'history', data: historyItems });
    return s;
  }, [activeItems, historyItems]);

  const totalQty = useMemo(
    () => activeItems.reduce((sum, i) => sum + i.quantity, 0),
    [activeItems]
  );

  function handleAdd(name: string, category: string, itemId: string | null) {
    addItem(key, { name, category: category || 'General', itemId });
    refresh();
    // If this store is tracked in Supabase and the item has no existing ID,
    // upsert it so users can report stock status from the home tab.
    if (!itemId && selectedStore?.supabaseId) {
      upsertItem(selectedStore.supabaseId, name, category || 'General')
        .then(() => {
          fetchItems(selectedStore.supabaseId!)
            .then(setStoreItems)
            .catch(() => {});
        })
        .catch(() => {});
    }
  }

  // Used by AddSheet to change qty by name (item id resolved here)
  function handleQtyByName(name: string, delta: number) {
    const item = activeItems.find((i) => i.name.toLowerCase() === name.toLowerCase());
    if (item) { changeQuantity(key, item.id, delta); refresh(); }
  }

  function handleQty(id: string, delta: number)  { changeQuantity(key, id, delta); refresh(); }
  function handleToggle(id: string)               { toggleItem(key, id);            refresh(); }
  function handleRemove(id: string)               { removeItem(key, id);            refresh(); }
  function handleReAdd(id: string)                { reAddItem(key, id);             refresh(); }

  function handleClearHistory() {
    Alert.alert('Clear History', 'Remove all checked items?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => { clearHistory(key); refresh(); } },
    ]);
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Store header */}
      <TouchableOpacity style={styles.header} onPress={() => setPickerVisible(true)} activeOpacity={0.75}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>Shopping at</Text>
          <View style={styles.storeNameRow}>
            <Text style={styles.storeName} numberOfLines={1}>
              {selectedStore?.name ?? 'Select a store…'}
            </Text>
            <Ionicons name="chevron-down" size={15} color="#9CA3AF" style={{ marginTop: 1 }} />
          </View>
        </View>
        {totalQty > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{totalQty}</Text>
          </View>
        )}
      </TouchableOpacity>

      <StorePicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={(name, supabaseId) => setSelectedStore({ name, supabaseId })}
      />

      <AddSheet
        visible={addSheetVisible}
        suggestions={suggestions}
        activeItems={activeItems}
        statusByName={statusByName}
        loading={storeItemsLoading}
        onAdd={handleAdd}
        onChangeQty={handleQtyByName}
        onClose={() => setAddSheetVisible(false)}
      />

      {/* List */}
      {listItems.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="cart-outline" size={56} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>Your list is empty</Text>
          <Text style={styles.emptySub}>
            Tap the button below to browse items and add them to your list.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => {
            if (section.key === 'active') {
              return (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>
                    {activeItems.length} item{activeItems.length !== 1 ? 's' : ''}
                    {totalQty !== activeItems.length ? ` · ${totalQty} total` : ''}
                  </Text>
                </View>
              );
            }
            // History header (always visible, no collapse)
            return (
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderLeft}>
                  <Text style={styles.sectionTitle}>
                    History ({historyItems.length})
                  </Text>
                </View>
                <TouchableOpacity onPress={handleClearHistory} hitSlop={8}>
                  <Text style={styles.clearText}>Clear</Text>
                </TouchableOpacity>
              </View>
            );
          }}
          renderItem={({ item, section }) => {
            const isHistory = section.key === 'history';
            const status = statusByName.get(item.name.toLowerCase()) ?? null;

            if (isHistory) {
              return (
                <View style={[styles.row, styles.rowHistory]}>
                  <TouchableOpacity onPress={() => handleToggle(item.id)} hitSlop={10}>
                    <View style={styles.checkDone}>
                      <Ionicons name="checkmark" size={13} color="#fff" />
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.rowNameDone} numberOfLines={1}>{item.name}</Text>
                  {item.quantity > 1 && (
                    <Text style={styles.historyQty}>×{item.quantity}</Text>
                  )}
                  <TouchableOpacity onPress={() => handleReAdd(item.id)} style={styles.reAddBtn} hitSlop={8}>
                    <Ionicons name="refresh-outline" size={13} color={PRIMARY} />
                    <Text style={styles.reAddText}>Re-add</Text>
                  </TouchableOpacity>
                </View>
              );
            }

            return (
              <View style={styles.row}>
                <TouchableOpacity onPress={() => handleToggle(item.id)} hitSlop={10}>
                  <View style={styles.checkEmpty} />
                </TouchableOpacity>
                <View style={styles.rowBody}>
                  <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.rowCat}>{item.category}</Text>
                </View>
                {/* Quantity stepper */}
                <View style={styles.stepper}>
                  <TouchableOpacity
                    onPress={() => handleQty(item.id, -1)}
                    hitSlop={8}
                    style={[styles.stepBtn, item.quantity <= 1 && styles.stepBtnDisabled]}
                    disabled={item.quantity <= 1}
                  >
                    <Ionicons name="remove" size={14} color={item.quantity <= 1 ? '#D1D5DB' : '#6B7280'} />
                  </TouchableOpacity>
                  <Text style={styles.stepQty}>{item.quantity}</Text>
                  <TouchableOpacity onPress={() => handleQty(item.id, 1)} hitSlop={8} style={styles.stepBtn}>
                    <Ionicons name="add" size={14} color="#6B7280" />
                  </TouchableOpacity>
                </View>
                {/* Status dot */}
                {status ? <StatusDot status={status} /> : <Text style={styles.noData}>—</Text>}
                {/* Remove */}
                <TouchableOpacity onPress={() => handleRemove(item.id)} hitSlop={10}>
                  <Ionicons name="close" size={15} color="#D1D5DB" />
                </TouchableOpacity>
              </View>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListFooterComponent={<View style={{ height: 100 }} />}
        />
      )}

      {/* Sticky Add button */}
      <View style={styles.addBar}>
        <TouchableOpacity
          style={styles.addBarBtn}
          onPress={() => setAddSheetVisible(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="add-circle" size={20} color="#fff" />
          <Text style={styles.addBarText}>Add Items</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function StatusDot({ status }: { status: StockStatus }) {
  const color = STATUS_COLORS[status];
  return (
    <View style={[dot.wrap, { borderColor: color + '50', backgroundColor: color + '18' }]}>
      <View style={[dot.circle, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: '#F9FAFB' },
  header:            { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  headerLabel:       { fontSize: 11, color: '#9CA3AF', fontWeight: '500', marginBottom: 1 },
  storeNameRow:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  storeName:         { fontSize: 17, fontWeight: '700', color: '#111827', flexShrink: 1 },
  countBadge:        { marginLeft: 10, backgroundColor: PRIMARY, borderRadius: 12, minWidth: 26, height: 26, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  countBadgeText:    { color: '#fff', fontSize: 13, fontWeight: '800' },
  list:              { paddingHorizontal: 16, paddingTop: 4 },
  sectionHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 2 },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sectionTitle:      { fontSize: 11, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.6 },
  clearText:         { fontSize: 12, color: '#EF4444', fontWeight: '600' },
  sep:               { height: 1, backgroundColor: '#F3F4F6', marginLeft: 44 },
  row:               { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, gap: 8 },
  rowHistory:        { opacity: 0.65 },
  rowBody:           { flex: 1, gap: 1, minWidth: 0 },
  rowName:           { fontSize: 14, fontWeight: '600', color: '#111827' },
  rowNameDone:       { flex: 1, fontSize: 14, color: '#9CA3AF', textDecorationLine: 'line-through' },
  rowCat:            { fontSize: 11, color: '#B0B7C3' },
  noData:            { fontSize: 14, color: '#E5E7EB', fontWeight: '600', minWidth: 18, textAlign: 'center' },
  checkEmpty:        { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#D1D5DB' },
  checkDone:         { width: 22, height: 22, borderRadius: 11, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center' },
  stepper:           { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 3, paddingVertical: 2 },
  stepBtn:           { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  stepBtnDisabled:   { opacity: 0.4 },
  stepQty:           { fontSize: 14, fontWeight: '700', color: '#111827', minWidth: 22, textAlign: 'center' },
  historyQty:        { fontSize: 12, fontWeight: '700', color: '#9CA3AF' },
  reAddBtn:          { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: '#A7F3D0', backgroundColor: '#ECFDF5' },
  reAddText:         { fontSize: 11, fontWeight: '700', color: PRIMARY },
  empty:             { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 80, paddingHorizontal: 40 },
  emptyTitle:        { fontSize: 18, fontWeight: '700', color: '#111827' },
  emptySub:          { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 21 },
  addBar:            { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 24, paddingTop: 12 },
  addBarBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: PRIMARY, borderRadius: 16, paddingVertical: 14, shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
  addBarText:        { color: '#fff', fontSize: 16, fontWeight: '700' },
});

const dot = StyleSheet.create({
  wrap:   { width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  circle: { width: 8, height: 8, borderRadius: 4 },
});

const sheet = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#F9FAFB' },
  header:       { backgroundColor: '#fff', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  handle:       { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginTop: 10, marginBottom: 14 },
  titleRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title:        { fontSize: 18, fontWeight: '700', color: '#111827' },
  doneBtn:      { paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#ECFDF5', borderRadius: 10 },
  doneBtnText:  { fontSize: 14, fontWeight: '700', color: PRIMARY },
  searchRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  searchInput:  { flex: 1, fontSize: 15, color: '#111827' },
  list:         { paddingHorizontal: 16, paddingVertical: 8 },
  sep:          { height: 1, backgroundColor: '#F3F4F6', marginLeft: 8 },
  row:          { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 12, gap: 10 },
  rowInList:    { backgroundColor: '#F0FDF8' },
  rowLeft:      { flex: 1, gap: 2, minWidth: 0 },
  rowName:      { fontSize: 15, fontWeight: '600', color: '#111827' },
  rowCategory:  { fontSize: 11, color: '#9CA3AF' },
  rowRight:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepper:      { flexDirection: 'row', alignItems: 'center', gap: 0, backgroundColor: '#F3F4F6', borderRadius: 8, overflow: 'hidden' },
  stepBtn:      { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  stepBtnDim:   { opacity: 0.35 },
  stepQty:      { fontSize: 14, fontWeight: '700', color: '#111827', minWidth: 28, textAlign: 'center' },
  addBtn:       { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: PRIMARY, alignItems: 'center', justifyContent: 'center' },
  customRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 12, gap: 10, marginBottom: 4 },
  customIcon:   { width: 30, height: 30, borderRadius: 15, backgroundColor: PRIMARY + '20', alignItems: 'center', justifyContent: 'center' },
  customLabel:  { fontSize: 15, fontWeight: '700', color: PRIMARY },
  customSub:    { fontSize: 11, color: '#6B7280' },
  centered:     { paddingVertical: 40, alignItems: 'center' },
  emptyText:    { fontSize: 14, color: '#9CA3AF' },
});

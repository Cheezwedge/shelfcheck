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
import { fetchItems, DEFAULT_STORE_ID } from '../../lib/api';
import { getSavedStore, matchChain, type SelectedStore } from '../../lib/stores';
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

function storeKey(store: SelectedStore | null): string {
  return store?.supabaseId ?? store?.name ?? '__default__';
}

type Suggestion = { name: string; category: string; itemId: string | null };

// ─── Add-Items bottom sheet ────────────────────────────────────────────────────
function AddSheet({
  visible,
  suggestions,
  statusByName,
  loading,
  onAdd,
  onClose,
}: {
  visible: boolean;
  suggestions: Suggestion[];
  statusByName: Map<string, StockStatus>;
  loading: boolean;
  onAdd: (name: string, category: string, itemId: string | null) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setQuery('');
      // Small delay so the modal animation finishes before focusing
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

  function handleAdd(s: Suggestion) {
    onAdd(s.name, s.category, s.itemId);
    setQuery('');
  }

  function handleCustomAdd() {
    const name = query.trim();
    if (!name) return;
    onAdd(name, 'General', null);
    setQuery('');
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView style={sheet.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Handle + header */}
        <View style={sheet.header}>
          <View style={sheet.handle} />
          <View style={sheet.titleRow}>
            <Text style={sheet.title}>Add Items</Text>
            <TouchableOpacity onPress={onClose} style={sheet.doneBtn}>
              <Text style={sheet.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
          {/* Search */}
          <View style={sheet.searchRow}>
            <Ionicons name="search" size={16} color="#9CA3AF" style={{ marginRight: 8 }} />
            <TextInput
              ref={inputRef}
              style={sheet.searchInput}
              placeholder="Search or type a custom item…"
              placeholderTextColor="#9CA3AF"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={handleCustomAdd}
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
                <TouchableOpacity style={sheet.customRow} onPress={handleCustomAdd}>
                  <View style={sheet.customIcon}>
                    <Ionicons name="add" size={18} color={PRIMARY} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={sheet.customLabel}>Add "{query.trim()}"</Text>
                    <Text style={sheet.customSub}>Custom item</Text>
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
              const status = s.itemId ? statusByName.get(s.name.toLowerCase()) : undefined;
              return (
                <TouchableOpacity
                  style={sheet.row}
                  onPress={() => handleAdd(s)}
                  activeOpacity={0.7}
                >
                  <View style={sheet.rowLeft}>
                    <Text style={sheet.rowName}>{s.name}</Text>
                    <Text style={sheet.rowCategory}>{s.category}</Text>
                  </View>
                  <View style={sheet.rowRight}>
                    {status ? <StatusDot status={status} /> : null}
                    <View style={sheet.addBtn}>
                      <Ionicons name="add" size={16} color={PRIMARY} />
                    </View>
                  </View>
                </TouchableOpacity>
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
  const [historyOpen, setHistoryOpen] = useState(true);

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

  // Build suggestions: Supabase catalog + chain sample items (deduplicated)
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
  const historyItems = useMemo(() => listItems.filter((i) => i.checked), [listItems]);

  function handleAdd(name: string, category: string, itemId: string | null) {
    addItem(key, { name, category: category || 'General', itemId });
    refresh();
  }

  function handleToggle(id: string) { toggleItem(key, id); refresh(); }
  function handleRemove(id: string) { removeItem(key, id); refresh(); }
  function handleReAdd(id: string)  { reAddItem(key, id);  refresh(); }

  function handleClearHistory() {
    Alert.alert('Clear History', 'Remove all checked items?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => { clearHistory(key); refresh(); } },
    ]);
  }

  function getStatus(item: GroceryListItem): StockStatus | null {
    return statusByName.get(item.name.toLowerCase()) ?? null;
  }

  // SectionList data
  const sections = useMemo(() => {
    const s = [];
    if (activeItems.length > 0) s.push({ key: 'active', data: activeItems });
    if (historyOpen && historyItems.length > 0) s.push({ key: 'history', data: historyItems });
    return s;
  }, [activeItems, historyItems, historyOpen]);

  // ── Render ───────────────────────────────────────────────────────────────────
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
        {activeItems.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{activeItems.length}</Text>
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
        statusByName={statusByName}
        loading={storeItemsLoading}
        onAdd={(name, cat, id) => { handleAdd(name, cat, id); }}
        onClose={() => setAddSheetVisible(false)}
      />

      {/* List — takes all remaining space */}
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
              return activeItems.length > 0 ? (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>
                    {activeItems.length} item{activeItems.length !== 1 ? 's' : ''}
                  </Text>
                </View>
              ) : null;
            }
            // History header
            return (
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => setHistoryOpen((o) => !o)}
                activeOpacity={0.7}
              >
                <View style={styles.sectionHeaderLeft}>
                  <Ionicons
                    name={historyOpen ? 'chevron-down' : 'chevron-forward'}
                    size={13}
                    color="#9CA3AF"
                  />
                  <Text style={styles.sectionTitle}>
                    History ({historyItems.length})
                  </Text>
                </View>
                <TouchableOpacity onPress={handleClearHistory} hitSlop={8}>
                  <Text style={styles.clearText}>Clear</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
          renderItem={({ item, section }) => {
            const isHistory = section.key === 'history';
            const status = getStatus(item);
            if (isHistory) {
              return (
                <View style={[styles.row, styles.rowHistory]}>
                  <TouchableOpacity onPress={() => handleToggle(item.id)} hitSlop={10}>
                    <View style={styles.checkDone}>
                      <Ionicons name="checkmark" size={13} color="#fff" />
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.rowNameDone} numberOfLines={1}>{item.name}</Text>
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
                <View style={styles.rowRight}>
                  {status ? (
                    <StatusDot status={status} labeled />
                  ) : (
                    <Text style={styles.noData}>—</Text>
                  )}
                  <TouchableOpacity onPress={() => handleRemove(item.id)} hitSlop={10} style={styles.removeBtn}>
                    <Ionicons name="close" size={15} color="#D1D5DB" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListFooterComponent={<View style={{ height: 100 }} />}
          ListEmptyComponent={
            <View style={styles.allDone}>
              <Ionicons name="checkmark-circle" size={32} color={PRIMARY} />
              <Text style={styles.allDoneText}>All done!</Text>
            </View>
          }
        />
      )}

      {/* Sticky "Add Items" bar */}
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

// ─── Status dot ───────────────────────────────────────────────────────────────
function StatusDot({ status, labeled }: { status: StockStatus; labeled?: boolean }) {
  const color = STATUS_COLORS[status];
  const short = status === 'in-stock' ? 'In Stock' : status === 'out-of-stock' ? 'Out' : 'Uncertain';
  return (
    <View style={[dot.wrap, { borderColor: color + '50', backgroundColor: color + '15' }]}>
      <View style={[dot.circle, { backgroundColor: color }]} />
      {labeled && <Text style={[dot.label, { color }]}>{short}</Text>}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#F9FAFB' },

  header:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  headerLabel:      { fontSize: 11, color: '#9CA3AF', fontWeight: '500', marginBottom: 1 },
  storeNameRow:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  storeName:        { fontSize: 17, fontWeight: '700', color: '#111827', flexShrink: 1 },
  countBadge:       { marginLeft: 10, backgroundColor: PRIMARY, borderRadius: 12, minWidth: 24, height: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  countBadgeText:   { color: '#fff', fontSize: 12, fontWeight: '800' },

  list:             { paddingHorizontal: 16, paddingTop: 4 },
  sectionHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 2 },
  sectionHeaderLeft:{ flexDirection: 'row', alignItems: 'center', gap: 5 },
  sectionTitle:     { fontSize: 12, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 },
  clearText:        { fontSize: 12, color: '#EF4444', fontWeight: '600' },

  sep:              { height: 1, backgroundColor: '#F3F4F6', marginLeft: 46 },

  row:              { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 12, gap: 10 },
  rowHistory:       { opacity: 0.7 },
  rowBody:          { flex: 1, gap: 2, minWidth: 0 },
  rowName:          { fontSize: 15, fontWeight: '600', color: '#111827' },
  rowNameDone:      { flex: 1, fontSize: 14, color: '#9CA3AF', textDecorationLine: 'line-through' },
  rowCat:           { fontSize: 11, color: '#9CA3AF' },
  rowRight:         { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noData:           { fontSize: 14, color: '#D1D5DB', fontWeight: '600' },
  removeBtn:        { padding: 2 },

  checkEmpty:       { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#D1D5DB' },
  checkDone:        { width: 22, height: 22, borderRadius: 11, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center' },

  reAddBtn:         { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: '#A7F3D0', backgroundColor: '#ECFDF5' },
  reAddText:        { fontSize: 11, fontWeight: '700', color: PRIMARY },

  allDone:          { alignItems: 'center', paddingTop: 28, gap: 6 },
  allDoneText:      { fontSize: 15, fontWeight: '600', color: PRIMARY },

  empty:            { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 80, paddingHorizontal: 40 },
  emptyTitle:       { fontSize: 18, fontWeight: '700', color: '#111827' },
  emptySub:         { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 21 },

  addBar:           { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 24, paddingTop: 12, backgroundColor: 'transparent' },
  addBarBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: PRIMARY, borderRadius: 16, paddingVertical: 14, shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
  addBarText:       { color: '#fff', fontSize: 16, fontWeight: '700' },
});

const dot = StyleSheet.create({
  wrap:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  circle: { width: 6, height: 6, borderRadius: 3 },
  label:  { fontSize: 11, fontWeight: '700' },
});

const sheet = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#F9FAFB' },
  header:      { backgroundColor: '#fff', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  handle:      { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginTop: 10, marginBottom: 14 },
  titleRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title:       { fontSize: 18, fontWeight: '700', color: '#111827' },
  doneBtn:     { paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#ECFDF5', borderRadius: 10 },
  doneBtnText: { fontSize: 14, fontWeight: '700', color: PRIMARY },
  searchRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#111827' },
  list:        { paddingHorizontal: 16, paddingVertical: 8 },
  sep:         { height: 1, backgroundColor: '#F3F4F6', marginLeft: 48 },
  row:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 12, gap: 10 },
  rowLeft:     { flex: 1, gap: 2, minWidth: 0 },
  rowName:     { fontSize: 15, fontWeight: '600', color: '#111827' },
  rowCategory: { fontSize: 11, color: '#9CA3AF' },
  rowRight:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addBtn:      { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: PRIMARY, alignItems: 'center', justifyContent: 'center' },
  customRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 12, gap: 10, marginBottom: 4 },
  customIcon:  { width: 30, height: 30, borderRadius: 15, backgroundColor: PRIMARY + '20', alignItems: 'center', justifyContent: 'center' },
  customLabel: { fontSize: 15, fontWeight: '700', color: PRIMARY },
  customSub:   { fontSize: 11, color: '#6B7280' },
  centered:    { paddingVertical: 40, alignItems: 'center' },
  emptyText:   { fontSize: 14, color: '#9CA3AF' },
});

// Keep StatusBadge for backwards compat (used nowhere now, but left to avoid TS errors)
function StatusBadge({ status }: { status: StockStatus }) {
  return <StatusDot status={status} labeled />;
}

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
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StockStatus, STATUS_COLORS, STATUS_LABELS, formatTimeAgo, getFreshness } from '../../data';
import { fetchItems, upsertItem, upsertStore, fetchStoreLeaderboard, DEFAULT_STORE_ID, type StoreLeaderboardEntry } from '../../lib/api';
import { ALL_BADGES } from '../../lib/badges';
import { supabase } from '../../lib/supabase';
import type { LiveItem } from '../../lib/types';
import { getSavedStore, matchChain, saveStore, type SelectedStore } from '../../lib/stores';
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
import { useAuth } from '../../lib/auth';

const PRIMARY = '#1D9E75';

function storeKey(store: SelectedStore | null): string {
  return store?.osmId ?? store?.name ?? '__default__';
}

type Suggestion = { name: string; category: string; itemId: string | null };

// ─── Section row types ────────────────────────────────────────────────────────
type ActiveRow  = { kind: 'active';  list: GroceryListItem; live: LiveItem | null };
type StoreRow   = { kind: 'store';   live: LiveItem };
type HistoryRow = { kind: 'history'; list: GroceryListItem };
type ShopRow = ActiveRow | StoreRow | HistoryRow;

// ─── Add-Items Sheet ──────────────────────────────────────────────────────────
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
  onAdd: (name: string, category: string, itemId: string | null, brand?: string, size?: string) => void;
  onChangeQty: (name: string, delta: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  // Suggestions that share significant words with a custom query — shown for
  // dedup confirmation before the user creates a brand-new item.
  const [similarItems, setSimilarItems] = useState<Suggestion[]>([]);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customBrand, setCustomBrand]       = useState('');
  const [customSize, setCustomSize]         = useState('');
  const inputRef = useRef<TextInput>(null);

  const inListMap = useMemo(() => {
    const m = new Map<string, number>();
    activeItems.forEach((i) => m.set(i.name.toLowerCase(), i.quantity));
    return m;
  }, [activeItems]);

  useEffect(() => {
    if (visible) {
      setQuery('');
      setSimilarItems([]);
      setShowCustomForm(false);
      setCustomBrand('');
      setCustomSize('');
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [visible]);

  // Clear similar-items prompt and custom form whenever the query changes
  useEffect(() => {
    setSimilarItems([]);
    setShowCustomForm(false);
    setCustomBrand('');
    setCustomSize('');
  }, [query]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? suggestions.filter((s) => s.name.toLowerCase().includes(q)) : suggestions;
  }, [query, suggestions]);

  const trimmedQuery = query.trim();
  const showCustomAdd =
    trimmedQuery.length > 0 &&
    !suggestions.some((s) => s.name.toLowerCase() === trimmedQuery.toLowerCase());

  /** Called when the user taps "Add {query}" for a name that isn't in suggestions. */
  function handleCustomAdd() {
    if (!trimmedQuery) return;
    const qLower = trimmedQuery.toLowerCase();

    // Find suggestions that share at least one significant word (≥3 chars) with the query.
    const words = qLower.split(/\s+/).filter((w) => w.length >= 3);
    const similar =
      words.length > 0
        ? suggestions.filter((s) => {
            const sLower = s.name.toLowerCase();
            return sLower !== qLower && words.some((w) => sLower.includes(w));
          })
        : [];

    if (similar.length > 0 && similarItems.length === 0) {
      // Show similar items so the user can pick one instead of duplicating
      setSimilarItems(similar);
    } else {
      // No similar items (or already dismissed): expand the brand/size form
      setShowCustomForm(true);
    }
  }

  function commitCustomAdd() {
    if (!trimmedQuery) return;
    onAdd(trimmedQuery, 'General', null, customBrand.trim() || undefined, customSize.trim() || undefined);
    setQuery('');
    setSimilarItems([]);
    setShowCustomForm(false);
    setCustomBrand('');
    setCustomSize('');
  }

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
              onSubmitEditing={() => { if (showCustomAdd) handleCustomAdd(); }}
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
              <>
                {/* ── Similar-items dedup prompt ── */}
                {similarItems.length > 0 && (
                  <View style={sheet.similarBox}>
                    <View style={sheet.similarTitleRow}>
                      <Ionicons name="alert-circle-outline" size={15} color="#F59E0B" />
                      <Text style={sheet.similarTitle}>
                        Similar items already at this store:
                      </Text>
                    </View>
                    {similarItems.map((s) => (
                      <TouchableOpacity
                        key={s.name}
                        style={sheet.similarRow}
                        onPress={() => {
                          onAdd(s.name, s.category, s.itemId);
                          setQuery('');
                          setSimilarItems([]);
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={sheet.similarName}>{s.name}</Text>
                          <Text style={sheet.similarCat}>{s.category}</Text>
                        </View>
                        <View style={sheet.useThisBtn}>
                          <Text style={sheet.useThisText}>Use this</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={sheet.addAnywayBtn}
                      onPress={() => {
                        setSimilarItems([]);
                        setShowCustomForm(true);
                      }}
                    >
                      <Ionicons name="add-circle-outline" size={15} color="#6B7280" />
                      <Text style={sheet.addAnywayText}>
                        Add "{trimmedQuery}" as a separate item
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* ── Add custom row / expanded form (shown only when no dedup prompt) ── */}
                {showCustomAdd && similarItems.length === 0 && (
                  showCustomForm ? (
                    <View style={sheet.customForm}>
                      <View style={sheet.customFormHeader}>
                        <View style={sheet.customIcon}>
                          <Ionicons name="add" size={18} color={PRIMARY} />
                        </View>
                        <Text style={sheet.customLabel} numberOfLines={1}>"{trimmedQuery}"</Text>
                        <TouchableOpacity onPress={() => setShowCustomForm(false)} hitSlop={8}>
                          <Ionicons name="close" size={16} color="#9CA3AF" />
                        </TouchableOpacity>
                      </View>
                      <View style={sheet.customFormFields}>
                        <TextInput
                          style={sheet.customFormInput}
                          placeholder="Brand (optional)"
                          placeholderTextColor="#9CA3AF"
                          value={customBrand}
                          onChangeText={setCustomBrand}
                          returnKeyType="next"
                        />
                        <TextInput
                          style={sheet.customFormInput}
                          placeholder="Size / qty (optional)"
                          placeholderTextColor="#9CA3AF"
                          value={customSize}
                          onChangeText={setCustomSize}
                          returnKeyType="done"
                          onSubmitEditing={commitCustomAdd}
                        />
                      </View>
                      <TouchableOpacity style={sheet.customFormBtn} onPress={commitCustomAdd}>
                        <Text style={sheet.customFormBtnText}>Add to list</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={sheet.customRow} onPress={handleCustomAdd}>
                      <View style={sheet.customIcon}>
                        <Ionicons name="add" size={18} color={PRIMARY} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={sheet.customLabel}>Add "{trimmedQuery}"</Text>
                        <Text style={sheet.customSub}>Custom item · tap to add details</Text>
                      </View>
                    </TouchableOpacity>
                  )
                )}
              </>
            }
            ListEmptyComponent={
              !showCustomAdd && similarItems.length === 0 ? (
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
                  <View style={sheet.rowLeft}>
                    <Text style={sheet.rowName}>{s.name}</Text>
                    <Text style={sheet.rowCategory}>{s.category}</Text>
                  </View>
                  <View style={sheet.rowRight}>
                    {status ? <SheetStatusDot status={status} /> : null}
                    {inList ? (
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
                        <TouchableOpacity onPress={() => onChangeQty(s.name, 1)} hitSlop={8} style={sheet.stepBtn}>
                          <Ionicons name="add" size={14} color={PRIMARY} />
                        </TouchableOpacity>
                      </View>
                    ) : (
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

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ShopScreen() {
  const router = useRouter();
  const { isGuest, session } = useAuth();

  const [selectedStore, setSelectedStore] = useState<SelectedStore | null>(() => getSavedStore());
  const [storeItems, setStoreItems] = useState<LiveItem[]>([]);
  const [storeItemsLoading, setStoreItemsLoading] = useState(false);
  const [listItems, setListItems] = useState<GroceryListItem[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [addSheetVisible, setAddSheetVisible] = useState(false);
  const [search, setSearch] = useState('');
  // ID of the list item currently being upserted before navigation (shows a spinner)
  const [reportingListId, setReportingListId] = useState<string | null>(null);
  // Show a nudge banner when a guest tries to add a custom item (needs account to sync)
  const [showSignInNudge, setShowSignInNudge] = useState(false);
  const [storeLbModalVisible, setStoreLbModalVisible] = useState(false);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [storeLb, setStoreLb]           = useState<StoreLeaderboardEntry[]>([]);
  const [storeLbLoading, setStoreLbLoading] = useState(false);

  const sk = storeKey(selectedStore);
  const sid = selectedStore?.supabaseId ?? DEFAULT_STORE_ID;

  const refresh = useCallback(() => setListItems(getList(sk)), [sk]);

  // Reload grocery list when store key changes
  useEffect(() => { setListItems(getList(sk)); }, [sk]);

  // Fetch Supabase items when store changes
  useEffect(() => {
    setStoreItemsLoading(true);
    fetchItems(sid)
      .then(setStoreItems)
      .catch(() => setStoreItems([]))
      .finally(() => setStoreItemsLoading(false));
  }, [sid]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('shop-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reports' }, () => {
        fetchItems(sid).then(setStoreItems).catch(() => {});
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sid]);

  // Reload on tab focus (skip initial mount)
  const isMounted = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!isMounted.current) { isMounted.current = true; return; }
    refresh();
    fetchItems(sid).then(setStoreItems).catch(() => {});
  }, [refresh, sid]));

  // Store leaderboard — load when modal opens or store changes
  useEffect(() => {
    if (!storeLbModalVisible || !selectedStore?.supabaseId) return;
    setStoreLbLoading(true);
    fetchStoreLeaderboard(selectedStore.supabaseId, 10)
      .then(setStoreLb)
      .catch(() => setStoreLb([]))
      .finally(() => setStoreLbLoading(false));
  }, [storeLbModalVisible, selectedStore?.supabaseId]);

  // Derived state
  const activeItems = useMemo(() => listItems.filter((i) => !i.checked), [listItems]);

  const historyItems = useMemo(() => {
    const seen = new Set<string>();
    return listItems.filter((i) => i.checked).filter((i) => {
      const k = i.name.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [listItems]);

  const activeNameSet = useMemo(
    () => new Set(activeItems.map((i) => i.name.toLowerCase())),
    [activeItems]
  );

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

  // Build section rows, filtered by search
  const sections = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (name: string) => !q || name.toLowerCase().includes(q);

    const activeRows: ShopRow[] = activeItems
      .filter((li) => matches(li.name))
      .map((li) => ({
        kind: 'active' as const,
        list: li,
        live: storeItems.find((s) => s.name.toLowerCase() === li.name.toLowerCase()) ?? null,
      }));

    const storeRows: ShopRow[] = storeItems
      .filter((s) => !activeNameSet.has(s.name.toLowerCase()) && matches(s.name))
      .map((s) => ({ kind: 'store' as const, live: s }));

    const historyRows: ShopRow[] = historyItems
      .filter((li) => matches(li.name))
      .map((li) => ({ kind: 'history' as const, list: li }));

    const result: { key: string; title: string; data: ShopRow[] }[] = [];
    if (activeRows.length > 0)
      result.push({ key: 'active', title: 'MY LIST', data: activeRows });
    if (storeRows.length > 0)
      result.push({ key: 'store', title: 'AT THIS STORE', data: storeRows });
    if (historyRows.length > 0)
      result.push({ key: 'history', title: `HISTORY (${historyItems.length})`, data: historyRows });
    return result;
  }, [activeItems, storeItems, historyItems, activeNameSet, search]);

  const totalQty = useMemo(
    () => activeItems.reduce((sum, i) => sum + i.quantity, 0),
    [activeItems]
  );

  // Ensure the selected store exists in Supabase and return its ID.
  // Throws if the store can't be found or created — callers must handle.
  async function ensureStoreId(): Promise<string | null> {
    if (selectedStore?.supabaseId) return selectedStore.supabaseId;
    if (!selectedStore?.name) return null;
    const newSid = await upsertStore(selectedStore.name); // may throw
    const updated: SelectedStore = {
      name: selectedStore.name,
      address: selectedStore.address,
      osmId: selectedStore.osmId,
      supabaseId: newSid,
    };
    setSelectedStore(updated);
    saveStore(updated);
    return newSid;
  }

  // Handlers
  async function handleAdd(name: string, category: string, itemId: string | null, brand?: string, size?: string) {
    // Always add to the local grocery list immediately
    addItem(sk, { name, category: category || 'General', itemId });
    refresh();

    // If the item already has a Supabase ID (picked from store suggestions) we're done
    if (itemId) return;

    // Guest users can't write to Supabase — show a sign-in nudge and stop here
    if (isGuest) {
      setShowSignInNudge(true);
      return;
    }

    // Custom item: upsert store + item in Supabase so stock status can be reported
    try {
      const storeSid = await ensureStoreId();
      if (!storeSid) return; // no store name at all — nothing to sync
      await upsertItem(storeSid, name, category || 'General', null, brand, size);
      // Refresh so the item's status dot appears immediately
      const fresh = await fetchItems(storeSid);
      setStoreItems(fresh);
    } catch {
      Alert.alert(
        'Couldn\'t sync to store database',
        'The item was added to your list.\n\nTo report its stock status, tap the item — it will sync automatically when you open the report.',
        [{ text: 'OK' }],
      );
    }
  }

  function handleQtyByName(name: string, delta: number) {
    const item = activeItems.find((i) => i.name.toLowerCase() === name.toLowerCase());
    if (item) { changeQuantity(sk, item.id, delta); refresh(); }
  }

  function handleQty(id: string, delta: number)  { changeQuantity(sk, id, delta); refresh(); }
  function handleToggle(id: string)               { toggleItem(sk, id);            refresh(); }
  function handleRemove(id: string)               { removeItem(sk, id);            refresh(); }
  function handleReAdd(id: string)                { reAddItem(sk, id);             refresh(); }

  function handleClearHistory() {
    setConfirmClearHistory(true);
  }

  function commitClearHistory() {
    clearHistory(sk);
    refresh();
    setConfirmClearHistory(false);
  }

  async function handleReportActive(row: ActiveRow) {
    const currentStoreId = selectedStore?.supabaseId ?? '';
    // Fast path: item already linked to Supabase
    if (row.live) {
      router.push({
        pathname: '/report/[id]',
        params: { id: row.live.id, storeId: currentStoreId },
      });
      return;
    }

    // Slow path: item exists in the grocery list but not yet in Supabase (just added,
    // or store was untracked). Upsert store + item, then navigate with the real ID.
    setReportingListId(row.list.id);
    try {
      const sid = await ensureStoreId();
      if (!sid) {
        router.push({
          pathname: '/report/[id]',
          params: { id: 'new', name: row.list.name, category: row.list.category, storeId: '', storeName: selectedStore?.name ?? '' },
        });
        return;
      }
      const itemId = await upsertItem(sid, row.list.name, row.list.category);
      fetchItems(sid).then(setStoreItems).catch(() => {});
      router.push({
        pathname: '/report/[id]',
        params: { id: itemId, storeId: sid },
      });
    } catch (err: unknown) {
      // upsertStore or upsertItem failed (usually RLS). Show an informative alert
      // instead of navigating to the misleading "Store not in database" screen.
      const code = (err as any)?.code ?? '';
      const msg  = (err as any)?.message ?? String(err);
      Alert.alert(
        'Couldn\'t sync item',
        `Unable to add "${row.list.name}" to the store database.\n\n${code ? `[${code}] ` : ''}${msg}\n\nTry again in a moment.`,
        [{ text: 'OK' }],
      );
    } finally {
      setReportingListId(null);
    }
  }

  function handleAddStoreItem(live: LiveItem) {
    addItem(sk, { name: live.name, category: live.category, itemId: live.id });
    refresh();
  }

  const isEmpty = sections.length === 0 && !storeItemsLoading;
  const noStore = !selectedStore;

  const renderRow = ({ item }: { item: ShopRow }) => {
    if (item.kind === 'active') {
      const status = item.live?.status ?? null;
      const isReporting = reportingListId === item.list.id;
      return (
        <View style={styles.row}>
          {/* Checkbox */}
          <TouchableOpacity onPress={() => handleToggle(item.list.id)} hitSlop={10} disabled={isReporting} style={styles.rowCheckWrap}>
            <View style={styles.checkEmpty} />
          </TouchableOpacity>

          {/* Body: name on top, meta below */}
          <TouchableOpacity style={styles.rowBody} onPress={() => handleReportActive(item)} activeOpacity={0.7} disabled={isReporting}>
            <Text style={styles.rowName} numberOfLines={2}>{item.list.name}</Text>
            <View style={styles.rowMetaRow}>
              <Text style={styles.rowCat}>{item.list.category}</Text>
              {!isReporting && status && (
                <>
                  <Text style={styles.rowMetaDot}> · </Text>
                  <FreshnessTag status={status} lastReportedAt={item.live?.lastReportedAt ?? null} quantity={item.live?.quantity} />
                </>
              )}
              {!isReporting && !status && (
                <TouchableOpacity onPress={() => handleReportActive(item)} hitSlop={8} style={styles.syncBtn}>
                  <Ionicons name="cloud-upload-outline" size={12} color="#9CA3AF" />
                  <Text style={styles.syncBtnText}>Sync</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>

          {/* Right side: stepper + spinner/close */}
          <View style={styles.rowRight}>
            <View style={styles.stepper}>
              <TouchableOpacity
                onPress={() => handleQty(item.list.id, -1)}
                hitSlop={8}
                style={[styles.stepBtn, item.list.quantity <= 1 && styles.stepBtnDim]}
                disabled={item.list.quantity <= 1 || isReporting}
              >
                <Ionicons name="remove" size={13} color={item.list.quantity <= 1 ? '#D1D5DB' : '#6B7280'} />
              </TouchableOpacity>
              <Text style={styles.stepQty}>{item.list.quantity}</Text>
              <TouchableOpacity onPress={() => handleQty(item.list.id, 1)} hitSlop={8} style={styles.stepBtn} disabled={isReporting}>
                <Ionicons name="add" size={13} color="#6B7280" />
              </TouchableOpacity>
            </View>
            {isReporting
              ? <ActivityIndicator size="small" color={PRIMARY} style={{ width: 22 }} />
              : <TouchableOpacity onPress={() => handleRemove(item.list.id)} hitSlop={10} disabled={isReporting}>
                  <Ionicons name="close" size={15} color="#D1D5DB" />
                </TouchableOpacity>
            }
          </View>
        </View>
      );
    }

    if (item.kind === 'store') {
      return (
        <View style={styles.storeRow}>
          <TouchableOpacity
            style={styles.storeRowMain}
            onPress={() => router.push({ pathname: '/report/[id]', params: { id: item.live.id, storeId: selectedStore?.supabaseId ?? '' } })}
            activeOpacity={0.7}
          >
            <Text style={styles.rowName} numberOfLines={2}>{item.live.name}</Text>
            <View style={styles.rowMetaRow}>
              <Text style={styles.rowCat}>{item.live.category}</Text>
              <Text style={styles.rowMetaDot}> · </Text>
              <FreshnessTag status={item.live.status} lastReportedAt={item.live.lastReportedAt} quantity={item.live.quantity} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleAddStoreItem(item.live)}
            style={styles.storeAddBtn}
            hitSlop={8}
          >
            <Ionicons name="add" size={18} color={PRIMARY} />
          </TouchableOpacity>
        </View>
      );
    }

    // history
    return (
      <View style={[styles.row, styles.rowHistory]}>
        <TouchableOpacity onPress={() => handleReAdd(item.list.id)} hitSlop={10} style={styles.rowCheckWrap}>
          <View style={styles.checkDone}>
            <Ionicons name="checkmark" size={12} color="#fff" />
          </View>
        </TouchableOpacity>
        <Text style={styles.rowNameDone} numberOfLines={2}>{item.list.name}</Text>
        <TouchableOpacity onPress={() => handleReAdd(item.list.id)} style={styles.reAddBtn} hitSlop={8}>
          <Ionicons name="refresh-outline" size={13} color={PRIMARY} />
          <Text style={styles.reAddText}>Re-add</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Store header */}
      <View style={styles.header}>
        <TouchableOpacity style={{ flex: 1 }} onPress={() => setPickerVisible(true)} activeOpacity={0.75}>
          <Text style={styles.headerLabel}>Shopping at</Text>
          <View style={styles.storeNameRow}>
            <Text style={styles.storeName} numberOfLines={1}>
              {selectedStore?.name ?? 'Select a store…'}
            </Text>
            <Ionicons name="chevron-down" size={15} color="#9CA3AF" style={{ marginTop: 1 }} />
          </View>
          {selectedStore?.address ? (
            <Text style={styles.storeAddress} numberOfLines={1}>{selectedStore.address}</Text>
          ) : null}
        </TouchableOpacity>
        <View style={styles.headerRight}>
          {selectedStore?.supabaseId && (
            <TouchableOpacity
              style={styles.lbBtn}
              onPress={() => setStoreLbModalVisible(true)}
              hitSlop={8}
            >
              <Ionicons name="podium-outline" size={20} color={PRIMARY} />
            </TouchableOpacity>
          )}
          {totalQty > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{totalQty}</Text>
            </View>
          )}
        </View>
      </View>

      <StorePicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={() => {
          const saved = getSavedStore();
          if (saved) setSelectedStore(saved);
        }}
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

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={16} color="#9CA3AF" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search items…"
          placeholderTextColor="#9CA3AF"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Empty / loading states */}
      {noStore ? (
        <TouchableOpacity style={styles.centered} onPress={() => setPickerVisible(true)} activeOpacity={0.8}>
          <Ionicons name="storefront-outline" size={48} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>No store selected</Text>
          <Text style={styles.emptySub}>Tap to find nearby grocery stores.</Text>
          <View style={styles.findBtn}>
            <Ionicons name="location-outline" size={15} color={PRIMARY} />
            <Text style={styles.findBtnText}>Find stores near me</Text>
          </View>
        </TouchableOpacity>
      ) : storeItemsLoading && listItems.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={PRIMARY} />
        </View>
      ) : isEmpty && search.length > 0 ? (
        <View style={styles.centered}>
          <Ionicons name="search-outline" size={40} color="#D1D5DB" />
          <Text style={styles.emptySub}>No items match "{search}"</Text>
        </View>
      ) : isEmpty ? (
        <View style={styles.centered}>
          <Ionicons name="cart-outline" size={56} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>Your list is empty</Text>
          <Text style={styles.emptySub}>Tap "Add Items" to browse and add groceries.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => {
            if (item.kind === 'active')  return 'a-' + item.list.id;
            if (item.kind === 'store')   return 's-' + item.live.id;
            return 'h-' + item.list.id;
          }}
          renderItem={renderRow}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.key === 'history' && (
                confirmClearHistory ? (
                  <View style={styles.clearConfirm}>
                    <Text style={styles.clearConfirmText}>Remove all?</Text>
                    <TouchableOpacity onPress={commitClearHistory} style={styles.clearConfirmYes}>
                      <Text style={styles.clearConfirmYesText}>Yes</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setConfirmClearHistory(false)} style={styles.clearConfirmNo}>
                      <Text style={styles.clearConfirmNoText}>No</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={handleClearHistory} hitSlop={8}>
                    <Text style={styles.clearText}>Clear</Text>
                  </TouchableOpacity>
                )
              )}
            </View>
          )}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          stickySectionHeadersEnabled={false}
          ListFooterComponent={<View style={{ height: 90 }} />}
        />
      )}

      {/* Store leaderboard modal */}
      <Modal visible={storeLbModalVisible} transparent animationType="fade" onRequestClose={() => setStoreLbModalVisible(false)}>
        <TouchableOpacity style={styles.lbBackdrop} activeOpacity={1} onPress={() => setStoreLbModalVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.lbModal}>
            <View style={styles.lbModalHeader}>
              <View style={styles.lbModalTitleRow}>
                <Ionicons name="podium" size={18} color={PRIMARY} />
                <Text style={styles.lbModalTitle}>Top Reporters</Text>
              </View>
              <Text style={styles.lbModalSub} numberOfLines={1}>{selectedStore?.name}</Text>
            </View>
            {storeLbLoading ? (
              <View style={styles.lbModalLoading}>
                <ActivityIndicator color={PRIMARY} />
              </View>
            ) : storeLb.length === 0 ? (
              <View style={styles.lbModalEmpty}>
                <Ionicons name="podium-outline" size={32} color="#D1D5DB" />
                <Text style={styles.lbModalEmptyText}>No reports yet — be the first!</Text>
              </View>
            ) : (
              <View style={styles.lbModalList}>
                {storeLb.map((entry, idx) => {
                  const badge = entry.featured_badge_id
                    ? ALL_BADGES.find((b) => b.id === entry.featured_badge_id)
                    : null;
                  const name = entry.username ?? `Reporter ${entry.id.slice(-4).toUpperCase()}`;
                  const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
                  return (
                    <View key={entry.id} style={styles.lbModalRow}>
                      <Text style={styles.lbModalMedal}>{medal}</Text>
                      {badge ? (
                        <View style={[styles.lbModalBadge, { backgroundColor: badge.bg }]}>
                          <Ionicons name={badge.icon as any} size={12} color={badge.color} />
                        </View>
                      ) : (
                        <View style={styles.lbModalBadge}>
                          <Ionicons name="person-outline" size={12} color="#D1D5DB" />
                        </View>
                      )}
                      <Text style={styles.lbModalName} numberOfLines={1}>{name}</Text>
                      <Text style={styles.lbModalCount}>{entry.report_count} reports</Text>
                    </View>
                  );
                })}
              </View>
            )}
            <TouchableOpacity style={styles.lbModalClose} onPress={() => setStoreLbModalVisible(false)}>
              <Text style={styles.lbModalCloseText}>Close</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Sign-in nudge banner (shown after guest tries to add a custom item) */}
      {showSignInNudge && (
        <View style={styles.nudgeBanner}>
          <Ionicons name="person-circle-outline" size={18} color="#92400E" />
          <Text style={styles.nudgeText}>
            Create a free account to sync custom items &amp; report stock.
          </Text>
          <TouchableOpacity onPress={() => { setShowSignInNudge(false); router.push('/auth'); }} style={styles.nudgeBtn}>
            <Text style={styles.nudgeBtnText}>Sign up</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowSignInNudge(false)} hitSlop={8}>
            <Ionicons name="close" size={16} color="#92400E" />
          </TouchableOpacity>
        </View>
      )}

      {/* Add Items bar */}
      {!noStore && (
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
      )}
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Inline tag: colored status + optional qty + freshness, all on one line. */
function FreshnessTag({ status, lastReportedAt, quantity }: { status: StockStatus; lastReportedAt: string | null; quantity?: number | null }) {
  const statusColor = STATUS_COLORS[status];
  const statusLabel = STATUS_LABELS[status];
  const f = getFreshness(lastReportedAt);
  const qtyLabel = status === 'in-stock' && quantity != null
    ? quantity >= 100 ? ' ~100+' : ` ~${quantity}`
    : '';
  return (
    <Text style={ftag.line}>
      <Text style={{ color: statusColor, fontWeight: '700' }}>{statusLabel}{qtyLabel}</Text>
      <Text style={{ color: f.color }}>{' '}{f.symbol} {f.label}</Text>
    </Text>
  );
}

/** Pill badge used on AT THIS STORE rows: status + freshness on two lines. */
function FreshBadge({ status, lastReportedAt, quantity }: { status: StockStatus; lastReportedAt: string | null; quantity?: number | null }) {
  const statusColor = STATUS_COLORS[status];
  const statusLabel = STATUS_LABELS[status];
  const f = getFreshness(lastReportedAt);
  const qtyLabel = status === 'in-stock' && quantity != null
    ? quantity >= 100 ? '~100+' : `~${quantity}`
    : null;
  return (
    <View style={[badge.wrap, { backgroundColor: statusColor + '14', borderColor: statusColor + '35' }]}>
      <View style={[badge.dot, { backgroundColor: statusColor }]} />
      <View>
        <Text style={[badge.statusText, { color: statusColor }]}>{statusLabel}{qtyLabel ? ` ${qtyLabel}` : ''}</Text>
        <Text style={[badge.freshText, { color: f.color }]}>{f.symbol} {f.label}</Text>
      </View>
    </View>
  );
}

/** Small dot used in the AddSheet list. */
function SheetStatusDot({ status }: { status: StockStatus }) {
  const color = STATUS_COLORS[status];
  return (
    <View style={[dot.wrap, { borderColor: color + '60', backgroundColor: color + '18' }]}>
      <View style={[dot.circle, { backgroundColor: color }]} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#F9FAFB' },
  header:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  headerLabel:     { fontSize: 11, color: '#9CA3AF', fontWeight: '500', marginBottom: 1 },
  storeNameRow:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  storeName:       { fontSize: 17, fontWeight: '700', color: '#111827', flexShrink: 1 },
  storeAddress:    { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  countBadge:      { marginLeft: 10, backgroundColor: PRIMARY, borderRadius: 12, minWidth: 26, height: 26, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  countBadgeText:  { color: '#fff', fontSize: 13, fontWeight: '800' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, marginVertical: 10, borderRadius: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: '#E5E7EB', height: 40 },
  searchIcon:      { marginRight: 8 },
  searchInput:     { flex: 1, fontSize: 14, color: '#111827' },
  list:            { paddingHorizontal: 16, paddingTop: 4 },
  sectionHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 2 },
  sectionTitle:    { fontSize: 11, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.6 },
  clearText:       { fontSize: 12, color: '#EF4444', fontWeight: '600' },
  clearConfirm:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clearConfirmText:   { fontSize: 12, color: '#EF4444', fontWeight: '600' },
  clearConfirmYes:    { backgroundColor: '#EF4444', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  clearConfirmYesText:{ fontSize: 12, fontWeight: '700', color: '#fff' },
  clearConfirmNo:     { backgroundColor: '#F3F4F6', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  clearConfirmNoText: { fontSize: 12, fontWeight: '700', color: '#6B7280' },
  sep:             { height: 1, backgroundColor: '#F3F4F6', marginLeft: 44 },
  // Active row
  row:             { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, gap: 8 },
  rowHistory:      { opacity: 0.65 },
  rowCheckWrap:    { alignSelf: 'flex-start', paddingTop: 2 },
  rowBody:         { flex: 1, minWidth: 0, gap: 3 },
  rowName:         { fontSize: 14, fontWeight: '600', color: '#111827', flexShrink: 1 },
  rowNameDone:     { flex: 1, fontSize: 14, color: '#9CA3AF', textDecorationLine: 'line-through' },
  rowMetaRow:      { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 2 },
  rowMetaDot:      { fontSize: 11, color: '#D1D5DB' },
  rowCat:          { fontSize: 11, color: '#B0B7C3' },
  rowTime:         { fontSize: 11, color: '#B0B7C3' },
  rowRight:        { alignItems: 'center', gap: 4 },
  checkEmpty:      { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#D1D5DB' },
  checkDone:       { width: 22, height: 22, borderRadius: 11, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center' },
  stepper:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 8, overflow: 'hidden' },
  stepBtn:         { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  stepBtnDim:      { opacity: 0.35 },
  stepQty:         { fontSize: 13, fontWeight: '700', color: '#111827', minWidth: 20, textAlign: 'center' },
  historyQty:      { fontSize: 12, fontWeight: '700', color: '#9CA3AF' },
  syncBtn:         { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
  syncBtnText:     { fontSize: 10, fontWeight: '600', color: '#9CA3AF' },
  reAddBtn:        { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: '#A7F3D0', backgroundColor: '#ECFDF5' },
  reAddText:       { fontSize: 11, fontWeight: '700', color: PRIMARY },
  // Store row
  storeRow:        { flexDirection: 'row', alignItems: 'stretch', backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
  storeRowMain:    { flex: 1, paddingVertical: 10, paddingLeft: 12, paddingRight: 8, gap: 3, justifyContent: 'center' },
  storeAddBtn:     { width: 44, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: '#F3F4F6' },
  // Add bar
  addBar:          { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 24, paddingTop: 12, backgroundColor: 'transparent' },
  addBarBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: PRIMARY, borderRadius: 16, paddingVertical: 14, shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
  addBarText:      { color: '#fff', fontSize: 16, fontWeight: '700' },
  // Sign-in nudge banner
  nudgeBanner:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFBEB', borderTopWidth: 1, borderTopColor: '#FDE68A', paddingHorizontal: 14, paddingVertical: 10 },
  nudgeText:       { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 16 },
  nudgeBtn:        { backgroundColor: '#F59E0B', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  nudgeBtnText:    { fontSize: 12, fontWeight: '700', color: '#fff' },
  // Empty / loading
  centered:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 60 },
  emptyTitle:      { fontSize: 18, fontWeight: '700', color: '#111827' },
  emptySub:        { fontSize: 14, color: '#6B7280', textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },
  findBtn:         { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, backgroundColor: '#ECFDF5', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: '#A7F3D0' },
  findBtnText:     { fontSize: 13, fontWeight: '600', color: PRIMARY },

  // Header right side
  headerRight:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 8 },
  lbBtn:            { width: 36, height: 36, borderRadius: 10, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#A7F3D0' },

  // Store leaderboard modal
  lbBackdrop:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  lbModal:          { backgroundColor: '#fff', borderRadius: 22, width: '100%', maxWidth: 380, overflow: 'hidden' },
  lbModalHeader:    { padding: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  lbModalTitleRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  lbModalTitle:     { fontSize: 18, fontWeight: '800', color: '#111827' },
  lbModalSub:       { fontSize: 12, color: '#9CA3AF' },
  lbModalLoading:   { paddingVertical: 36, alignItems: 'center' },
  lbModalEmpty:     { paddingVertical: 36, alignItems: 'center', gap: 10 },
  lbModalEmptyText: { fontSize: 14, color: '#9CA3AF' },
  lbModalList:      { paddingVertical: 4 },
  lbModalRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  lbModalMedal:     { fontSize: 16, width: 28, textAlign: 'center' },
  lbModalBadge:     { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
  lbModalName:      { flex: 1, fontSize: 14, fontWeight: '600', color: '#111827' },
  lbModalCount:     { fontSize: 12, color: '#9CA3AF', fontWeight: '500' },
  lbModalClose:     { margin: 16, backgroundColor: '#F3F4F6', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  lbModalCloseText: { fontSize: 14, fontWeight: '700', color: '#374151' },
});

const badge = StyleSheet.create({
  wrap:       { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, gap: 5 },
  dot:        { width: 7, height: 7, borderRadius: 4, marginTop: 2 },
  statusText: { fontSize: 11, fontWeight: '700', lineHeight: 14 },
  freshText:  { fontSize: 10, fontWeight: '500', lineHeight: 13 },
  // legacy
  text:       { fontSize: 11, fontWeight: '700' },
});

const ftag = StyleSheet.create({
  line: { fontSize: 11, lineHeight: 15 },
});

const dot = StyleSheet.create({
  wrap:   { width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  circle: { width: 8, height: 8, borderRadius: 4 },
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
  sep:         { height: 1, backgroundColor: '#F3F4F6', marginLeft: 8 },
  row:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 12, gap: 10 },
  rowInList:   { backgroundColor: '#F0FDF8' },
  rowLeft:     { flex: 1, gap: 2, minWidth: 0 },
  rowName:     { fontSize: 15, fontWeight: '600', color: '#111827' },
  rowCategory: { fontSize: 11, color: '#9CA3AF' },
  rowRight:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepper:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 8, overflow: 'hidden' },
  stepBtn:     { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  stepBtnDim:  { opacity: 0.35 },
  stepQty:     { fontSize: 14, fontWeight: '700', color: '#111827', minWidth: 28, textAlign: 'center' },
  addBtn:      { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: PRIMARY, alignItems: 'center', justifyContent: 'center' },
  customRow:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 12, gap: 10, marginBottom: 4 },
  customIcon:     { width: 30, height: 30, borderRadius: 15, backgroundColor: PRIMARY + '20', alignItems: 'center', justifyContent: 'center' },
  customLabel:    { fontSize: 15, fontWeight: '700', color: PRIMARY, flex: 1 },
  customSub:      { fontSize: 11, color: '#6B7280' },
  customForm:        { backgroundColor: '#ECFDF5', borderRadius: 12, padding: 12, gap: 10, marginBottom: 4 },
  customFormHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  customFormFields:  { gap: 8 },
  customFormInput:   { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#D1FAE5', paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: '#111827' },
  customFormBtn:     { backgroundColor: PRIMARY, borderRadius: 8, alignItems: 'center', paddingVertical: 10 },
  customFormBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  centered:       { paddingVertical: 40, alignItems: 'center' },
  emptyText:      { fontSize: 14, color: '#9CA3AF' },
  // Similar-items dedup prompt
  similarBox:     { backgroundColor: '#FFFBEB', borderRadius: 12, borderWidth: 1, borderColor: '#FDE68A', padding: 12, marginBottom: 8, gap: 8 },
  similarTitleRow:{ flexDirection: 'row', alignItems: 'center', gap: 6 },
  similarTitle:   { fontSize: 12, fontWeight: '700', color: '#92400E', flex: 1 },
  similarRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, gap: 10 },
  similarName:    { fontSize: 14, fontWeight: '600', color: '#111827' },
  similarCat:     { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  useThisBtn:     { backgroundColor: PRIMARY + '18', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  useThisText:    { fontSize: 12, fontWeight: '700', color: PRIMARY },
  addAnywayBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 4 },
  addAnywayText:  { fontSize: 12, color: '#6B7280' },
});

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { fetchAdminItems, renameItem, deleteItem, mergeItems, type AdminItem } from '../../lib/api';
import { getSavedStore } from '../../lib/stores';
import { STATUS_COLORS } from '../../data';

const PRIMARY = '#1D9E75';
const DANGER  = '#EF4444';

export default function AdminScreen() {
  const router = useRouter();
  const { isAdmin, loading: authLoading } = useAuth();

  const store   = getSavedStore();
  const storeId = store?.supabaseId ?? null;

  const [items, setItems]                   = useState<AdminItem[]>([]);
  const [loading, setLoading]               = useState(true);
  const [search, setSearch]                 = useState('');
  const [selectMode, setSelectMode]         = useState(false);
  const [selected, setSelected]             = useState<Set<string>>(new Set());
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget]     = useState<AdminItem | null>(null);
  const [renameText, setRenameText]         = useState('');
  const [saving, setSaving]                 = useState(false);
  const [errorMsg, setErrorMsg]             = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!storeId) { setLoading(false); return; }
    setLoading(true);
    setErrorMsg(null);
    try {
      setItems(await fetchAdminItems(storeId));
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Failed to load items.');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { if (!authLoading) load(); }, [authLoading, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? items.filter((i) => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q))
      : items;
  }, [items, search]);

  // ── Auth / store guards ─────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centered}><ActivityIndicator color={PRIMARY} size="large" /></View>
      </SafeAreaView>
    );
  }
  if (!isAdmin) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centered}>
          <Ionicons name="lock-closed" size={44} color="#D1D5DB" />
          <Text style={s.gateTitle}>Admin only</Text>
          <Text style={s.gateSub}>You don't have permission to access this screen.</Text>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Text style={s.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
  if (!storeId) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centered}>
          <Ionicons name="storefront-outline" size={44} color="#D1D5DB" />
          <Text style={s.gateTitle}>No store selected</Text>
          <Text style={s.gateSub}>Go to the Shop tab and select a store first.</Text>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Text style={s.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Actions ─────────────────────────────────────────────────────────────────
  function toggleSelect(id: string) {
    setPendingDeleteId(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else if (next.size < 2) next.add(id);
      return next;
    });
  }

  async function execDelete(item: AdminItem) {
    setSaving(true);
    setErrorMsg(null);
    try {
      await deleteItem(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setPendingDeleteId(null);
    } catch (err: any) {
      setErrorMsg('Delete failed: ' + (err?.message ?? String(err)));
    } finally {
      setSaving(false);
    }
  }

  function openRename(item: AdminItem) {
    setPendingDeleteId(null);
    setRenameTarget(item);
    setRenameText(item.name);
  }

  async function commitRename() {
    if (!renameTarget || !renameText.trim()) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await renameItem(renameTarget.id, renameText.trim());
      setItems((prev) => prev.map((i) =>
        i.id === renameTarget.id ? { ...i, name: renameText.trim() } : i
      ));
      setRenameTarget(null);
    } catch (err: any) {
      setErrorMsg('Rename failed: ' + (err?.message ?? String(err)));
    } finally {
      setSaving(false);
    }
  }

  async function execMerge() {
    const [keepId, dropId] = [...selected];
    setSaving(true);
    setErrorMsg(null);
    try {
      await mergeItems(keepId, dropId);
      await load();
      setSelected(new Set());
      setSelectMode(false);
    } catch (err: any) {
      setErrorMsg('Merge failed: ' + (err?.message ?? String(err)));
    } finally {
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const selectedArr = [...selected];
  const canMerge    = selectedArr.length === 2;
  const keepItem    = canMerge ? items.find((i) => i.id === selectedArr[0]) : null;
  const dropItem    = canMerge ? items.find((i) => i.id === selectedArr[1]) : null;

  return (
    <SafeAreaView style={s.container}>

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={s.backIcon}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Item Admin</Text>
          <Text style={s.headerSub} numberOfLines={1}>{store?.name ?? ''} · {items.length} items</Text>
        </View>
        <TouchableOpacity
          onPress={() => { setSelectMode((v) => !v); setSelected(new Set()); setPendingDeleteId(null); }}
          style={[s.selectToggle, selectMode && s.selectToggleActive]}
        >
          <Ionicons name={selectMode ? 'close' : 'git-merge'} size={16} color={selectMode ? '#fff' : PRIMARY} />
          <Text style={[s.selectToggleText, selectMode && s.selectToggleTextActive]}>
            {selectMode ? 'Cancel' : 'Merge'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Error banner */}
      {errorMsg && (
        <View style={s.errorBanner}>
          <Ionicons name="alert-circle" size={15} color="#fff" />
          <Text style={s.errorBannerText} numberOfLines={3}>{errorMsg}</Text>
          <TouchableOpacity onPress={() => setErrorMsg(null)} hitSlop={8}>
            <Ionicons name="close" size={15} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Search */}
      <View style={s.searchBar}>
        <Ionicons name="search" size={16} color="#9CA3AF" />
        <TextInput
          style={s.searchInput}
          placeholder="Search items…"
          placeholderTextColor="#9CA3AF"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
        <TouchableOpacity onPress={load} hitSlop={8}>
          <Ionicons name="refresh" size={16} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      {/* Merge panel */}
      {selectMode && (
        <View style={[s.mergePanel, canMerge && s.mergePanelReady]}>
          {!canMerge ? (
            <Text style={s.mergePanelHint}>
              <Ionicons name="checkbox-outline" size={13} color="#9CA3AF" /> Select 2 items — first selected keeps the name
            </Text>
          ) : (
            <View style={s.mergeReadyRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.mergeReadyLabel}>Keep: <Text style={s.mergeReadyName}>{keepItem?.name}</Text></Text>
                <Text style={s.mergeDropLabel}>Delete: <Text style={s.mergeDropName}>{dropItem?.name}</Text> ({dropItem?.report_count} reports → merged)</Text>
              </View>
              <TouchableOpacity
                style={[s.mergeBtn, saving && s.mergeBtnDim]}
                onPress={execMerge}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.mergeBtnText}>Merge</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* List */}
      {loading ? (
        <View style={s.centered}><ActivityIndicator color={PRIMARY} size="large" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={s.list}
          ItemSeparatorComponent={() => <View style={s.sep} />}
          ListEmptyComponent={
            <View style={s.centered}>
              <Text style={s.emptyText}>No items found.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isSelected     = selected.has(item.id);
            const isPendingDelete = pendingDeleteId === item.id;
            const statusColor    = item.status ? (STATUS_COLORS as any)[item.status] : '#D1D5DB';

            return (
              <View style={[s.row, isSelected && s.rowSelected, isPendingDelete && s.rowDanger]}>
                {/* Select checkbox (merge mode) */}
                {selectMode && (
                  <TouchableOpacity
                    onPress={() => toggleSelect(item.id)}
                    style={[s.checkbox, isSelected && s.checkboxChecked]}
                  >
                    {isSelected && <Ionicons name="checkmark" size={13} color="#fff" />}
                  </TouchableOpacity>
                )}

                {/* Status dot */}
                <View style={[s.statusDot, { backgroundColor: statusColor }]} />

                {/* Name + meta — tapping opens rename */}
                <TouchableOpacity
                  style={s.rowBody}
                  onPress={() => selectMode ? toggleSelect(item.id) : openRename(item)}
                  activeOpacity={0.7}
                >
                  <Text style={s.rowName} numberOfLines={1}>{item.name}</Text>
                  <Text style={s.rowMeta}>
                    {item.category}
                    {item.report_count > 0
                      ? ` · ${item.report_count} report${item.report_count !== 1 ? 's' : ''}`
                      : ' · no reports'}
                  </Text>
                </TouchableOpacity>

                {/* Action buttons (non-merge mode) */}
                {!selectMode && (
                  isPendingDelete ? (
                    /* Inline delete confirmation */
                    <View style={s.deleteConfirm}>
                      <Text style={s.deleteConfirmText}>Delete?</Text>
                      <TouchableOpacity
                        style={s.deleteConfirmYes}
                        onPress={() => execDelete(item)}
                        disabled={saving}
                      >
                        {saving
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <Text style={s.deleteConfirmYesText}>Yes</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={s.deleteConfirmNo}
                        onPress={() => setPendingDeleteId(null)}
                      >
                        <Text style={s.deleteConfirmNoText}>No</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={s.actions}>
                      <TouchableOpacity
                        onPress={() => openRename(item)}
                        hitSlop={8}
                        style={s.actionBtn}
                      >
                        <Ionicons name="pencil" size={16} color="#6B7280" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => { setPendingDeleteId(item.id); }}
                        hitSlop={8}
                        style={s.actionBtn}
                      >
                        <Ionicons name="trash-outline" size={16} color={DANGER} />
                      </TouchableOpacity>
                    </View>
                  )
                )}
              </View>
            );
          }}
        />
      )}

      {saving && !pendingDeleteId && (
        <View style={s.savingOverlay}>
          <ActivityIndicator color={PRIMARY} size="large" />
        </View>
      )}

      {/* Rename modal */}
      <Modal
        visible={!!renameTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameTarget(null)}
      >
        <TouchableOpacity
          style={s.modalBackdrop}
          activeOpacity={1}
          onPress={() => setRenameTarget(null)}
        >
          <TouchableOpacity activeOpacity={1} style={s.modalCard}>
            <Text style={s.modalTitle}>Rename Item</Text>
            <Text style={s.modalSub}>
              {renameTarget?.report_count
                ? `${renameTarget.report_count} report(s) will follow the new name.`
                : 'No reports yet — safe to rename freely.'}
            </Text>
            <TextInput
              style={s.modalInput}
              value={renameText}
              onChangeText={setRenameText}
              autoFocus
              selectTextOnFocus
              returnKeyType="done"
              onSubmitEditing={commitRename}
              placeholder="Item name"
              placeholderTextColor="#9CA3AF"
            />
            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancel} onPress={() => setRenameTarget(null)}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalSave, (!renameText.trim() || saving) && s.modalSaveDim]}
                onPress={commitRename}
                disabled={!renameText.trim() || saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.modalSaveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#F9FAFB' },
  centered:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  gateTitle:     { fontSize: 18, fontWeight: '700', color: '#111827' },
  gateSub:       { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
  backBtn:       { marginTop: 8, backgroundColor: PRIMARY, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 11 },
  backBtnText:   { color: '#fff', fontWeight: '700', fontSize: 15 },

  header:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  backIcon:      { padding: 4 },
  headerTitle:   { fontSize: 17, fontWeight: '700', color: '#111827' },
  headerSub:     { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  selectToggle:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderColor: PRIMARY, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  selectToggleActive:     { backgroundColor: '#6B7280', borderColor: '#6B7280' },
  selectToggleText:       { fontSize: 13, fontWeight: '700', color: PRIMARY },
  selectToggleTextActive: { color: '#fff' },

  errorBanner:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: DANGER, paddingHorizontal: 14, paddingVertical: 10 },
  errorBannerText: { flex: 1, fontSize: 12, color: '#fff', fontWeight: '600' },

  searchBar:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', marginHorizontal: 16, marginVertical: 10, borderRadius: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: '#E5E7EB', height: 40 },
  searchInput:   { flex: 1, fontSize: 14, color: '#111827' },

  mergePanel:      { marginHorizontal: 16, marginBottom: 6, borderRadius: 10, backgroundColor: '#F3F4F6', padding: 12 },
  mergePanelReady: { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0' },
  mergePanelHint:  { fontSize: 12, color: '#6B7280' },
  mergeReadyRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mergeReadyLabel: { fontSize: 12, color: '#065F46', marginBottom: 2 },
  mergeReadyName:  { fontWeight: '700' },
  mergeDropLabel:  { fontSize: 11, color: '#6B7280' },
  mergeDropName:   { fontWeight: '600' },
  mergeBtn:        { backgroundColor: PRIMARY, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, minWidth: 64, alignItems: 'center' },
  mergeBtnDim:     { opacity: 0.6 },
  mergeBtnText:    { color: '#fff', fontWeight: '700', fontSize: 14 },

  list:          { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 },
  sep:           { height: 1, backgroundColor: '#F3F4F6' },
  emptyText:     { fontSize: 14, color: '#9CA3AF' },

  row:           { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingVertical: 11, paddingHorizontal: 14, gap: 10, borderRadius: 12, minHeight: 56 },
  rowSelected:   { backgroundColor: '#ECFDF5', borderWidth: 1.5, borderColor: PRIMARY + '60' },
  rowDanger:     { backgroundColor: '#FEF2F2', borderWidth: 1.5, borderColor: DANGER + '50' },
  statusDot:     { width: 9, height: 9, borderRadius: 5, flexShrink: 0 },
  rowBody:       { flex: 1, gap: 2, minWidth: 0 },
  rowName:       { fontSize: 14, fontWeight: '600', color: '#111827' },
  rowMeta:       { fontSize: 12, color: '#9CA3AF' },
  checkbox:      { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  checkboxChecked: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  actions:       { flexDirection: 'row', gap: 4, flexShrink: 0 },
  actionBtn:     { padding: 8, borderRadius: 8, backgroundColor: '#F9FAFB' },

  deleteConfirm:       { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  deleteConfirmText:   { fontSize: 12, fontWeight: '700', color: DANGER },
  deleteConfirmYes:    { backgroundColor: DANGER, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 5 },
  deleteConfirmYesText:{ fontSize: 12, fontWeight: '700', color: '#fff' },
  deleteConfirmNo:     { backgroundColor: '#F3F4F6', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 5 },
  deleteConfirmNoText: { fontSize: 12, fontWeight: '700', color: '#6B7280' },

  savingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard:     { backgroundColor: '#fff', borderRadius: 18, padding: 24, width: '100%', maxWidth: 400, gap: 14 },
  modalTitle:    { fontSize: 18, fontWeight: '700', color: '#111827' },
  modalSub:      { fontSize: 13, color: '#6B7280', lineHeight: 18, marginTop: -6 },
  modalInput:    { borderWidth: 1.5, borderColor: PRIMARY, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 16, color: '#111827' },
  modalActions:  { flexDirection: 'row', gap: 10 },
  modalCancel:   { flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center', paddingVertical: 11 },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: '#6B7280' },
  modalSave:     { flex: 1, borderRadius: 10, backgroundColor: PRIMARY, alignItems: 'center', paddingVertical: 11 },
  modalSaveDim:  { opacity: 0.5 },
  modalSaveText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

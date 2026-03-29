import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fetchItem, upsertItem, submitReport } from '../../lib/api';
import { useAuth, getReportingUserId } from '../../lib/auth';
import type { LiveItem } from '../../lib/types';

const PRIMARY = '#1D9E75';
const POINTS_PER_REPORT = 10;
const PHOTO_BONUS = 15;

export default function ReportScreen() {
  const { id, name: paramName, category: paramCategory, storeId: paramStoreId, storeName: paramStoreName } =
    useLocalSearchParams<{ id: string; name?: string; category?: string; storeId?: string; storeName?: string }>();
  const currentStoreId = paramStoreId ?? null;
  const router = useRouter();
  const { session } = useAuth();

  const [item, setItem] = useState<LiveItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notTracked, setNotTracked] = useState(false);
  const [selected, setSelected] = useState<'in-stock' | 'out-of-stock' | null>(null);
  const [quantityEstimate, setQuantityEstimate] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [alreadyReported, setAlreadyReported] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (id === 'new' && paramName) {
      if (!paramStoreId) {
        // Store not in our database — show informative screen
        setNotTracked(true);
        setLoading(false);
        return;
      }
      // Item doesn't exist in Supabase yet — upsert it, then load
      upsertItem(paramStoreId, paramName, paramCategory ?? 'General')
        .then((newId) => fetchItem(newId))
        .then(setItem)
        .catch((e: unknown) => {
          const msg = (e as any)?.message ?? String(e);
          const code = (e as any)?.code ?? '';
          setLoadError(`${code ? `[${code}] ` : ''}${msg}`);
          setItem(null);
        })
        .finally(() => setLoading(false));
    } else {
      fetchItem(id as string)
        .then(setItem)
        .catch((e: unknown) => {
          const msg = (e as any)?.message ?? String(e);
          const code = (e as any)?.code ?? '';
          setLoadError(`${code ? `[${code}] ` : ''}${msg}`);
          setItem(null);
        })
        .finally(() => setLoading(false));
    }
  }, [id, paramName, paramCategory, paramStoreId]);

  const handleSubmit = async () => {
    if (!selected || !item) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitReport(item.id, selected, getReportingUserId(session), quantityEstimate, currentStoreId);
      setSubmitted(true);
      setTimeout(() => router.back(), 1600);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      const msg  = (err as { message?: string })?.message ?? 'Unknown error';
      if (code === '23505') {
        setAlreadyReported(true);
        setSubmitted(true);
        setTimeout(() => router.back(), 1600);
      } else {
        setSubmitError(`${code ? `[${code}] ` : ''}${msg}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={PRIMARY} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Store not tracked ────────────────────────────────────────────────────
  if (notTracked) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Ionicons name="storefront-outline" size={48} color="#D1D5DB" />
          <Text style={styles.notTrackedTitle}>Store not in database</Text>
          <Text style={styles.notTrackedSub}>
            {paramStoreName
              ? `${paramStoreName} isn't in our database yet.`
              : 'This store isn\'t in our database yet.'}
            {'\n'}Reports can only be submitted for stores we track.
          </Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Not found ────────────────────────────────────────────────────────────
  if (!item) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={42} color="#D1D5DB" />
          <Text style={styles.errorText}>Item not found.</Text>
          {loadError && <Text style={styles.errorDetail}>{loadError}</Text>}
        </View>
      </SafeAreaView>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={36} color="#fff" />
          </View>
          <Text style={styles.successTitle}>
            {alreadyReported ? 'Already reported today' : 'Thanks for reporting!'}
          </Text>
          <Text style={styles.successSub}>
            {alreadyReported
              ? 'You\'ve already reported this item today.'
              : `+${POINTS_PER_REPORT} pts pending — confirmed in ~4h if unchallenged`}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main form ────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Item header */}
        <View style={styles.itemHeader}>
          <View style={styles.itemIconBox}>
            <Ionicons name="basket-outline" size={22} color={PRIMARY} />
          </View>
          <View style={styles.itemHeaderText}>
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.itemCategory}>{item.category}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>IS THIS ITEM IN STOCK?</Text>

        {/* Stock buttons */}
        <View style={styles.stockButtons}>
          <TouchableOpacity
            style={[styles.stockBtn, styles.stockBtnIn, selected === 'in-stock' && styles.stockBtnInActive]}
            onPress={() => setSelected('in-stock')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="checkmark-circle"
              size={24}
              color={selected === 'in-stock' ? '#fff' : PRIMARY}
            />
            <View>
              <Text style={[styles.stockBtnLabel, selected === 'in-stock' ? styles.labelActive : { color: PRIMARY }]}>
                In Stock
              </Text>
              <Text style={[styles.stockBtnSub, selected === 'in-stock' ? styles.subActive : { color: '#6B7280' }]}>
                Found on shelf
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.stockBtn, styles.stockBtnOut, selected === 'out-of-stock' && styles.stockBtnOutActive]}
            onPress={() => { setSelected('out-of-stock'); setQuantityEstimate(null); }}
            activeOpacity={0.8}
          >
            <Ionicons
              name="close-circle"
              size={24}
              color={selected === 'out-of-stock' ? '#fff' : '#E53935'}
            />
            <View>
              <Text style={[styles.stockBtnLabel, selected === 'out-of-stock' ? styles.labelActive : { color: '#E53935' }]}>
                Out of Stock
              </Text>
              <Text style={[styles.stockBtnSub, selected === 'out-of-stock' ? styles.subActive : { color: '#6B7280' }]}>
                Shelf is empty
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Quantity picker — only when In Stock */}
        {selected === 'in-stock' && (
          <>
            <Text style={styles.sectionLabel}>ESTIMATED QUANTITY (OPTIONAL)</Text>
            <View style={styles.qtyRow}>
              {([1, 5, 10, 50, 100] as const).map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[styles.qtyBtn, quantityEstimate === n && styles.qtyBtnActive]}
                  onPress={() => setQuantityEstimate(quantityEstimate === n ? null : n)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.qtyBtnText, quantityEstimate === n && styles.qtyBtnTextActive]}>
                    {n === 100 ? '100+' : String(n)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <Text style={styles.sectionLabel}>ADD EVIDENCE (OPTIONAL)</Text>

        {/* Camera placeholders — compact horizontal layout */}
        <View style={styles.evidenceRow}>
          <TouchableOpacity style={styles.evidenceBtn} activeOpacity={0.7}>
            <Ionicons name="camera-outline" size={18} color={PRIMARY} />
            <Text style={styles.evidenceBtnLabel}>Shelf Photo</Text>
            <View style={styles.bonusBadge}>
              <Text style={styles.bonusBadgeText}>+{PHOTO_BONUS} pts</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.evidenceBtn} activeOpacity={0.7}>
            <Ionicons name="receipt-outline" size={18} color={PRIMARY} />
            <Text style={styles.evidenceBtnLabel}>Receipt Scan</Text>
            <View style={styles.bonusBadge}>
              <Text style={styles.bonusBadgeText}>+{PHOTO_BONUS} pts</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Points note */}
        <View style={styles.pointsNote}>
          <Ionicons name="star" size={13} color="#F59E0B" />
          <Text style={styles.pointsNoteText}>
            Earns <Text style={styles.pointsBold}>{POINTS_PER_REPORT} points</Text> toward your next reward
          </Text>
        </View>

        {/* Error banner */}
        {submitError && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={15} color="#991B1B" />
            <Text style={styles.errorBannerText}>{submitError}</Text>
          </View>
        )}

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, (!selected || submitting) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!selected || submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text style={styles.submitBtnText}>Submit Report</Text>
              <View style={styles.submitPtsChip}>
                <Ionicons name="star" size={12} color="#F59E0B" />
                <Text style={styles.submitPtsText}>+{POINTS_PER_REPORT}</Text>
              </View>
            </>
          )}
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#F9FAFB' },
  scroll:           { padding: 16, paddingBottom: 24 },
  centered:         { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  errorText:        { fontSize: 15, color: '#6B7280' },
  errorDetail:      { fontSize: 11, color: '#EF4444', textAlign: 'center', fontFamily: 'monospace' },
  notTrackedTitle:  { fontSize: 17, fontWeight: '700', color: '#111827', textAlign: 'center' },
  notTrackedSub:    { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22 },
  backBtn:          { backgroundColor: PRIMARY, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 12, marginTop: 8 },
  backBtnText:      { color: '#fff', fontWeight: '700', fontSize: 15 },
  itemHeader: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, padding: 12, marginBottom: 14, gap: 12,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  itemIconBox: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: '#ECFDF5',
    alignItems: 'center', justifyContent: 'center',
  },
  itemHeaderText:   { flex: 1 },
  itemName:         { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 2 },
  itemCategory:     { fontSize: 12, color: '#9CA3AF', fontWeight: '500' },
  sectionLabel:     { fontSize: 11, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.8, marginBottom: 8, marginTop: 2 },
  stockButtons:     { flexDirection: 'row', gap: 10, marginBottom: 14 },
  stockBtn:         { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 14, gap: 10, borderWidth: 2 },
  stockBtnIn:       { backgroundColor: '#ECFDF5', borderColor: '#1D9E75' },
  stockBtnInActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  stockBtnOut:      { backgroundColor: '#FEF2F2', borderColor: '#E53935' },
  stockBtnOutActive:{ backgroundColor: '#E53935', borderColor: '#E53935' },
  stockBtnLabel:    { fontSize: 14, fontWeight: '700' },
  labelActive:      { color: '#fff' },
  stockBtnSub:      { fontSize: 11, marginTop: 1 },
  subActive:        { color: 'rgba(255,255,255,0.8)' },
  qtyRow: {
    flexDirection: 'row', gap: 8, marginBottom: 14,
  },
  qtyBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 9, borderRadius: 10,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#D1D5DB',
  },
  qtyBtnActive: {
    backgroundColor: PRIMARY, borderColor: PRIMARY,
  },
  qtyBtnText:       { fontSize: 13, fontWeight: '700', color: '#374151' },
  qtyBtnTextActive: { color: '#fff' },
  evidenceRow:      { flexDirection: 'row', gap: 10, marginBottom: 12 },
  evidenceBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1.5,
    borderStyle: 'dashed', borderColor: '#D1D5DB', gap: 8,
  },
  evidenceBtnLabel: { flex: 1, fontSize: 12, fontWeight: '600', color: '#374151' },
  bonusBadge:       { backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  bonusBadgeText:   { fontSize: 10, fontWeight: '700', color: '#92400E' },
  pointsNote: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFFBEB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
    marginBottom: 14, borderWidth: 1, borderColor: '#FDE68A',
  },
  pointsNoteText:   { fontSize: 12, color: '#6B7280', flex: 1 },
  pointsBold:       { fontWeight: '700', color: '#92400E' },
  submitBtn: {
    backgroundColor: PRIMARY, borderRadius: 12, height: 48,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  submitBtnDisabled:{ backgroundColor: '#D1D5DB' },
  submitBtnText:    { color: '#fff', fontSize: 16, fontWeight: '700' },
  errorBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12,
    marginBottom: 12, borderWidth: 1, borderColor: '#FECACA',
  },
  errorBannerText: { flex: 1, fontSize: 12, color: '#991B1B', lineHeight: 18 },
  submitPtsChip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3, gap: 3,
  },
  submitPtsText:    { color: '#fff', fontSize: 12, fontWeight: '700' },
  successIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: PRIMARY,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  successTitle:     { fontSize: 22, fontWeight: '800', color: '#111827' },
  successSub:       { fontSize: 14, color: '#6B7280' },
});

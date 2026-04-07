import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  SafeAreaView, ActivityIndicator, Platform, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Fuse from 'fuse.js';
import { fetchItems, submitReport } from '../../lib/api';
import { getSavedStore } from '../../lib/stores';
import { useAuth, getReportingUserId } from '../../lib/auth';
import type { LiveItem } from '../../lib/types';

const PRIMARY = '#1D9E75';
const OCR_URL = 'https://api.ocr.space/parse/image';
const OCR_KEY = 'K89755849088957';

type ScanState = 'idle' | 'processing' | 'matching' | 'submitting' | 'done' | 'error';

interface MatchRow {
  receiptLine: string;
  match: LiveItem | null;
  score: number;        // 0–1, higher = better
  confirmed: boolean;
}

export default function ScanScreen() {
  const { session } = useAuth();
  const reportingId = getReportingUserId(session);

  const [imageUri, setImageUri]   = useState<string | null>(null);
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [rows, setRows]           = useState<MatchRow[]>([]);
  const [submitted, setSubmitted] = useState(0);
  const [error, setError]         = useState<string | null>(null);

  const store = getSavedStore();

  function pickFile() {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const dataUrl = await fileToDataUrl(file);
      setImageUri(dataUrl);
      runOcrAndMatch(file);
    };
    input.click();
  }

  async function runOcrAndMatch(file: File) {
    setScanState('processing');
    setError(null);
    setRows([]);

    try {
      // 1. OCR
      const form = new FormData();
      form.append('file', file);
      form.append('apikey', OCR_KEY);
      form.append('language', 'eng');
      form.append('isOverlayRequired', 'false');

      const res = await fetch(OCR_URL, { method: 'POST', body: form });
      if (!res.ok) throw new Error(`OCR API error: HTTP ${res.status}`);
      const data = await res.json();
      if (data.IsErroredOnProcessing) throw new Error(data.ErrorMessage?.[0] ?? 'OCR failed');

      const rawText: string = data.ParsedResults?.[0]?.ParsedText ?? '';
      const receiptLines = parseReceiptItems(rawText);

      if (receiptLines.length === 0) {
        setError('No items detected — try a clearer photo.');
        setScanState('error');
        return;
      }

      // 2. Load store catalog
      const storeId = store?.supabaseId ?? undefined;
      const catalog = await fetchItems(storeId);

      // 3. Fuzzy match
      const fuse = new Fuse(catalog, {
        keys: ['name', 'brand'],
        threshold: 0.45,       // lower = stricter
        includeScore: true,
      });

      const matched: MatchRow[] = receiptLines.map((line) => {
        const results = fuse.search(line);
        const best = results[0];
        return {
          receiptLine: line,
          match: best ? best.item : null,
          score: best ? 1 - (best.score ?? 1) : 0,
          confirmed: best != null,   // auto-confirm matches above threshold
        };
      });

      setRows(matched);
      setScanState('matching');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to process receipt');
      setScanState('error');
    }
  }

  function toggleConfirm(idx: number) {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, confirmed: !r.confirmed } : r));
  }

  async function submitConfirmed() {
    const confirmed = rows.filter((r) => r.confirmed && r.match);
    if (confirmed.length === 0) return;

    setScanState('submitting');
    let count = 0;
    const storeId = store?.supabaseId ?? null;

    for (const row of confirmed) {
      try {
        await submitReport(row.match!.id, 'in-stock', reportingId, null, storeId);
        count++;
      } catch {
        // skip individual failures silently
      }
    }

    setSubmitted(count);
    setScanState('done');
  }

  function reset() {
    setImageUri(null);
    setScanState('idle');
    setRows([]);
    setSubmitted(0);
    setError(null);
  }

  const confirmedCount = rows.filter((r) => r.confirmed && r.match).length;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="receipt-outline" size={36} color={PRIMARY} />
          </View>
          <Text style={styles.heroTitle}>Scan a Receipt</Text>
          <Text style={styles.heroSub}>
            Upload a receipt to automatically report items as in-stock at your store.
          </Text>
        </View>

        {/* Store context */}
        {store ? (
          <View style={styles.storeChip}>
            <Ionicons name="storefront-outline" size={14} color={PRIMARY} />
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.storeChipText} numberOfLines={1}>{store.name}</Text>
              {store.address ? (
                <Text style={styles.storeChipAddress} numberOfLines={1}>{store.address}</Text>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={styles.storeWarning}>
            <Ionicons name="warning-outline" size={14} color="#B45309" />
            <Text style={styles.storeWarningText}>No store selected — reports won't be store-specific. Select one in the Shop tab first.</Text>
          </View>
        )}

        {/* Image preview */}
        {imageUri && (
          <View style={styles.previewCard}>
            <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
            {(scanState === 'idle' || scanState === 'error') && (
              <TouchableOpacity style={styles.clearBtn} onPress={reset}>
                <Ionicons name="close-circle" size={22} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Idle: upload box */}
        {scanState === 'idle' && (
          <TouchableOpacity style={styles.uploadBox} onPress={pickFile} activeOpacity={0.75}>
            <View style={styles.uploadIconCircle}>
              <Ionicons name="cloud-upload-outline" size={32} color={PRIMARY} />
            </View>
            <Text style={styles.uploadTitle}>Tap to upload receipt</Text>
            <Text style={styles.uploadSub}>JPG, PNG or PDF · Max 10 MB</Text>
            <View style={styles.orRow}>
              <View style={styles.orLine} /><Text style={styles.orText}>or</Text><View style={styles.orLine} />
            </View>
            <View style={styles.cameraBtn}>
              <Ionicons name="camera-outline" size={16} color={PRIMARY} />
              <Text style={styles.cameraBtnText}>Take a photo</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Processing */}
        {scanState === 'processing' && (
          <View style={styles.statusCard}>
            <ActivityIndicator size="large" color={PRIMARY} />
            <Text style={styles.statusTitle}>Reading receipt…</Text>
            <Text style={styles.statusSub}>Matching items to your store catalog.</Text>
          </View>
        )}

        {/* Error */}
        {scanState === 'error' && (
          <View style={styles.statusCard}>
            <Ionicons name="warning-outline" size={36} color="#EF4444" />
            <Text style={[styles.statusTitle, { color: '#EF4444' }]}>Scan failed</Text>
            <Text style={styles.statusSub}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={reset}>
              <Text style={styles.retryBtnText}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Matching: confirm/skip each row */}
        {scanState === 'matching' && (
          <>
            <View style={styles.matchHeader}>
              <Text style={styles.matchHeaderTitle}>{rows.length} items detected</Text>
              <Text style={styles.matchHeaderSub}>
                Toggle items off to skip them. Green = matched to catalog.
              </Text>
            </View>

            <View style={styles.matchList}>
              {rows.map((row, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.matchRow, row.confirmed && row.match && styles.matchRowConfirmed]}
                  onPress={() => toggleConfirm(i)}
                  activeOpacity={0.7}
                >
                  <View style={styles.matchCheck}>
                    <Ionicons
                      name={row.confirmed && row.match ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={row.confirmed && row.match ? PRIMARY : '#D1D5DB'}
                    />
                  </View>
                  <View style={styles.matchText}>
                    <Text style={styles.matchReceipt} numberOfLines={1}>{row.receiptLine}</Text>
                    {row.match ? (
                      <View style={styles.matchCatalogRow}>
                        <Ionicons name="arrow-forward" size={11} color="#9CA3AF" />
                        <Text style={styles.matchCatalog} numberOfLines={1}>
                          {row.match.name}{row.match.brand ? ` · ${row.match.brand}` : ''}
                        </Text>
                        <View style={[styles.scorePill, { backgroundColor: scoreColor(row.score) + '20' }]}>
                          <Text style={[styles.scoreText, { color: scoreColor(row.score) }]}>
                            {Math.round(row.score * 100)}%
                          </Text>
                        </View>
                      </View>
                    ) : (
                      <Text style={styles.noMatch}>No catalog match — tap to skip</Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, confirmedCount === 0 && styles.submitBtnDisabled]}
              onPress={submitConfirmed}
              disabled={confirmedCount === 0}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark-done" size={18} color="#fff" />
              <Text style={styles.submitBtnText}>
                Report {confirmedCount} item{confirmedCount !== 1 ? 's' : ''} as In Stock
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.scanAnotherBtn} onPress={reset}>
              <Text style={styles.scanAnotherText}>Scan a different receipt</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Submitting */}
        {scanState === 'submitting' && (
          <View style={styles.statusCard}>
            <ActivityIndicator size="large" color={PRIMARY} />
            <Text style={styles.statusTitle}>Submitting reports…</Text>
          </View>
        )}

        {/* Done */}
        {scanState === 'done' && (
          <View style={styles.statusCard}>
            <View style={styles.doneIcon}>
              <Ionicons name="checkmark-circle" size={52} color={PRIMARY} />
            </View>
            <Text style={styles.statusTitle}>Done!</Text>
            <Text style={styles.statusSub}>
              {submitted} item{submitted !== 1 ? 's' : ''} reported as in-stock.{'\n'}
              You earned {submitted * 10} pts.
            </Text>
            <TouchableOpacity style={styles.retryBtn} onPress={reset}>
              <Text style={styles.retryBtnText}>Scan another receipt</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* How it works (idle only) */}
        {scanState === 'idle' && (
          <>
            <Text style={styles.sectionTitle}>How it works</Text>
            <View style={styles.stepsList}>
              {STEPS.map((step, i) => (
                <View key={i} style={styles.step}>
                  <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
                  <View style={styles.stepText}>
                    <Text style={styles.stepTitle}>{step.title}</Text>
                    <Text style={styles.stepSub}>{step.sub}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function parseReceiptItems(text: string): string[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const items: string[] = [];
  for (const line of lines) {
    if (/^\$?[\d.,\s%*]+$/.test(line)) continue;
    if (/^\s*(subtotal|sub total|total|tax|change|cash|debit|credit|visa|mastercard|approval|auth|thank you|welcome|receipt|store #|phone|address|date|time|cashier|register|trans|transaction|item|qty|price|amount|savings|discount|member|reward|point|balance|earn|redeem|survey|barcode)/i.test(line)) continue;
    if (line.length < 4) continue;
    const cleaned = line.replace(/\s+\$?[\d]+\.[\d]{2}\s*[A-Z]?\s*$/, '').trim();
    if (cleaned.length >= 4) items.push(cleaned);
  }
  return [...new Set(items)].slice(0, 40);
}

function scoreColor(score: number): string {
  if (score >= 0.75) return '#1D9E75';
  if (score >= 0.5)  return '#F59E0B';
  return '#EF4444';
}

const STEPS = [
  { title: 'Select your store first', sub: 'Tap the Shop tab and pick a store so reports are location-specific.' },
  { title: 'Upload or photograph your receipt', sub: 'Supports receipts from most major grocery chains.' },
  { title: 'Confirm the matched items', sub: 'We fuzzy-match receipt lines to your store\'s catalog. Toggle any off to skip.' },
  { title: 'Submit — earn points instantly', sub: '10 pts per item reported as in-stock.' },
];

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  scroll:    { padding: 16, paddingBottom: 40 },

  hero:      { alignItems: 'center', paddingVertical: 20, gap: 8 },
  heroIcon:  { width: 68, height: 68, borderRadius: 20, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#111827' },
  heroSub:   { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20, maxWidth: 300 },

  storeChip:        { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', backgroundColor: '#ECFDF5', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 14, borderWidth: 1, borderColor: '#A7F3D0', maxWidth: '90%' },
  storeChipText:    { fontSize: 13, fontWeight: '600', color: '#065F46' },
  storeChipAddress: { fontSize: 11, color: '#059669', marginTop: 1 },
  storeWarning:     { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#FFFBEB', borderRadius: 10, padding: 10, marginBottom: 14, borderWidth: 1, borderColor: '#FDE68A' },
  storeWarningText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },

  previewCard:  { borderRadius: 14, overflow: 'hidden', marginBottom: 14, backgroundColor: '#000', position: 'relative' },
  previewImage: { width: '100%', height: 180 },
  clearBtn:     { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 12 },

  uploadBox:        { borderWidth: 2, borderStyle: 'dashed', borderColor: PRIMARY, borderRadius: 18, backgroundColor: '#ECFDF5', alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20, marginBottom: 24, gap: 8 },
  uploadIconCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  uploadTitle:      { fontSize: 16, fontWeight: '700', color: '#111827' },
  uploadSub:        { fontSize: 12, color: '#9CA3AF' },
  orRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, width: '60%', marginVertical: 4 },
  orLine:  { flex: 1, height: 1, backgroundColor: '#D1D5DB' },
  orText:  { fontSize: 12, color: '#9CA3AF', fontWeight: '600' },
  cameraBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: PRIMARY },
  cameraBtnText: { fontSize: 14, fontWeight: '600', color: PRIMARY },

  statusCard:  { alignItems: 'center', paddingVertical: 40, gap: 10 },
  statusTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  statusSub:   { fontSize: 13, color: '#9CA3AF', textAlign: 'center', lineHeight: 19 },
  retryBtn:    { marginTop: 8, backgroundColor: PRIMARY, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  retryBtnText:{ fontSize: 14, fontWeight: '700', color: '#fff' },
  doneIcon:    { marginBottom: 4 },

  matchHeader:      { marginBottom: 12 },
  matchHeaderTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 3 },
  matchHeaderSub:   { fontSize: 12, color: '#9CA3AF' },

  matchList:          { gap: 8, marginBottom: 16 },
  matchRow:           { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  matchRowConfirmed:  { borderColor: '#A7F3D0', backgroundColor: '#F0FDF4' },
  matchCheck:         { flexShrink: 0 },
  matchText:          { flex: 1, gap: 3, minWidth: 0 },
  matchReceipt:       { fontSize: 13, fontWeight: '600', color: '#111827' },
  matchCatalogRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  matchCatalog:       { fontSize: 12, color: '#6B7280', flex: 1 },
  noMatch:            { fontSize: 11, color: '#D1D5DB', fontStyle: 'italic' },
  scorePill:          { borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  scoreText:          { fontSize: 10, fontWeight: '700' },

  submitBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 14, marginBottom: 10 },
  submitBtnDisabled: { backgroundColor: '#D1D5DB' },
  submitBtnText:     { fontSize: 15, fontWeight: '700', color: '#fff' },
  scanAnotherBtn:    { alignItems: 'center', paddingVertical: 10 },
  scanAnotherText:   { fontSize: 13, color: '#9CA3AF', fontWeight: '600' },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 12 },
  stepsList:    { gap: 10 },
  step:         { flexDirection: 'row', gap: 14, backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'flex-start' },
  stepNum:      { width: 28, height: 28, borderRadius: 14, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumText:  { fontSize: 13, fontWeight: '800', color: PRIMARY },
  stepText:     { flex: 1, gap: 3 },
  stepTitle:    { fontSize: 14, fontWeight: '600', color: '#111827' },
  stepSub:      { fontSize: 13, color: '#9CA3AF', lineHeight: 18 },
});

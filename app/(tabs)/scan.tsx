import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const PRIMARY = '#1D9E75';
const OCR_URL = 'https://api.ocr.space/parse/image';
const OCR_KEY = 'helloworld'; // free demo key — 25k req/month

type ScanState = 'idle' | 'processing' | 'done' | 'error';

export default function ScanScreen() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [parsedItems, setParsedItems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function pickFile() {
    if (Platform.OS !== 'web') return;
    // Create a temporary file input and trigger it
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const dataUrl = await fileToDataUrl(file);
      setImageUri(dataUrl);
      runOcr(file);
    };
    input.click();
  }

  async function runOcr(file: File) {
    setScanState('processing');
    setError(null);
    setParsedItems([]);

    try {
      const form = new FormData();
      form.append('file', file);
      form.append('apikey', OCR_KEY);
      form.append('language', 'eng');
      form.append('isOverlayRequired', 'false');

      const res = await fetch(OCR_URL, { method: 'POST', body: form });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.IsErroredOnProcessing) {
        throw new Error(data.ErrorMessage?.[0] ?? 'OCR failed');
      }

      const text: string = data.ParsedResults?.[0]?.ParsedText ?? '';
      const items = parseReceiptItems(text);
      setParsedItems(items);
      setScanState(items.length > 0 ? 'done' : 'error');
      if (items.length === 0) setError('No items found — try a clearer photo.');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to process receipt');
      setScanState('error');
    }
  }

  function reset() {
    setImageUri(null);
    setScanState('idle');
    setParsedItems([]);
    setError(null);
  }

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
            Upload a receipt photo to automatically detect which items were in stock at your store.
          </Text>
        </View>

        {/* Image preview */}
        {imageUri && (
          <View style={styles.previewCard}>
            <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
            <TouchableOpacity style={styles.clearBtn} onPress={reset}>
              <Ionicons name="close-circle" size={22} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        )}

        {/* Upload box (shown when idle) */}
        {scanState === 'idle' && (
          <TouchableOpacity style={styles.uploadBox} onPress={pickFile} activeOpacity={0.75}>
            <View style={styles.uploadIconCircle}>
              <Ionicons name="cloud-upload-outline" size={32} color={PRIMARY} />
            </View>
            <Text style={styles.uploadTitle}>Tap to upload receipt</Text>
            <Text style={styles.uploadSub}>JPG, PNG or PDF · Max 10 MB</Text>
            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>or</Text>
              <View style={styles.orLine} />
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
            <Text style={styles.statusSub}>This usually takes a few seconds.</Text>
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

        {/* Results */}
        {scanState === 'done' && parsedItems.length > 0 && (
          <>
            <View style={styles.resultsHeader}>
              <View style={styles.resultsBadge}>
                <Ionicons name="checkmark-circle" size={16} color="#1D9E75" />
                <Text style={styles.resultsBadgeText}>{parsedItems.length} items found</Text>
              </View>
              <TouchableOpacity onPress={reset}>
                <Text style={styles.rescanText}>Scan another</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.resultsHint}>
              These items were detected on your receipt. Go to the Shop tab to report their availability at your store.
            </Text>

            <View style={styles.itemsList}>
              {parsedItems.map((item, i) => (
                <View key={i} style={styles.itemRow}>
                  <View style={styles.itemDot} />
                  <Text style={styles.itemText}>{item}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* How it works */}
        {scanState === 'idle' && (
          <>
            <Text style={styles.sectionTitle}>How it works</Text>
            <View style={styles.stepsList}>
              {STEPS.map((step, i) => (
                <View key={i} style={styles.step}>
                  <View style={styles.stepNum}>
                    <Text style={styles.stepNumText}>{i + 1}</Text>
                  </View>
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
    // Skip lines that are pure numbers/prices
    if (/^\$?[\d.,\s%*]+$/.test(line)) continue;
    // Skip common non-item receipt lines
    if (/^\s*(subtotal|sub total|total|tax|change|cash|debit|credit|visa|mastercard|approval|auth|thank you|welcome|receipt|store #|phone|address|date|time|cashier|register|trans|transaction|item|qty|price|amount|savings|discount|member|reward|point|balance|earn|redeem|survey|barcode)/i.test(line)) continue;
    // Skip very short lines
    if (line.length < 4) continue;
    // Strip trailing price pattern (e.g. "3.99 B" or "$3.99")
    const cleaned = line.replace(/\s+\$?[\d]+\.[\d]{2}\s*[A-Z]?\s*$/, '').trim();
    if (cleaned.length >= 4) {
      items.push(cleaned);
    }
  }

  // Deduplicate and limit
  return [...new Set(items)].slice(0, 30);
}

const STEPS = [
  { title: 'Upload or photograph your receipt', sub: 'Supports receipts from most major grocery chains.' },
  { title: 'We extract the items automatically', sub: 'OCR reads item names directly from the receipt.' },
  { title: 'Review the detected items', sub: 'Confirm the list looks right before using it.' },
  { title: 'Report availability in the Shop tab', sub: 'Use the detected items to quickly log stock status.' },
];

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  scroll:    { padding: 16, paddingBottom: 40 },

  hero: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  heroIcon: { width: 68, height: 68, borderRadius: 20, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#111827' },
  heroSub:   { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20, maxWidth: 300 },

  previewCard: { borderRadius: 14, overflow: 'hidden', marginBottom: 14, backgroundColor: '#000', position: 'relative' },
  previewImage: { width: '100%', height: 200 },
  clearBtn: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 12 },

  uploadBox: { borderWidth: 2, borderStyle: 'dashed', borderColor: PRIMARY, borderRadius: 18, backgroundColor: '#ECFDF5', alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20, marginBottom: 24, gap: 8 },
  uploadIconCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  uploadTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  uploadSub:   { fontSize: 12, color: '#9CA3AF' },
  orRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, width: '60%', marginVertical: 4 },
  orLine: { flex: 1, height: 1, backgroundColor: '#D1D5DB' },
  orText: { fontSize: 12, color: '#9CA3AF', fontWeight: '600' },
  cameraBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: PRIMARY },
  cameraBtnText: { fontSize: 14, fontWeight: '600', color: PRIMARY },

  statusCard:  { alignItems: 'center', paddingVertical: 40, gap: 10 },
  statusTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  statusSub:   { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },
  retryBtn:    { marginTop: 8, backgroundColor: PRIMARY, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  retryBtnText:{ fontSize: 14, fontWeight: '700', color: '#fff' },

  resultsHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  resultsBadge:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#ECFDF5', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#A7F3D0' },
  resultsBadgeText:  { fontSize: 13, fontWeight: '700', color: '#065F46' },
  rescanText:        { fontSize: 13, fontWeight: '600', color: PRIMARY },
  resultsHint:       { fontSize: 12, color: '#9CA3AF', lineHeight: 17, marginBottom: 14 },
  itemsList:         { backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 10, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 24 },
  itemRow:           { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemDot:           { width: 7, height: 7, borderRadius: 4, backgroundColor: PRIMARY, flexShrink: 0 },
  itemText:          { fontSize: 14, color: '#111827', flex: 1 },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 12 },
  stepsList:    { gap: 10 },
  step:         { flexDirection: 'row', gap: 14, backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'flex-start' },
  stepNum:      { width: 28, height: 28, borderRadius: 14, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumText:  { fontSize: 13, fontWeight: '800', color: PRIMARY },
  stepText:     { flex: 1, gap: 3 },
  stepTitle:    { fontSize: 14, fontWeight: '600', color: '#111827' },
  stepSub:      { fontSize: 13, color: '#9CA3AF', lineHeight: 18 },
});

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  SafeAreaView,
  ActivityIndicator,
  Image,
  Modal,
  Dimensions,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fetchItem, fetchRecentReports } from '../../lib/api';
import { STATUS_COLORS, STATUS_LABELS, formatTimeAgo } from '../../data';
import type { LiveItem, RecentReport } from '../../lib/types';
import type { StockStatus } from '../../data';

const PRIMARY = '#1D9E75';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [item, setItem] = useState<LiveItem | null>(null);
  const [reports, setReports] = useState<RecentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [itemData, reportData] = await Promise.all([
        fetchItem(id as string),
        fetchRecentReports(id as string),
      ]);
      setItem(itemData);
      setReports(reportData);
    } catch (e) {
      // silently keep previous state on refresh failures
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Refresh every time screen comes into focus (e.g. after submitting a report)
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={PRIMARY} />
        </View>
      </SafeAreaView>
    );
  }

  if (!item) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={42} color="#D1D5DB" />
          <Text style={styles.emptyText}>Item not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const withPhotos = reports.filter((r) => r.photo_url);

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={reports}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            {/* Item card */}
            <View style={styles.itemCard}>
              <View style={styles.itemIconBox}>
                <Ionicons name="basket-outline" size={28} color={PRIMARY} />
              </View>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemCategory}>{item.category}</Text>
              </View>
              <StatusBadge status={item.status} />
            </View>

            {/* Submit report CTA */}
            <TouchableOpacity
              style={styles.reportBtn}
              onPress={() => router.push(`/report/${item.id}`)}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle-outline" size={20} color="#fff" />
              <Text style={styles.reportBtnText}>Submit a Report</Text>
              <View style={styles.ptsChip}>
                <Ionicons name="star" size={11} color="#F59E0B" />
                <Text style={styles.ptsChipText}>+10</Text>
              </View>
            </TouchableOpacity>

            {/* Photo gallery strip (only when photos exist) */}
            {withPhotos.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Shelf Photos <Text style={styles.sectionCount}>({withPhotos.length})</Text>
                </Text>
                <FlatList
                  horizontal
                  data={withPhotos}
                  keyExtractor={(r) => `thumb-${r.id}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.thumbRow}
                  renderItem={({ item: r }) => (
                    <TouchableOpacity
                      onPress={() => setLightboxUri(r.photo_url!)}
                      activeOpacity={0.85}
                    >
                      <Image
                        source={{ uri: r.photo_url! }}
                        style={styles.thumbnail}
                      />
                      <View style={styles.thumbOverlay}>
                        <Text style={styles.thumbTime}>{formatTimeAgo(r.created_at)}</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                />
              </View>
            )}

            {/* Report history header */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Report History{' '}
                <Text style={styles.sectionCount}>({reports.length})</Text>
              </Text>
            </View>
          </>
        }
        renderItem={({ item: report }) => (
          <ReportRow
            report={report}
            onPhotoPress={() => report.photo_url && setLightboxUri(report.photo_url)}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.emptyReports}>
            <Ionicons name="clipboard-outline" size={36} color="#D1D5DB" />
            <Text style={styles.emptyText}>No reports yet. Be the first!</Text>
          </View>
        }
      />

      {/* Full-screen photo lightbox */}
      <Modal
        visible={lightboxUri !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxUri(null)}
      >
        <Pressable style={styles.lightboxBackdrop} onPress={() => setLightboxUri(null)}>
          <Image
            source={{ uri: lightboxUri ?? undefined }}
            style={styles.lightboxImage}
            resizeMode="contain"
          />
          <TouchableOpacity style={styles.lightboxClose} onPress={() => setLightboxUri(null)}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </Pressable>
      </Modal>
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

function ReportRow({
  report,
  onPhotoPress,
}: {
  report: RecentReport;
  onPhotoPress: () => void;
}) {
  const isInStock = report.status === 'in-stock';
  const color = isInStock ? PRIMARY : '#E53935';
  const label = isInStock ? 'In Stock' : 'Out of Stock';
  const icon = isInStock ? 'checkmark-circle' : 'close-circle';

  return (
    <View style={styles.reportRow}>
      <View style={[styles.reportIconBox, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={styles.reportInfo}>
        <Text style={[styles.reportLabel, { color }]}>{label}</Text>
        <Text style={styles.reportTime}>{formatTimeAgo(report.created_at)}</Text>
      </View>
      {report.photo_url ? (
        <TouchableOpacity onPress={onPhotoPress} activeOpacity={0.8}>
          <Image source={{ uri: report.photo_url }} style={styles.reportThumb} />
          <View style={styles.reportThumbBadge}>
            <Ionicons name="expand-outline" size={10} color="#fff" />
          </View>
        </TouchableOpacity>
      ) : (
        <View style={styles.noPhoto}>
          <Ionicons name="camera-outline" size={16} color="#D1D5DB" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#F9FAFB' },
  centered:       { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  listContent:    { paddingBottom: 40 },

  // Item card
  itemCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    margin: 16, marginBottom: 12, borderRadius: 14, padding: 16, gap: 12,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  itemIconBox: {
    width: 48, height: 48, borderRadius: 13, backgroundColor: '#ECFDF5',
    alignItems: 'center', justifyContent: 'center',
  },
  itemInfo:       { flex: 1 },
  itemName:       { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 2 },
  itemCategory:   { fontSize: 12, color: '#9CA3AF', fontWeight: '500' },

  // Status badge
  badge: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, gap: 4,
  },
  badgeDot:       { width: 6, height: 6, borderRadius: 3 },
  badgeText:      { fontSize: 11, fontWeight: '700' },

  // CTA button
  reportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: PRIMARY, marginHorizontal: 16, borderRadius: 14,
    height: 50, gap: 8, marginBottom: 20,
  },
  reportBtnText:  { color: '#fff', fontSize: 15, fontWeight: '700' },
  ptsChip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3, gap: 3,
  },
  ptsChipText:    { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Sections
  section:        { paddingHorizontal: 16, marginBottom: 12 },
  sectionTitle:   { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 10 },
  sectionCount:   { color: '#9CA3AF', fontWeight: '500' },

  // Thumbnail strip
  thumbRow:       { gap: 8, paddingBottom: 4 },
  thumbnail: {
    width: 110, height: 80, borderRadius: 10,
    backgroundColor: '#E5E7EB',
  },
  thumbOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.35)', borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10, paddingVertical: 3, paddingHorizontal: 6,
  },
  thumbTime:      { color: '#fff', fontSize: 10, fontWeight: '600' },

  // Report rows
  separator:      { height: 1, backgroundColor: '#F3F4F6', marginHorizontal: 16 },
  reportRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
  },
  reportIconBox: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  reportInfo:     { flex: 1 },
  reportLabel:    { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  reportTime:     { fontSize: 12, color: '#9CA3AF' },
  reportThumb: {
    width: 52, height: 40, borderRadius: 8,
    backgroundColor: '#E5E7EB',
  },
  reportThumbBadge: {
    position: 'absolute', top: 2, right: 2,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 4,
    padding: 2,
  },
  noPhoto: {
    width: 52, height: 40, borderRadius: 8,
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center',
  },
  emptyReports:   { alignItems: 'center', paddingTop: 40, gap: 10, paddingHorizontal: 16 },
  emptyText:      { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },

  // Lightbox
  lightboxBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center', justifyContent: 'center',
  },
  lightboxImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.85,
  },
  lightboxClose: {
    position: 'absolute', top: 52, right: 20,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20,
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
  },
});

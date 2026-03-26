import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchNearbyStores,
  findSupabaseStore,
  saveStore,
  type NearbyStore,
} from '../lib/stores';

const PRIMARY = '#1D9E75';

interface Props {
  visible: boolean;
  onSelect: (name: string, supabaseId: string | null) => void;
  onClose: () => void;
}

export default function StorePicker({ visible, onSelect, onClose }: Props) {
  const [stores, setStores] = useState<NearbyStore[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) load();
  }, [visible]);

  async function load() {
    setLoading(true);
    setError(null);
    setStores([]);
    try {
      let lat: number;
      let lon: number;

      if (Platform.OS === 'web') {
        // Use browser Geolocation API directly on web
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 10000,
            maximumAge: 60000,
          })
        );
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setError('Location permission denied. Please enable location in Settings.');
          return;
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        lat = loc.coords.latitude;
        lon = loc.coords.longitude;
      }

      const nearby = await fetchNearbyStores(lat, lon);
      setStores(nearby);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes('denied') || msg.includes('PERMISSION')) {
        setError('Location access was denied. Please allow location in your browser settings and try again.');
      } else {
        setError('Could not find nearby stores. Check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSelect(store: NearbyStore) {
    const supabaseId = await findSupabaseStore(store.name);
    const selected = { name: store.name, supabaseId };
    saveStore(selected);
    onSelect(store.name, supabaseId);
    onClose();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>Nearby Stores</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
              <Ionicons name="close" size={22} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>Grocery stores within 5 miles</Text>
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={PRIMARY} />
            <Text style={styles.hint}>Finding stores near you…</Text>
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Ionicons name="location-outline" size={48} color="#D1D5DB" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryBtnText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : stores.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons name="storefront-outline" size={48} color="#D1D5DB" />
            <Text style={styles.hint}>No grocery stores found nearby.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryBtnText}>Search Again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={stores}
            keyExtractor={(s) => s.osmId}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.storeRow}
                onPress={() => handleSelect(item)}
                activeOpacity={0.7}
              >
                <View style={styles.storeIcon}>
                  <Ionicons name="storefront-outline" size={20} color={PRIMARY} />
                </View>
                <View style={styles.storeInfo}>
                  <Text style={styles.storeName}>{item.name}</Text>
                  <Text style={styles.storeDist}>
                    {item.distanceMi < 0.1
                      ? 'Less than 0.1 mi away'
                      : `${item.distanceMi.toFixed(1)} mi away`}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#F9FAFB' },
  header:      { backgroundColor: '#fff', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  handle:      { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginTop: 10, marginBottom: 14 },
  headerRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:       { fontSize: 18, fontWeight: '700', color: '#111827' },
  subtitle:    { fontSize: 13, color: '#9CA3AF', marginTop: 4 },
  closeBtn:    { padding: 4 },
  centered:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  hint:        { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },
  errorText:   { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
  retryBtn:    { backgroundColor: PRIMARY, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10, marginTop: 4 },
  retryBtnText:{ color: '#fff', fontWeight: '700', fontSize: 14 },
  list:        { padding: 16 },
  separator:   { height: 1, backgroundColor: '#F3F4F6', marginLeft: 60 },
  storeRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 12 },
  storeIcon:   { width: 40, height: 40, borderRadius: 10, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },
  storeInfo:   { flex: 1, gap: 2 },
  storeName:   { fontSize: 15, fontWeight: '600', color: '#111827' },
  storeDist:   { fontSize: 12, color: '#9CA3AF' },
});

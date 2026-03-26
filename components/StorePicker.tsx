import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchNearbyStores,
  findSupabaseStore,
  saveStore,
  type NearbyStore,
} from '../lib/stores';
import StoreMap from './StoreMap';

const PRIMARY = '#1D9E75';

interface Props {
  visible: boolean;
  onSelect: (name: string, supabaseId: string | null) => void;
  onClose: () => void;
}

async function geocodeZip(zip: string): Promise<{ lat: number; lon: number }> {
  const url =
    `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(zip)}&country=US&format=json&limit=1`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error('Geocoding failed.');
  const data = await res.json();
  if (!data.length) throw new Error(`No location found for zip code "${zip}".`);
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

export default function StorePicker({ visible, onSelect, onClose }: Props) {
  const [stores, setStores] = useState<NearbyStore[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showZipInput, setShowZipInput] = useState(false);
  const [zip, setZip] = useState('');
  const [zipError, setZipError] = useState<string | null>(null);
  const [hoveredOsmId, setHoveredOsmId] = useState<string | null>(null);
  const zipRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList<NearbyStore>>(null);

  useEffect(() => {
    if (visible) {
      setShowZipInput(false);
      setZip('');
      setZipError(null);
      setCoords(null);
      loadFromGPS();
    }
  }, [visible]);

  async function loadFromGPS() {
    setLoading(true);
    setError(null);
    setStores([]);
    try {
      const loc = await getGPSCoords();
      setCoords(loc);
      const nearby = await fetchNearbyStores(loc.lat, loc.lon);
      setStores(nearby);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const isDenied =
        msg.includes('denied') ||
        msg.includes('PERMISSION') ||
        msg.includes('User denied') ||
        msg.toLowerCase().includes('not allowed');
      if (isDenied) {
        setShowZipInput(true);
      } else {
        setError('Could not find nearby stores. Check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function getGPSCoords(): Promise<{ lat: number; lon: number }> {
    if (Platform.OS === 'web') {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 10000,
          maximumAge: 60000,
        })
      );
      return { lat: pos.coords.latitude, lon: pos.coords.longitude };
    } else {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('PERMISSION_DENIED');
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      return { lat: loc.coords.latitude, lon: loc.coords.longitude };
    }
  }

  async function handleZipSearch() {
    const trimmed = zip.trim();
    if (!/^\d{5}$/.test(trimmed)) {
      setZipError('Please enter a valid 5-digit zip code.');
      return;
    }
    setZipError(null);
    setLoading(true);
    setShowZipInput(false);
    setStores([]);
    setError(null);
    try {
      const loc = await geocodeZip(trimmed);
      setCoords(loc);
      const nearby = await fetchNearbyStores(loc.lat, loc.lon);
      setStores(nearby);
    } catch (e: any) {
      setError(e.message || 'Could not find stores for that zip code.');
      setShowZipInput(true);
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

  // When a map marker is hovered/selected, scroll the list to that item
  function handleMapHover(osmId: string | null) {
    setHoveredOsmId(osmId);
    if (osmId) {
      const idx = stores.findIndex((s) => s.osmId === osmId);
      if (idx >= 0) {
        listRef.current?.scrollToIndex({ index: idx, animated: true, viewOffset: 8 });
      }
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView style={styles.container} behavior="padding">
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
        ) : showZipInput ? (
          <View style={styles.centered}>
            <Ionicons name="location-outline" size={48} color="#D1D5DB" />
            <Text style={styles.permissionTitle}>Location access needed</Text>
            <Text style={styles.permissionSub}>
              Enter your zip code to find nearby stores instead.
            </Text>
            <View style={styles.zipRow}>
              <TextInput
                ref={zipRef}
                style={[styles.zipInput, zipError ? styles.zipInputError : null]}
                placeholder="e.g. 92688"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                maxLength={5}
                value={zip}
                onChangeText={(t) => { setZip(t); setZipError(null); }}
                onSubmitEditing={handleZipSearch}
                returnKeyType="search"
                autoFocus
              />
              <TouchableOpacity
                style={[styles.zipBtn, zip.length !== 5 && styles.zipBtnDisabled]}
                onPress={handleZipSearch}
                disabled={zip.length !== 5}
              >
                <Ionicons name="search" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
            {zipError ? (
              <Text style={styles.zipErrorText}>{zipError}</Text>
            ) : null}
            <TouchableOpacity onPress={loadFromGPS} style={styles.tryGpsBtn}>
              <Ionicons name="navigate-outline" size={14} color={PRIMARY} />
              <Text style={styles.tryGpsBtnText}>Try location again</Text>
            </TouchableOpacity>
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Ionicons name="cloud-offline-outline" size={48} color="#D1D5DB" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadFromGPS}>
              <Text style={styles.retryBtnText}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setError(null); setShowZipInput(true); }}
              style={styles.tryGpsBtn}
            >
              <Ionicons name="keypad-outline" size={14} color={PRIMARY} />
              <Text style={styles.tryGpsBtnText}>Enter zip code instead</Text>
            </TouchableOpacity>
          </View>
        ) : stores.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons name="storefront-outline" size={48} color="#D1D5DB" />
            <Text style={styles.hint}>No grocery stores found nearby.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadFromGPS}>
              <Text style={styles.retryBtnText}>Search Again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowZipInput(true)}
              style={styles.tryGpsBtn}
            >
              <Ionicons name="keypad-outline" size={14} color={PRIMARY} />
              <Text style={styles.tryGpsBtnText}>Enter a different zip code</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.resultsContainer}>
            {/* Map (web only — native StoreMap returns null) */}
            {coords ? (
              <StoreMap
                stores={stores}
                center={coords}
                selectedOsmId={hoveredOsmId}
                onHover={handleMapHover}
                onSelect={handleSelect}
              />
            ) : null}

            {/* Store list */}
            <FlatList
              ref={listRef}
              data={stores}
              keyExtractor={(s) => s.osmId}
              contentContainerStyle={styles.list}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              onScrollToIndexFailed={() => {}}
              ListHeaderComponent={
                <TouchableOpacity
                  style={styles.changeZipRow}
                  onPress={() => { setStores([]); setCoords(null); setShowZipInput(true); }}
                >
                  <Ionicons name="keypad-outline" size={14} color={PRIMARY} />
                  <Text style={styles.changeZipText}>Search a different zip code</Text>
                </TouchableOpacity>
              }
              renderItem={({ item }) => {
                const isHighlighted = item.osmId === hoveredOsmId;
                return (
                  <TouchableOpacity
                    style={[styles.storeRow, isHighlighted && styles.storeRowHighlighted]}
                    onPress={() => handleSelect(item)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.storeIcon, isHighlighted && styles.storeIconHighlighted]}>
                      <Ionicons name="storefront-outline" size={20} color={isHighlighted ? '#fff' : PRIMARY} />
                    </View>
                    <View style={styles.storeInfo}>
                      <Text style={styles.storeName}>{item.name}</Text>
                      <Text style={styles.storeDist}>
                        {item.distanceMi < 0.1
                          ? 'Less than 0.1 mi away'
                          : `${item.distanceMi.toFixed(1)} mi away`}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={isHighlighted ? PRIMARY : '#D1D5DB'} />
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container:              { flex: 1, backgroundColor: '#F9FAFB' },
  header:                 { backgroundColor: '#fff', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  handle:                 { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginTop: 10, marginBottom: 14 },
  headerRow:              { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:                  { fontSize: 18, fontWeight: '700', color: '#111827' },
  subtitle:               { fontSize: 13, color: '#9CA3AF', marginTop: 4 },
  closeBtn:               { padding: 4 },
  centered:               { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  hint:                   { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },
  errorText:              { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
  permissionTitle:        { fontSize: 16, fontWeight: '700', color: '#111827' },
  permissionSub:          { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
  zipRow:                 { flexDirection: 'row', gap: 8, width: '100%', maxWidth: 280 },
  zipInput:               { flex: 1, height: 48, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 16, fontSize: 18, fontWeight: '600', color: '#111827', textAlign: 'center', letterSpacing: 4 },
  zipInputError:          { borderColor: '#EF4444' },
  zipBtn:                 { width: 48, height: 48, backgroundColor: PRIMARY, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  zipBtnDisabled:         { backgroundColor: '#D1D5DB' },
  zipErrorText:           { fontSize: 12, color: '#EF4444', textAlign: 'center' },
  tryGpsBtn:              { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  tryGpsBtnText:          { fontSize: 13, color: PRIMARY, fontWeight: '600' },
  retryBtn:               { backgroundColor: PRIMARY, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10, marginTop: 4 },
  retryBtnText:           { color: '#fff', fontWeight: '700', fontSize: 14 },
  resultsContainer:       { flex: 1 },
  list:                   { padding: 16 },
  changeZipRow:           { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, paddingHorizontal: 2 },
  changeZipText:          { fontSize: 13, color: PRIMARY, fontWeight: '600' },
  separator:              { height: 1, backgroundColor: '#F3F4F6', marginLeft: 60 },
  storeRow:               { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 12 },
  storeRowHighlighted:    { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#6EE7B7' },
  storeIcon:              { width: 40, height: 40, borderRadius: 10, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },
  storeIconHighlighted:   { backgroundColor: PRIMARY },
  storeInfo:              { flex: 1, gap: 2 },
  storeName:              { fontSize: 15, fontWeight: '600', color: '#111827' },
  storeDist:              { fontSize: 12, color: '#9CA3AF' },
});

import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  ScrollView,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchNearbyStores,
  findSupabaseStore,
  saveStore,
  searchStoresByName,
  getFavorites,
  toggleFavorite,
  CHAINS,
  ALL_CHAIN_KEYS,
  type ChainKey,
  type NearbyStore,
  type StoreSearchResult,
} from '../lib/stores';
import StoreMap from './StoreMap';

const PRIMARY = '#1D9E75';
const RADIUS_OPTIONS = [2, 5, 10, 15, 25] as const;

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
  const [allStores, setAllStores] = useState<NearbyStore[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [radiusMi, setRadiusMi] = useState<number>(5);
  const [activeChains, setActiveChains] = useState<Set<ChainKey>>(new Set(ALL_CHAIN_KEYS));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showZipInput, setShowZipInput] = useState(false);
  const [zip, setZip] = useState('');
  const [zipError, setZipError] = useState<string | null>(null);
  const [hoveredOsmId, setHoveredOsmId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(() => getFavorites());
  const [viewMode, setViewMode] = useState<'nearby' | 'saved'>('nearby');
  const [storeSearch, setStoreSearch] = useState('');
  const [searchResults, setSearchResults] = useState<StoreSearchResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const zipRef = useRef<TextInput>(null);
  const searchRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList<NearbyStore>>(null);

  // Stable reference — only changes when allStores or activeChains changes,
  // NOT on every hover, so the map never gets an unnecessary rebuild.
  const filteredStores = useMemo(
    () => allStores.filter((s) => activeChains.has(s.chainKey)),
    [allStores, activeChains]
  );

  // Sorted for the list: favorites first, then by distance.
  // The map still uses filteredStores (stable ref) to avoid re-zooming.
  const sortedStores = useMemo(
    () => [...filteredStores].sort((a, b) => {
      const aFav = favorites.has(a.name) ? 0 : 1;
      const bFav = favorites.has(b.name) ? 0 : 1;
      if (aFav !== bFav) return aFav - bFav;
      return a.distanceMi - b.distanceMi;
    }),
    [filteredStores, favorites]
  );

  const allChainsActive = activeChains.size === ALL_CHAIN_KEYS.length;
  const inactiveCount = ALL_CHAIN_KEYS.length - activeChains.size;

  useEffect(() => {
    if (visible) {
      setShowZipInput(false);
      setZip('');
      setZipError(null);
      setCoords(null);
      setAllStores([]);
      setFiltersOpen(false);
      setStoreSearch('');
      setSearchResults(null);
      setViewMode('nearby');
      loadFromGPS(radiusMi);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Re-fetch when radius changes (only if we already have coords)
  useEffect(() => {
    if (coords && !loading && !showZipInput) {
      doFetch(coords, radiusMi);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radiusMi]);

  async function loadFromGPS(radius = radiusMi) {
    setLoading(true);
    setError(null);
    setAllStores([]);
    try {
      const loc = await getGPSCoords();
      setCoords(loc);
      await doFetch(loc, radius);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const isDenied =
        msg.includes('denied') ||
        msg.includes('PERMISSION') ||
        msg.includes('User denied') ||
        msg.toLowerCase().includes('not allowed');
      setLoading(false);
      if (isDenied) setShowZipInput(true);
      else setError('Could not find nearby stores. Check your connection and try again.');
    }
  }

  async function doFetch(loc: { lat: number; lon: number }, radius: number) {
    setLoading(true);
    setError(null);
    setAllStores([]);
    try {
      const nearby = await fetchNearbyStores(loc.lat, loc.lon, radius);
      setAllStores(nearby);
    } catch (e: any) {
      setError(e.message || 'Could not fetch nearby stores.');
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
    setShowZipInput(false);
    try {
      const loc = await geocodeZip(trimmed);
      setCoords(loc);
      await doFetch(loc, radiusMi);
    } catch (e: any) {
      setError(e.message || 'Could not find stores for that zip code.');
      setShowZipInput(true);
    }
  }

  async function handleSelect(store: NearbyStore) {
    const supabaseId = await findSupabaseStore(store.name);
    saveStore({ name: store.name, supabaseId });
    onSelect(store.name, supabaseId);
    onClose();
  }

  async function handleStoreSearch() {
    const q = storeSearch.trim();
    if (!q || !coords) return;
    setSearchLoading(true);
    try {
      const results = await searchStoresByName(q, coords.lat, coords.lon, radiusMi);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }

  async function handleSelectSearchResult(result: StoreSearchResult) {
    const supabaseId = await findSupabaseStore(result.name);
    saveStore({ name: result.name, supabaseId });
    onSelect(result.name, supabaseId);
    onClose();
  }

  function handleMapHover(osmId: string | null) {
    setHoveredOsmId(osmId);
    if (osmId) {
      const idx = sortedStores.findIndex((s) => s.osmId === osmId);
      if (idx >= 0)
        listRef.current?.scrollToIndex({ index: idx, animated: true, viewOffset: 8 });
    }
  }

  function handleFavorite(storeName: string) {
    toggleFavorite(storeName);
    setFavorites(getFavorites());
  }

  async function handleSelectFavorite(name: string) {
    const supabaseId = await findSupabaseStore(name).catch(() => null);
    saveStore({ name, supabaseId });
    onSelect(name, supabaseId);
    onClose();
  }

  function toggleChain(key: ChainKey) {
    setActiveChains((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleAll() {
    setActiveChains(allChainsActive ? new Set() : new Set(ALL_CHAIN_KEYS));
  }

  // ─── Filter bar ─────────────────────────────────────────────────────────────
  const filterBar = (
    <View style={styles.filterBar}>
      {/* Store name search */}
      <View style={styles.storeSearchRow}>
        <Ionicons name="search" size={15} color="#9CA3AF" style={{ marginRight: 6 }} />
        <TextInput
          ref={searchRef}
          style={styles.storeSearchInput}
          placeholder="Search for a store by name…"
          placeholderTextColor="#9CA3AF"
          value={storeSearch}
          onChangeText={(t) => { setStoreSearch(t); if (!t) setSearchResults(null); }}
          onSubmitEditing={handleStoreSearch}
          returnKeyType="search"
        />
        {storeSearch.length > 0 && (
          <TouchableOpacity onPress={() => { setStoreSearch(''); setSearchResults(null); }} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        )}
        {storeSearch.length > 0 && (
          <TouchableOpacity
            style={styles.storeSearchBtn}
            onPress={handleStoreSearch}
            disabled={!coords || searchLoading}
          >
            {searchLoading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.storeSearchBtnText}>Search</Text>}
          </TouchableOpacity>
        )}
      </View>

      {/* Radius pills */}
      <View style={styles.radiusRow}>
        <Text style={styles.filterLabel}>Radius</Text>
        <View style={styles.radiusPills}>
          {RADIUS_OPTIONS.map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.radiusPill, radiusMi === r && styles.radiusPillActive]}
              onPress={() => setRadiusMi(r)}
            >
              <Text style={[styles.radiusPillText, radiusMi === r && styles.radiusPillTextActive]}>
                {r} mi
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Chain filter toggle */}
      <TouchableOpacity
        style={styles.filterToggle}
        onPress={() => setFiltersOpen((o) => !o)}
        activeOpacity={0.7}
      >
        <Ionicons
          name="options-outline"
          size={15}
          color={inactiveCount > 0 ? PRIMARY : '#6B7280'}
        />
        <Text style={[styles.filterToggleText, inactiveCount > 0 && { color: PRIMARY }]}>
          {inactiveCount > 0 ? `Stores (${activeChains.size}/${ALL_CHAIN_KEYS.length})` : 'Stores'}
        </Text>
        <Ionicons
          name={filtersOpen ? 'chevron-up' : 'chevron-down'}
          size={13}
          color="#9CA3AF"
        />
      </TouchableOpacity>

      {/* Collapsible chain chips */}
      {filtersOpen && (
        <View style={styles.chipPanel}>
          {/* All/None toggle */}
          <TouchableOpacity
            style={[styles.chip, allChainsActive && styles.chipActive]}
            onPress={toggleAll}
          >
            <Text style={[styles.chipText, allChainsActive && styles.chipTextActive]}>
              {allChainsActive ? '✓ All' : 'All'}
            </Text>
          </TouchableOpacity>

          {CHAINS.map((chain) => {
            const active = activeChains.has(chain.key as ChainKey);
            return (
              <TouchableOpacity
                key={chain.key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => toggleChain(chain.key as ChainKey)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {active ? `✓ ` : ''}{chain.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );

  // ─── Render ──────────────────────────────────────────────────────────────────
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
            <Text style={styles.title}>Find a Store</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
              <Ionicons name="close" size={22} color="#6B7280" />
            </TouchableOpacity>
          </View>
          {/* Nearby / Saved toggle */}
          <View style={styles.modeToggleRow}>
            <TouchableOpacity
              style={[styles.modeBtn, viewMode === 'nearby' && styles.modeBtnActive]}
              onPress={() => setViewMode('nearby')}
            >
              <Ionicons name="navigate-outline" size={13} color={viewMode === 'nearby' ? '#fff' : '#6B7280'} />
              <Text style={[styles.modeBtnText, viewMode === 'nearby' && styles.modeBtnTextActive]}>Nearby</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, viewMode === 'saved' && styles.modeBtnActive]}
              onPress={() => setViewMode('saved')}
            >
              <Ionicons name="star-outline" size={13} color={viewMode === 'saved' ? '#fff' : '#6B7280'} />
              <Text style={[styles.modeBtnText, viewMode === 'saved' && styles.modeBtnTextActive]}>
                {'Saved'}
                {favorites.size > 0 ? ` (${favorites.size})` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {viewMode === 'saved' ? (
          /* ── Saved stores view ─────────────────────────────────────────── */
          favorites.size === 0 ? (
            <View style={styles.centered}>
              <Ionicons name="star-outline" size={48} color="#D1D5DB" />
              <Text style={styles.hint}>No saved stores yet.</Text>
              <Text style={styles.hintSub}>Tap ★ on any store in the Nearby list to save it.</Text>
            </View>
          ) : (
            <FlatList
              data={[...favorites]}
              keyExtractor={(name) => name}
              contentContainerStyle={styles.list}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderItem={({ item: name }) => (
                <View style={styles.storeRow}>
                  <View style={[styles.storeIcon, styles.storeIconFav]}>
                    <Ionicons name="star" size={18} color="#F59E0B" />
                  </View>
                  <Text style={[styles.storeName, { flex: 1 }]}>{name}</Text>
                  <TouchableOpacity onPress={() => handleFavorite(name)} hitSlop={8} style={styles.starBtn}>
                    <Ionicons name="star" size={17} color="#F59E0B" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleSelectFavorite(name)} style={styles.selectBtn}>
                    <Text style={styles.selectBtnText}>Select</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
          )
        ) : loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={PRIMARY} />
            <Text style={styles.hint}>Finding stores near you…</Text>
          </View>
        ) : showZipInput ? (
          <>
            {filterBar}
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
                  placeholder="ZIP code"
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
              {zipError ? <Text style={styles.zipErrorText}>{zipError}</Text> : null}
              <TouchableOpacity onPress={() => loadFromGPS()} style={styles.linkBtn}>
                <Ionicons name="navigate-outline" size={14} color={PRIMARY} />
                <Text style={styles.linkBtnText}>Try location again</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : error ? (
          <>
            {filterBar}
            <View style={styles.centered}>
              <Ionicons name="cloud-offline-outline" size={48} color="#D1D5DB" />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => loadFromGPS()}>
                <Text style={styles.retryBtnText}>Try Again</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setError(null); setShowZipInput(true); }}
                style={styles.linkBtn}
              >
                <Ionicons name="keypad-outline" size={14} color={PRIMARY} />
                <Text style={styles.linkBtnText}>Enter zip code instead</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : allStores.length === 0 && !loading ? (
          <>
            {filterBar}
            <View style={styles.centered}>
              <Ionicons name="storefront-outline" size={48} color="#D1D5DB" />
              <Text style={styles.hint}>No matching stores found within {radiusMi} mi.</Text>
              <Text style={styles.hintSub}>Try increasing the radius or searching by zip code.</Text>
              <TouchableOpacity
                onPress={() => setShowZipInput(true)}
                style={styles.linkBtn}
              >
                <Ionicons name="keypad-outline" size={14} color={PRIMARY} />
                <Text style={styles.linkBtnText}>Enter a different zip code</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.resultsContainer}>
            {filterBar}

            {/* Search results overlay */}
            {searchResults !== null && (
              <View style={styles.searchResultsPanel}>
                <View style={styles.searchResultsHeader}>
                  <Text style={styles.searchResultsTitle}>
                    {searchResults.length === 0
                      ? 'No stores found'
                      : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''} for "${storeSearch}"`}
                  </Text>
                  <TouchableOpacity onPress={() => { setSearchResults(null); setStoreSearch(''); }}>
                    <Text style={styles.linkBtnText}>Clear</Text>
                  </TouchableOpacity>
                </View>
                {searchResults.map((r) => (
                  <TouchableOpacity
                    key={r.osmId}
                    style={styles.storeRow}
                    onPress={() => handleSelectSearchResult(r)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.storeIcon}>
                      <Ionicons name="storefront-outline" size={20} color={PRIMARY} />
                    </View>
                    <View style={styles.storeInfo}>
                      <Text style={styles.storeName}>{r.name}</Text>
                      <Text style={styles.storeDist}>
                        {r.distanceMi < 0.1 ? 'Less than 0.1 mi away' : `${r.distanceMi.toFixed(1)} mi away`}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Regular map — hidden when search results are showing */}
            {searchResults === null && coords ? (
              <StoreMap
                stores={filteredStores}
                center={coords}
                selectedOsmId={hoveredOsmId}
                onHover={handleMapHover}
                onSelect={handleSelect}
              />
            ) : null}

            {/* Regular store list — hidden when search results are showing */}
            {searchResults !== null ? null : <FlatList
              ref={listRef}
              data={sortedStores}
              keyExtractor={(s) => s.osmId}
              contentContainerStyle={styles.list}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              onScrollToIndexFailed={() => {}}
              ListEmptyComponent={
                <View style={styles.emptyList}>
                  <Text style={styles.hint}>
                    No stores match the selected filters.
                  </Text>
                  <TouchableOpacity onPress={() => setActiveChains(new Set(ALL_CHAIN_KEYS))}>
                    <Text style={styles.linkBtnText}>Clear filters</Text>
                  </TouchableOpacity>
                </View>
              }
              ListHeaderComponent={
                <TouchableOpacity
                  style={styles.changeZipRow}
                  onPress={() => { setAllStores([]); setCoords(null); setShowZipInput(true); }}
                >
                  <Ionicons name="keypad-outline" size={14} color={PRIMARY} />
                  <Text style={styles.linkBtnText}>Search a different zip code</Text>
                </TouchableOpacity>
              }
              renderItem={({ item }) => {
                const isHighlighted = item.osmId === hoveredOsmId;
                const isFav = favorites.has(item.name);
                return (
                  <View style={[styles.storeRow, isHighlighted && styles.storeRowHighlighted]}>
                    <TouchableOpacity
                      style={styles.storeRowMain}
                      onPress={() => handleSelect(item)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.storeIcon, isHighlighted && styles.storeIconHighlighted]}>
                        <Ionicons
                          name="storefront-outline"
                          size={20}
                          color={isHighlighted ? '#fff' : PRIMARY}
                        />
                      </View>
                      <View style={styles.storeInfo}>
                        <Text style={styles.storeName}>{item.name}</Text>
                        <Text style={styles.storeDist}>
                          {item.distanceMi < 0.1
                            ? 'Less than 0.1 mi away'
                            : `${item.distanceMi.toFixed(1)} mi away`}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleFavorite(item.name)} hitSlop={8} style={styles.starBtn}>
                      <Ionicons
                        name={isFav ? 'star' : 'star-outline'}
                        size={17}
                        color={isFav ? '#F59E0B' : '#D1D5DB'}
                      />
                    </TouchableOpacity>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={isHighlighted ? PRIMARY : '#D1D5DB'}
                    />
                  </View>
                );
              }}
            />}
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container:            { flex: 1, backgroundColor: '#F9FAFB' },
  header:               { backgroundColor: '#fff', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  handle:               { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginTop: 10, marginBottom: 14 },
  headerRow:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:                { fontSize: 18, fontWeight: '700', color: '#111827' },
  subtitle:             { fontSize: 13, color: '#9CA3AF', marginTop: 4 },
  closeBtn:             { padding: 4 },

  // Store search
  storeSearchRow:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, gap: 4 },
  storeSearchInput:     { flex: 1, fontSize: 13, color: '#111827', paddingVertical: 2 },
  storeSearchBtn:       { backgroundColor: PRIMARY, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 5, marginLeft: 4 },
  storeSearchBtnText:   { color: '#fff', fontSize: 12, fontWeight: '700' },
  searchResultsPanel:   { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', maxHeight: 300 },
  searchResultsHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  searchResultsTitle:   { fontSize: 13, fontWeight: '600', color: '#6B7280' },

  // Filter bar
  filterBar:            { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', gap: 10 },
  radiusRow:            { flexDirection: 'row', alignItems: 'center', gap: 10 },
  filterLabel:          { fontSize: 12, fontWeight: '600', color: '#6B7280', minWidth: 44 },
  radiusPills:          { flexDirection: 'row', gap: 6 },
  radiusPill:           { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff' },
  radiusPillActive:     { backgroundColor: PRIMARY, borderColor: PRIMARY },
  radiusPillText:       { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  radiusPillTextActive: { color: '#fff' },
  filterToggle:         { flexDirection: 'row', alignItems: 'center', gap: 5 },
  filterToggleText:     { fontSize: 13, fontWeight: '600', color: '#6B7280', flex: 1 },
  chipPanel:            { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 4 },
  chip:                 { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
  chipActive:           { backgroundColor: '#ECFDF5', borderColor: '#6EE7B7' },
  chipText:             { fontSize: 12, fontWeight: '500', color: '#6B7280' },
  chipTextActive:       { color: PRIMARY, fontWeight: '700' },

  // States
  centered:             { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 32, paddingHorizontal: 24 },
  hint:                 { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },
  hintSub:              { fontSize: 12, color: '#D1D5DB', textAlign: 'center' },
  errorText:            { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
  permissionTitle:      { fontSize: 16, fontWeight: '700', color: '#111827' },
  permissionSub:        { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },

  // Zip input
  zipRow:               { flexDirection: 'row', gap: 8, alignSelf: 'stretch', marginHorizontal: 0 },
  zipInput:             { flex: 1, minWidth: 0, height: 48, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 12, fontSize: 18, fontWeight: '600', color: '#111827', textAlign: 'center', letterSpacing: 4 },
  zipInputError:        { borderColor: '#EF4444' },
  zipBtn:               { width: 48, height: 48, backgroundColor: PRIMARY, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  zipBtnDisabled:       { backgroundColor: '#D1D5DB' },
  zipErrorText:         { fontSize: 12, color: '#EF4444', textAlign: 'center' },

  // Buttons
  linkBtn:              { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  linkBtnText:          { fontSize: 13, color: PRIMARY, fontWeight: '600' },
  retryBtn:             { backgroundColor: PRIMARY, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10, marginTop: 4 },
  retryBtnText:         { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Results
  resultsContainer:     { flex: 1 },
  list:                 { padding: 16 },
  changeZipRow:         { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, paddingHorizontal: 2 },
  emptyList:            { alignItems: 'center', gap: 8, paddingVertical: 32 },
  separator:            { height: 1, backgroundColor: '#F3F4F6', marginLeft: 60 },
  // Mode toggle
  modeToggleRow:        { flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 10, padding: 3, gap: 2, marginTop: 12 },
  modeBtn:              { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 7, borderRadius: 8 },
  modeBtnActive:        { backgroundColor: PRIMARY },
  modeBtnText:          { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  modeBtnTextActive:    { color: '#fff' },

  // Saved view
  storeIconFav:         { backgroundColor: '#FEF3C7' },
  selectBtn:            { backgroundColor: PRIMARY, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  selectBtnText:        { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Store rows
  storeRow:             { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 12 },
  storeRowHighlighted:  { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#6EE7B7' },
  storeRowMain:         { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  storeIcon:            { width: 40, height: 40, borderRadius: 10, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },
  storeIconHighlighted: { backgroundColor: PRIMARY },
  storeInfo:            { flex: 1, gap: 2 },
  storeName:            { fontSize: 15, fontWeight: '600', color: '#111827' },
  storeDist:            { fontSize: 12, color: '#9CA3AF' },
  starBtn:              { padding: 4 },
});

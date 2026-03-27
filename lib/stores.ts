import { supabase } from './supabase';

export interface NearbyStore {
  osmId: string;
  name: string;
  address: string;
  chainKey: ChainKey;
  lat: number;
  lon: number;
  distanceMi: number;
}

export interface SelectedStore {
  name: string;
  address: string;
  osmId: string;
  supabaseId: string | null;
}

export interface FavoriteStore {
  osmId: string;
  name: string;
  address: string;
}

// ─── Allowed chain definitions ────────────────────────────────────────────────
export const CHAINS = [
  { key: 'ralphs',     label: "Ralphs",                  keywords: ["ralphs", "ralph's"] },
  { key: 'vons',       label: "Vons",                    keywords: ["vons"] },
  { key: 'albertsons', label: "Albertsons",              keywords: ["albertsons"] },
  { key: 'stater',     label: "Stater Bros.",            keywords: ["stater bros"] },
  { key: 'traderjoes', label: "Trader Joe's",            keywords: ["trader joe"] },
  { key: 'wholefoods', label: "Whole Foods",             keywords: ["whole foods"] },
  { key: 'sprouts',    label: "Sprouts",                 keywords: ["sprouts"] },
  { key: 'costco',     label: "Costco",                  keywords: ["costco"] },
  { key: 'food4less',  label: "Food 4 Less",             keywords: ["food 4 less", "food4less"] },
  { key: 'smartfinal', label: "Smart & Final",           keywords: ["smart & final", "smart and final"] },
  { key: 'pavilions',  label: "Pavilions",               keywords: ["pavilions"] },
  { key: 'winco',      label: "WinCo Foods",             keywords: ["winco"] },
  { key: '99ranch',    label: "99 Ranch Market",         keywords: ["99 ranch"] },
  { key: 'northgate',  label: "Northgate",               keywords: ["northgate"] },
  { key: 'walmart',    label: "Walmart",                 keywords: ["walmart"] },
  { key: 'target',     label: "Target",                  keywords: ["target"] },
  { key: 'aldi',       label: "Aldi",                    keywords: ["aldi"] },
  { key: 'outlet',     label: "Grocery Outlet",          keywords: ["grocery outlet"] },
  { key: 'bristol',    label: "Bristol Farms",           keywords: ["bristol farms"] },
  { key: 'gelsons',    label: "Gelson's",                keywords: ["gelson"] },
] as const;

export type ChainKey = typeof CHAINS[number]['key'];
export const ALL_CHAIN_KEYS = CHAINS.map((c) => c.key) as ChainKey[];

export function matchChain(name: string): ChainKey | null {
  const lower = name.toLowerCase();
  for (const chain of CHAINS) {
    if ((chain.keywords as readonly string[]).some((kw) => lower.includes(kw))) {
      return chain.key as ChainKey;
    }
  }
  return null;
}

// ─── Address helper ────────────────────────────────────────────────────────────
function parseAddress(tags: Record<string, string>): string {
  const num = tags['addr:housenumber'];
  const street = tags['addr:street'];
  const city = tags['addr:city'];
  const parts: string[] = [];
  if (num && street) parts.push(`${num} ${street}`);
  else if (street) parts.push(street);
  if (city) parts.push(city);
  return parts.join(', ');
}

// ─── Haversine distance ────────────────────────────────────────────────────────
const STORAGE_KEY = 'shelfcheck_selected_store';

function toMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Overpass fetch ────────────────────────────────────────────────────────────
export async function fetchNearbyStores(
  lat: number,
  lon: number,
  radiusMi = 5
): Promise<NearbyStore[]> {
  const radiusM = Math.round(radiusMi * 1609.34);
  // Include both node and way elements; "out center" returns centroid for ways
  // Include wholesale (Costco) and department_store (Target) in addition to
  // the usual supermarket/grocery tags.
  const shopTypes = ['supermarket', 'grocery', 'wholesale', 'department_store'];
  const typeQueries = shopTypes.flatMap((t) => [
    `node["shop"="${t}"](around:${radiusM},${lat},${lon});`,
    `way["shop"="${t}"](around:${radiusM},${lat},${lon});`,
  ]).join('');
  const query = `[out:json][timeout:20];(${typeQueries});out center 200;`;

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (!res.ok) throw new Error('Could not fetch nearby stores. Please try again.');

  const data = await res.json();

  const results: NearbyStore[] = [];
  for (const el of data.elements as any[]) {
    const name: string | undefined = el.tags?.name;
    if (!name) continue;
    const chainKey = matchChain(name);
    if (!chainKey) continue; // skip stores not in the allowed list
    // nodes have lat/lon directly; ways have el.center.lat / el.center.lon
    const elLat: number = el.lat ?? el.center?.lat;
    const elLon: number = el.lon ?? el.center?.lon;
    if (elLat == null || elLon == null) continue;
    results.push({
      osmId: String(el.id),
      name,
      address: parseAddress(el.tags ?? {}),
      chainKey,
      lat: elLat,
      lon: elLon,
      distanceMi: toMiles(lat, lon, elLat, elLon),
    });
  }

  // De-duplicate by osmId only (same store can appear as both node and way in OSM)
  const seen = new Map<string, NearbyStore>();
  for (const s of results) {
    if (!seen.has(s.osmId)) seen.set(s.osmId, s);
  }

  return Array.from(seen.values()).sort((a, b) => a.distanceMi - b.distanceMi);
}

// ─── Supabase helpers ──────────────────────────────────────────────────────────
export async function findSupabaseStore(name: string): Promise<string | null> {
  const keyword = name.split(/\s+/)[0];
  const { data } = await supabase
    .from('stores')
    .select('id')
    .ilike('name', `%${keyword}%`)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export function getSavedStore(): SelectedStore | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SelectedStore) : null;
  } catch {
    return null;
  }
}

export function saveStore(store: SelectedStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {}
}

// ─── Store favorites ────────────────────────────────────────────────────────────
const FAVORITES_KEY = 'shelfcheck_favorite_stores';

export function getFavorites(): FavoriteStore[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Migrate old format (array of strings) to new format (array of objects)
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
      return (parsed as string[]).map((name) => ({ osmId: name, name, address: '' }));
    }
    return parsed as FavoriteStore[];
  } catch {
    return [];
  }
}

export function toggleFavorite(store: FavoriteStore): void {
  const favs = getFavorites();
  const idx = favs.findIndex((f) => f.osmId === store.osmId);
  if (idx !== -1) {
    favs.splice(idx, 1);
  } else {
    favs.push(store);
  }
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs)); } catch {}
}

// ─── Free-text store name search (not limited to allowed chains) ───────────────
export interface StoreSearchResult {
  osmId: string;
  name: string;
  chainKey: ChainKey | null;
  lat: number;
  lon: number;
  distanceMi: number;
}

export async function searchStoresByName(
  query: string,
  lat: number,
  lon: number,
  radiusMi = 10
): Promise<StoreSearchResult[]> {
  const radiusM = Math.round(radiusMi * 1609.34);
  // Escape special regex chars before sending to Overpass
  const safe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const q =
    `[out:json][timeout:15];` +
    `(node["name"~"${safe}",i](around:${radiusM},${lat},${lon});` +
    `way["name"~"${safe}",i](around:${radiusM},${lat},${lon}););` +
    `out center 30;`;

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: `data=${encodeURIComponent(q)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!res.ok) throw new Error('Search failed. Please try again.');

  const data = await res.json();
  return (data.elements as any[])
    .filter((el) => el.tags?.name)
    .map((el) => {
      const elLat: number = el.lat ?? el.center?.lat;
      const elLon: number = el.lon ?? el.center?.lon;
      return {
        osmId: String(el.id),
        name: el.tags.name as string,
        chainKey: matchChain(el.tags.name) as ChainKey | null,
        lat: elLat,
        lon: elLon,
        distanceMi: toMiles(lat, lon, elLat, elLon),
      };
    })
    .filter((s) => s.lat != null && s.lon != null)
    .sort((a, b) => a.distanceMi - b.distanceMi);
}

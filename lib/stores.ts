import { supabase } from './supabase';

export interface NearbyStore {
  osmId: string;
  name: string;
  lat: number;
  lon: number;
  distanceMi: number;
}

export interface SelectedStore {
  name: string;
  supabaseId: string | null;
}

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

export async function fetchNearbyStores(
  lat: number,
  lon: number,
  radiusMi = 5
): Promise<NearbyStore[]> {
  const radiusM = Math.round(radiusMi * 1609.34);
  const query =
    `[out:json][timeout:15];` +
    `(node["shop"="supermarket"](around:${radiusM},${lat},${lon});` +
    `node["shop"="grocery"](around:${radiusM},${lat},${lon});` +
    `node["shop"="convenience"](around:${radiusM},${lat},${lon}););` +
    `out body 40;`;

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (!res.ok) throw new Error('Could not fetch nearby stores. Please try again.');

  const data = await res.json();

  return (data.elements as any[])
    .filter((el) => el.tags?.name)
    .map((el) => ({
      osmId: String(el.id),
      name: el.tags.name as string,
      lat: el.lat as number,
      lon: el.lon as number,
      distanceMi: toMiles(lat, lon, el.lat, el.lon),
    }))
    .sort((a, b) => a.distanceMi - b.distanceMi);
}

/** Looks up a store in Supabase by partial name match. */
export async function findSupabaseStore(name: string): Promise<string | null> {
  const keyword = name.split(/\s+/)[0]; // e.g. "Vons" from "Vons #1234"
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

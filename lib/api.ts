import { supabase } from './supabase';
import type { ItemRow, LiveItem } from './types';
import type { StockStatus } from '../data';

/**
 * The seeded store ID. In a multi-store version this becomes a
 * runtime parameter derived from location or user selection.
 */
export const DEFAULT_STORE_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

/** Maps a raw DB row to the UI-facing shape */
function toLocalItem(row: ItemRow): LiveItem {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    status: row.status ?? 'uncertain',
    lastReportedAt: row.last_reported_at,
  };
}

/**
 * Fetch all items for the default store with their current status.
 * Reads from the `items_with_status` Postgres view.
 */
export async function fetchItems(storeId = DEFAULT_STORE_ID): Promise<LiveItem[]> {
  const { data, error } = await supabase
    .from('items_with_status')
    .select('*')
    .eq('store_id', storeId)
    .order('name');

  if (error) throw error;
  return (data as ItemRow[]).map(toLocalItem);
}

/**
 * Fetch a single item by id (used by the Report screen).
 * Returns null if the item doesn't exist.
 */
export async function fetchItem(id: string): Promise<LiveItem | null> {
  const { data, error } = await supabase
    .from('items_with_status')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // no rows
    throw error;
  }
  return toLocalItem(data as ItemRow);
}

/**
 * Fetch the store name for the default store.
 */
export async function fetchStoreName(storeId = DEFAULT_STORE_ID): Promise<string> {
  const { data, error } = await supabase
    .from('stores')
    .select('name')
    .eq('id', storeId)
    .single();

  if (error) throw error;
  return (data as { name: string }).name;
}

/**
 * Insert a new crowdsourced report, tagged with the device's anonymous id.
 * The DB trigger increments profiles.points by 10 for the user_id.
 * Returns the created report's id.
 */
export async function submitReport(
  itemId: string,
  status: Extract<StockStatus, 'in-stock' | 'out-of-stock'>,
  userId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('reports')
    .insert({ item_id: itemId, status, user_id: userId })
    .select('id')
    .single();

  if (error) throw error;
  return (data as { id: string }).id;
}

/**
 * Find or create an item for a store. Used when a grocery-list item has no
 * Supabase record yet and the user wants to submit a first report.
 * Returns the item's id.
 */
export async function upsertItem(
  storeId: string,
  name: string,
  category: string
): Promise<string> {
  // Normalize: collapse internal whitespace and trim edges so "Whole  Milk " ≡ "Whole Milk"
  const normalized = name.trim().replace(/\s+/g, ' ');

  // Look for an existing item with the same name in this store (case-insensitive)
  const { data: existing } = await supabase
    .from('items')
    .select('id')
    .eq('store_id', storeId)
    .ilike('name', normalized)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  // Create new item (store the normalized name to keep the DB tidy)
  const { data, error } = await supabase
    .from('items')
    .insert({ store_id: storeId, name: normalized, category })
    .select('id')
    .single();

  if (error) throw error;
  return (data as { id: string }).id;
}

/**
 * Find or create a store by name. Used when an OSM-selected store has no
 * Supabase record yet. Returns the store's id.
 */
export async function upsertStore(name: string): Promise<string> {
  // Try to find by first keyword (matches "Ralphs", "Vons", etc.)
  const keyword = name.split(/\s+/)[0];
  const { data: existing } = await supabase
    .from('stores')
    .select('id')
    .ilike('name', `%${keyword}%`)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  // Create a new store entry
  const { data, error } = await supabase
    .from('stores')
    .insert({ name })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export interface Profile {
  id: string;
  points: number;
  reports_count: number;
}

/**
 * Fetch the profile for a given device/user id.
 * Returns null if no reports have been submitted yet (profile doesn't exist).
 */
export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, points, reports_count')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as Profile;
}

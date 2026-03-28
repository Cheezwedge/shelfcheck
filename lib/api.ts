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
    storeId: row.store_id,
    name: row.name,
    category: row.category,
    status: row.status ?? 'uncertain',
    lastReportedAt: row.last_reported_at,
    quantity: row.quantity ?? null,
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
  userId: string,
  quantity?: number | null
): Promise<string> {
  // store_id is omitted: the DB BEFORE INSERT trigger fills it automatically
  // from items.store_id once migration 002 is applied.
  const payload: Record<string, unknown> = { item_id: itemId, status, user_id: userId };
  if (quantity != null) payload.quantity = quantity;
  const { data, error } = await supabase
    .from('reports')
    .insert(payload)
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
  pending_points: number;
  reports_count: number;
  accuracy_ratio: number;
  streak_days: number;
  joined_at: string | null;
}

/**
 * Fetch the profile for a given device/user id.
 * Returns null if no reports have been submitted yet (profile doesn't exist).
 */
export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  // Map with defaults so older DB schemas (pre-migration 002) still work
  const row = data as Record<string, any>;
  return {
    id: row.id,
    points:         row.points         ?? 0,
    pending_points: row.pending_points ?? 0,
    reports_count:  row.reports_count  ?? 0,
    accuracy_ratio: row.accuracy_ratio ?? 1,
    streak_days:    row.streak_days    ?? 0,
    joined_at:      row.joined_at      ?? null,
  };
}

// ─── Admin functions ──────────────────────────────────────────────────────────

export interface AdminItem {
  id: string;
  store_id: string;
  name: string;
  category: string;
  report_count: number;
  status: string | null;
  last_reported_at: string | null;
}

/** Fetch all items for a store with their report counts (admin view). */
export async function fetchAdminItems(storeId: string): Promise<AdminItem[]> {
  const { data, error } = await supabase
    .from('items_with_status')
    .select('*')
    .eq('store_id', storeId)
    .order('name');
  if (error) throw error;

  // Count reports per item
  const ids = (data as any[]).map((r) => r.id);
  const { data: counts } = await supabase
    .from('reports')
    .select('item_id')
    .in('item_id', ids);
  const countMap = new Map<string, number>();
  (counts ?? []).forEach((r: { item_id: string }) => {
    countMap.set(r.item_id, (countMap.get(r.item_id) ?? 0) + 1);
  });

  return (data as any[]).map((r) => ({
    id: r.id,
    store_id: r.store_id,
    name: r.name,
    category: r.category,
    report_count: countMap.get(r.id) ?? 0,
    status: r.status ?? null,
    last_reported_at: r.last_reported_at ?? null,
  }));
}

/** Rename an item (admin only — enforced by RLS). */
export async function renameItem(itemId: string, newName: string): Promise<void> {
  const normalized = newName.trim().replace(/\s+/g, ' ');
  const { error } = await supabase
    .from('items')
    .update({ name: normalized })
    .eq('id', itemId);
  if (error) throw error;
}

/**
 * Delete an item and all its reports (admin only).
 * Deletes reports first to avoid FK constraint issues.
 */
export async function deleteItem(itemId: string): Promise<void> {
  const { error: rErr } = await supabase.from('reports').delete().eq('item_id', itemId);
  if (rErr) throw rErr;
  const { error } = await supabase.from('items').delete().eq('id', itemId);
  if (error) throw error;
}

/**
 * Merge dropId into keepId: re-points all reports then deletes the duplicate.
 * Uses the server-side admin_merge_items() function for atomicity.
 */
export async function mergeItems(keepId: string, dropId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_merge_items', {
    keep_id: keepId,
    drop_id: dropId,
  });
  if (error) throw error;
}

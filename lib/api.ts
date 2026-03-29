import { supabase } from './supabase';
import type { ItemRow, LiveItem } from './types';
import type { StockStatus } from '../data';
import { matchChain, CHAINS } from './stores';

/**
 * The seeded store ID. In a multi-store version this becomes a
 * runtime parameter derived from location or user selection.
 */
export const DEFAULT_STORE_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

/** Maps a raw DB row to the UI-facing shape */
function toLocalItem(row: ItemRow): LiveItem {
  return {
    id: row.id,
    chainId: row.chain_id ?? null,
    storeId: row.store_id ?? null,
    name: row.name,
    category: row.category,
    status: row.status ?? 'uncertain',
    lastReportedAt: row.last_reported_at,
    quantity: row.quantity ?? null,
  };
}

/**
 * Fetch all items for a store with their current status at that location.
 * Uses the fetch_store_items() RPC which returns the chain-level catalog
 * filtered by the store's chain, with status from reports at this location only.
 */
export async function fetchItems(storeId = DEFAULT_STORE_ID): Promise<LiveItem[]> {
  // Try chain-aware RPC first (requires migration 006). Fall back to the view.
  const { data: rpcData, error: rpcError } = await supabase
    .rpc('fetch_store_items', { p_store_id: storeId });

  if (!rpcError) {
    return (rpcData as ItemRow[]).map(toLocalItem);
  }

  // Fallback: pre-migration 006 view query
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
  quantity?: number | null,
  storeId?: string | null
): Promise<string> {
  const payload: Record<string, unknown> = { item_id: itemId, status, user_id: userId };
  if (quantity != null) payload.quantity = quantity;
  if (storeId) payload.store_id = storeId;

  const { data, error } = await supabase
    .from('reports')
    .insert(payload)
    .select('id')
    .single();

  // PGRST204 = column not in schema cache (store_id or quantity may not exist yet).
  // Retry with only the core fields so submission still works.
  if (error?.code === 'PGRST204') {
    const { data: fallback, error: fallbackErr } = await supabase
      .from('reports')
      .insert({ item_id: itemId, status, user_id: userId })
      .select('id')
      .single();
    if (fallbackErr) throw fallbackErr;
    return (fallback as { id: string }).id;
  }

  if (error) throw error;
  return (data as { id: string }).id;
}

/**
 * Find or create an item. In the chain model, items belong to a chain so the
 * same item is shared across all locations of that chain. Falls back to
 * store-scoped items if the store has no chain set.
 * Returns the item's id.
 */
export async function upsertItem(
  storeId: string,
  name: string,
  category: string,
  userId?: string | null
): Promise<string> {
  const normalized = name.trim().replace(/\s+/g, ' ');
  // created_by lets the RLS rate-limit policy count correctly per authenticated user
  const createdBy = userId ?? null;

  // Get this store's chain_id
  const { data: storeRow } = await supabase
    .from('stores')
    .select('chain_id')
    .eq('id', storeId)
    .maybeSingle();
  const chainId = (storeRow as any)?.chain_id as string | null;

  if (chainId) {
    // Dedup across the whole chain — "Whole Milk" at any Ralphs = same item
    const { data: existing } = await supabase
      .from('items')
      .select('id')
      .eq('chain_id', chainId)
      .ilike('name', normalized)
      .maybeSingle();
    if (existing?.id) return existing.id as string;

    const chainPayload: Record<string, unknown> = { chain_id: chainId, store_id: storeId, name: normalized, category };
    if (createdBy) chainPayload.created_by = createdBy;
    const { data, error } = await supabase
      .from('items')
      .insert(chainPayload)
      .select('id')
      .single();
    // If chain_id column doesn't exist yet (pre-migration 006), fall through to store-scoped insert
    if (!error) return (data as { id: string }).id;
  }

  // Fallback: store-scoped item (store has no chain match)
  const { data: existing } = await supabase
    .from('items')
    .select('id')
    .eq('store_id', storeId)
    .ilike('name', normalized)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const storePayload: Record<string, unknown> = { store_id: storeId, name: normalized, category };
  if (createdBy) storePayload.created_by = createdBy;
  const { data, error } = await supabase
    .from('items')
    .insert(storePayload)
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/**
 * Find or create a store by name. Sets chain_id so the store's items
 * come from the shared chain catalog. Returns the store's id.
 */
export async function upsertStore(name: string): Promise<string> {
  const keyword = name.split(/\s+/)[0];
  const { data: existing } = await supabase
    .from('stores')
    .select('id')
    .ilike('name', `%${keyword}%`)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  // Resolve chain_id from store name
  const chainKey = matchChain(name);
  let chainId: string | null = null;
  if (chainKey) {
    const chainLabel = CHAINS.find((c) => c.key === chainKey)?.label ?? null;
    if (chainLabel) {
      const { data: chain } = await supabase
        .from('chains')
        .select('id')
        .eq('name', chainLabel)
        .maybeSingle();
      chainId = (chain as any)?.id ?? null;
    }
  }

  // Only include chain_id in the insert if resolved — omitting it is safe;
  // the column is nullable and migration 006 will backfill existing rows.
  const storePayload: Record<string, unknown> = { name };
  if (chainId) storePayload.chain_id = chainId;

  const { data, error } = await supabase
    .from('stores')
    .insert(storePayload)
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

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
export async function fetchItems(): Promise<LiveItem[]> {
  const { data, error } = await supabase
    .from('items_with_status')
    .select('*')
    .eq('store_id', DEFAULT_STORE_ID)
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
export async function fetchStoreName(): Promise<string> {
  const { data, error } = await supabase
    .from('stores')
    .select('name')
    .eq('id', DEFAULT_STORE_ID)
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

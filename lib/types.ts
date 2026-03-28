import type { StockStatus } from '../data';

/** Raw row returned by fetch_store_items() RPC or items_with_status view */
export interface ItemRow {
  id: string;
  chain_id: string | null;
  store_id: string | null;          // present in view, absent in RPC result
  name: string;
  category: string;
  created_at: string;
  status: StockStatus | null;       // null = no reports yet → shown as 'uncertain'
  last_reported_at: string | null;  // ISO timestamp of the most recent report at this store
  quantity: number | null;          // estimated qty from most recent in-stock report
}

/** UI-facing shape used by screens */
export interface LiveItem {
  id: string;
  chainId: string | null;
  storeId: string | null;           // null for chain-level items
  name: string;
  category: string;
  status: StockStatus;              // guaranteed non-null (null → 'uncertain')
  lastReportedAt: string | null;    // ISO timestamp, null if never reported at this location
  quantity: number | null;          // estimated qty from most recent in-stock report
}

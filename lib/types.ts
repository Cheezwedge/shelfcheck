import type { StockStatus } from '../data';

/** Raw row returned by the items_with_status Postgres view */
export interface ItemRow {
  id: string;
  store_id: string;
  name: string;
  category: string;
  created_at: string;
  status: StockStatus | null;       // null = no reports yet → shown as 'uncertain'
  last_reported_at: string | null;  // ISO timestamp of the most recent report
}

/** UI-facing shape used by screens */
export interface LiveItem {
  id: string;
  storeId: string;
  name: string;
  category: string;
  status: StockStatus;              // guaranteed non-null (null → 'uncertain')
  lastReportedAt: string | null;    // ISO timestamp, null if never reported
}

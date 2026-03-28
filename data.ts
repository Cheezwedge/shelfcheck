export type StockStatus = 'in-stock' | 'out-of-stock' | 'uncertain';

export const STATUS_COLORS: Record<StockStatus, string> = {
  'in-stock':     '#1D9E75',
  'out-of-stock': '#E53935',
  'uncertain':    '#F59E0B',
};

export const STATUS_LABELS: Record<StockStatus, string> = {
  'in-stock':     'In Stock',
  'out-of-stock': 'Out of Stock',
  'uncertain':    'Uncertain',
};

// ── Report freshness ──────────────────────────────────────────────────────────

export type FreshnessLevel = 'now' | 'fresh' | 'aging' | 'stale' | 'old' | 'none';

export interface Freshness {
  level: FreshnessLevel;
  label: string;  // e.g. "Just now", "Fresh", "Aging"
  symbol: string; // e.g. "✓", "~", "⚠", "?"
  color: string;  // color for the freshness label text
}

export function getFreshness(lastReportedAt: string | null): Freshness {
  if (!lastReportedAt) return { level: 'none',  label: 'No data',  symbol: '?', color: '#D1D5DB' };
  const hrs = (Date.now() - new Date(lastReportedAt).getTime()) / 3_600_000;
  if (hrs <  2)  return { level: 'now',   label: 'Just now', symbol: '✓', color: '#1D9E75' };
  if (hrs <  4)  return { level: 'fresh', label: 'Fresh',    symbol: '✓', color: '#1D9E75' };
  if (hrs <  6)  return { level: 'aging', label: 'Aging',    symbol: '~', color: '#F59E0B' };
  if (hrs < 12)  return { level: 'stale', label: 'Stale',    symbol: '⚠', color: '#9CA3AF' };
  if (hrs < 24)  return { level: 'old',   label: 'Old',      symbol: '?', color: '#D1D5DB' };
  return                 { level: 'old',   label: 'Expired',  symbol: '×', color: '#D1D5DB' };
}

/**
 * Converts an ISO timestamp (or null) into a human-readable relative string.
 * null means the item has never been reported — shown as "No reports yet".
 */
export function formatTimeAgo(isoDate: string | null): string {
  if (!isoDate) return 'No reports yet';
  const minutes = Math.floor((Date.now() - new Date(isoDate).getTime()) / 60_000);
  if (minutes < 1)  return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)   return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

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

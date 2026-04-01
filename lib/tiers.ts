/** Tier definitions shared between Rewards screen and Leaderboard. */

export interface Tier {
  level: number;
  label: string;
  min: number;
  next: number;     // points needed for NEXT tier (same as min if max tier)
  color: string;
  bg: string;
  icon: string;
  animated?: boolean;
}

export const TIERS: Tier[] = [
  { level: 1, label: 'Newcomer',     min: 0,    next: 100,  color: '#9CA3AF', bg: '#F3F4F6', icon: 'person-outline' },
  { level: 2, label: 'Helper',       min: 100,  next: 300,  color: '#1D9E75', bg: '#ECFDF5', icon: 'leaf-outline' },
  { level: 3, label: 'Scout',        min: 300,  next: 600,  color: '#3B82F6', bg: '#EFF6FF', icon: 'search-outline' },
  { level: 4, label: 'Trail Blazer', min: 600,  next: 1000, color: '#F59E0B', bg: '#FFFBEB', icon: 'flame-outline' },
  { level: 5, label: 'Expert',       min: 1000, next: 1500, color: '#8B5CF6', bg: '#F5F3FF', icon: 'star-outline' },
  { level: 6, label: 'Champion',     min: 1500, next: 2500, color: '#EC4899', bg: '#FDF2F8', icon: 'shield-checkmark-outline' },
  { level: 7, label: 'Legend',       min: 2500, next: 2500, color: '#EF4444', bg: '#FEF2F2', icon: 'trophy',          animated: true },
];

export function getTier(points: number): Tier {
  let tier = TIERS[0];
  for (const t of TIERS) { if (points >= t.min) tier = t; }
  return tier;
}

export function tierProgress(points: number): number {
  const tier = getTier(points);
  if (tier.next === tier.min) return 1; // max tier
  const prev = tier.min;
  return Math.min((points - prev) / (tier.next - prev), 1);
}

/** Badge metadata and earned-badge logic for the Rewards screen. */

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface Badge {
  id: string;
  title: string;
  description: string;
  icon: string;       // Ionicons name
  color: string;      // primary accent color
  bg: string;         // card background tint
  rarity: Rarity;
  animated?: boolean; // pulsing glow ring on featured display
}

// Sorted by display order (rarity desc within each theme)
export const ALL_BADGES: Badge[] = [
  // ── Early / time-based ──────────────────────────────────────────────────
  {
    id: 'founding_reporter',
    title: 'Founding Reporter',
    description: 'Joined ShelfCheck in its first year',
    icon: 'leaf',
    color: '#F59E0B',
    bg: '#FFFBEB',
    rarity: 'legendary',
    animated: true,
  },

  // ── Volume ───────────────────────────────────────────────────────────────
  {
    id: 'first_step',
    title: 'First Step',
    description: 'Submitted your first report',
    icon: 'footsteps',
    color: '#9CA3AF',
    bg: '#F9FAFB',
    rarity: 'common',
  },
  {
    id: 'scout',
    title: 'Scout',
    description: '10 confirmed reports',
    icon: 'search',
    color: '#3B82F6',
    bg: '#EFF6FF',
    rarity: 'common',
  },
  {
    id: 'tracker',
    title: 'Tracker',
    description: '50 confirmed reports',
    icon: 'navigate',
    color: '#8B5CF6',
    bg: '#F5F3FF',
    rarity: 'rare',
  },
  {
    id: 'field_expert',
    title: 'Field Expert',
    description: '200 confirmed reports',
    icon: 'star',
    color: '#F59E0B',
    bg: '#FFFBEB',
    rarity: 'rare',
  },
  {
    id: 'legend',
    title: 'Legend',
    description: '500 confirmed reports',
    icon: 'trophy',
    color: '#EF4444',
    bg: '#FEF2F2',
    rarity: 'legendary',
    animated: true,
  },

  // ── Accuracy ─────────────────────────────────────────────────────────────
  {
    id: 'truth_teller',
    title: 'Truth Teller',
    description: '90%+ accuracy over 25 reports',
    icon: 'checkmark-circle',
    color: '#1D9E75',
    bg: '#ECFDF5',
    rarity: 'rare',
  },
  {
    id: 'oracle',
    title: 'Oracle',
    description: '95%+ accuracy over 100 reports',
    icon: 'eye',
    color: '#06B6D4',
    bg: '#ECFEFF',
    rarity: 'epic',
    animated: true,
  },

  // ── Streak ───────────────────────────────────────────────────────────────
  {
    id: 'on_a_roll',
    title: 'On a Roll',
    description: '7-day reporting streak',
    icon: 'flame',
    color: '#F97316',
    bg: '#FFF7ED',
    rarity: 'rare',
  },
  {
    id: 'unstoppable',
    title: 'Unstoppable',
    description: '30-day reporting streak',
    icon: 'thunderstorm',
    color: '#EF4444',
    bg: '#FEF2F2',
    rarity: 'epic',
    animated: true,
  },
];

const RARITY_RANK: Record<Rarity, number> = {
  legendary: 4,
  epic: 3,
  rare: 2,
  common: 1,
};

export const RARITY_LABELS: Record<Rarity, string> = {
  legendary: 'Legendary',
  epic: 'Epic',
  rare: 'Rare',
  common: 'Common',
};

export const RARITY_COLORS: Record<Rarity, string> = {
  legendary: '#F59E0B',
  epic: '#8B5CF6',
  rare: '#3B82F6',
  common: '#9CA3AF',
};

/** Returns badges the user has earned, sorted by rarity desc. */
export function earnedBadges(profile: {
  reports_count: number;
  accuracy_ratio: number;
  streak_days: number;
  joined_at: string | null;
}): Badge[] {
  const { reports_count, accuracy_ratio, streak_days, joined_at } = profile;
  const earned: string[] = [];

  // Founding: joined before 2027-01-01
  if (joined_at && new Date(joined_at) < new Date('2027-01-01')) {
    earned.push('founding_reporter');
  }
  if (reports_count >= 1)   earned.push('first_step');
  if (reports_count >= 10)  earned.push('scout');
  if (reports_count >= 50)  earned.push('tracker');
  if (reports_count >= 200) earned.push('field_expert');
  if (reports_count >= 500) earned.push('legend');

  if (reports_count >= 25  && accuracy_ratio >= 0.90) earned.push('truth_teller');
  if (reports_count >= 100 && accuracy_ratio >= 0.95) earned.push('oracle');

  if (streak_days >= 7)  earned.push('on_a_roll');
  if (streak_days >= 30) earned.push('unstoppable');

  return ALL_BADGES
    .filter((b) => earned.includes(b.id))
    .sort((a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity]);
}

/** Highest-rarity badge for use as featured display. */
export function featuredBadge(badges: Badge[]): Badge | null {
  return badges[0] ?? null;
}

/** Title to display below a user's name — based on highest-rarity badge. */
export function profileTitle(badges: Badge[]): string {
  const top = badges[0];
  if (!top) return 'New Member';
  return top.title;
}

/** Hero card accent color — based on rarity of highest badge. */
export function heroColor(badges: Badge[]): string {
  const top = badges[0];
  if (!top) return '#1D9E75';
  const palette: Record<Rarity, string> = {
    legendary: '#B45309',   // dark amber
    epic:      '#6D28D9',   // dark purple
    rare:      '#1D4ED8',   // dark blue
    common:    '#1D9E75',   // brand green
  };
  return palette[top.rarity];
}

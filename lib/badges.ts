/** Badge metadata and earned-badge logic for the Rewards screen. */

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface Badge {
  id: string;
  title: string;
  description: string;
  requirement: string;  // how to unlock, shown in preview
  icon: string;
  color: string;
  bg: string;
  rarity: Rarity;
  animated?: boolean;
}

// Sorted by display order (rarity desc within each theme)
export const ALL_BADGES: Badge[] = [
  // ── Special / limited ───────────────────────────────────────────────────
  {
    id: 'founding_reporter',
    title: 'Founding Reporter',
    description: 'One of the original ShelfCheck contributors — here since the beginning',
    requirement: 'Awarded to anyone who joined before 2027. Cannot be earned after launch year.',
    icon: 'leaf',
    color: '#F59E0B',
    bg: '#FFFBEB',
    rarity: 'legendary',
    animated: true,
  },
  {
    id: 'top_reporter',
    title: 'Top Reporter',
    description: 'One of the top 10 contributors on ShelfCheck',
    requirement: 'Reach the top 10 on the leaderboard.',
    icon: 'podium',
    color: '#8B5CF6',
    bg: '#F5F3FF',
    rarity: 'epic',
    animated: true,
  },

  // ── Volume ───────────────────────────────────────────────────────────────
  {
    id: 'first_step',
    title: 'First Step',
    description: 'Submitted your first stock report',
    requirement: 'Submit 1 report.',
    icon: 'footsteps',
    color: '#9CA3AF',
    bg: '#F9FAFB',
    rarity: 'common',
  },
  {
    id: 'scout',
    title: 'Scout',
    description: 'A regular contributor to the community',
    requirement: 'Submit 10 confirmed reports.',
    icon: 'search',
    color: '#3B82F6',
    bg: '#EFF6FF',
    rarity: 'common',
  },
  {
    id: 'tracker',
    title: 'Tracker',
    description: 'A dedicated shelf-checker',
    requirement: 'Submit 50 confirmed reports.',
    icon: 'navigate',
    color: '#8B5CF6',
    bg: '#F5F3FF',
    rarity: 'rare',
  },
  {
    id: 'field_expert',
    title: 'Field Expert',
    description: 'An expert in the field',
    requirement: 'Submit 200 confirmed reports.',
    icon: 'star',
    color: '#F59E0B',
    bg: '#FFFBEB',
    rarity: 'rare',
  },
  {
    id: 'legend',
    title: 'Legend',
    description: 'A ShelfCheck legend — top of the community',
    requirement: 'Submit 500 confirmed reports.',
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
    description: 'Consistently accurate reports',
    requirement: 'Maintain 90%+ accuracy across at least 25 reports.',
    icon: 'checkmark-circle',
    color: '#1D9E75',
    bg: '#ECFDF5',
    rarity: 'rare',
  },
  {
    id: 'oracle',
    title: 'Oracle',
    description: 'Near-perfect accuracy — the community trusts you',
    requirement: 'Maintain 95%+ accuracy across at least 100 reports.',
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
    description: 'Reported every day for a full week',
    requirement: 'Maintain a 7-day reporting streak.',
    icon: 'flame',
    color: '#F97316',
    bg: '#FFF7ED',
    rarity: 'rare',
  },
  {
    id: 'unstoppable',
    title: 'Unstoppable',
    description: 'A month of daily contributions',
    requirement: 'Maintain a 30-day reporting streak.',
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
  leaderboard_rank?: number | null;
}): Badge[] {
  const { reports_count, accuracy_ratio, streak_days, joined_at, leaderboard_rank } = profile;
  const earned: string[] = [];

  // Founding: joined before 2027-01-01
  if (joined_at && new Date(joined_at) < new Date('2027-01-01')) {
    earned.push('founding_reporter');
  }
  // Top 10 on leaderboard
  if (leaderboard_rank != null && leaderboard_rank >= 1 && leaderboard_rank <= 10) {
    earned.push('top_reporter');
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

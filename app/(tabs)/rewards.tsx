import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';

const FEATURED_KEY = 'shelfcheck:featured_badge';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { fetchProfile, fetchLeaderboard, updateUsername, updateFeaturedBadge, confirmPendingPoints, type Profile, type LeaderboardEntry } from '../../lib/api';
import TierProgressModal from '../../components/TierProgressModal';
import { supabase } from '../../lib/supabase';
import { useAuth, getReportingUserId } from '../../lib/auth';
import {
  ALL_BADGES,
  earnedBadges,
  featuredBadge,
  heroColor,
  RARITY_COLORS,
  RARITY_LABELS,
  type Badge,
} from '../../lib/badges';
import { TIERS, getTier, tierProgress } from '../../lib/tiers';

const PRIMARY = '#1D9E75';

// ─── Tier pill ────────────────────────────────────────────────────────────────
function TierPill({ points, size = 'sm' }: { points: number; size?: 'sm' | 'xs' }) {
  const tier = getTier(points);
  const isXs = size === 'xs';
  return (
    <View style={[tp.pill, { backgroundColor: tier.color + '20', borderColor: tier.color + '50' }]}>
      <Ionicons name={tier.icon as any} size={isXs ? 9 : 11} color={tier.color} />
      <Text style={[tp.label, { color: tier.color, fontSize: isXs ? 9 : 10 }]}>{tier.label}</Text>
    </View>
  );
}
const tp = StyleSheet.create({
  pill:  { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 20, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  label: { fontWeight: '700' },
});

// ─── Animated badge glow component ────────────────────────────────────────────
function GlowBadge({ badge, size = 72 }: { badge: Badge; size?: number }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!badge.animated) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [badge.animated, pulse]);

  const glowOpacity = badge.animated
    ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.75] })
    : 1;
  const glowScale = badge.animated
    ? pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] })
    : new Animated.Value(1);

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: size + 24, height: size + 24 }}>
      {badge.animated && (
        <Animated.View
          style={{
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: badge.color,
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          }}
        />
      )}
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: badge.bg,
          borderWidth: 2,
          borderColor: badge.color + '60',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={badge.icon as any} size={size * 0.44} color={badge.color} />
      </View>
    </View>
  );
}

// ─── Small badge card for grid ────────────────────────────────────────────────
function BadgeCard({
  badge, unlocked, isFeatured, onPress,
}: {
  badge: Badge; unlocked: boolean; isFeatured: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[bc.card, { borderColor: unlocked ? badge.color + '40' : '#E5E7EB' }, !unlocked && bc.locked, isFeatured && { borderColor: badge.color, borderWidth: 2 }]}
    >
      <View style={[bc.iconBox, { backgroundColor: unlocked ? badge.bg : '#F3F4F6' }]}>
        <Ionicons name={badge.icon as any} size={22} color={unlocked ? badge.color : '#D1D5DB'} />
        {!unlocked && (
          <View style={bc.lockDot}>
            <Ionicons name="lock-closed" size={9} color="#9CA3AF" />
          </View>
        )}
        {isFeatured && (
          <View style={bc.featuredDot}>
            <Ionicons name="star" size={8} color="#fff" />
          </View>
        )}
      </View>
      <Text style={[bc.name, !unlocked && bc.nameLocked]} numberOfLines={1}>{badge.title}</Text>
      <View style={[bc.rarityPill, { backgroundColor: unlocked ? RARITY_COLORS[badge.rarity] + '20' : '#F3F4F6' }]}>
        <Text style={[bc.rarityText, { color: unlocked ? RARITY_COLORS[badge.rarity] : '#9CA3AF' }]}>
          {RARITY_LABELS[badge.rarity]}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Badge detail / preview modal ─────────────────────────────────────────────
function BadgeDetailModal({
  badge,
  unlocked,
  isFeatured,
  onSetFeatured,
  onClose,
}: {
  badge: Badge;
  unlocked: boolean;
  isFeatured: boolean;
  onSetFeatured: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <TouchableOpacity style={md.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={md.card}>
          {/* Badge preview */}
          <View style={[md.badgeBg, { backgroundColor: unlocked ? badge.bg : '#F3F4F6' }]}>
            <GlowBadge badge={unlocked ? badge : { ...badge, animated: false }} size={88} />
          </View>

          {/* Rarity pill */}
          <View style={[md.rarityPill, { backgroundColor: RARITY_COLORS[badge.rarity] + '20' }]}>
            <View style={[md.rarityDot, { backgroundColor: RARITY_COLORS[badge.rarity] }]} />
            <Text style={[md.rarityText, { color: RARITY_COLORS[badge.rarity] }]}>
              {RARITY_LABELS[badge.rarity]}
            </Text>
          </View>

          <Text style={md.title}>{badge.title}</Text>
          <Text style={md.description}>{badge.description}</Text>

          {/* Requirement */}
          <View style={[md.requireBox, unlocked && md.requireBoxEarned]}>
            <Ionicons
              name={unlocked ? 'checkmark-circle' : 'lock-closed-outline'}
              size={15}
              color={unlocked ? '#1D9E75' : '#9CA3AF'}
            />
            <Text style={[md.requireText, unlocked && md.requireTextEarned]}>
              {unlocked ? 'Earned · ' : 'How to unlock: '}{badge.requirement}
            </Text>
          </View>

          {/* Actions */}
          <View style={md.actions}>
            <TouchableOpacity style={md.closeBtn} onPress={onClose}>
              <Text style={md.closeBtnText}>Close</Text>
            </TouchableOpacity>
            {unlocked && (
              <TouchableOpacity
                style={[md.setBtn, { backgroundColor: isFeatured ? '#6B7280' : badge.color }]}
                onPress={() => { onSetFeatured(); onClose(); }}
              >
                <Ionicons name={isFeatured ? 'star' : 'star-outline'} size={14} color="#fff" />
                <Text style={md.setBtnText}>
                  {isFeatured ? 'Current Avatar' : 'Set as Avatar'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function RewardsScreen() {
  const router = useRouter();
  const { session, isGuest, isAdmin, loading: authLoading } = useAuth();
  const reportingId = getReportingUserId(session);

  const [profile, setProfile]             = useState<Profile | null>(null);
  const [loading, setLoading]             = useState(true);
  const [leaderboard, setLeaderboard]     = useState<LeaderboardEntry[]>([]);
  const [lbLoading, setLbLoading]         = useState(true);
  const [lbError, setLbError]             = useState<string | null>(null);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [showTierProgress, setShowTierProgress] = useState(false);
  const [previewBadge, setPreviewBadge]   = useState<Badge | null>(null);
  const [featuredBadgeId, setFeaturedBadgeId] = useState<string | null>(() => {
    try { return localStorage.getItem(FEATURED_KEY); } catch { return null; }
  });
  const [editingName, setEditingName]     = useState(false);
  const [nameInput, setNameInput]         = useState('');
  const [nameSaving, setNameSaving]       = useState(false);

  const load = useCallback(async () => {
    // Trigger server-side confirmation of any pending reports older than 4h
    confirmPendingPoints().catch(() => {});
    try {
      const p = await fetchProfile(reportingId);
      setProfile(p);
    } catch {
      // profile stays null
    } finally {
      setLoading(false);
    }
  }, [reportingId]);

  const loadLeaderboard = useCallback(async () => {
    setLbLoading(true);
    setLbError(null);
    try {
      setLeaderboard(await fetchLeaderboard(25));
    } catch (err: any) {
      setLbError(err?.message ?? 'Failed to load leaderboard');
    } finally {
      setLbLoading(false);
    }
  }, []);

  useEffect(() => { loadLeaderboard(); }, [loadLeaderboard]);

  useEffect(() => {
    // Wait for auth to finish restoring the session before loading the profile.
    // Without this, on refresh session=null briefly and we'd fetch the guest profile.
    if (authLoading) return;
    load();
    const channel = supabase
      .channel(`profile-live-${reportingId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${reportingId}` },
        (payload) => { if (payload.new) setProfile(payload.new as Profile); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load, reportingId, authLoading]);

  const points        = profile?.points        ?? 0;
  const pendingPts    = profile?.pending_points ?? 0;
  const reportsCount  = profile?.reports_count  ?? 0;
  const accuracyRatio = (profile as any)?.accuracy_ratio ?? 1;
  const streakDays    = (profile as any)?.streak_days    ?? 0;
  const joinedAt      = session?.user?.created_at ?? (profile as any)?.joined_at ?? null;
  const displayName   = profile?.username       ?? null;
  const tier          = getTier(points);
  const progress      = tierProgress(points);

  const myLbEntry     = leaderboard.find((e) => e.id === reportingId);
  const myRank        = myLbEntry?.rank ?? null;

  const earned    = earnedBadges({ reports_count: reportsCount, accuracy_ratio: accuracyRatio, streak_days: streakDays, joined_at: joinedAt, leaderboard_rank: myRank });
  const earnedIds = new Set(earned.map((b) => b.id));

  // Use the user's chosen badge if it's still earned, otherwise fall back to highest-rarity
  const featured  = (featuredBadgeId && earnedIds.has(featuredBadgeId))
    ? ALL_BADGES.find((b) => b.id === featuredBadgeId) ?? featuredBadge(earned)
    : featuredBadge(earned);
  const title     = tier.label;
  const cardColor = heroColor(featured ? [featured, ...earned.filter(b => b.id !== featured.id)] : earned);

  function handleSetFeatured(badgeId: string) {
    setFeaturedBadgeId(badgeId);
    try { localStorage.setItem(FEATURED_KEY, badgeId); } catch {}
    if (session?.user.id) {
      updateFeaturedBadge(session.user.id, badgeId).catch(() => {});
    }
  }

  async function handleSaveName() {
    if (!session?.user.id) return;
    setNameSaving(true);
    try {
      await updateUsername(session.user.id, nameInput);
      const trimmed = nameInput.trim() || null;
      setProfile((p) => p
        ? { ...p, username: trimmed }
        : { id: session.user.id, username: trimmed, points: 0, pending_points: 0, reports_count: 0 } as any
      );
      setEditingName(false);
    } catch (err: any) {
      // Show error inline so user knows it failed
      setNameSaving(false);
      alert('Could not save name: ' + (err?.message ?? String(err)));
      return;
    }
    setNameSaving(false);
  }

  // Sort ALL_BADGES: earned first, then by rarity
  const sortedBadges = [...ALL_BADGES].sort((a, b) => {
    const aE = earnedIds.has(a.id) ? 1 : 0;
    const bE = earnedIds.has(b.id) ? 1 : 0;
    if (aE !== bE) return bE - aE;
    const rarityOrder = { legendary: 4, epic: 3, rare: 2, common: 1 };
    return rarityOrder[b.rarity] - rarityOrder[a.rarity];
  });

  const accuracyPct = Math.round(accuracyRatio * 100);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero card ── */}
        <View style={[styles.heroCard, { backgroundColor: cardColor }]}>

          {/* Featured badge + title */}
          <View style={styles.heroTop}>
            {loading ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : featured ? (
              <TouchableOpacity
                style={styles.featuredRow}
                onPress={() => earned.length > 1 ? setShowAvatarPicker(true) : setPreviewBadge(featured)}
                activeOpacity={0.8}
              >
                <View>
                  <GlowBadge badge={featured} size={64} />
                  {earned.length > 1 && (
                    <View style={styles.changeHint}>
                      <Ionicons name="swap-horizontal" size={9} color="rgba(255,255,255,0.8)" />
                      <Text style={styles.changeHintText}>tap to change</Text>
                    </View>
                  )}
                </View>
                <View style={styles.featuredText}>
                  <Text style={styles.featuredTitle}>{title}</Text>
                  <View style={styles.featuredRarityRow}>
                    <View style={[styles.featuredRarityPill, { backgroundColor: RARITY_COLORS[featured.rarity] + '30' }]}>
                      <Text style={[styles.featuredRarityText, { color: '#fff' }]}>
                        {RARITY_LABELS[featured.rarity]}
                      </Text>
                    </View>
                    <Text style={styles.featuredDesc} numberOfLines={2}>{featured.description}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ) : (
              <View style={styles.featuredRow}>
                <View style={styles.noFeaturedIcon}>
                  <Ionicons name="person-circle" size={52} color="rgba(255,255,255,0.3)" />
                </View>
                <View style={styles.featuredText}>
                  <Text style={styles.featuredTitle}>{tier.label}</Text>
                  <Text style={styles.featuredDesc}>Submit reports to earn your first badge</Text>
                </View>
              </View>
            )}
          </View>

          {/* Display name */}
          {!isGuest && (
            <View style={styles.nameRow}>
              {editingName ? (
                <View style={styles.nameEditRow}>
                  <TextInput
                    style={styles.nameInput}
                    value={nameInput}
                    onChangeText={setNameInput}
                    placeholder="Display name (optional)"
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    maxLength={30}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleSaveName}
                  />
                  <TouchableOpacity onPress={handleSaveName} disabled={nameSaving} style={styles.nameSaveBtn}>
                    {nameSaving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark" size={16} color="#fff" />}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditingName(false)} style={styles.nameCancelBtn}>
                    <Ionicons name="close" size={16} color="rgba(255,255,255,0.7)" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.nameDisplay} onPress={() => { setNameInput(displayName ?? ''); setEditingName(true); }}>
                  <Text style={styles.nameText}>{displayName ?? 'Set display name'}</Text>
                  <Ionicons name="pencil" size={11} color="rgba(255,255,255,0.6)" />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Points + pending */}
          <View style={styles.pointsRow}>
            <View>
              <Text style={styles.pointsLabel}>Confirmed Points</Text>
              <Text style={styles.pointsValue}>{points.toLocaleString()}</Text>
            </View>
            {pendingPts > 0 && (
              <View style={styles.pendingBox}>
                <Ionicons name="time-outline" size={13} color="#FDE68A" />
                <View>
                  <Text style={styles.pendingValue}>+{pendingPts}</Text>
                  <Text style={styles.pendingLabel}>pending</Text>
                </View>
              </View>
            )}
            <View style={[styles.tierBadge, { backgroundColor: tier.color + '30' }]}>
              <Ionicons name={tier.icon as any} size={13} color="#fff" />
              <Text style={styles.tierBadgeText}>Lv {tier.level} · {tier.label}</Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={styles.progressSection}>
            <View style={styles.progressLabelRow}>
              <Text style={styles.progressLabel}>
                {tier.level < TIERS.length ? `Next: ${TIERS[tier.level]?.label ?? ''}` : 'Max tier reached'}
              </Text>
              <Text style={styles.progressLabel}>{points} / {tier.next}</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` as any }]} />
            </View>
            <TouchableOpacity
              style={styles.tierProgressBtn}
              onPress={() => setShowTierProgress(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="layers-outline" size={13} color="rgba(255,255,255,0.85)" />
              <Text style={styles.tierProgressBtnText}>View all levels &amp; perks</Text>
              <Ionicons name="chevron-forward" size={12} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <StatItem value={reportsCount.toString()} label="Reports" />
            <View style={styles.statDivider} />
            <StatItem value={`${accuracyPct}%`} label="Accuracy" />
            <View style={styles.statDivider} />
            <StatItem value={streakDays > 0 ? `${streakDays}d 🔥` : '—'} label="Streak" />
            <View style={styles.statDivider} />
            <StatItem value={earned.length.toString()} label="Badges" />
          </View>
        </View>

        {/* Guest banner */}
        {isGuest && (
          <TouchableOpacity style={styles.guestBanner} onPress={() => router.push('/auth')} activeOpacity={0.8}>
            <Ionicons name="person-circle-outline" size={20} color={PRIMARY} />
            <Text style={styles.guestBannerText}>Sign in to sync points &amp; badges across devices</Text>
            <Ionicons name="chevron-forward" size={16} color={PRIMARY} />
          </TouchableOpacity>
        )}

        {/* Pending points explanation */}
        {pendingPts > 0 && (
          <View style={styles.pendingNote}>
            <Ionicons name="information-circle-outline" size={16} color="#92400E" />
            <Text style={styles.pendingNoteText}>
              <Text style={{ fontWeight: '700' }}>{pendingPts} pts pending</Text>
              {' '}— confirmed ~4h after submission if no one reports differently.
            </Text>
          </View>
        )}

        {/* ── Badges ── */}
        <Text style={styles.sectionTitle}>Badges</Text>
        <View style={styles.badgeGrid}>
          {sortedBadges.map((b) => (
            <BadgeCard
              key={b.id}
              badge={b}
              unlocked={earnedIds.has(b.id)}
              isFeatured={featuredBadgeId === b.id || (!featuredBadgeId && featured?.id === b.id)}
              onPress={() => setPreviewBadge(b)}
            />
          ))}
        </View>

        {/* Badge descriptions (earned only) */}
        {earned.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Your Collection</Text>
            <View style={styles.collectionList}>
              {earned.map((b) => (
                <View key={b.id} style={[styles.collectionRow, { borderLeftColor: b.color }]}>
                  <View style={[styles.collectionIconBox, { backgroundColor: b.bg }]}>
                    <Ionicons name={b.icon as any} size={18} color={b.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.collectionNameRow}>
                      <Text style={styles.collectionName}>{b.title}</Text>
                      <View style={[styles.collectionRarity, { backgroundColor: RARITY_COLORS[b.rarity] + '20' }]}>
                        <Text style={[styles.collectionRarityText, { color: RARITY_COLORS[b.rarity] }]}>
                          {RARITY_LABELS[b.rarity]}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.collectionDesc}>{b.description}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Leaderboard ── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Leaderboard</Text>
          <TouchableOpacity onPress={loadLeaderboard} hitSlop={8}>
            <Ionicons name="refresh" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {lbLoading ? (
          <View style={lb.loading}><ActivityIndicator color={PRIMARY} /></View>
        ) : lbError ? (
          <View style={lb.empty}>
            <Ionicons name="warning-outline" size={32} color="#FCA5A5" />
            <Text style={lb.emptyText}>Leaderboard unavailable</Text>
            <Text style={lb.emptyHint}>Run migration 010 in Supabase to enable it.{'\n'}{lbError}</Text>
          </View>
        ) : leaderboard.length === 0 ? (
          <View style={lb.empty}>
            <Ionicons name="podium-outline" size={32} color="#D1D5DB" />
            <Text style={lb.emptyText}>No entries yet — be the first!</Text>
          </View>
        ) : (
          <View style={lb.card}>
            {leaderboard.map((entry) => {
              const isMe = entry.id === reportingId;
              const name = entry.username ?? `Reporter ${entry.id.slice(-5).toUpperCase()}`;
              const rankColor = entry.rank === 1 ? '#F59E0B' : entry.rank === 2 ? '#9CA3AF' : entry.rank === 3 ? '#B45309' : '#E5E7EB';
              const rankText = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`;
              return (
                <View key={entry.id} style={[lb.row, isMe && lb.rowMe]}>
                  <View style={[lb.rankBox, { borderColor: rankColor }]}>
                    <Text style={[lb.rankText, entry.rank <= 3 && { fontSize: 16 }]}>{rankText}</Text>
                  </View>
                  <View style={lb.nameCol}>
                    <View style={lb.nameRow}>
                      {entry.featured_badge_id && (() => {
                        const b = ALL_BADGES.find((x) => x.id === entry.featured_badge_id);
                        return b ? (
                          <View style={[lb.badgeIcon, { backgroundColor: b.bg }]}>
                            <Ionicons name={b.icon as any} size={11} color={b.color} />
                          </View>
                        ) : null;
                      })()}
                      <Text style={[lb.name, isMe && lb.nameMe]} numberOfLines={1}>{name}</Text>
                      {isMe && <View style={lb.youBadge}><Text style={lb.youText}>you</Text></View>}
                    </View>
                    <TierPill points={entry.points} size="xs" />
                  </View>
                  <Text style={[lb.pts, isMe && lb.ptsMe]}>{entry.points.toLocaleString()} pts</Text>
                </View>
              );
            })}

            {/* Current user's rank if not in top 25 */}
            {myRank && !myLbEntry && (
              <View style={lb.myRankRow}>
                <Ionicons name="ellipsis-horizontal" size={14} color="#9CA3AF" />
                <Text style={lb.myRankText}>Your rank: #{myRank}</Text>
                <Text style={lb.myRankPts}>{points.toLocaleString()} pts</Text>
              </View>
            )}
          </View>
        )}

        {/* Admin panel link — only visible to admins */}
        {isAdmin && (
          <TouchableOpacity style={styles.adminBtn} onPress={() => router.push('/admin')} activeOpacity={0.8}>
            <Ionicons name="shield-checkmark" size={16} color="#6D28D9" />
            <Text style={styles.adminBtnText}>Item Admin Panel</Text>
            <Ionicons name="chevron-forward" size={14} color="#6D28D9" />
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Avatar picker modal */}
      <Modal visible={showAvatarPicker} transparent animationType="fade" onRequestClose={() => setShowAvatarPicker(false)}>
        <TouchableOpacity style={md.backdrop} activeOpacity={1} onPress={() => setShowAvatarPicker(false)}>
          <TouchableOpacity activeOpacity={1} style={[md.card, { alignItems: 'stretch' }]}>
            <Text style={[md.title, { fontSize: 17, marginBottom: 4 }]}>Choose Avatar</Text>
            <Text style={[md.description, { marginBottom: 12, fontSize: 12 }]}>Pick from your earned badges</Text>
            <View style={av.grid}>
              {earned.map((b) => {
                const isActive = featuredBadgeId === b.id || (!featuredBadgeId && featured?.id === b.id);
                return (
                  <TouchableOpacity
                    key={b.id}
                    style={[av.item, isActive && { borderColor: b.color, borderWidth: 2 }]}
                    onPress={() => { handleSetFeatured(b.id); setShowAvatarPicker(false); }}
                    activeOpacity={0.75}
                  >
                    <View style={[av.iconBox, { backgroundColor: b.bg }]}>
                      <Ionicons name={b.icon as any} size={26} color={b.color} />
                    </View>
                    <Text style={av.name} numberOfLines={1}>{b.title}</Text>
                    {isActive && (
                      <View style={av.activeDot}>
                        <Ionicons name="checkmark" size={9} color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={md.closeBtn} onPress={() => setShowAvatarPicker(false)}>
              <Text style={md.closeBtnText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Badge preview / avatar picker modal */}
      {previewBadge && (
        <BadgeDetailModal
          badge={previewBadge}
          unlocked={earnedIds.has(previewBadge.id)}
          isFeatured={featuredBadgeId === previewBadge.id || (!featuredBadgeId && featured?.id === previewBadge.id)}
          onSetFeatured={() => handleSetFeatured(previewBadge.id)}
          onClose={() => setPreviewBadge(null)}
        />
      )}

      <TierProgressModal
        visible={showTierProgress}
        onClose={() => setShowTierProgress(false)}
        points={points}
      />
    </SafeAreaView>
  );
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#F9FAFB' },
  scroll:             { padding: 16, paddingBottom: 40 },

  // Hero card
  heroCard:           { borderRadius: 22, padding: 20, marginBottom: 16 },
  heroTop:            { marginBottom: 18 },
  featuredRow:        { flexDirection: 'row', alignItems: 'center', gap: 14 },
  noFeaturedIcon:     { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
  featuredText:       { flex: 1, gap: 6 },
  featuredTitle:      { fontSize: 20, fontWeight: '800', color: '#fff' },
  featuredRarityRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  featuredRarityPill: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  featuredRarityText: { fontSize: 11, fontWeight: '700' },
  featuredDesc:       { fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 16, flex: 1 },

  // Points
  pointsRow:          { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  pointsLabel:        { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  pointsValue:        { fontSize: 38, fontWeight: '800', color: '#fff', lineHeight: 44 },
  pendingBox:         { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 4 },
  pendingValue:       { fontSize: 16, fontWeight: '800', color: '#FDE68A' },
  pendingLabel:       { fontSize: 10, color: 'rgba(255,255,255,0.65)', fontWeight: '600' },
  tierBadge:          { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 4, marginLeft: 'auto' as any },
  tierBadgeText:      { fontSize: 12, fontWeight: '700', color: '#fff' },

  // Display name
  nameRow:            { marginBottom: 12 },
  nameDisplay:        { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' },
  nameText:           { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  nameEditRow:        { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nameInput:          { flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 14, color: '#fff', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  nameSaveBtn:        { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  nameCancelBtn:      { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  // Section with refresh button
  sectionHeaderRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 8 },

  // Progress
  progressSection:    { marginBottom: 16, gap: 6 },
  progressLabelRow:   { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel:      { fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  progressTrack:      { height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  progressFill:       { height: '100%', backgroundColor: '#fff', borderRadius: 4 },
  tierProgressBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5, marginTop: 2,
  },
  tierProgressBtnText: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },

  // Stats
  statsRow:           { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 12, paddingVertical: 12 },
  statItem:           { flex: 1, alignItems: 'center', gap: 2 },
  statValue:          { fontSize: 17, fontWeight: '800', color: '#fff' },
  statLabel:          { fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  statDivider:        { width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },

  // Guest banner
  guestBanner:        { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ECFDF5', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#A7F3D0' },
  guestBannerText:    { flex: 1, fontSize: 13, fontWeight: '600', color: PRIMARY },

  // Pending note
  pendingNote:        { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FFFBEB', borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#FDE68A' },
  pendingNoteText:    { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },

  // Section titles
  sectionTitle:       { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 12, marginTop: 8 },

  // Badge grid
  badgeGrid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },

  // Collection list
  collectionList:     { gap: 10, marginBottom: 28 },
  collectionRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#E5E7EB', borderLeftWidth: 4 },
  collectionIconBox:  { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  collectionNameRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  collectionName:     { fontSize: 14, fontWeight: '700', color: '#111827' },
  collectionRarity:   { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  collectionRarityText:{ fontSize: 10, fontWeight: '700' },
  collectionDesc:     { fontSize: 12, color: '#6B7280', lineHeight: 16 },

  // Featured badge change hint
  changeHint:      { flexDirection: 'row', alignItems: 'center', gap: 3, justifyContent: 'center', marginTop: 2 },
  changeHintText:  { fontSize: 9, color: 'rgba(255,255,255,0.75)', fontWeight: '600' },

  // Admin
  adminBtn:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5F3FF', borderRadius: 12, padding: 14, marginTop: 8, borderWidth: 1, borderColor: '#DDD6FE' },
  adminBtnText:  { flex: 1, fontSize: 14, fontWeight: '700', color: '#6D28D9' },
});

const bc = StyleSheet.create({
  card:       { width: '31%', backgroundColor: '#fff', borderRadius: 14, padding: 11, alignItems: 'center', gap: 5, borderWidth: 1 },
  locked:     { opacity: 0.5 },
  iconBox:    { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  lockDot:    { position: 'absolute', bottom: -2, right: -2, backgroundColor: '#E5E7EB', borderRadius: 8, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  featuredDot:{ position: 'absolute', top: -2, right: -2, backgroundColor: '#F59E0B', borderRadius: 8, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  name:       { fontSize: 11, fontWeight: '700', color: '#111827', textAlign: 'center' },
  nameLocked: { color: '#9CA3AF' },
  rarityPill: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  rarityText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase' as any },
});

const lb = StyleSheet.create({
  loading:      { paddingVertical: 32, alignItems: 'center' },
  empty:        { paddingVertical: 32, alignItems: 'center', gap: 8 },
  emptyText:    { fontSize: 14, color: '#9CA3AF' },
  emptyHint:    { fontSize: 11, color: '#D1D5DB', textAlign: 'center', paddingHorizontal: 16 },
  card:         { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden', marginBottom: 4 },
  row:          { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  rowMe:        { backgroundColor: '#ECFDF5' },
  rankBox:      { width: 36, height: 36, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rankText:     { fontSize: 12, fontWeight: '800', color: '#374151' },
  nameCol:      { flex: 1, gap: 3, minWidth: 0 },
  nameRow:      { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  name:         { fontSize: 14, fontWeight: '600', color: '#111827' },
  nameMe:       { color: '#065F46' },
  founderBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#FFFBEB', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: '#FDE68A' },
  founderText:  { fontSize: 9, fontWeight: '800', color: '#B45309' },
  badgeIcon:    { width: 18, height: 18, borderRadius: 5, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  youBadge:     { backgroundColor: '#ECFDF5', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: '#A7F3D0' },
  youText:      { fontSize: 9, fontWeight: '800', color: '#065F46' },
  pts:          { fontSize: 13, fontWeight: '700', color: '#6B7280', flexShrink: 0 },
  ptsMe:        { color: '#065F46' },
  myRankRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#F9FAFB', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  myRankText:   { flex: 1, fontSize: 13, fontWeight: '600', color: '#6B7280' },
  myRankPts:    { fontSize: 13, fontWeight: '700', color: '#9CA3AF' },
});

const av = StyleSheet.create({
  grid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  item:      { width: '30%', alignItems: 'center', gap: 5, backgroundColor: '#F9FAFB', borderRadius: 14, padding: 10, borderWidth: 1.5, borderColor: '#E5E7EB' },
  iconBox:   { width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  name:      { fontSize: 10, fontWeight: '700', color: '#374151', textAlign: 'center' },
  activeDot: { position: 'absolute', top: 4, right: 4, backgroundColor: '#1D9E75', borderRadius: 8, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
});

const md = StyleSheet.create({
  backdrop:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:           { backgroundColor: '#fff', borderRadius: 24, padding: 24, width: '100%', maxWidth: 380, alignItems: 'center', gap: 12 },
  badgeBg:        { width: 140, height: 140, borderRadius: 70, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  rarityPill:     { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  rarityDot:      { width: 7, height: 7, borderRadius: 4 },
  rarityText:     { fontSize: 12, fontWeight: '700' },
  title:          { fontSize: 22, fontWeight: '800', color: '#111827', textAlign: 'center' },
  description:    { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
  requireBox:     { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: '#F3F4F6', borderRadius: 10, padding: 12, width: '100%' },
  requireBoxEarned: { backgroundColor: '#ECFDF5' },
  requireText:    { flex: 1, fontSize: 12, color: '#6B7280', lineHeight: 17 },
  requireTextEarned: { color: '#065F46' },
  actions:        { flexDirection: 'row', gap: 10, width: '100%', marginTop: 4 },
  closeBtn:       { flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center', paddingVertical: 12 },
  closeBtnText:   { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  setBtn:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 12 },
  setBtnText:     { fontSize: 14, fontWeight: '700', color: '#fff' },
});

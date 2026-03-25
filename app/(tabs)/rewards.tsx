import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { fetchProfile, type Profile } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { useAuth, getReportingUserId } from '../../lib/auth';

const PRIMARY = '#1D9E75';

// Level thresholds: [minPoints, label, nextLevelPoints]
const LEVELS: Array<{ min: number; label: string; next: number }> = [
  { min: 0,    label: 'Level 1 Newcomer',    next: 100  },
  { min: 100,  label: 'Level 2 Helper',       next: 300  },
  { min: 300,  label: 'Level 3 Scout',        next: 600  },
  { min: 600,  label: 'Level 4 Trail Blazer', next: 1000 },
  { min: 1000, label: 'Level 5 Expert',       next: 1500 },
  { min: 1500, label: 'Level 6 Champion',     next: 2500 },
];

function getLevelInfo(points: number) {
  let level = LEVELS[0];
  for (const l of LEVELS) {
    if (points >= l.min) level = l;
  }
  return level;
}

const ACHIEVEMENTS = [
  { id: '1', icon: 'star',    title: 'First Report',    sub: 'Log your first item',    minReports: 1  },
  { id: '2', icon: 'flash',   title: 'Speed Scout',     sub: '5 reports submitted',    minReports: 5  },
  { id: '3', icon: 'ribbon',  title: 'Dedicated',       sub: '10 reports submitted',   minReports: 10 },
  { id: '4', icon: 'trophy',  title: 'Top Contributor', sub: '25 reports submitted',   minReports: 25 },
  { id: '5', icon: 'medal',   title: 'Streak Master',   sub: '50 reports submitted',   minReports: 50 },
  { id: '6', icon: 'globe',   title: 'Store Explorer',  sub: '100 reports submitted',  minReports: 100},
];

const REWARDS = [
  { id: '1', label: '$2 off',        sub: 'Any order over $20', cost: 200  },
  { id: '2', label: '$5 off',        sub: 'Any order over $40', cost: 500  },
  { id: '3', label: 'Free Delivery', sub: 'One delivery order', cost: 1000 },
];

export default function RewardsScreen() {
  const router = useRouter();
  const { session, isGuest } = useAuth();
  const reportingId = getReportingUserId(session);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const p = await fetchProfile(reportingId);
      setProfile(p);
    } catch {
      // silently ignore — profile just stays null
    } finally {
      setLoading(false);
    }
  }, [reportingId]);

  useEffect(() => {
    load();

    // Realtime: update points instantly when this user's profile changes
    const channel = supabase
      .channel(`profile-live-${reportingId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${reportingId}`,
        },
        (payload) => {
          if (payload.new && typeof payload.new === 'object') {
            setProfile(payload.new as Profile);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [load, reportingId]);

  const points       = profile?.points ?? 0;
  const reportsCount = profile?.reports_count ?? 0;
  const levelInfo    = getLevelInfo(points);
  const progress     = Math.min(points / levelInfo.next, 1);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Points hero card */}
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.pointsLabel}>Your Points</Text>
              {loading ? (
                <ActivityIndicator color="#fff" style={{ marginTop: 8 }} />
              ) : (
                <Text style={styles.pointsValue}>{points.toLocaleString()}</Text>
              )}
            </View>
            <View style={styles.levelBadge}>
              <Ionicons name="shield-checkmark" size={16} color="#fff" />
              <Text style={styles.levelBadgeText}>{levelInfo.label}</Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={styles.progressSection}>
            <View style={styles.progressLabelRow}>
              <Text style={styles.progressLabel}>Progress to next level</Text>
              <Text style={styles.progressLabel}>{points} / {levelInfo.next}</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` as any }]} />
            </View>
            <Text style={styles.progressSub}>
              {Math.max(0, levelInfo.next - points)} pts to {
                LEVELS[Math.min(LEVELS.indexOf(levelInfo) + 1, LEVELS.length - 1)].label
              }
            </Text>
          </View>

          {/* Stats */}
          <View style={styles.statsRow}>
            <StatItem value={reportsCount.toString()} label="Reports" />
            <View style={styles.statDivider} />
            <StatItem value={(points / 10).toFixed(0)} label="Pts Earned" />
            <View style={styles.statDivider} />
            <StatItem
              value={LEVELS.filter((l) => points >= l.min).length.toString()}
              label="Levels"
            />
          </View>
        </View>

        {/* Guest sign-in banner */}
        {isGuest && (
          <TouchableOpacity
            style={styles.guestBanner}
            onPress={() => router.push('/auth')}
            activeOpacity={0.8}
          >
            <Ionicons name="person-circle-outline" size={20} color={PRIMARY} />
            <Text style={styles.guestBannerText}>
              Sign in to sync points across devices
            </Text>
            <Ionicons name="chevron-forward" size={16} color={PRIMARY} />
          </TouchableOpacity>
        )}

        {/* Empty state — no reports yet */}
        {!loading && reportsCount === 0 && (
          <View style={styles.emptyCard}>
            <Ionicons name="leaf-outline" size={28} color={PRIMARY} />
            <Text style={styles.emptyTitle}>No points yet</Text>
            <Text style={styles.emptySub}>
              Submit your first report on the Home tab to start earning points.
            </Text>
          </View>
        )}

        {/* Achievements */}
        <Text style={styles.sectionTitle}>Achievements</Text>
        <View style={styles.achievementsGrid}>
          {ACHIEVEMENTS.map((a) => {
            const unlocked = reportsCount >= a.minReports;
            return (
              <View
                key={a.id}
                style={[styles.achievementCard, !unlocked && styles.achievementCardLocked]}
              >
                <View style={[styles.achievementIcon, unlocked ? styles.iconUnlocked : styles.iconLocked]}>
                  <Ionicons name={a.icon as any} size={22} color={unlocked ? PRIMARY : '#D1D5DB'} />
                  {!unlocked && (
                    <View style={styles.lockOverlay}>
                      <Ionicons name="lock-closed" size={11} color="#9CA3AF" />
                    </View>
                  )}
                </View>
                <Text style={[styles.achievementTitle, !unlocked && styles.titleLocked]} numberOfLines={1}>
                  {a.title}
                </Text>
                <Text style={styles.achievementSub} numberOfLines={2}>{a.sub}</Text>
              </View>
            );
          })}
        </View>

        {/* Redeem */}
        <Text style={styles.sectionTitle}>Redeem Rewards</Text>
        <View style={styles.rewardsList}>
          {REWARDS.map((r) => {
            const canRedeem = points >= r.cost;
            return (
              <View key={r.id} style={styles.rewardRow}>
                <View style={styles.rewardLeft}>
                  <View style={[styles.rewardValueBox, !canRedeem && styles.rewardValueBoxDim]}>
                    <Text style={[styles.rewardValue, !canRedeem && styles.rewardValueDim]}>
                      {r.label}
                    </Text>
                  </View>
                  <View style={styles.rewardText}>
                    <Text style={styles.rewardSub}>{r.sub}</Text>
                    <View style={styles.rewardCostRow}>
                      <Ionicons name="star" size={12} color="#F59E0B" />
                      <Text style={styles.rewardCost}>{r.cost} pts</Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.redeemBtn, !canRedeem && styles.redeemBtnDisabled]}
                  activeOpacity={0.8}
                  disabled={!canRedeem}
                >
                  <Text style={[styles.redeemBtnText, !canRedeem && styles.redeemBtnTextDisabled]}>
                    {canRedeem ? 'Redeem' : 'Locked'}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

      </ScrollView>
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

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#F9FAFB' },
  scroll:          { padding: 16, paddingBottom: 40 },
  heroCard:        { backgroundColor: PRIMARY, borderRadius: 20, padding: 20, marginBottom: 24 },
  heroTop:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  pointsLabel:     { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '600', marginBottom: 4 },
  pointsValue:     { fontSize: 40, fontWeight: '800', color: '#fff' },
  levelBadge:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  levelBadgeText:  { fontSize: 12, fontWeight: '700', color: '#fff' },
  progressSection: { marginBottom: 20, gap: 6 },
  progressLabelRow:{ flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel:   { fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },
  progressTrack:   { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  progressFill:    { height: '100%', backgroundColor: '#fff', borderRadius: 4 },
  progressSub:     { fontSize: 12, color: 'rgba(255,255,255,0.65)' },
  statsRow:        { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, paddingVertical: 12 },
  statItem:        { flex: 1, alignItems: 'center', gap: 2 },
  statValue:       { fontSize: 20, fontWeight: '800', color: '#fff' },
  statLabel:       { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },
  statDivider:     { width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  guestBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#ECFDF5', borderRadius: 12, padding: 14,
    marginBottom: 16, borderWidth: 1, borderColor: '#A7F3D0',
  },
  guestBannerText: { flex: 1, fontSize: 13, fontWeight: '600', color: PRIMARY },
  emptyCard: {
    backgroundColor: '#ECFDF5', borderRadius: 14, padding: 20,
    alignItems: 'center', gap: 8, marginBottom: 24,
    borderWidth: 1, borderColor: '#A7F3D0',
  },
  emptyTitle:      { fontSize: 15, fontWeight: '700', color: '#111827' },
  emptySub:        { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 18 },
  sectionTitle:    { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 12 },
  achievementsGrid:{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28 },
  achievementCard: { width: '31%', backgroundColor: '#fff', borderRadius: 14, padding: 12, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#E5E7EB' },
  achievementCardLocked: { opacity: 0.55 },
  achievementIcon: { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  iconUnlocked:    { backgroundColor: '#ECFDF5' },
  iconLocked:      { backgroundColor: '#F3F4F6' },
  lockOverlay:     { position: 'absolute', bottom: -2, right: -2, backgroundColor: '#E5E7EB', borderRadius: 8, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  achievementTitle:{ fontSize: 12, fontWeight: '700', color: '#111827', textAlign: 'center' },
  titleLocked:     { color: '#6B7280' },
  achievementSub:  { fontSize: 10, color: '#9CA3AF', textAlign: 'center', lineHeight: 14 },
  rewardsList:     { gap: 10 },
  rewardRow:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, justifyContent: 'space-between', borderWidth: 1, borderColor: '#E5E7EB', gap: 10 },
  rewardLeft:      { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rewardValueBox:  { backgroundColor: '#ECFDF5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, minWidth: 62, alignItems: 'center' },
  rewardValueBoxDim:{ backgroundColor: '#F3F4F6' },
  rewardValue:     { fontSize: 16, fontWeight: '800', color: PRIMARY },
  rewardValueDim:  { color: '#9CA3AF' },
  rewardText:      { gap: 3, flex: 1 },
  rewardSub:       { fontSize: 13, fontWeight: '600', color: '#111827' },
  rewardCostRow:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rewardCost:      { fontSize: 12, color: '#9CA3AF', fontWeight: '500' },
  redeemBtn:       { backgroundColor: PRIMARY, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  redeemBtnDisabled:{ backgroundColor: '#E5E7EB' },
  redeemBtnText:   { fontSize: 13, fontWeight: '700', color: '#fff' },
  redeemBtnTextDisabled: { color: '#9CA3AF' },
});

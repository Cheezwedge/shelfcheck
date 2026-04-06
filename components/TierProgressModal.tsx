import React, { useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  Animated,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TIERS, getTier, tierProgress, type Tier } from '../lib/tiers';

interface Props {
  visible: boolean;
  onClose: () => void;
  points: number;
}

function AnimatedRing({ color, size }: { color: string; size: number }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });
  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: color,
        transform: [{ scale }],
        opacity,
      }}
    />
  );
}

function TierRow({ tier, points, isLast }: { tier: Tier; points: number; isLast: boolean }) {
  const currentTier = getTier(points);
  const isUnlocked = points >= tier.min;
  const isCurrent  = currentTier.level === tier.level;
  const ICON_SIZE  = 40;

  // Progress fill for current tier
  const progress = isCurrent ? tierProgress(points) : (isUnlocked ? 1 : 0);

  return (
    <View style={tr.row}>
      {/* ── Left: connector line + icon ── */}
      <View style={tr.leftCol}>
        {/* top connector */}
        <View style={[tr.line, tr.lineTop, { backgroundColor: isUnlocked ? tier.color : '#E5E7EB' }]} />

        {/* icon circle */}
        <View style={[tr.iconWrap, { backgroundColor: isUnlocked ? tier.bg : '#F9FAFB' }]}>
          {isCurrent && <AnimatedRing color={tier.color} size={ICON_SIZE + 8} />}
          <View style={[
            tr.iconCircle,
            { backgroundColor: isUnlocked ? tier.color + '20' : '#F3F4F6',
              borderColor: isCurrent ? tier.color : (isUnlocked ? tier.color + '60' : '#E5E7EB'),
              borderWidth: isCurrent ? 2 : 1,
            },
          ]}>
            <Ionicons
              name={tier.icon as any}
              size={18}
              color={isUnlocked ? tier.color : '#D1D5DB'}
            />
          </View>
        </View>

        {/* bottom connector */}
        {!isLast && (
          <View style={[tr.line, tr.lineBottom, { backgroundColor: isUnlocked && points >= TIERS[tier.level]?.min ? tier.color : '#E5E7EB' }]} />
        )}
      </View>

      {/* ── Right: content card ── */}
      <View style={[tr.card, isCurrent && { borderColor: tier.color, borderWidth: 1.5 }]}>
        {/* Header row */}
        <View style={tr.cardHeader}>
          <View style={tr.titleRow}>
            <View style={[tr.levelPill, { backgroundColor: tier.color + '18' }]}>
              <Text style={[tr.levelText, { color: tier.color }]}>Lv {tier.level}</Text>
            </View>
            <Text style={[tr.tierName, { color: isUnlocked ? '#111827' : '#9CA3AF' }]}>
              {tier.label}
            </Text>
            {isCurrent && (
              <View style={[tr.currentChip, { backgroundColor: tier.color }]}>
                <Text style={tr.currentChipText}>YOU ARE HERE</Text>
              </View>
            )}
            {tier.animated && isUnlocked && (
              <Ionicons name="sparkles" size={13} color={tier.color} style={{ marginLeft: 2 }} />
            )}
          </View>
          <Text style={[tr.pointsReq, { color: isUnlocked ? '#6B7280' : '#D1D5DB' }]}>
            {tier.min === 0 ? 'Starting tier' : `${tier.min.toLocaleString()} pts`}
          </Text>
        </View>

        {/* Perk row */}
        <View style={[tr.perkRow, { opacity: isUnlocked ? 1 : 0.45 }]}>
          <View style={[tr.perkIconBox, { backgroundColor: tier.color + '15' }]}>
            <Ionicons name={tier.perkIcon as any} size={14} color={tier.color} />
          </View>
          <Text style={tr.perkText}>{tier.perk}</Text>
        </View>

        {/* Progress bar for current tier */}
        {isCurrent && tier.next !== tier.min && (
          <View style={tr.progressWrap}>
            <View style={tr.progressTrack}>
              <View style={[tr.progressFill, { width: `${Math.round(progress * 100)}%` as any, backgroundColor: tier.color }]} />
            </View>
            <Text style={[tr.progressLabel, { color: tier.color }]}>
              {points.toLocaleString()} / {tier.next.toLocaleString()} pts to {TIERS[tier.level]?.label}
            </Text>
          </View>
        )}

        {/* Max tier message */}
        {isCurrent && tier.next === tier.min && (
          <View style={tr.maxWrap}>
            <Ionicons name="checkmark-done-circle" size={14} color={tier.color} />
            <Text style={[tr.maxText, { color: tier.color }]}>Max tier reached — you're a Legend!</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function TierProgressModal({ visible, onClose, points }: Props) {
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <View style={styles.sheet}>
        {/* Handle bar */}
        <View style={styles.handle} />

        <View style={styles.titleRow}>
          <Text style={styles.title}>Level Progression</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>
          Earn points by submitting stock reports to level up and unlock perks
        </Text>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {TIERS.map((tier, i) => (
            <TierRow key={tier.level} tier={tier} points={points} isLast={i === TIERS.length - 1} />
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const tr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch', marginBottom: 0 },
  leftCol: { width: 52, alignItems: 'center' },
  iconWrap: { alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  line: { width: 2, flex: 1, minHeight: 10 },
  lineTop: { marginBottom: 4 },
  lineBottom: { marginTop: 4 },

  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    padding: 12,
    marginVertical: 6,
    marginRight: 4,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  cardHeader:   { marginBottom: 8 },
  titleRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 },
  levelPill:    { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  levelText:    { fontSize: 10, fontWeight: '800' },
  tierName:     { fontSize: 15, fontWeight: '700' },
  currentChip:  { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 2 },
  currentChipText: { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  pointsReq:    { fontSize: 11, fontWeight: '500' },

  perkRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  perkIconBox:  { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  perkText:     { flex: 1, fontSize: 12, color: '#374151', lineHeight: 17 },

  progressWrap:  { marginTop: 10 },
  progressTrack: { height: 5, backgroundColor: '#F3F4F6', borderRadius: 99, overflow: 'hidden', marginBottom: 4 },
  progressFill:  { height: '100%', borderRadius: 99 },
  progressLabel: { fontSize: 11, fontWeight: '600' },

  maxWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  maxText: { fontSize: 12, fontWeight: '600' },
});

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#F9FAFB',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingTop: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 20,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  title: { flex: 1, fontSize: 19, fontWeight: '800', color: '#111827' },
  closeBtn: { padding: 4 },
  subtitle: { fontSize: 13, color: '#6B7280', paddingHorizontal: 20, marginBottom: 16, lineHeight: 18 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },
});

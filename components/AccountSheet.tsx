import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../lib/auth';
import { fetchProfile, type Profile } from '../lib/api';
import { getReportingUserId } from '../lib/auth';
import { getTier } from '../lib/tiers';

const PRIMARY = '#1D9E75';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function AccountSheet({ visible, onClose }: Props) {
  const router = useRouter();
  const { session, isGuest, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!visible || isGuest) return;
    const uid = getReportingUserId(session);
    fetchProfile(uid).then(setProfile).catch(() => {});
  }, [visible, isGuest, session]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
      onClose();
    }
  };

  const go = (path: string) => {
    onClose();
    router.push(path as any);
  };

  if (!visible) return null;

  const tier = profile ? getTier(profile.points) : null;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <View style={styles.sheetWrap} pointerEvents="box-none">
        <View style={styles.sheet}>

          {isGuest ? (
            /* ── Guest state ── */
            <>
              <View style={styles.guestHeader}>
                <View style={styles.avatarCircle}>
                  <Ionicons name="person-outline" size={28} color="#9CA3AF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.guestName}>Guest</Text>
                  <Text style={styles.guestSub}>Sign in to earn points &amp; sync favorites</Text>
                </View>
              </View>

              <TouchableOpacity style={styles.signInBtn} onPress={() => go('/auth')} activeOpacity={0.85}>
                <Ionicons name="log-in-outline" size={18} color="#fff" />
                <Text style={styles.signInBtnText}>Sign In / Create Account</Text>
              </TouchableOpacity>
            </>
          ) : (
            /* ── Signed-in state ── */
            <>
              <View style={styles.profileHeader}>
                <View style={[styles.avatarCircle, { backgroundColor: PRIMARY + '18' }]}>
                  <Ionicons name="person" size={28} color={PRIMARY} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.profileName} numberOfLines={1}>
                    {profile?.username ?? '…'}
                  </Text>
                  {tier && (
                    <View style={styles.tierRow}>
                      <Ionicons name={tier.icon as any} size={12} color={tier.color} />
                      <Text style={[styles.tierLabel, { color: tier.color }]}>{tier.label}</Text>
                      {profile && (
                        <Text style={styles.pointsLabel}> · {profile.points} pts</Text>
                      )}
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.divider} />

              <TouchableOpacity style={styles.menuRow} onPress={() => go('/(tabs)/rewards')} activeOpacity={0.7}>
                <Ionicons name="trophy-outline" size={20} color="#374151" />
                <Text style={styles.menuRowText}>My Rewards &amp; Badges</Text>
                <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuRow} onPress={() => go('/(tabs)/rewards')} activeOpacity={0.7}>
                <Ionicons name="create-outline" size={20} color="#374151" />
                <Text style={styles.menuRowText}>Edit Display Name</Text>
                <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
              </TouchableOpacity>

              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.menuRow}
                onPress={handleSignOut}
                disabled={signingOut}
                activeOpacity={0.7}
              >
                {signingOut
                  ? <ActivityIndicator size="small" color="#EF4444" />
                  : <Ionicons name="log-out-outline" size={20} color="#EF4444" />
                }
                <Text style={[styles.menuRowText, { color: '#EF4444' }]}>Sign Out</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheetWrap: {
    position: 'absolute',
    top: 52,
    right: 12,
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: 280,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  // Guest
  guestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  guestName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  guestSub:  { fontSize: 12, color: '#6B7280', marginTop: 1, lineHeight: 16 },
  signInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: PRIMARY,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    height: 44,
  },
  signInBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  // Signed in
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  profileName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  tierRow:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  tierLabel:   { fontSize: 11, fontWeight: '700' },
  pointsLabel: { fontSize: 11, color: '#9CA3AF' },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider:   { height: 1, backgroundColor: '#F3F4F6', marginVertical: 4 },
  menuRow:   {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  menuRowText: { flex: 1, fontSize: 14, fontWeight: '500', color: '#374151' },
});

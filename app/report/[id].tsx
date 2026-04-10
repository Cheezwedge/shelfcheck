import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { fetchItem, submitReport, uploadShelfPhoto } from '../../lib/api';
import { useAuth, getReportingUserId } from '../../lib/auth';
import type { LiveItem } from '../../lib/types';

const PRIMARY = '#1D9E75';
const POINTS_PER_REPORT = 10;
const PHOTO_BONUS = 15;

export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();

  const [item, setItem] = useState<LiveItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<'in-stock' | 'out-of-stock' | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [earnedPoints, setEarnedPoints] = useState(POINTS_PER_REPORT);

  useEffect(() => {
    fetchItem(id as string)
      .then(setItem)
      .catch((error) => {
        console.error('Failed to fetch item:', error);
        setItem(null);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const pickPhoto = async () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Add Shelf Photo', 'Choose a source', [
        {
          text: 'Camera',
          onPress: () => launchCamera(),
        },
        {
          text: 'Photo Library',
          onPress: () => launchLibrary(),
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      launchLibrary();
    }
  };

  const launchCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to take shelf photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });
    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const launchLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });
    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    if (!selected || !item) return;
    setSubmitting(true);
    try {
      let photoUrl: string | undefined;
      if (photoUri) {
        photoUrl = await uploadShelfPhoto(photoUri);
      }
      await submitReport(item.id, selected, getReportingUserId(session), photoUrl);
      setEarnedPoints(POINTS_PER_REPORT + (photoUrl ? PHOTO_BONUS : 0));
      setSubmitted(true);
      setTimeout(() => router.back(), 1800);
    } catch {
      Alert.alert(
        'Submission failed',
        'Please check your connection and try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={PRIMARY} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Not found ────────────────────────────────────────────────────────────
  if (!item) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={42} color="#D1D5DB" />
          <Text style={styles.errorText}>Item not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={36} color="#fff" />
          </View>
          <Text style={styles.successTitle}>Thanks for reporting!</Text>
          <Text style={styles.successSub}>+{earnedPoints} pts added to your account</Text>
          {earnedPoints > POINTS_PER_REPORT && (
            <View style={styles.bonusNote}>
              <Ionicons name="camera" size={14} color={PRIMARY} />
              <Text style={styles.bonusNoteText}>Includes +{PHOTO_BONUS} pts photo bonus</Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const totalPoints = POINTS_PER_REPORT + (photoUri ? PHOTO_BONUS : 0);

  // ── Main form ────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Item header */}
        <View style={styles.itemHeader}>
          <View style={styles.itemIconBox}>
            <Ionicons name="basket-outline" size={28} color={PRIMARY} />
          </View>
          <View style={styles.itemHeaderText}>
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.itemCategory}>{item.category}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>IS THIS ITEM IN STOCK?</Text>

        {/* Stock buttons */}
        <View style={styles.stockButtons}>
          <TouchableOpacity
            style={[styles.stockBtn, styles.stockBtnIn, selected === 'in-stock' && styles.stockBtnInActive]}
            onPress={() => setSelected('in-stock')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="checkmark-circle"
              size={32}
              color={selected === 'in-stock' ? '#fff' : PRIMARY}
            />
            <Text style={[styles.stockBtnLabel, selected === 'in-stock' ? styles.labelActive : { color: PRIMARY }]}>
              In Stock
            </Text>
            <Text style={[styles.stockBtnSub, selected === 'in-stock' ? styles.subActive : { color: '#6B7280' }]}>
              Found on shelf
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.stockBtn, styles.stockBtnOut, selected === 'out-of-stock' && styles.stockBtnOutActive]}
            onPress={() => setSelected('out-of-stock')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="close-circle"
              size={32}
              color={selected === 'out-of-stock' ? '#fff' : '#E53935'}
            />
            <Text style={[styles.stockBtnLabel, selected === 'out-of-stock' ? styles.labelActive : { color: '#E53935' }]}>
              Out of Stock
            </Text>
            <Text style={[styles.stockBtnSub, selected === 'out-of-stock' ? styles.subActive : { color: '#6B7280' }]}>
              Shelf is empty
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>ADD EVIDENCE (OPTIONAL)</Text>

        {/* Photo picker */}
        <View style={styles.evidenceRow}>
          <TouchableOpacity style={styles.evidenceBtn} onPress={pickPhoto} activeOpacity={0.7}>
            {photoUri ? (
              <View style={styles.photoPreviewWrapper}>
                <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                <View style={styles.photoCheckBadge}>
                  <Ionicons name="checkmark" size={12} color="#fff" />
                </View>
              </View>
            ) : (
              <View style={styles.evidenceIcon}>
                <Ionicons name="camera-outline" size={22} color={PRIMARY} />
              </View>
            )}
            <Text style={styles.evidenceBtnLabel}>
              {photoUri ? 'Change Photo' : 'Shelf Photo'}
            </Text>
            <View style={[styles.bonusBadge, photoUri && styles.bonusBadgeEarned]}>
              <Text style={[styles.bonusBadgeText, photoUri && styles.bonusBadgeTextEarned]}>
                +{PHOTO_BONUS} pts
              </Text>
            </View>
          </TouchableOpacity>

          {/* Receipt scan — placeholder */}
          <TouchableOpacity style={styles.evidenceBtn} activeOpacity={0.7}>
            <View style={styles.evidenceIcon}>
              <Ionicons name="receipt-outline" size={22} color="#9CA3AF" />
            </View>
            <Text style={[styles.evidenceBtnLabel, { color: '#9CA3AF' }]}>Receipt Scan</Text>
            <View style={styles.bonusBadge}>
              <Text style={styles.bonusBadgeText}>+{PHOTO_BONUS} pts</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Points note */}
        <View style={styles.pointsNote}>
          <Ionicons name="star" size={14} color="#F59E0B" />
          <Text style={styles.pointsNoteText}>
            This submission earns{' '}
            <Text style={styles.pointsBold}>{totalPoints} points</Text>
            {photoUri ? ' (includes photo bonus)' : ' toward your next reward'}
          </Text>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, (!selected || submitting) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!selected || submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text style={styles.submitBtnText}>Submit Report</Text>
              <View style={styles.submitPtsChip}>
                <Ionicons name="star" size={12} color="#F59E0B" />
                <Text style={styles.submitPtsText}>+{totalPoints}</Text>
              </View>
            </>
          )}
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#F9FAFB' },
  scroll:             { padding: 16, paddingBottom: 40 },
  centered:           { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText:          { fontSize: 15, color: '#6B7280' },
  itemHeader: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 14, padding: 16, marginBottom: 20, gap: 14,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  itemIconBox: {
    width: 52, height: 52, borderRadius: 14, backgroundColor: '#ECFDF5',
    alignItems: 'center', justifyContent: 'center',
  },
  itemHeaderText:     { flex: 1 },
  itemName:           { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 3 },
  itemCategory:       { fontSize: 13, color: '#9CA3AF', fontWeight: '500' },
  sectionLabel:       { fontSize: 11, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.8, marginBottom: 10, marginTop: 4 },
  stockButtons:       { flexDirection: 'row', gap: 12, marginBottom: 24 },
  stockBtn:           { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 16, paddingVertical: 20, paddingHorizontal: 12, gap: 6, borderWidth: 2 },
  stockBtnIn:         { backgroundColor: '#ECFDF5', borderColor: '#1D9E75' },
  stockBtnInActive:   { backgroundColor: PRIMARY, borderColor: PRIMARY },
  stockBtnOut:        { backgroundColor: '#FEF2F2', borderColor: '#E53935' },
  stockBtnOutActive:  { backgroundColor: '#E53935', borderColor: '#E53935' },
  stockBtnLabel:      { fontSize: 16, fontWeight: '700' },
  labelActive:        { color: '#fff' },
  stockBtnSub:        { fontSize: 12 },
  subActive:          { color: 'rgba(255,255,255,0.8)' },
  evidenceRow:        { flexDirection: 'row', gap: 12, marginBottom: 16 },
  evidenceBtn: {
    flex: 1, alignItems: 'center', backgroundColor: '#fff', borderRadius: 14,
    paddingVertical: 16, paddingHorizontal: 10, borderWidth: 1.5,
    borderStyle: 'dashed', borderColor: '#D1D5DB', gap: 6,
  },
  evidenceIcon: {
    width: 42, height: 42, borderRadius: 12, backgroundColor: '#ECFDF5',
    alignItems: 'center', justifyContent: 'center',
  },
  photoPreviewWrapper:  { position: 'relative' },
  photoPreview:         { width: 56, height: 42, borderRadius: 8 },
  photoCheckBadge: {
    position: 'absolute', bottom: -4, right: -4,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  evidenceBtnLabel:   { fontSize: 13, fontWeight: '600', color: '#374151' },
  bonusBadge:         { backgroundColor: '#FEF3C7', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  bonusBadgeEarned:   { backgroundColor: '#ECFDF5' },
  bonusBadgeText:     { fontSize: 11, fontWeight: '700', color: '#92400E' },
  bonusBadgeTextEarned: { color: '#065F46' },
  pointsNote: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFFBEB', borderRadius: 10, padding: 12,
    marginBottom: 20, borderWidth: 1, borderColor: '#FDE68A',
  },
  pointsNoteText:     { fontSize: 13, color: '#6B7280', flex: 1 },
  pointsBold:         { fontWeight: '700', color: '#92400E' },
  submitBtn: {
    backgroundColor: PRIMARY, borderRadius: 14, height: 54,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  submitBtnDisabled:  { backgroundColor: '#D1D5DB' },
  submitBtnText:      { color: '#fff', fontSize: 16, fontWeight: '700' },
  submitPtsChip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3, gap: 3,
  },
  submitPtsText:      { color: '#fff', fontSize: 12, fontWeight: '700' },
  successIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: PRIMARY,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  successTitle:       { fontSize: 22, fontWeight: '800', color: '#111827' },
  successSub:         { fontSize: 14, color: '#6B7280' },
  bonusNote: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#ECFDF5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
  },
  bonusNoteText:      { fontSize: 12, color: PRIMARY, fontWeight: '600' },
});

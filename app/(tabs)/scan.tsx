import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const PRIMARY = '#1D9E75';

export default function ScanScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="receipt-outline" size={40} color={PRIMARY} />
          </View>
          <Text style={styles.heroTitle}>Scan a Receipt</Text>
          <Text style={styles.heroSub}>
            Upload your grocery receipt to automatically log multiple items at once and earn bonus points.
          </Text>
        </View>

        {/* Upload box */}
        <TouchableOpacity style={styles.uploadBox} activeOpacity={0.75}>
          <View style={styles.uploadIconCircle}>
            <Ionicons name="cloud-upload-outline" size={32} color={PRIMARY} />
          </View>
          <Text style={styles.uploadTitle}>Tap to upload receipt</Text>
          <Text style={styles.uploadSub}>JPG, PNG or PDF · Max 10 MB</Text>
          <View style={styles.uploadOrRow}>
            <View style={styles.uploadOrLine} />
            <Text style={styles.uploadOrText}>or</Text>
            <View style={styles.uploadOrLine} />
          </View>
          <View style={styles.cameraBtn}>
            <Ionicons name="camera-outline" size={16} color={PRIMARY} />
            <Text style={styles.cameraBtnText}>Take a photo</Text>
          </View>
        </TouchableOpacity>

        {/* Points callout */}
        <View style={styles.pointsCard}>
          <View style={styles.pointsCardLeft}>
            <Ionicons name="star" size={22} color="#F59E0B" />
            <View>
              <Text style={styles.pointsCardTitle}>Earn 25 pts per receipt</Text>
              <Text style={styles.pointsCardSub}>+5 bonus for each item verified</Text>
            </View>
          </View>
          <Text style={styles.pointsCardBig}>25+</Text>
        </View>

        {/* How it works */}
        <Text style={styles.sectionTitle}>How it works</Text>
        <View style={styles.stepsList}>
          {STEPS.map((step, i) => (
            <View key={i} style={styles.step}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <View style={styles.stepText}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepSub}>{step.sub}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const STEPS = [
  {
    title: 'Upload or photograph your receipt',
    sub: 'We support receipts from most major grocery chains.',
  },
  {
    title: 'We extract the items automatically',
    sub: 'Our system reads item names and matches them to our catalog.',
  },
  {
    title: 'Confirm the items are accurate',
    sub: 'Give a quick thumbs-up on each matched item.',
  },
  {
    title: 'Earn points instantly',
    sub: '25 base points + 5 per verified item, credited immediately.',
  },
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  hero: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  heroSub: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300,
  },
  uploadBox: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#1D9E75',
    borderRadius: 18,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 8,
  },
  uploadIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    boxShadow: '0px 2px 4px rgba(0,0,0,0.06)',
    elevation: 2,
  },
  uploadTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  uploadSub: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  uploadOrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '60%',
    marginVertical: 4,
  },
  uploadOrLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#D1D5DB',
  },
  uploadOrText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  cameraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#1D9E75',
  },
  cameraBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: PRIMARY,
  },
  pointsCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  pointsCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  pointsCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 2,
  },
  pointsCardSub: {
    fontSize: 12,
    color: '#B45309',
  },
  pointsCardBig: {
    fontSize: 26,
    fontWeight: '800',
    color: '#F59E0B',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  stepsList: {
    gap: 12,
  },
  step: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'flex-start',
  },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumText: {
    fontSize: 13,
    fontWeight: '800',
    color: PRIMARY,
  },
  stepText: {
    flex: 1,
    gap: 3,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  stepSub: {
    fontSize: 13,
    color: '#9CA3AF',
    lineHeight: 18,
  },
});

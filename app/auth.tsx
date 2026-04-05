import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { fetchProfile, updateUsername } from '../lib/api';
import { supabase } from '../lib/supabase';
import { getDeviceId } from '../lib/identity';

const PRIMARY = '#1D9E75';

type Mode = 'signin' | 'signup';

export default function AuthScreen() {
  const router = useRouter();
  const { signIn, signUp, claimGuestPoints } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Claim-points prompt state (shown after sign-up if device has points)
  const [claimState, setClaimState] = useState<{ points: number } | null>(null);
  const [claiming, setClaiming] = useState(false);

  // Display name step (required after sign-up)
  const [showNameStep, setShowNameStep] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  // Store user id for the name-save step
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  const validate = (): string | null => {
    if (!email.trim()) return 'Email is required.';
    if (!/\S+@\S+\.\S+/.test(email)) return 'Enter a valid email address.';
    if (!password) return 'Password is required.';
    if (password.length < 6) return 'Password must be at least 6 characters.';
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    setError(null);
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
        router.back();
      } else {
        await signUp(email.trim(), password);
        const { data: sd } = await supabase.auth.getSession();
        setPendingUserId(sd.session?.user?.id ?? null);
        // Check if this device has guest points to claim
        const guestProfile = await fetchProfile(getDeviceId());
        if (guestProfile && guestProfile.points > 0) {
          setClaimState({ points: guestProfile.points });
        } else {
          setShowNameStep(true);
        }
      }
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async (claim: boolean) => {
    setClaiming(true);
    try {
      if (claim) await claimGuestPoints();
    } finally {
      setClaiming(false);
      setClaimState(null);
      setShowNameStep(true);
    }
  };

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) { setNameError('Please enter a display name.'); return; }
    if (!pendingUserId) { router.back(); return; }
    setNameSaving(true);
    setNameError(null);
    try {
      await updateUsername(pendingUserId, trimmed);
      router.back();
    } catch (e: any) {
      setNameError(e?.message ?? 'Could not save name. Try again.');
      setNameSaving(false);
    }
  };

  // ── Claim points prompt ──────────────────────────────────────────────────
  if (claimState) {
    return (
      <View style={styles.container}>
        <View style={styles.claimBox}>
          <View style={styles.claimIcon}>
            <Ionicons name="star" size={32} color="#F59E0B" />
          </View>
          <Text style={styles.claimTitle}>You have {claimState.points} points!</Text>
          <Text style={styles.claimSub}>
            Would you like to transfer your guest points to your new account?
          </Text>
          <TouchableOpacity
            style={styles.claimYesBtn}
            onPress={() => handleClaim(true)}
            disabled={claiming}
            activeOpacity={0.8}
          >
            {claiming
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.claimYesBtnText}>Yes, claim {claimState.points} pts</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleClaim(false)} disabled={claiming}>
            <Text style={styles.claimSkip}>Skip, start fresh</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Display name step (required after sign-up) ──────────────────────────
  if (showNameStep) {
    return (
      <View style={styles.container}>
        <View style={styles.claimBox}>
          <View style={styles.claimIcon}>
            <Ionicons name="person-circle-outline" size={40} color={PRIMARY} />
          </View>
          <Text style={styles.claimTitle}>Choose your display name</Text>
          <Text style={styles.claimSub}>
            This is how you'll appear on leaderboards. You can change it later.
          </Text>
          <TextInput
            style={[styles.nameInput, nameError ? styles.nameInputError : null]}
            placeholder="e.g. Alex, ShopperJane, …"
            placeholderTextColor="#9CA3AF"
            value={nameInput}
            onChangeText={(t) => { setNameInput(t); setNameError(null); }}
            maxLength={30}
            autoFocus
            autoCapitalize="words"
          />
          {nameError && <Text style={styles.nameErrorText}>{nameError}</Text>}
          <TouchableOpacity
            style={[styles.claimYesBtn, nameSaving && styles.submitBtnDisabled]}
            onPress={handleSaveName}
            disabled={nameSaving}
            activeOpacity={0.85}
          >
            {nameSaving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.claimYesBtnText}>Save &amp; Continue</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Main sign-in / sign-up form ──────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Logo */}
        <View style={styles.logoRow}>
          <View style={styles.logoIcon}>
            <Ionicons name="basket" size={28} color="#fff" />
          </View>
          <Text style={styles.logoText}>ShelfCheck</Text>
        </View>

        <Text style={styles.headline}>
          {mode === 'signin' ? 'Welcome back' : 'Create your account'}
        </Text>
        <Text style={styles.subline}>
          {mode === 'signin'
            ? 'Sign in to sync your points across devices.'
            : 'Start earning points for every report you submit.'}
        </Text>

        {/* Mode toggle */}
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'signin' && styles.modeBtnActive]}
            onPress={() => { setMode('signin'); setError(null); }}
          >
            <Text style={[styles.modeBtnText, mode === 'signin' && styles.modeBtnTextActive]}>
              Sign In
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'signup' && styles.modeBtnActive]}
            onPress={() => { setMode('signup'); setError(null); }}
          >
            <Text style={[styles.modeBtnText, mode === 'signup' && styles.modeBtnTextActive]}>
              Create Account
            </Text>
          </TouchableOpacity>
        </View>

        {/* Error */}
        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={15} color="#E53935" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Inputs */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor="#9CA3AF"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
            placeholderTextColor="#9CA3AF"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          />
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.submitBtnText}>
                {mode === 'signin' ? 'Sign In' : 'Create Account'}
              </Text>
          }
        </TouchableOpacity>

        {/* Guest option */}
        <TouchableOpacity style={styles.guestBtn} onPress={() => router.back()}>
          <Text style={styles.guestBtnText}>Continue as Guest</Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#F9FAFB' },
  scroll:          { padding: 24, paddingBottom: 48, flexGrow: 1 },
  logoRow:         { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 28, marginTop: 8 },
  logoIcon:        { width: 44, height: 44, borderRadius: 12, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center' },
  logoText:        { fontSize: 22, fontWeight: '800', color: '#111827' },
  headline:        { fontSize: 26, fontWeight: '800', color: '#111827', marginBottom: 6 },
  subline:         { fontSize: 14, color: '#6B7280', lineHeight: 20, marginBottom: 24 },
  modeToggle:      { flexDirection: 'row', backgroundColor: '#E5E7EB', borderRadius: 12, padding: 4, marginBottom: 24 },
  modeBtn:         { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  modeBtnActive:   { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  modeBtnText:     { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  modeBtnTextActive:{ color: '#111827' },
  errorBox:        { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#FECACA' },
  errorText:       { fontSize: 13, color: '#E53935', flex: 1 },
  inputGroup:      { marginBottom: 16 },
  inputLabel:      { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input:           { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  submitBtn:       { backgroundColor: PRIMARY, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 16 },
  submitBtnDisabled:{ backgroundColor: '#9CA3AF' },
  submitBtnText:   { color: '#fff', fontSize: 16, fontWeight: '700' },
  guestBtn:        { alignItems: 'center', paddingVertical: 12 },
  guestBtnText:    { fontSize: 14, color: '#9CA3AF', fontWeight: '500' },
  // Claim points prompt
  claimBox:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  claimIcon:       { width: 72, height: 72, borderRadius: 36, backgroundColor: '#FFFBEB', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  claimTitle:      { fontSize: 22, fontWeight: '800', color: '#111827', textAlign: 'center' },
  claimSub:        { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20, marginBottom: 8 },
  claimYesBtn:     { backgroundColor: PRIMARY, borderRadius: 14, height: 52, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', width: '100%' },
  claimYesBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  claimSkip:       { fontSize: 14, color: '#9CA3AF', marginTop: 8 },
  nameInput: {
    width: '100%', height: 48, borderWidth: 1.5, borderColor: '#D1D5DB',
    borderRadius: 10, paddingHorizontal: 14, fontSize: 15, color: '#111827',
    backgroundColor: '#fff', marginTop: 4,
  },
  nameInputError: { borderColor: '#EF4444' },
  nameErrorText:  { fontSize: 12, color: '#EF4444', alignSelf: 'flex-start' },
});

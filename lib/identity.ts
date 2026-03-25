/**
 * Persistent anonymous device identity.
 * Generates a UUID on first use and stores it in localStorage (web)
 * or falls back to an in-memory value for environments without storage.
 *
 * Replace with expo-secure-store when adding native builds / real auth.
 */

const STORAGE_KEY = 'shelfcheck_device_id';

let _cached: string | null = null;

function generateUUID(): string {
  // crypto.randomUUID() is available in all modern browsers and Hermes (RN 0.71+)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function getDeviceId(): string {
  if (_cached) return _cached;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      _cached = stored;
      return stored;
    }
    const fresh = generateUUID();
    localStorage.setItem(STORAGE_KEY, fresh);
    _cached = fresh;
    return fresh;
  } catch {
    // localStorage unavailable (SSR, native without AsyncStorage, etc.)
    if (!_cached) _cached = generateUUID();
    return _cached;
  }
}

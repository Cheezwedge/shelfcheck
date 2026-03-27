import { Tabs, useRouter } from 'expo-router';
import { TouchableOpacity, Alert, Platform } from 'react-native';
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';

const PRIMARY = '#1D9E75';
const INACTIVE = '#9CA3AF';

function useWebSafeAreaBottom(): number {
  const [bottom, setBottom] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // Probe the actual computed pixel value of env(safe-area-inset-bottom)
    // by measuring a fixed-position element whose height equals the env() value.
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;bottom:0;left:0;width:1px;' +
      'height:env(safe-area-inset-bottom,0px);pointer-events:none;visibility:hidden';
    document.body.appendChild(probe);
    const h = probe.getBoundingClientRect().height || 0;
    document.body.removeChild(probe);
    setBottom(h);
  }, []);
  return bottom;
}

export default function TabLayout() {
  const router = useRouter();
  const { isGuest, signOut } = useAuth();
  const safeBottom = useWebSafeAreaBottom();

  const handleAccountPress = () => {
    if (isGuest) {
      router.push('/auth');
    } else {
      Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => { try { await signOut(); } catch {} },
        },
      ]);
    }
  };

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: PRIMARY,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#E5E7EB',
          borderTopWidth: 1,
          height: 60 + safeBottom,
          paddingBottom: 8 + safeBottom,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerStyle: { backgroundColor: '#fff' },
        headerTitleStyle: { fontWeight: '700', fontSize: 18, color: '#111' },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="list"
        options={{
          title: 'My List',
          tabBarIcon: ({ color, size }) => <Ionicons name="cart" size={size} color={color} />,
          headerTitle: 'Grocery List',
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          tabBarIcon: ({ color, size }) => <Ionicons name="scan" size={size} color={color} />,
          headerTitle: 'Scan Receipt',
        }}
      />
      <Tabs.Screen
        name="rewards"
        options={{
          title: 'Rewards',
          tabBarIcon: ({ color, size }) => <Ionicons name="trophy" size={size} color={color} />,
          headerTitle: 'My Rewards',
          headerRight: () => (
            <TouchableOpacity
              onPress={handleAccountPress}
              style={{ marginRight: 16, padding: 4 }}
            >
              <Ionicons
                name={isGuest ? 'person-circle-outline' : 'person-circle'}
                size={26}
                color={isGuest ? INACTIVE : PRIMARY}
              />
            </TouchableOpacity>
          ),
        }}
      />
    </Tabs>
  );
}

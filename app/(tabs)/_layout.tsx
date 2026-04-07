import { Tabs } from 'expo-router';
import { TouchableOpacity, Platform } from 'react-native';
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import AccountSheet from '../../components/AccountSheet';

const PRIMARY = '#1D9E75';
const INACTIVE = '#9CA3AF';

function useWebSafeAreaBottom(): number {
  const [bottom, setBottom] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
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
  const { isGuest } = useAuth();
  const safeBottom = useWebSafeAreaBottom();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
    <AccountSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: PRIMARY,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#E5E7EB',
          borderTopWidth: 1,
          height: 72 + safeBottom,
          paddingBottom: 10 + safeBottom,
          paddingTop: 6,
          overflow: 'visible',
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
          title: 'Shop',
          tabBarIcon: ({ color, size }) => <Ionicons name="cart" size={size} color={color} />,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          tabBarIcon: ({ color, size }) => <Ionicons name="scan" size={size} color={color} />,
          headerTitle: 'Scan Receipt',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => setSheetOpen(true)}
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
      <Tabs.Screen
        name="rewards"
        options={{
          title: 'Rewards',
          tabBarIcon: ({ color, size }) => <Ionicons name="trophy" size={size} color={color} />,
          headerTitle: 'My Rewards',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => setSheetOpen(true)}
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
    </>
  );
}

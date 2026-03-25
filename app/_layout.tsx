import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../lib/auth';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="report/[id]"
          options={{
            title: 'Report Item',
            headerStyle: { backgroundColor: '#fff' },
            headerTintColor: '#1D9E75',
            headerTitleStyle: { fontWeight: '700', color: '#111' },
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="auth"
          options={{
            title: '',
            headerStyle: { backgroundColor: '#F9FAFB' },
            headerShadowVisible: false,
            headerTintColor: '#1D9E75',
            presentation: 'modal',
          }}
        />
      </Stack>
    </AuthProvider>
  );
}

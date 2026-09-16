import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../src/lib/react-query';
import { useAuthStore } from '../src/stores/auth.store';
import { authApi } from '../src/api/auth';
import { Screen, LoadingState } from '../src/components/ui';

function NavigationRoot() {
  const { status, restoreSession } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    restoreSession(async (refreshToken) => {
      const res = await authApi.refresh(refreshToken);
      let user;
      try {
        const meRes = await authApi.getMe();
        user = meRes.data;
      } catch {
        // me can fail if profile not loaded yet
      }
      return {
        accessToken: res.data.accessToken,
        refreshToken: res.data.refreshToken,
        user,
      };
    });
  }, [restoreSession]);

  useEffect(() => {
    if (status === 'unknown' || status === 'refreshing') {
      return;
    }

    const inAuthGroup = segments[0] === '(auth)';

    if (status === 'unauthenticated' && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (status === 'authenticated' && inAuthGroup) {
      router.replace('/(app)/(tabs)/today');
    }
  }, [status, segments, router]);

  if (status === 'unknown' || status === 'refreshing') {
    return (
      <Screen>
        <LoadingState message="Inicializando Atlas..." />
      </Screen>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(app)" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <NavigationRoot />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

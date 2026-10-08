import { Stack, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { DriverAccessGuard } from '@/components/DriverAccessGuard';
import { useAuth } from '@/lib/auth-context-v2';

export default function DriverLayout() {
  const { isSignedIn, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isSignedIn) {
      router.replace('/auth/sign-in' as any);
    }
  }, [isLoading, isSignedIn, router]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A0A' }}>
        <ActivityIndicator size="large" color="#1E88FF" />
      </View>
    );
  }

  if (!isSignedIn) return null;

  return (
    <DriverAccessGuard>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0A0A0A' } }}>
          <Stack.Screen name="index" options={{ animation: 'none' }} />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="request-detail"
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="ride-detail"
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="active-ride"
            options={{ animation: 'slide_from_bottom', presentation: 'fullScreenModal' }}
          />
          <Stack.Screen
            name="driver-chat"
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="schedule"
            options={{ animation: 'slide_from_right' }}
          />
        </Stack>
      </View>
    </DriverAccessGuard>
  );
}

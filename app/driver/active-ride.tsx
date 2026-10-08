import { useDriverStore } from '@/lib/stores';
import { trpc } from '@/lib/trpc';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const C = {
  bg: '#0A0A0A', green: '#22C55E', textMuted: '#6B7280',
};

export default function ActiveRideScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useDriverStore((s) => s.session);
  const { data: sessionData } = trpc.driver.getSession.useQuery(undefined, { staleTime: 0 });

  const rideId = sessionData?.currentRideId ?? session?.currentRideId ?? null;

  useEffect(() => {
    if (rideId) {
      router.replace({ pathname: '/driver/ride-detail', params: { rideId } });
      return;
    }
    const t = setTimeout(() => router.replace('/driver/(tabs)/dashboard'), 1200);
    return () => clearTimeout(t);
  }, [rideId, router]);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <View style={s.center}>
        <Ionicons name="car-outline" size={40} color={C.green} />
        <ActivityIndicator color={C.green} size="small" style={{ marginTop: 16 }} />
        <Text style={s.text}>{rideId ? 'Opening active ride…' : 'No active ride'}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  text:      { fontSize: 14, color: C.textMuted, marginTop: 4 },
});

import { useDriverOnlineLocation } from '@/lib/hooks/use-driver-online-location';
import { useDriverStore, useRequestStore } from '@/lib/stores';
import { trpc } from '@/lib/trpc';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useNavigationState } from '@react-navigation/core';
import { useSseInvalidation } from '@/lib/hooks/use-sse-invalidation';
import React, { useEffect } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const C = { bg: '#111111', border: '#222222', green: '#22C55E', gray: '#6B7280', red: '#EF4444' };

function Badge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <View style={s.badge}>
      <Text style={s.badgeText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

function TabIcon({ icon, label, focused, badge }: { icon: string; label: string; focused: boolean; badge?: number }) {
  return (
    <View style={s.tabItem}>
      <View>
        <Ionicons name={icon as any} size={22} color={focused ? C.green : C.gray} />
        {!!badge && <Badge count={badge} />}
      </View>
      <Text
        style={[s.tabLabel, { color: focused ? C.green : C.gray }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
      >
        {label}
      </Text>
    </View>
  );
}

export default function DriverTabsLayout() {
  const requestCount    = useRequestStore((s) => s.requests.length);
  const setPendingDispatch = useRequestStore((s) => s.setPendingDispatch);
  const session         = useDriverStore((s) => s.session);
  const isOnline        = session?.status === 'online' || session?.status === 'on_ride';
  const insets          = useSafeAreaInsets();
  const { width }       = Dimensions.get('window');
  const narrowTabs      = width < 480;
  const activeTab       = useNavigationState((state) => state?.routes?.[state.index]?.name ?? '');
  const onDispatchTab   = activeTab === 'dashboard' || activeTab === 'requests';
  const shouldPollDispatch = isOnline && onDispatchTab;
  useDriverOnlineLocation(isOnline);
  useSseInvalidation('driver');

  // Poll dispatched ride requests — SSE invalidates; poll is fallback only
  const { data: pendingData } = trpc.driver.getPendingRequest.useQuery(
    undefined,
    { enabled: shouldPollDispatch, refetchInterval: shouldPollDispatch ? 10_000 : false, staleTime: 8_000 },
  );

  useEffect(() => {
    if (!pendingData) return;
    if (pendingData.hasRequest && pendingData.request) {
      setPendingDispatch({
        rideId:         pendingData.request.rideId,
        pickupAddress:  pendingData.request.pickupAddress,
        dropoffAddress: pendingData.request.dropoffAddress,
        totalFare:      pendingData.request.totalFare,
        etaMinutes:     pendingData.request.etaMinutes,
        expiresIn:      pendingData.request.expiresIn,
      });
    } else {
      setPendingDispatch(null);
    }
  }, [pendingData, setPendingDispatch]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: C.bg,
          borderTopColor: C.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 56 + Math.max(insets.bottom, 8),
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 6,
        },
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          tabBarIcon: ({ focused }: { focused: boolean }) => (
            <TabIcon icon={focused ? 'home' : 'home-outline'} label="Home" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          tabBarIcon: ({ focused }: { focused: boolean }) => (
            <TabIcon icon={focused ? 'people' : 'people-outline'} label={narrowTabs ? 'Reqs' : 'Requests'} focused={focused} badge={requestCount} />
          ),
        }}
      />
      <Tabs.Screen
        name="rides"
        options={{
          tabBarIcon: ({ focused }: { focused: boolean }) => (
            <TabIcon icon={focused ? 'car' : 'car-outline'} label="Rides" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          tabBarIcon: ({ focused }: { focused: boolean }) => (
            <TabIcon icon={focused ? 'wallet' : 'wallet-outline'} label={narrowTabs ? 'Earn' : 'Earnings'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }: { focused: boolean }) => (
            <TabIcon icon={focused ? 'person' : 'person-outline'} label="Profile" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const s = StyleSheet.create({
  tabItem:      { alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabLabel:     { fontSize: 10, fontWeight: '600', letterSpacing: 0, maxWidth: 52, textAlign: 'center' },
  badge:        { position: 'absolute', top: -5, right: -10, backgroundColor: C.red, borderRadius: 8, minWidth: 17, height: 17, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 1.5, borderColor: C.bg },
  badgeText:    { color: '#fff', fontSize: 9, fontWeight: '700' },
});

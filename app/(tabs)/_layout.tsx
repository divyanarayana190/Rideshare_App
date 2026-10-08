import { Tabs } from "expo-router";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/lib/auth-context-v2";
import { trpc } from "@/lib/trpc";

// ── Tab icon with active indicator dot ───────────────────────────────────────
function TabIcon({ name, color, focused, badge }: {
  name: string;
  color: string;
  focused: boolean;
  badge?: number;
}) {
  return (
    <View style={tabSt.iconWrap}>
      <View>
        <IconSymbol size={22} name={name as any} color={color} />
        {badge != null && badge > 0 && (
          <View style={tabSt.badge}>
            <Text style={tabSt.badgeText}>{badge > 99 ? "99+" : badge}</Text>
          </View>
        )}
      </View>
      {focused && <View style={[tabSt.activePill, { backgroundColor: color }]} />}
    </View>
  );
}

const tabSt = StyleSheet.create({
  iconWrap: { alignItems: "center", gap: 3, paddingTop: 2 },
  activePill: { width: 18, height: 3, borderRadius: 1.5 },
  badge: {
    position: "absolute", top: -4, right: -7,
    minWidth: 15, height: 15, borderRadius: 7.5,
    backgroundColor: "#EF4444",
    alignItems: "center", justifyContent: "center",
    paddingHorizontal: 3, borderWidth: 1.5, borderColor: "#fff",
  },
  badgeText: { fontSize: 8, fontWeight: "800", color: "#fff" },
});

// ── Layout ────────────────────────────────────────────────────────────────────
export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { isLoading, isSignedIn, justLoggedIn } = useAuth();

  const { data: allRequests = [] } = trpc.carpool.getAllJoinRequests.useQuery(
    undefined,
    {
      enabled: isSignedIn,
      staleTime: 30_000,
      refetchInterval: 45_000,
    },
  );
  const pendingCount = (allRequests as any[]).filter((r: any) => r.status === "pending").length;

  const bottomPadding = Platform.OS === "web" ? 10 : Math.max(insets.bottom, 6);
  const tabBarHeight = 58 + bottomPadding;

  // Show a blank screen (covered by the FuturisticLoader overlay in root layout)
  // while auth is loading or right after login before navigation resolves.
  // Never show the "Loading..." text — it causes the visible flicker on Android.
  if (isLoading || (!isSignedIn && justLoggedIn)) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  if (!isSignedIn) return null;

  return (
    <Tabs
      screenOptions={{
        lazy: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
          marginTop: 0,
        },
        tabBarStyle: {
          paddingTop: 6,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.15,
          shadowRadius: 16,
          elevation: 20,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
            <TabIcon name="house.fill" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="rides"
        options={{
          title: "My Rides",
          tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
            <TabIcon name="car.fill" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="communities"
        options={{
          title: "Communities",
          tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
            <TabIcon name="person.3.fill" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: "Requests",
          tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
            <TabIcon name="person.2.fill" color={color} focused={focused} badge={pendingCount} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
            <TabIcon name="person.fill" color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

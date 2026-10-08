import { useRouter, type Href } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useIsFocused } from "@/hooks/use-is-focused";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { DriverModeCard } from "@/components/profile/DriverModeCard";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfileHeroCard } from "@/components/profile/ProfileHeroCard";
import { ProfileMenuRow } from "@/components/profile/ProfileMenuRow";
import { ProfileQuickActions } from "@/components/profile/ProfileActionTile";
import {
  ProfileMoreOptionsGrid,
  ProfileSectionCard,
} from "@/components/profile/ProfileSectionCard";
import { D } from "@/constants/design";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/lib/auth-context-v2";
import { useRides } from "@/lib/rides-store";
import { useDriverAccess } from "@/lib/use-driver-access";
import { useToastStore } from "@/lib/stores";
import { isStripeClientConfigured } from "@/lib/stripe-client";
import { trpc } from "@/lib/trpc";
import { useProfilePhoto } from "@/hooks/use-profile-photo";

function toNumber(v: unknown, fallback = 0) {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function loyaltyLevelLabel(points: number): string {
  if (points >= 200) return "Level 4";
  if (points >= 100) return "Level 3";
  if (points >= 50) return "Level 2";
  return "Level 1";
}

const GENDER_OPTIONS = [
  { value: "male", label: "Male", color: "#0EA5E9", bg: "#0EA5E915" },
  { value: "female", label: "Female", color: "#EC4899", bg: "#EC489915" },
  { value: "non_binary", label: "Non-Binary", color: "#8B5CF6", bg: "#8B5CF615" },
  { value: "prefer_not_to_say", label: "Prefer Not to Say", color: "#6B7280", bg: "#6B728015" },
] as const;

export default function ProfileScreen() {
  const colors = useColors();
  const router = useRouter();
  const isFocused = useIsFocused();
  const { state, toggleDriverMode } = useRides();
  const { user, isLoading, isSignedIn, justLoggedIn, signOut } = useAuth();
  const toast = useToastStore();
  const danger = D.red;
  const stripePaymentsEnabled = isStripeClientConfigured();
  const { data: stripeServerOk } = trpc.payment.isConfigured.useQuery(undefined, {
    enabled: isFocused && stripePaymentsEnabled,
  });
  const showPayments = stripePaymentsEnabled && (stripeServerOk?.configured ?? false);

  const { data: userProfile, refetch: refetchProfile } = trpc.user.getProfile.useQuery(undefined, {
    enabled: isFocused,
    staleTime: 60_000,
  });
  const { photoUrl, isUploading: isUploadingPhoto, pickAndUpload } = useProfilePhoto(
    userProfile?.profilePhotoKey ?? user?.profilePhoto ?? null,
  );

  const [showEditName, setShowEditName] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const updateProfileMutation = trpc.user.updateProfile.useMutation();

  const updateGenderMutation = trpc.user.updateGender.useMutation({
    onSettled: () => refetchProfile(),
  } as any);
  const [showGenderPicker, setShowGenderPicker] = useState(false);
  const [savingGender, setSavingGender] = useState(false);

  const currentGender = userProfile?.gender ?? null;
  const currentGenderOption = GENDER_OPTIONS.find((g) => g.value === currentGender);

  const handleSelectGender = async (value: string) => {
    setSavingGender(true);
    try {
      await updateGenderMutation.mutateAsync({ gender: value as (typeof GENDER_OPTIONS)[number]["value"] });
      toast.show("Gender updated", "success");
    } catch {
      toast.show("Failed to update gender", "error");
    } finally {
      setSavingGender(false);
      setShowGenderPicker(false);
    }
  };

  const {
    canAccessDriverMode: isApprovedDriver,
    isPending: hasPendingApp,
    isActionRequired: isDriverActionRequired,
    isRejected: wasRejected,
    isSuspended: isDriverSuspended,
    isError: driverAccessError,
    rejectionReason: driverRejectionReason,
    actionRequiredReason: driverActionRequiredReason,
    banReason: driverBanReason,
    isLoading: driverAccessLoading,
  } = useDriverAccess(isFocused);

  const { data: driverApp } = trpc.driver.getApplicationStatus.useQuery(undefined, {
    enabled: isFocused,
    staleTime: 5 * 60_000,
  });

  const { data: studentStatus } = trpc.student.getStatus.useQuery(undefined, {
    enabled: isFocused,
    staleTime: 60_000,
  });
  const isStudentVerified = studentStatus?.status === "verified";

  const { data: rewardPoints } = trpc.rewards.getPoints.useQuery(undefined, {
    enabled: isFocused,
    staleTime: 60_000,
  });
  const points = rewardPoints?.points ?? 0;

  useEffect(() => {
    if (!isLoading && !isSignedIn && !justLoggedIn) {
      router.replace("/auth/sign-in" as Href);
    }
  }, [isLoading, isSignedIn, justLoggedIn, router]);

  const { data: liveStats } = trpc.user.getStats.useQuery(undefined, {
    enabled: isSignedIn && isFocused,
    staleTime: 30_000,
    refetchInterval: isFocused ? 30_000 : false,
  });

  const rating = useMemo(() => {
    if (liveStats?.avgRating && liveStats.avgRating > 0) return liveStats.avgRating;
    return toNumber(user?.averageRating ?? (user as { rating?: number })?.rating, 5);
  }, [user, liveStats]);

  const { data: allRidesData = [] } = trpc.rides.myRides.useQuery(undefined, {
    enabled: isSignedIn && isFocused,
    staleTime: 30_000,
  });

  const profileStats = useMemo(() => {
    const rides = (allRidesData as Array<{ isDriver?: boolean; status?: string; myFare?: number; mode?: string }>) ?? [];
    const isDriverMode = state.driverMode;

    if (isDriverMode) {
      const driverRides = rides.filter((r) => r.isDriver);
      const completedDriverRides = driverRides.filter((r) => r.status === "completed");
      const totalDriverEarnings = completedDriverRides.reduce((sum, r) => sum + (r.myFare || 0), 0);
      return {
        totalRides: completedDriverRides.length,
        totalAmount: totalDriverEarnings,
        sharedRides: completedDriverRides.filter((r) => r.mode === "share").length,
        amountLabel: "Total Earnings",
        ridesLabel: "Rides Given",
        thirdLabel: "Shared Rides",
      };
    }

    const passengerRides = rides.filter((r) => !r.isDriver);
    const completedRides = passengerRides.filter((r) => r.status === "completed");
    const totalSpent = completedRides.reduce((sum, r) => sum + (r.myFare || 0), 0);
    return {
      totalRides: completedRides.length,
      totalAmount: totalSpent,
      sharedRides: completedRides.filter((r) => r.mode === "share").length,
      amountLabel: "Total Spent",
      ridesLabel: "Total Rides",
      thirdLabel: "Shared Rides",
    };
  }, [allRidesData, state.driverMode]);

  const handleLogout = () => {
    const doLogout = async () => {
      await signOut();
      router.replace("/auth/sign-in" as Href);
    };
    if (Platform.OS === "web") {
      if (window.confirm("Log out?\nYou will be signed out of your account.")) {
        doLogout();
      }
    } else {
      Alert.alert("Log out?", "You will be signed out of your account.", [
        { text: "Cancel", style: "cancel" },
        { text: "Log out", style: "destructive", onPress: doLogout },
      ]);
    }
  };

  const handleOpenEditName = () => {
    setEditFirstName(user?.firstName || "");
    setEditLastName(user?.lastName || "");
    setShowEditName(true);
  };

  const handleSaveName = async () => {
    const first = editFirstName.trim();
    if (!first) {
      toast.show("First name is required", "error");
      return;
    }
    setSavingName(true);
    try {
      await updateProfileMutation.mutateAsync({ firstName: first, lastName: editLastName.trim() });
      setShowEditName(false);
      toast.show("Name updated successfully", "success");
      if (Platform.OS === "web") window.location.reload();
    } catch {
      toast.show("Failed to save name. Please try again.", "error");
    } finally {
      setSavingName(false);
    }
  };

  if (isLoading) {
    return (
      <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 16, color: colors.foreground }}>Loading profile...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!isSignedIn || !user) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name || "User";
  const emailOrPhone = user.email || user.phone || "";
  const avatar = (name?.[0] ?? "U").toUpperCase();
  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleString("en-US", { month: "long", year: "numeric" })
    : "";

  const studentSubtitle = isStudentVerified
    ? "Verified"
    : studentStatus?.status === "pending"
      ? "In progress"
      : "Verify";

  const accountRows = [
    ...(showPayments
      ? [{
          icon: "creditcard.fill" as const,
          iconColor: D.blue,
          iconBg: "#EFF6FF",
          label: "Payment Methods",
          subtitle: "Manage cards, wallets & UPI",
          onPress: () => router.push("/stripe-cards" as Href),
        }]
      : []),
    {
      icon: "wallet.pass.fill" as const,
      iconColor: D.green,
      iconBg: "#ECFDF5",
      label: "Ride Credits",
      subtitle: "Add or manage ride credits",
      onPress: () => router.push("/wallet" as Href),
    },
    {
      icon: "ticket.fill" as const,
      iconColor: D.red,
      iconBg: "#FEF2F2",
      label: "Promo Codes",
      subtitle: "Apply codes & save on rides",
      onPress: () => router.push("/wallet" as Href),
    },
    {
      icon: "star.fill" as const,
      iconColor: D.orange,
      iconBg: "#FFF7ED",
      label: "Loyalty Rewards",
      subtitle: "View rewards & benefits",
      onPress: () => router.push("/loyalty-rewards" as Href),
    },
    {
      icon: "chart.bar.fill" as const,
      iconColor: D.purple,
      iconBg: "#F5F3FF",
      label: "Analytics",
      subtitle: "Your ride insights & stats",
      onPress: () => router.push("/analytics-dashboard" as Href),
    },
  ];

  const moreOptionsGrid = [
    {
      icon: "bell.fill" as const,
      iconColor: D.blue,
      iconBg: "#EFF6FF",
      label: "Notifications",
      subtitle: "Manage alerts & updates",
      onPress: () => router.push("/notifications" as Href),
    },
    {
      icon: "shield.fill" as const,
      iconColor: D.green,
      iconBg: "#ECFDF5",
      label: "Privacy & Compliance",
      subtitle: "Privacy settings & controls",
      onPress: () => router.push("/settings/privacy" as Href),
    },
    {
      icon: "doc.text.fill" as const,
      iconColor: D.purple,
      iconBg: "#F5F3FF",
      label: "Legal Center",
      subtitle: "Terms, policies & documents",
      onPress: () => router.push("/legal" as Href),
    },
  ];

  const moreOptionsExtra = [
    {
      icon: "info.circle" as const,
      iconColor: D.blue,
      iconBg: "#EFF6FF",
      label: "Help & Support",
      subtitle: "Get help with your account",
      onPress: () => router.push("/help-support" as Href),
    },
    ...(__DEV__
      ? [{
          icon: "wrench.fill" as const,
          iconColor: D.orange,
          iconBg: "#FFF7ED",
          label: "Stripe Diagnostics",
          subtitle: "Developer payment tools",
          onPress: () => router.push("/stripe-diagnostics" as Href),
        }]
      : []),
  ];

  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40, backgroundColor: "#F8FAFC" }}
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: "#F8FAFC" }}
      >
        <ProfileHeader onSettingsPress={() => router.push("/analytics-dashboard" as Href)} />

        <ProfileHeroCard
          name={name}
          emailOrPhone={emailOrPhone}
          avatar={avatar}
          photoUrl={photoUrl}
          rating={rating}
          memberSince={memberSince}
          isDriverMode={state.driverMode}
          isStudentVerified={isStudentVerified}
          currentGender={currentGender}
          currentGenderOption={currentGenderOption}
          isUploadingPhoto={isUploadingPhoto}
          onPickPhoto={pickAndUpload}
          onEditName={handleOpenEditName}
          onSetGender={() => setShowGenderPicker(true)}
          onStudentBadgePress={() => router.push("/student-verification" as Href)}
          stats={profileStats}
        />

        <DriverModeCard
          isApprovedDriver={isApprovedDriver}
          driverMode={state.driverMode}
          onToggleDriverMode={toggleDriverMode}
          onOpenDashboard={() => router.push("/driver/dashboard" as Href)}
          onOpenDocuments={() => router.push("/driver/documents" as Href)}
          onBecomeDriver={() => router.push("/driver-onboarding" as Href)}
          hasPendingApp={hasPendingApp}
          isDriverActionRequired={isDriverActionRequired}
          isDriverSuspended={isDriverSuspended}
          wasRejected={wasRejected}
          driverAccessLoading={driverAccessLoading}
          driverAccessError={driverAccessError}
          driverActionRequiredReason={driverActionRequiredReason}
          driverAppActionRequiredReason={driverApp?.actionRequiredReason}
          driverRejectionReason={driverRejectionReason}
          driverAppRejectionReason={driverApp?.rejectionReason}
          driverBanReason={driverBanReason}
          onUpdateApplication={() => router.push("/driver-application-status" as Href)}
          onReapply={() => router.push("/driver-onboarding" as Href)}
        />

        <ProfileQuickActions
          actions={[
            {
              icon: "gift.fill",
              iconColor: D.green,
              iconBg: "#ECFDF5",
              label: "Rewards",
              subtitle: `${points} pts`,
              onPress: () => router.push("/loyalty-rewards" as Href),
            },
            {
              icon: "graduationcap.fill",
              iconColor: D.purple,
              iconBg: "#F5F3FF",
              label: "Student",
              subtitle: studentSubtitle,
              onPress: () => router.push("/student-verification" as Href),
            },
            {
              icon: "creditcard.fill",
              iconColor: D.orange,
              iconBg: "#FFF7ED",
              label: "Payments",
              subtitle: showPayments ? "Add Card" : "Credits",
              onPress: () => router.push((showPayments ? "/stripe-cards" : "/wallet") as Href),
            },
            {
              icon: "ticket.fill",
              iconColor: D.blue,
              iconBg: "#EFF6FF",
              label: "Promos",
              subtitle: "View All",
              onPress: () => router.push("/wallet" as Href),
            },
            {
              icon: "heart.fill",
              iconColor: D.red,
              iconBg: "#FEF2F2",
              label: "Loyalty",
              subtitle: loyaltyLevelLabel(points),
              onPress: () => router.push("/loyalty-rewards" as Href),
            },
          ]}
        />

        <ProfileSectionCard
          title="Account & Settings"
          icon="gear"
          onViewAll={() => router.push("/analytics-dashboard" as Href)}
        >
          {accountRows.map((row, index) => (
            <ProfileMenuRow
              key={row.label}
              {...row}
              showDivider={index < accountRows.length - 1}
            />
          ))}
        </ProfileSectionCard>

        <ProfileMoreOptionsGrid
          title="More Options"
          icon="shield.fill"
          gridItems={moreOptionsGrid}
          extraItems={moreOptionsExtra}
          onViewAll={() => router.push("/notifications" as Href)}
        />

        <TouchableOpacity
          onPress={handleLogout}
          accessibilityLabel="Log out"
          accessibilityRole="button"
          style={{
            marginHorizontal: 16,
            marginTop: 2,
            marginBottom: 6,
            borderRadius: 26,
            borderWidth: 1,
            borderColor: "#E2E8F0",
            padding: 16,
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "#fff",
            minHeight: 64,
            ...D.shadow.card,
          }}
        >
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: danger + "18", alignItems: "center", justifyContent: "center" }}>
            <IconSymbol name="arrow.right.square.fill" size={18} color={danger} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontSize: 15, fontWeight: "800", color: danger }}>Log Out</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>Sign out from this device</Text>
          </View>
          <IconSymbol name="chevron.right" size={16} color={danger} />
        </TouchableOpacity>

        <Text style={{ textAlign: "center", fontSize: 12, color: colors.muted, marginTop: 10 }}>
          YOO v1.0.0 · Rideshare App
        </Text>
      </ScrollView>

      <Modal visible={showGenderPicker} transparent animationType="slide" onRequestClose={() => setShowGenderPicker(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, borderTopWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground, marginBottom: 4 }}>Select Gender</Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 20 }}>Used for safety matching and targeted notifications.</Text>
            {GENDER_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => handleSelectGender(opt.value)}
                disabled={savingGender}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  borderRadius: 14,
                  marginBottom: 8,
                  backgroundColor: currentGender === opt.value ? opt.bg : colors.background,
                  borderWidth: 1.5,
                  borderColor: currentGender === opt.value ? opt.color : colors.border,
                  minHeight: 48,
                }}
              >
                <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: currentGender === opt.value ? opt.color : colors.border, alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                  {currentGender === opt.value && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: opt.color }} />}
                </View>
                <Text style={{ fontSize: 15, fontWeight: currentGender === opt.value ? "700" : "500", color: currentGender === opt.value ? opt.color : colors.foreground, flex: 1 }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={() => setShowGenderPicker(false)}
              style={{ marginTop: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, alignItems: "center", minHeight: 48, justifyContent: "center" }}
            >
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.muted }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showEditName} transparent animationType="fade" onRequestClose={() => setShowEditName(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 24 }}>
          <View style={{ width: "100%", maxWidth: 380, backgroundColor: colors.surface, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground, marginBottom: 4 }}>Edit Name</Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 20 }}>Update how your name appears in the app.</Text>

            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>FIRST NAME</Text>
            <TextInput
              value={editFirstName}
              onChangeText={setEditFirstName}
              placeholder="First name"
              placeholderTextColor={colors.muted}
              autoFocus
              style={{ backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.foreground, marginBottom: 12 }}
            />

            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted, marginBottom: 6 }}>LAST NAME</Text>
            <TextInput
              value={editLastName}
              onChangeText={setEditLastName}
              placeholder="Last name (optional)"
              placeholderTextColor={colors.muted}
              style={{ backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.foreground, marginBottom: 24 }}
            />

            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                onPress={() => setShowEditName(false)}
                style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, alignItems: "center", minHeight: 48, justifyContent: "center" }}
              >
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.muted }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveName}
                disabled={savingName}
                style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", opacity: savingName ? 0.6 : 1, minHeight: 48, justifyContent: "center" }}
              >
                <Text style={{ fontSize: 15, fontWeight: "700", color: "#fff" }}>{savingName ? "Saving…" : "Save"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

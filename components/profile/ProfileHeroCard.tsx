import { ActivityIndicator, Platform, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { GradientView } from "@/components/GradientView";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { D, SHADOW_HERO } from "@/constants/design";
import { ProfileStatItem } from "./ProfileStatItem";

interface GenderOption {
  value: string;
  label: string;
  color: string;
}

interface ProfileHeroCardProps {
  name: string;
  emailOrPhone: string;
  avatar: string;
  photoUrl: string | null;
  rating: number;
  memberSince: string;
  isDriverMode: boolean;
  isStudentVerified: boolean;
  currentGender: string | null;
  currentGenderOption: GenderOption | undefined;
  isUploadingPhoto: boolean;
  onPickPhoto: () => void;
  onEditName: () => void;
  onSetGender: () => void;
  onStudentBadgePress: () => void;
  stats: {
    totalRides: number;
    totalAmount: number;
    sharedRides: number;
    ridesLabel: string;
    amountLabel: string;
    thirdLabel: string;
  };
}

function HeroWaves() {
  return (
    <>
      <View
        style={{
          position: "absolute",
          top: -60,
          right: -40,
          width: 220,
          height: 220,
          borderRadius: 110,
          backgroundColor: "rgba(255,255,255,0.07)",
        }}
      />
      <View
        style={{
          position: "absolute",
          bottom: 40,
          left: -50,
          width: 180,
          height: 180,
          borderRadius: 90,
          backgroundColor: "rgba(255,255,255,0.05)",
        }}
      />
      <View
        style={{
          position: "absolute",
          top: 30,
          right: 60,
          width: 100,
          height: 100,
          borderRadius: 50,
          backgroundColor: "rgba(66,199,255,0.12)",
        }}
      />
    </>
  );
}

export function ProfileHeroCard({
  name,
  emailOrPhone,
  avatar,
  photoUrl,
  rating,
  memberSince,
  isDriverMode,
  isStudentVerified,
  currentGender,
  currentGenderOption,
  isUploadingPhoto,
  onPickPhoto,
  onEditName,
  onSetGender,
  onStudentBadgePress,
  stats,
}: ProfileHeroCardProps) {
  const amountDisplay = `$${stats.totalAmount.toFixed(2)}`;
  const showGenderBadge = currentGenderOption && currentGender !== "prefer_not_to_say";
  const genderEditable = !currentGenderOption || currentGender === "prefer_not_to_say";

  const heroGradientStyle = Platform.select({
    web: {
      background: "linear-gradient(135deg, #0A2D6E 0%, #1565D8 45%, #1E88FF 100%)",
      backgroundColor: "#0A2D6E",
    } as Record<string, string>,
    default: { backgroundColor: "#0A2D6E" },
  });

  return (
    <View style={{ marginHorizontal: 16, marginTop: 8, borderRadius: 28, overflow: "hidden", ...SHADOW_HERO }}>
      <GradientView style={{ padding: 20, paddingBottom: 18, ...(heroGradientStyle as object) }}>
        <HeroWaves />

        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
          <View style={{ position: "relative" }}>
            <TouchableOpacity
              onPress={onPickPhoto}
              disabled={isUploadingPhoto}
              activeOpacity={0.8}
              accessibilityLabel="Edit profile photo"
            >
              <View
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  backgroundColor: "#fff",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  borderWidth: 3,
                  borderColor: "rgba(255,255,255,0.4)",
                }}
              >
                {photoUrl ? (
                  <Image source={{ uri: photoUrl }} style={{ width: 80, height: 80 }} contentFit="cover" transition={200} />
                ) : (
                  <Text style={{ fontSize: 30, fontWeight: "800", color: D.blue }}>{avatar}</Text>
                )}
              </View>
              <View
                style={{
                  position: "absolute",
                  bottom: 2,
                  right: 2,
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: D.blue,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 2.5,
                  borderColor: "#fff",
                }}
              >
                {isUploadingPhoto ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <IconSymbol name="camera.fill" size={13} color="#fff" />
                )}
              </View>
            </TouchableOpacity>
            {isDriverMode && (
              <View
                style={{
                  position: "absolute",
                  top: -2,
                  left: -2,
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: D.orange,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 2,
                  borderColor: "#fff",
                }}
              >
                <IconSymbol name="car.fill" size={11} color="#fff" />
              </View>
            )}
          </View>

          <View style={{ flex: 1, marginLeft: 16, paddingTop: 2 }}>
            <TouchableOpacity
              onPress={onEditName}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}
              accessibilityLabel="Edit name"
            >
              <Text style={{ fontSize: 22, fontWeight: "800", color: "#fff", letterSpacing: -0.3 }}>{name}</Text>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: "rgba(255,255,255,0.22)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <IconSymbol name="pencil" size={11} color="#fff" />
              </View>
              {isStudentVerified && <IconSymbol name="checkmark.seal.fill" size={18} color="#4ADE80" />}
            </TouchableOpacity>

            {emailOrPhone ? (
              <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.88)", marginTop: 4 }} numberOfLines={1}>
                {emailOrPhone}
              </Text>
            ) : null}

            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
              <IconSymbol name="star.fill" size={14} color="#FBBF24" />
              <Text style={{ fontSize: 13, color: "#fff", fontWeight: "700", marginLeft: 4 }}>{rating.toFixed(2)}</Text>
              {memberSince ? (
                <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", marginLeft: 6 }}>
                  Member since {memberSince}
                </Text>
              ) : null}
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {showGenderBadge && currentGenderOption ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    paddingHorizontal: 12,
                    paddingVertical: 5,
                    borderRadius: 20,
                    backgroundColor: "rgba(30,136,255,0.45)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.2)",
                  }}
                >
                  <IconSymbol name="person.fill" size={11} color="#fff" />
                  <Text style={{ fontSize: 12, fontWeight: "600", color: "#fff" }}>{currentGenderOption.label}</Text>
                </View>
              ) : genderEditable ? (
                <TouchableOpacity
                  onPress={onSetGender}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    paddingHorizontal: 12,
                    paddingVertical: 5,
                    borderRadius: 20,
                    backgroundColor: "rgba(255,255,255,0.12)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.25)",
                    borderStyle: "dashed",
                  }}
                >
                  <IconSymbol name="plus" size={10} color="rgba(255,255,255,0.7)" />
                  <Text style={{ fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.7)" }}>Set gender</Text>
                </TouchableOpacity>
              ) : null}
              {isStudentVerified && (
                <TouchableOpacity
                  onPress={onStudentBadgePress}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    paddingHorizontal: 12,
                    paddingVertical: 5,
                    borderRadius: 20,
                    backgroundColor: "rgba(34,197,94,0.35)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.2)",
                  }}
                >
                  <IconSymbol name="checkmark.circle.fill" size={12} color="#4ADE80" />
                  <Text style={{ fontSize: 12, fontWeight: "600", color: "#fff" }}>Verified</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        <View
          style={{
            marginTop: 20,
            backgroundColor: "#fff",
            borderRadius: 22,
            paddingVertical: 16,
            paddingHorizontal: 6,
            flexDirection: "row",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.06,
            shadowRadius: 8,
            elevation: 2,
          }}
        >
          <ProfileStatItem
            icon="car.fill"
            iconColor={D.blue}
            iconBg="#EFF6FF"
            value={String(stats.totalRides)}
            label={stats.ridesLabel}
          />
          <View style={{ width: 1, backgroundColor: "#E2E8F0", marginVertical: 12 }} />
          <ProfileStatItem
            icon="dollarsign.circle.fill"
            iconColor={D.green}
            iconBg="#ECFDF5"
            value={amountDisplay}
            label={stats.amountLabel}
          />
          <View style={{ width: 1, backgroundColor: "#E2E8F0", marginVertical: 12 }} />
          <ProfileStatItem
            icon="person.2.fill"
            iconColor={D.purple}
            iconBg="#F5F3FF"
            value={String(stats.sharedRides)}
            label={stats.thirdLabel}
          />
        </View>
      </GradientView>
    </View>
  );
}

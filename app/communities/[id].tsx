import { C } from "@/components/communities/communityTheme";
import { ScreenContainer } from "@/components/screen-container";
import { GradientButton } from "@/components/ui/GradientButton";
import { useSignedImage } from "@/hooks/use-signed-image";
import { useToastStore } from "@/lib/stores";
import { trpc } from "@/lib/trpc";
import {
  CATEGORY_LABELS,
  type CommunityCategory,
  type CommunityVisibility,
} from "@/shared/community";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Tab = "rides" | "members";
type DateFilter = "all" | "today" | "tomorrow" | "week";
type ChipFilter = DateFilter | "airport";

function visibilityLabel(v: CommunityVisibility) {
  if (v === "public") return "Public Community";
  if (v === "private") return "Private Community";
  return "Invite Only";
}

function formatDeparture(d: string | Date | null | undefined): { label: string; tone: "today" | "tomorrow" | "other" } {
  if (!d) return { label: "Flexible", tone: "other" };
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return { label: "Flexible", tone: "other" };
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (isToday) return { label: `Today, ${time}`, tone: "today" as const };
  if (isTomorrow) return { label: `Tomorrow, ${time}`, tone: "tomorrow" as const };
  return {
    label: date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
    tone: "other" as const,
  };
}

function FloatingBtn({ icon, onPress }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.floatBtn}>
      <Ionicons name={icon} size={20} color={C.text} />
    </Pressable>
  );
}

function MemberAvatar({ photoKey, name }: { photoKey?: string | null; name: string }) {
  const signed = useSignedImage(photoKey?.startsWith("http") ? null : photoKey);
  const url = photoKey?.startsWith("http") ? photoKey : signed;
  if (url) {
    return <Image source={{ uri: url }} style={s.memberAvatar} />;
  }
  return (
    <View style={[s.memberAvatar, { backgroundColor: "#E2E8F0", alignItems: "center", justifyContent: "center" }]}>
      <Text style={{ fontWeight: "700", color: C.muted }}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

export default function CommunityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const communityId = Number(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToastStore((s) => s.show);
  const utils = trpc.useUtils();

  const [tab, setTab] = useState<Tab>("rides");
  const [chipFilter, setChipFilter] = useState<ChipFilter>("all");
  const [memberSearch, setMemberSearch] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [joinModal, setJoinModal] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  const dateFilter: DateFilter = chipFilter === "airport" ? "all" : chipFilter;

  const detailQuery = trpc.communities.getById.useQuery(
    { id: communityId },
    { enabled: Number.isFinite(communityId) && communityId > 0 },
  );

  const ridesQuery = trpc.communities.listRides.useQuery(
    { communityId, dateFilter },
    { enabled: !!detailQuery.data?.canViewRides },
  );

  const membersQuery = trpc.communities.listMembers.useQuery(
    { communityId, search: memberSearch || undefined, limit: 50 },
    { enabled: !!detailQuery.data?.canViewMembers && tab === "members" },
  );

  const joinMut = trpc.communities.join.useMutation({
    onSuccess: (res: { status: string }) => {
      toast(res.status === "active" ? "Joined community!" : "Join request sent", "success");
      setJoinModal(false);
      void utils.communities.getById.invalidate({ id: communityId });
      void utils.communities.listMyCommunities.invalidate();
    },
    onError: (err: { message: string }) => toast(err.message, "error"),
  } as any);

  const leaveMut = trpc.communities.leave.useMutation({
    onSuccess: () => {
      toast("Left community", "info");
      void utils.communities.getById.invalidate({ id: communityId });
      void utils.communities.listMyCommunities.invalidate();
    },
    onError: (err: { message: string }) => toast(err.message, "error"),
  } as any);

  const approveMut = trpc.communities.approveMember.useMutation({
    onSuccess: () => {
      void membersQuery.refetch();
      void detailQuery.refetch();
    },
  } as any);

  const community = detailQuery.data;
  const bannerUrl = useSignedImage(
    community?.bannerUrl?.startsWith("http") ? null : community?.bannerUrl,
  );
  const bannerDisplay = community?.bannerUrl?.startsWith("http") ? community.bannerUrl : bannerUrl;
  const logoUrl = useSignedImage(
    community?.logoUrl?.startsWith("http") ? null : community?.logoUrl,
  );
  const logoDisplay = community?.logoUrl?.startsWith("http") ? community.logoUrl : logoUrl;

  const membershipStatus = community?.membershipStatus;
  const isMember = membershipStatus === "active";
  const isPending = membershipStatus === "pending";

  const joinLabel = useMemo(() => {
    if (isMember) return "Joined";
    if (isPending) return "Pending";
    if (community?.visibility === "private" || community?.verificationType === "manual_approval") {
      return "Request";
    }
    return "Join";
  }, [isMember, isPending, community]);

  const filteredRides = useMemo(() => {
    const rides = ridesQuery.data ?? [];
    if (chipFilter !== "airport") return rides;
    return rides.filter((r: { pickup?: string; dropoff?: string }) => {
      const text = `${r.pickup ?? ""} ${r.dropoff ?? ""}`.toLowerCase();
      return text.includes("airport");
    });
  }, [ridesQuery.data, chipFilter]);

  if (detailQuery.isLoading) {
    return (
      <ScreenContainer style={{ alignItems: "center", justifyContent: "center", backgroundColor: C.bg }}>
        <ActivityIndicator color={C.blue} size="large" />
      </ScreenContainer>
    );
  }

  if (detailQuery.isError || !community) {
    return (
      <ScreenContainer style={{ padding: 20, backgroundColor: C.bg }}>
        <Pressable onPress={() => router.back()} style={s.floatBtn}>
          <Ionicons name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={{ color: C.text, marginTop: 20, fontWeight: "600" }}>Community not found</Text>
      </ScreenContainer>
    );
  }

  const desc = community.description;
  const descPreview = desc.length > 140 && !descExpanded ? `${desc.slice(0, 140)}...` : desc;

  const handleJoin = () => {
    if (isMember || isPending) return;
    if (community.visibility === "invite_only" || community.verificationType === "invite_code") {
      setJoinModal(true);
      return;
    }
    joinMut.mutate({ communityId });
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: `Join ${community.name} on YOO` });
    } catch {
      /* user cancelled */
    }
  };

  const online = community.onlineCount ?? 0;

  return (
    <ScreenContainer edges={[]} style={{ backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={{ height: 200, backgroundColor: "#CBD5E1" }}>
          {bannerDisplay ? (
            <Image source={{ uri: bannerDisplay }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
          ) : null}
          <View style={[s.bannerOverlay, { paddingTop: insets.top + 8 }]}>
            <FloatingBtn icon="arrow-back" onPress={() => router.back()} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <FloatingBtn icon="search-outline" onPress={() => setTab("members")} />
              <FloatingBtn icon="share-outline" onPress={handleShare} />
              <FloatingBtn icon="notifications-outline" onPress={() => router.push("/notifications" as Href)} />
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: 20 }}>
          <View style={s.headerRow}>
            <View style={s.logoWrap}>
              {logoDisplay ? (
                <Image source={{ uri: logoDisplay }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
              ) : (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="people" size={32} color={C.blue} />
                </View>
              )}
            </View>
            <View style={{ flex: 1 }} />
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              {isMember ? (
                <Pressable onPress={() => leaveMut.mutate({ communityId })} style={s.leaveBtn}>
                  <Text style={s.leaveBtnText}>Leave</Text>
                </Pressable>
              ) : (
                <>
                  <Pressable
                    onPress={handleJoin}
                    disabled={joinMut.isPending || isPending}
                    style={[s.joinBtn, (joinMut.isPending || isPending) && { opacity: 0.6 }]}
                  >
                    <Ionicons name="add" size={16} color="#fff" />
                    <Text style={s.joinBtnText}>{joinLabel}</Text>
                  </Pressable>
                  <Pressable style={s.bellOutlineBtn} onPress={() => router.push("/notifications" as Href)}>
                    <Ionicons name="notifications-outline" size={18} color={C.text} />
                  </Pressable>
                </>
              )}
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
            <Text style={s.communityName}>{community.name}</Text>
            {community.isVerified ? (
              <Ionicons name="checkmark-circle" size={22} color={C.green} style={{ marginLeft: 6 }} />
            ) : null}
          </View>

          <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <View style={s.pill}>
              <Text style={s.pillText}>{CATEGORY_LABELS[community.category as CommunityCategory]}</Text>
            </View>
            <View style={[s.pill, { flexDirection: "row", alignItems: "center", gap: 4 }]}>
              <Ionicons name="globe-outline" size={12} color={C.blue} />
              <Text style={s.pillText}>{visibilityLabel(community.visibility as CommunityVisibility)}</Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
            <Text style={s.statsLine}>{community.memberCount.toLocaleString()} members</Text>
            <Text style={s.statsLine}> · </Text>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.green, marginRight: 4 }} />
            <Text style={{ color: C.green, fontSize: 14, fontWeight: "600" }}>{online.toLocaleString()} online</Text>
          </View>

          <Text style={s.description}>
            {descPreview}
            {desc.length > 140 && (
              <Text onPress={() => setDescExpanded((v) => !v)} style={s.seeMore}>
                {" "}{descExpanded ? "See less" : "See more"}
              </Text>
            )}
          </Text>
        </View>

        <View style={s.tabBar}>
          {(["rides", "members"] as Tab[]).map((t) => {
            const active = tab === t;
            const icon = t === "rides" ? "car-outline" : "people-outline";
            return (
              <Pressable key={t} onPress={() => setTab(t)} style={s.tabItem}>
                <Ionicons name={icon} size={18} color={active ? C.blue : C.muted} />
                <Text style={[s.tabLabel, active && s.tabLabelActive]}>{t === "rides" ? "Rides" : "Members"}</Text>
                {active && <View style={s.tabUnderline} />}
              </Pressable>
            );
          })}
        </View>

        {tab === "rides" && (
          <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
            {!community.canViewRides ? (
              <EmptyBlock
                title="Rides are members-only"
                subtitle="Join this community to see rides posted here."
              />
            ) : (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                  {(
                    [
                      { key: "all", label: "All Rides" },
                      { key: "today", label: "Today" },
                      { key: "tomorrow", label: "Tomorrow" },
                      { key: "week", label: "This Week" },
                      { key: "airport", label: "Airport" },
                    ] as { key: ChipFilter; label: string }[]
                  ).map((f) => (
                    <Pressable
                      key={f.key}
                      onPress={() => setChipFilter(f.key)}
                      style={[s.chip, chipFilter === f.key && s.chipActive]}
                    >
                      <Text style={[s.chipText, chipFilter === f.key && s.chipTextActive]}>{f.label}</Text>
                    </Pressable>
                  ))}
                  <Pressable style={s.filterIconBtn}>
                    <Ionicons name="options-outline" size={18} color={C.muted} />
                  </Pressable>
                </ScrollView>

                <Text style={s.sectionHeading}>Upcoming Rides</Text>

                {ridesQuery.isLoading ? (
                  <ActivityIndicator color={C.blue} style={{ marginTop: 20 }} />
                ) : filteredRides.length === 0 ? (
                  <EmptyBlock
                    title="No rides in this community yet"
                    subtitle="Be the first to post a community ride."
                    cta={isMember ? "Post Community Ride" : undefined}
                    onCta={
                      isMember
                        ? () => router.push(`/create-ride?flow=post&communityId=${communityId}` as Href)
                        : undefined
                    }
                  />
                ) : (
                  <>
                    {filteredRides.map((ride: {
                      rideId: string;
                      pickup: string;
                      dropoff: string;
                      pickupShort: string;
                      dropoffShort: string;
                      departureTime: string | Date | null;
                      organizerName: string;
                      organizerPhoto?: string | null;
                      isVerified?: boolean;
                      pricePerSeat: number;
                      seatsLeft: number;
                      isOwnRide: boolean;
                      mode?: string;
                    }) => {
                      const dep = formatDeparture(ride.departureTime);
                      const timeBg = dep.tone === "today" ? "#DCFCE7" : dep.tone === "tomorrow" ? "#DBEAFE" : "#F1F5F9";
                      const timeColor = dep.tone === "today" ? "#16A34A" : dep.tone === "tomorrow" ? C.blue : C.muted;
                      return (
                        <Pressable
                          key={ride.rideId}
                          onPress={() => router.push(`/carpool-detail?rideId=${ride.rideId}` as Href)}
                          style={s.rideCard}
                        >
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                              <MemberAvatar photoKey={ride.organizerPhoto} name={ride.organizerName} />
                              <View style={{ marginLeft: 10, flex: 1 }}>
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                                  <Text style={s.driverName} numberOfLines={1}>{ride.organizerName}</Text>
                                  {ride.isVerified ? <Ionicons name="checkmark-circle" size={14} color={C.blue} /> : null}
                                </View>
                              </View>
                            </View>
                            <View style={[s.timePill, { backgroundColor: timeBg }]}>
                              <Text style={{ color: timeColor, fontSize: 11, fontWeight: "700" }}>{dep.label}</Text>
                            </View>
                          </View>

                          <Text style={s.routeMain}>
                            {ride.pickupShort} → {ride.dropoffShort}
                          </Text>
                          <Text style={s.routeSub} numberOfLines={1}>
                            {ride.pickup.split(",")[0]} → {ride.dropoff.split(",")[0]}
                          </Text>

                          <View style={s.rideMetaRow}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                              <Ionicons name="person-outline" size={14} color={C.muted} />
                              <Text style={s.metaText}>{ride.seatsLeft} seats left</Text>
                            </View>
                            <Text style={s.priceText}>${ride.pricePerSeat.toFixed(2)} / seat</Text>
                            <Text style={s.metaText}>Direct</Text>
                          </View>

                          {!ride.isOwnRide && (
                            <Pressable
                              style={s.joinRideBtn}
                              onPress={() => router.push(`/carpool-detail?rideId=${ride.rideId}` as Href)}
                            >
                              <Text style={s.joinRideText}>Join Ride</Text>
                            </Pressable>
                          )}
                        </Pressable>
                      );
                    })}

                    {filteredRides.length > 0 && (
                      <Pressable style={s.viewAllRides}>
                        <Text style={s.viewAllRidesText}>View all rides</Text>
                        <Ionicons name="chevron-forward" size={16} color={C.blue} />
                      </Pressable>
                    )}
                  </>
                )}

                {isMember && (
                  <View style={s.quickGrid}>
                    {[
                      { label: "Post a Ride", icon: "add-circle" as const, color: C.blue, href: `/create-ride?flow=post&communityId=${communityId}` },
                      { label: "Find Rides", icon: "search" as const, color: C.green, href: "/find-shared" },
                      { label: "My Rides", icon: "car" as const, color: C.orange, href: "/(tabs)/rides" },
                      { label: "Ride Alerts", icon: "notifications" as const, color: C.purple, href: "/notifications" },
                    ].map((action) => (
                      <Pressable
                        key={action.label}
                        style={s.quickCard}
                        onPress={() => router.push(action.href as Href)}
                      >
                        <View style={[s.quickIcon, { backgroundColor: action.color + "18" }]}>
                          <Ionicons name={action.icon} size={22} color={action.color} />
                        </View>
                        <Text style={s.quickLabel}>{action.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {tab === "members" && (
          <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
            {!community.canViewMembers ? (
              <EmptyBlock title="Members are private" subtitle="Join this community to see members." />
            ) : (
              <>
                <View style={s.memberSearchWrap}>
                  <Ionicons name="search" size={18} color={C.muted} />
                  <TextInput
                    value={memberSearch}
                    onChangeText={setMemberSearch}
                    placeholder="Search members"
                    placeholderTextColor={C.muted}
                    style={s.memberSearchInput}
                  />
                </View>
                {membersQuery.isLoading ? (
                  <ActivityIndicator color={C.blue} />
                ) : (membersQuery.data ?? []).length === 0 ? (
                  <EmptyBlock title="No members found" />
                ) : (
                  (membersQuery.data ?? []).map((m: {
                    id: number;
                    userId: number;
                    name: string;
                    role: string;
                    status: string;
                    profilePhoto?: string | null;
                    isStudentVerified?: boolean;
                    joinedAt: string | Date | null;
                  }) => (
                    <View key={m.id} style={s.memberCard}>
                      <MemberAvatar photoKey={m.profilePhoto} name={m.name} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Text style={s.memberName}>{m.name}</Text>
                          {m.isStudentVerified ? <Ionicons name="checkmark-circle" size={14} color={C.blue} /> : null}
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                          <View style={s.rolePill}>
                            <Text style={s.rolePillText}>{m.role}</Text>
                          </View>
                          {m.joinedAt ? (
                            <Text style={s.memberMeta}>Joined {new Date(m.joinedAt).toLocaleDateString()}</Text>
                          ) : null}
                        </View>
                      </View>
                      {m.status === "pending" && community.canManage && (
                        <Pressable
                          onPress={() => approveMut.mutate({ communityId, userId: m.userId })}
                          style={s.approveBtn}
                        >
                          <Text style={s.approveBtnText}>Approve</Text>
                        </Pressable>
                      )}
                    </View>
                  ))
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={joinModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: C.text }}>Enter invite code</Text>
            <TextInput
              value={inviteCode}
              onChangeText={setInviteCode}
              placeholder="Invite code"
              autoCapitalize="characters"
              placeholderTextColor={C.muted}
              style={{
                borderWidth: 1,
                borderColor: C.border,
                borderRadius: 14,
                padding: 12,
                marginTop: 12,
                color: C.text,
              }}
            />
            <View style={{ marginTop: 16, gap: 10 }}>
              <GradientButton
                label="Join Community"
                loading={joinMut.isPending}
                onPress={() => joinMut.mutate({ communityId, inviteCode: inviteCode.trim() || undefined })}
              />
              <Pressable onPress={() => setJoinModal(false)} style={{ alignItems: "center", padding: 12 }}>
                <Text style={{ color: C.muted }}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

function EmptyBlock({
  title,
  subtitle,
  cta,
  onCta,
}: {
  title: string;
  subtitle?: string;
  cta?: string;
  onCta?: () => void;
}) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 28 }}>
      <Text style={{ fontWeight: "700", color: C.text }}>{title}</Text>
      {subtitle ? <Text style={{ color: C.muted, marginTop: 6, textAlign: "center" }}>{subtitle}</Text> : null}
      {cta && onCta ? (
        <View style={{ marginTop: 16, width: "100%" }}>
          <GradientButton label={cta} onPress={onCta} />
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  floatBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    ...C.shadow,
  },
  bannerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  headerRow: { flexDirection: "row", alignItems: "flex-end", marginTop: -44 },
  logoWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 4,
    borderColor: C.bg,
    overflow: "hidden",
    backgroundColor: "#E2E8F0",
    ...C.shadow,
  },
  joinBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: C.blue,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  joinBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  leaveBtn: {
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: C.surface,
  },
  leaveBtnText: { color: C.muted, fontWeight: "600" },
  bellOutlineBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface,
  },
  communityName: { fontSize: 24, fontWeight: "800", color: C.text },
  pill: { backgroundColor: "#E8F2FF", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  pillText: { color: C.blue, fontSize: 12, fontWeight: "600" },
  statsLine: { color: C.muted, fontSize: 14 },
  description: { color: C.text, marginTop: 12, lineHeight: 21, fontSize: 14 },
  seeMore: { color: C.blue, fontWeight: "600" },
  tabBar: {
    flexDirection: "row",
    marginTop: 20,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingHorizontal: 20,
  },
  tabItem: { flex: 1, alignItems: "center", paddingVertical: 12, position: "relative" },
  tabLabel: { fontWeight: "600", color: C.muted, marginTop: 4, fontSize: 14 },
  tabLabelActive: { color: C.blue, fontWeight: "700" },
  tabUnderline: {
    position: "absolute",
    bottom: 0,
    left: "20%",
    right: "20%",
    height: 2,
    backgroundColor: C.blue,
    borderRadius: 1,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipActive: { backgroundColor: C.blue, borderColor: C.blue },
  chipText: { color: C.text, fontWeight: "600", fontSize: 13 },
  chipTextActive: { color: "#fff" },
  filterIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface,
  },
  sectionHeading: { fontSize: 17, fontWeight: "700", color: C.text, marginBottom: 12 },
  rideCard: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    backgroundColor: C.surface,
    ...C.shadow,
  },
  driverName: { fontWeight: "700", color: C.text, fontSize: 14 },
  timePill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  routeMain: { fontWeight: "800", color: C.text, fontSize: 16, marginTop: 12 },
  routeSub: { color: C.muted, fontSize: 12, marginTop: 4 },
  rideMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  metaText: { color: C.muted, fontSize: 12 },
  priceText: { color: C.green, fontWeight: "700", fontSize: 13 },
  joinRideBtn: {
    alignSelf: "flex-end",
    marginTop: 10,
    backgroundColor: "#E8F2FF",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  joinRideText: { color: C.blue, fontWeight: "700", fontSize: 13 },
  viewAllRides: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 12,
    marginBottom: 8,
  },
  viewAllRidesText: { color: C.blue, fontWeight: "600", fontSize: 14 },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
    marginBottom: 8,
  },
  quickCard: {
    width: "48%",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
    backgroundColor: C.surface,
    ...C.shadow,
  },
  quickIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: { fontWeight: "600", color: C.text, marginTop: 8, fontSize: 13 },
  memberSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
    backgroundColor: C.surface,
  },
  memberSearchInput: { flex: 1, marginLeft: 8, color: C.text, fontSize: 15 },
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    backgroundColor: C.surface,
    ...C.shadow,
  },
  memberAvatar: { width: 44, height: 44, borderRadius: 22 },
  memberName: { fontWeight: "700", color: C.text, fontSize: 15 },
  rolePill: { backgroundColor: "#F1F5F9", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  rolePillText: { color: C.muted, fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  memberMeta: { color: C.muted, fontSize: 11 },
  approveBtn: { backgroundColor: C.blue, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  approveBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
});

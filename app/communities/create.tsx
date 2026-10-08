import { CommunityStepper } from "@/components/communities/CommunityStepper";
import { C } from "@/components/communities/communityTheme";
import { ScreenContainer } from "@/components/screen-container";
import { useCommunityImageUpload } from "@/hooks/use-community-image";
import { useSignedImage } from "@/hooks/use-signed-image";
import { useAuth } from "@/lib/auth-context-v2";
import {
  clearCommunityDraft,
  EMPTY_DRAFT,
  loadCommunityDraft,
  saveCommunityDraft,
  type CommunityDraft,
} from "@/lib/community-draft";
import { useToastStore } from "@/lib/stores";
import { trpc } from "@/lib/trpc";
import {
  CATEGORY_LABELS,
  COMMUNITY_CATEGORIES,
  DEFAULT_COMMUNITY_RULES,
  type CommunityCategory,
  type CommunityVerificationType,
  type CommunityVisibility,
} from "@/shared/community";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const CATEGORY_ICONS: Record<CommunityCategory, keyof typeof Ionicons.glyphMap> = {
  university: "school-outline",
  company: "briefcase-outline",
  city: "business-outline",
  apartment: "people-outline",
  event: "calendar-outline",
  travel: "airplane-outline",
  private_group: "lock-closed-outline",
  custom: "grid-outline",
};

const VISIBILITY_OPTS: {
  value: CommunityVisibility;
  title: string;
  desc: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}[] = [
  { value: "public", title: "Public", desc: "Anyone can find and request to join.", icon: "globe-outline", color: C.blue },
  { value: "private", title: "Private", desc: "Only approved members can view and join.", icon: "lock-closed-outline", color: C.green },
  { value: "invite_only", title: "Invite Only", desc: "Only people with an invite link or code can join.", icon: "mail-outline", color: C.purple },
];

const VERIFY_OPTS: {
  value: CommunityVerificationType;
  title: string;
  desc: string;
}[] = [
  { value: "none", title: "No verification", desc: "Anyone eligible by visibility can join." },
  { value: "edu_email", title: ".edu email", desc: "Require a university email domain." },
  { value: "company_email", title: "Company email", desc: "Require a company email domain." },
  { value: "invite_code", title: "Invite code", desc: "Members need a community invite code." },
  { value: "manual_approval", title: "Manual approval", desc: "Admins approve each join request." },
];

function PreviewImage({ imageKey, fallback }: { imageKey?: string | null; fallback: string }) {
  const url = useSignedImage(imageKey);
  if (url) return <Image source={{ uri: url }} style={{ width: "100%", height: "100%" }} contentFit="cover" />;
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#E2E8F0" }}>
      <Text style={{ color: C.muted, fontSize: 12 }}>{fallback}</Text>
    </View>
  );
}

function FormCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={s.formCard}>
      {title ? <Text style={s.cardTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

export default function CreateCommunityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const toast = useToastStore((s) => s.show);
  const userId = user?.id ? Number(user.id) : 0;

  const [draft, setDraft] = useState<CommunityDraft>({
    ...EMPTY_DRAFT,
    rules: [...DEFAULT_COMMUNITY_RULES],
  });
  const [newRule, setNewRule] = useState("");
  const [draftLoaded, setDraftLoaded] = useState(false);

  const logoUpload = useCommunityImageUpload("community_logo");
  const bannerUpload = useCommunityImageUpload("community_banner");
  const createMut = trpc.communities.create.useMutation();

  useEffect(() => {
    if (!userId) return;
    loadCommunityDraft(userId).then((saved) => {
      if (saved) setDraft(saved);
      setDraftLoaded(true);
    });
  }, [userId]);

  useEffect(() => {
    if (!userId || !draftLoaded) return;
    void saveCommunityDraft(userId, draft);
  }, [draft, userId, draftLoaded]);

  const step = draft.step;

  const canContinueStep0 =
    draft.name.trim().length >= 3 &&
    draft.description.trim().length >= 10 &&
    draft.category != null;

  const canContinueStep1 = draft.visibility != null;
  const canContinueStep2 = draft.verificationType != null && (
    (draft.verificationType !== "edu_email" && draft.verificationType !== "company_email") ||
    draft.verificationDomain.trim().length >= 3
  );

  const update = (patch: Partial<CommunityDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const goBack = () => {
    if (step === 0) {
      if (Platform.OS === "web") {
        if (window.confirm("Discard community draft?")) router.back();
      } else {
        Alert.alert("Discard draft?", "Your progress will be saved locally.", [
          { text: "Keep editing", style: "cancel" },
          { text: "Leave", onPress: () => router.back() },
        ]);
      }
      return;
    }
    update({ step: step - 1 });
  };

  const handleCreate = async () => {
    if (!draft.category || !draft.visibility || !draft.verificationType) return;
    try {
      const community = await createMut.mutateAsync({
        name: draft.name.trim(),
        description: draft.description.trim(),
        category: draft.category,
        visibility: draft.visibility,
        logoUrl: draft.logoUrl ?? undefined,
        bannerUrl: draft.bannerUrl ?? undefined,
        verificationType: draft.verificationType,
        verificationDomain: draft.verificationDomain.trim() || undefined,
        customInviteCode: draft.customInviteCode.trim() || undefined,
        rules: draft.rules,
      });
      await clearCommunityDraft(userId);
      toast("Community created!", "success");
      router.replace(`/communities/${community.id}` as Href);
    } catch (err: any) {
      toast(err?.message ?? "Failed to create community", "error");
    }
  };

  const categoryLabel = draft.category ? CATEGORY_LABELS[draft.category] : "";
  const canContinue =
    (step === 0 && canContinueStep0) ||
    (step === 1 && canContinueStep1) ||
    (step === 2 && canContinueStep2) ||
    step === 3 ||
    step === 4;

  const continueLabel = step < 4 ? "Continue" : "Create Community";

  return (
    <ScreenContainer edges={["top", "left", "right"]} style={{ backgroundColor: C.canvas }}>
      <View style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable onPress={goBack} style={s.backBtn} accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={22} color={C.text} />
          </Pressable>

          <Text style={s.pageTitle}>Create Community</Text>
          <Text style={s.pageSubtitle}>Build your community and bring people together</Text>

          <CommunityStepper current={step} />

          {step === 0 && (
            <View style={{ gap: 14 }}>
              <FormCard title="Basic Information">
                <Text style={s.fieldLabel}>Community Name *</Text>
                <TextInput
                  value={draft.name}
                  onChangeText={(name: string) => update({ name })}
                  placeholder="e.g. Campus Carpool"
                  maxLength={50}
                  placeholderTextColor={C.muted}
                  style={s.input}
                />
                <Text style={s.counter}>{draft.name.length}/50</Text>

                <Text style={[s.fieldLabel, { marginTop: 14 }]}>Description *</Text>
                <TextInput
                  value={draft.description}
                  onChangeText={(description: string) => update({ description })}
                  placeholder="Tell people what your community is about..."
                  maxLength={300}
                  multiline
                  placeholderTextColor={C.muted}
                  style={[s.input, { minHeight: 88, textAlignVertical: "top" }]}
                />
                <Text style={s.counter}>{draft.description.length}/300</Text>
              </FormCard>

              <FormCard title="Category *">
                <View style={s.categoryGrid}>
                  {COMMUNITY_CATEGORIES.map((cat) => {
                    const selected = draft.category === cat;
                    return (
                      <Pressable
                        key={cat}
                        onPress={() => update({ category: cat })}
                        style={[s.categoryCell, selected && s.categoryCellSelected]}
                      >
                        {selected && (
                          <View style={s.categoryCheck}>
                            <Ionicons name="checkmark" size={10} color="#fff" />
                          </View>
                        )}
                        <Ionicons name={CATEGORY_ICONS[cat]} size={22} color={selected ? C.blue : C.muted} />
                        <Text style={[s.categoryLabel, selected && { color: C.blue }]} numberOfLines={1}>
                          {CATEGORY_LABELS[cat]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </FormCard>

              <FormCard title="Community Image">
                <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                  <Pressable
                    onPress={async () => {
                      const key = await logoUpload.pickAndUpload();
                      if (key) update({ logoUrl: key });
                    }}
                    style={s.imageUpload}
                  >
                    {draft.logoUrl ? (
                      <PreviewImage imageKey={draft.logoUrl} fallback="" />
                    ) : logoUpload.uploading ? (
                      <ActivityIndicator color={C.blue} />
                    ) : (
                      <>
                        <Ionicons name="image-outline" size={22} color={C.muted} />
                        <Text style={s.uploadHint}>Logo</Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={async () => {
                      const key = await bannerUpload.pickAndUpload();
                      if (key) update({ bannerUrl: key });
                    }}
                    style={[s.imageUpload, { flex: 1, height: 80 }]}
                  >
                    {draft.bannerUrl ? (
                      <PreviewImage imageKey={draft.bannerUrl} fallback="" />
                    ) : bannerUpload.uploading ? (
                      <ActivityIndicator color={C.blue} />
                    ) : (
                      <Text style={s.uploadHint}>Upload banner (optional)</Text>
                    )}
                  </Pressable>
                </View>
              </FormCard>
            </View>
          )}

          {step === 1 && (
            <View style={{ gap: 12 }}>
              <Text style={s.stepHeading}>Choose Visibility</Text>
              <Text style={s.stepDesc}>Control who can find and join your community.</Text>
              <View style={[s.infoBanner, { marginBottom: 4 }]}>
                <Ionicons name="information-circle-outline" size={18} color={C.blue} />
                <Text style={s.infoBannerText}>You can change this later in community settings.</Text>
              </View>
              {VISIBILITY_OPTS.map((opt) => {
                const selected = draft.visibility === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => update({ visibility: opt.value })}
                    style={[s.optionCard, selected && s.optionCardSelected]}
                  >
                    <View style={[s.optionIcon, { backgroundColor: opt.color + "18" }]}>
                      <Ionicons name={opt.icon} size={22} color={opt.color} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={s.optionTitle}>{opt.title}</Text>
                      <Text style={s.optionDesc}>{opt.desc}</Text>
                    </View>
                    <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={22} color={selected ? C.blue : C.muted} />
                  </Pressable>
                );
              })}
            </View>
          )}

          {step === 2 && (
            <View style={{ gap: 12 }}>
              <Text style={s.stepHeading}>Join Rules</Text>
              {VERIFY_OPTS.map((opt) => {
                const selected = draft.verificationType === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => update({ verificationType: opt.value })}
                    style={[s.optionCard, selected && s.optionCardSelected]}
                  >
                    <Text style={s.optionTitle}>{opt.title}</Text>
                    <Text style={s.optionDesc}>{opt.desc}</Text>
                  </Pressable>
                );
              })}
              {(draft.verificationType === "edu_email" || draft.verificationType === "company_email") && (
                <FormCard>
                  <Text style={s.fieldLabel}>Email domain *</Text>
                  <TextInput
                    value={draft.verificationDomain}
                    onChangeText={(verificationDomain: string) => update({ verificationDomain })}
                    placeholder="university.edu"
                    autoCapitalize="none"
                    placeholderTextColor={C.muted}
                    style={s.input}
                  />
                </FormCard>
              )}
              {draft.verificationType === "invite_code" && (
                <FormCard>
                  <Text style={s.fieldLabel}>Custom invite code (optional)</Text>
                  <TextInput
                    value={draft.customInviteCode}
                    onChangeText={(customInviteCode: string) => update({ customInviteCode })}
                    placeholder="Auto-generated if empty"
                    autoCapitalize="characters"
                    placeholderTextColor={C.muted}
                    style={s.input}
                  />
                </FormCard>
              )}
            </View>
          )}

          {step === 3 && (
            <FormCard>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <Text style={s.cardTitle}>Rules (optional)</Text>
                <Pressable
                  onPress={() => {
                    const t = newRule.trim();
                    if (!t || draft.rules.length >= 10) return;
                    update({ rules: [...draft.rules, t] });
                    setNewRule("");
                  }}
                >
                  <Text style={{ color: C.blue, fontWeight: "700" }}>Add Rule</Text>
                </Pressable>
              </View>
              <TextInput
                value={newRule}
                onChangeText={setNewRule}
                placeholder="Add a custom rule..."
                placeholderTextColor={C.muted}
                style={s.input}
              />
              {draft.rules.map((rule, i) => (
                <View key={`${rule}-${i}`} style={s.ruleRow}>
                  <Text style={{ flex: 1, color: C.text, fontSize: 14 }}>{rule}</Text>
                  <Pressable onPress={() => update({ rules: draft.rules.filter((_, idx) => idx !== i) })}>
                    <Ionicons name="close" size={18} color={C.muted} />
                  </Pressable>
                </View>
              ))}
            </FormCard>
          )}

          {step === 4 && (
            <View style={s.reviewCard}>
              <View style={{ height: 120 }}>
                <PreviewImage imageKey={draft.bannerUrl} fallback="Banner preview" />
              </View>
              <View style={{ padding: 16 }}>
                <Text style={{ fontSize: 20, fontWeight: "800", color: C.text }}>{draft.name}</Text>
                <Text style={{ color: C.blue, fontWeight: "600", marginTop: 4 }}>{categoryLabel}</Text>
                <Text style={{ color: C.muted, marginTop: 8, lineHeight: 20 }}>{draft.description}</Text>
                <Text style={{ color: C.text, marginTop: 12, fontWeight: "600" }}>
                  {draft.visibility} · {draft.verificationType?.replace(/_/g, " ")}
                </Text>
                <Text style={{ color: C.muted, marginTop: 8 }}>{draft.rules.length} rules</Text>
              </View>
            </View>
          )}
        </ScrollView>

        <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Pressable
            onPress={step < 4 ? () => update({ step: step + 1 }) : handleCreate}
            disabled={!canContinue || (step === 4 && createMut.isPending)}
            style={[s.continueBtn, !canContinue && { opacity: 0.45 }]}
          >
            {createMut.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={s.continueBtnText}>{continueLabel}</Text>
                {step < 4 && <Ionicons name="arrow-forward" size={18} color="#fff" />}
              </>
            )}
          </Pressable>
        </View>
      </View>
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    marginBottom: 8,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: C.text,
    textAlign: "center",
  },
  pageSubtitle: {
    color: C.muted,
    marginTop: 4,
    marginBottom: 20,
    textAlign: "center",
    fontSize: 14,
  },
  formCard: {
    ...C.card,
    ...C.shadow,
    marginBottom: 0,
  },
  cardTitle: { fontWeight: "700", fontSize: 16, color: C.text, marginBottom: 12 },
  fieldLabel: { fontWeight: "600", color: C.text, marginBottom: 8, fontSize: 14 },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: C.text,
    backgroundColor: C.canvas,
    fontSize: 15,
  },
  counter: { textAlign: "right", color: C.muted, fontSize: 11, marginTop: 4 },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  categoryCell: {
    width: "23%",
    minWidth: 72,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: C.canvas,
    position: "relative",
  },
  categoryCellSelected: {
    borderColor: C.blue,
    backgroundColor: "#E8F2FF",
  },
  categoryCheck: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryLabel: { fontSize: 10, marginTop: 6, fontWeight: "600", color: C.text, textAlign: "center" },
  imageUpload: {
    width: 80,
    height: 80,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: C.border,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.canvas,
  },
  uploadHint: { fontSize: 10, color: C.muted, marginTop: 4 },
  stepHeading: { fontSize: 18, fontWeight: "700", color: C.text },
  stepDesc: { color: C.muted, marginBottom: 8, fontSize: 14 },
  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#E8F2FF",
    borderRadius: 12,
    padding: 12,
  },
  infoBannerText: { flex: 1, color: C.text, fontSize: 13 },
  optionCard: {
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    ...C.shadow,
  },
  optionCardSelected: { borderColor: C.blue, backgroundColor: "#F8FBFF" },
  optionIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  optionTitle: { fontWeight: "700", color: C.text, fontSize: 15 },
  optionDesc: { color: C.muted, fontSize: 13, marginTop: 2 },
  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    backgroundColor: C.canvas,
  },
  reviewCard: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: C.surface,
    ...C.shadow,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: C.canvas,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  continueBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.blue,
    borderRadius: 14,
    paddingVertical: 15,
    minHeight: 52,
  },
  continueBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});

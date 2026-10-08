import { useRouter } from "expo-router";
import { useState, useMemo } from "react";
import { ActivityIndicator, Linking, Platform, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol, type IconSymbolName } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/lib/auth-context-v2";
import { track } from "@/lib/analytics";
import { trpc } from "@/lib/trpc";

// ─── Color Constants ─────────────────────────────────────────────────────────
const P = "#1E88FF";
const G = "#16A34A";
const R = "#EF4444";
const A = "#F59E0B";
const V = "#8B5CF6";

const STATUS_CONFIG: Record<string, { label: string; bg: string; fg: string }> = {
  completed: { label: "Completed", bg: G + "20", fg: G },
  pending:   { label: "Pending",   bg: A + "20", fg: A },
  expired:   { label: "Expired",   bg: R + "20", fg: R },
};

const HOW_IT_WORKS: { step: number; icon: IconSymbolName; title: string; desc: string }[] = [
  { step: 1, icon: "square.and.arrow.up", title: "Share your code",  desc: "Send your unique referral code to friends and family" },
  { step: 2, icon: "person.badge.plus",   title: "Friend signs up",  desc: "They create an account using your referral code" },
  { step: 3, icon: "gift.fill",           title: "Both earn $10",    desc: "You both get $10 credit after their first ride" },
];

const TERMS = [
  "Referral rewards are credited once the referred user completes their first ride.",
  "Both the referrer and the referred user receive a $10 credit.",
  "Referral codes expire 30 days after the friend signs up if they haven't completed a ride.",
  "There is no limit to the number of friends you can refer.",
  "Referral credits cannot be exchanged for cash and are non-transferable.",
  "YOO reserves the right to modify or terminate the referral program at any time.",
  "Abuse of the referral system may result in account suspension.",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function generateReferralCode(userId: string): string {
  const base = userId.slice(0, 5).toUpperCase().padEnd(5, "0");
  return `YOO-${base}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

async function copyText(text: string): Promise<void> {
  if (Platform.OS !== "web") {
    await Share.share({ message: text });
    return;
  }
  if (typeof window !== "undefined" && window.navigator?.clipboard) {
    await window.navigator.clipboard.writeText(text);
  }
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function ReferralScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user } = useAuth();
  const [termsExpanded, setTermsExpanded] = useState(false);

  const userId = String(user?.id ?? "");
  const referralCode = useMemo(() => generateReferralCode(userId), [userId]);
  const referralLink = `https://yoo.app/join?ref=${referralCode}`;

  const { data: referrals = [], isLoading } = trpc.user.getMyReferrals.useQuery(undefined, {
    enabled: !!userId,
  });

  type ReferralRow = (typeof referrals)[number];
  const completedCount = referrals.filter((r: ReferralRow) => r.status === "completed").length;
  const pendingCount   = referrals.filter((r: ReferralRow) => r.status === "pending").length;
  const totalEarned    = referrals.reduce((s: number, r: ReferralRow) => s + (r.status === "completed" ? r.amount : 0), 0);

  // ── Share handlers ───────────────────────────────────────────────────────
  const handleCopyCode = async () => {
    await copyText(referralCode);
    if (Platform.OS === "web") window.alert(`Referral code "${referralCode}" copied!`);
  };

  const handleCopyLink = async () => {
    await copyText(referralLink);
    if (Platform.OS === "web") window.alert("Referral link copied!");
  };

  const handleShareText = () => {
    track("referral_shared", { method: "sms" });
    const msg = `Join me on YOO! Use my code ${referralCode} and we both get $10. ${referralLink}`;
    if (Platform.OS === "web") window.open(`sms:?body=${encodeURIComponent(msg)}`, "_blank");
    else Linking.openURL(`sms:?body=${encodeURIComponent(msg)}`);
  };

  const handleShareEmail = () => {
    track("referral_shared", { method: "email" });
    const subject = encodeURIComponent("Join YOO and earn $10!");
    const body = encodeURIComponent(
      `Hey!\n\nI've been using YOO and love it. Use my referral code ${referralCode} when you sign up and we'll both get $10 credit!\n\nSign up here: ${referralLink}\n\nHappy riding!`
    );
    if (Platform.OS === "web") window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
    else Linking.openURL(`mailto:?subject=${subject}&body=${body}`);
  };

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* ── Blue Header ─────────────────────────────────────────────────── */}
        <View style={[s.header, { backgroundColor: P }]}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <IconSymbol name="chevron.left" size={20} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>Back</Text>
          </TouchableOpacity>

          <View style={s.headerContent}>
            <View style={{ flex: 1 }}>
              <Text style={s.headerTitle}>Refer & Earn</Text>
              <Text style={s.headerSubtitle}>Share the ride, share the rewards</Text>
            </View>
            <View style={s.headerIconWrap}>
              <IconSymbol name="gift.fill" size={40} color="rgba(255,255,255,0.9)" />
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: 18, gap: 18, marginTop: -28 }}>
          {/* ── Earnings Card ─────────────────────────────────────────────── */}
          <View style={[s.earningsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.earningsSparkle}><IconSymbol name="sparkles" size={20} color={A} /></View>
            <Text style={{ fontSize: 14, color: colors.muted, fontWeight: "500" }}>{"You've earned"}</Text>
            <Text style={{ fontSize: 44, fontWeight: "800", color: G, marginVertical: 4 }}>
              ${totalEarned.toFixed(2)}
            </Text>
            <Text style={{ fontSize: 14, color: colors.muted }}>from referrals</Text>
          </View>

          {/* ── Referral Code Card ────────────────────────────────────────── */}
          <View style={[s.codeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted, letterSpacing: 1.5 }}>YOUR REFERRAL CODE</Text>
            <View style={s.codeRow}>
              <Text style={s.codeText}>{referralCode}</Text>
              <TouchableOpacity onPress={handleCopyCode} style={[s.copyBtn, { backgroundColor: P + "15" }]}>
                <IconSymbol name="doc.text.fill" size={18} color={P} />
                <Text style={{ color: P, fontWeight: "700", fontSize: 13 }}>Copy</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center" }}>
              Share this code with friends to earn rewards
            </Text>
          </View>

          {/* ── Share Buttons Row ─────────────────────────────────────────── */}
          <View style={s.shareRow}>
            <TouchableOpacity onPress={handleCopyLink} style={[s.shareBtn, { backgroundColor: P + "10" }]}>
              <View style={[s.shareBtnIcon, { backgroundColor: P + "20" }]}>
                <IconSymbol name="doc.text.fill" size={20} color={P} />
              </View>
              <Text style={[s.shareBtnLabel, { color: P }]}>Copy Link</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleShareText} style={[s.shareBtn, { backgroundColor: G + "10" }]}>
              <View style={[s.shareBtnIcon, { backgroundColor: G + "20" }]}>
                <IconSymbol name="message.fill" size={20} color={G} />
              </View>
              <Text style={[s.shareBtnLabel, { color: G }]}>Text</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleShareEmail} style={[s.shareBtn, { backgroundColor: V + "10" }]}>
              <View style={[s.shareBtnIcon, { backgroundColor: V + "20" }]}>
                <IconSymbol name="paperplane.fill" size={20} color={V} />
              </View>
              <Text style={[s.shareBtnLabel, { color: V }]}>Email</Text>
            </TouchableOpacity>
          </View>

          {/* ── How It Works ──────────────────────────────────────────────── */}
          <View style={[s.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[s.sectionTitle, { color: colors.foreground }]}>How it works</Text>
            <View style={{ gap: 20, marginTop: 8 }}>
              {HOW_IT_WORKS.map((item, idx) => (
                <View key={item.step} style={s.stepRow}>
                  <View style={s.stepIndicator}>
                    <View style={[s.stepCircle, { backgroundColor: P }]}>
                      <Text style={s.stepNum}>{item.step}</Text>
                    </View>
                    {idx < HOW_IT_WORKS.length - 1 && (
                      <View style={[s.stepLine, { backgroundColor: P + "30" }]} />
                    )}
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <IconSymbol name={item.icon} size={18} color={P} />
                      <Text style={{ fontWeight: "700", fontSize: 15, color: colors.foreground }}>{item.title}</Text>
                    </View>
                    <Text style={{ fontSize: 13, color: colors.muted, marginLeft: 26 }}>{item.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* ── Stats Grid ───────────────────────────────────────────────── */}
          <View style={s.statsGrid}>
            {[
              { label: "Total Referrals", value: String(referrals.length), color: P },
              { label: "Successful",      value: String(completedCount),   color: G },
              { label: "Pending",         value: String(pendingCount),     color: A },
              { label: "Total Earned",    value: `$${totalEarned.toFixed(0)}`, color: V },
            ].map(stat => (
              <View key={stat.label} style={[s.statItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={{ fontSize: 26, fontWeight: "800", color: stat.color }}>{stat.value}</Text>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2, fontWeight: "500" }}>{stat.label}</Text>
              </View>
            ))}
          </View>

          {/* ── Referral History ──────────────────────────────────────────── */}
          <View style={[s.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[s.sectionTitle, { color: colors.foreground }]}>Referral History</Text>
            {isLoading ? (
              <ActivityIndicator size="small" color={P} style={{ marginVertical: 24 }} />
            ) : referrals.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 28 }}>
                <IconSymbol name="person.2.fill" size={36} color={colors.muted} />
                <Text style={{ color: colors.muted, marginTop: 10, fontSize: 14, fontWeight: "600" }}>No referrals yet</Text>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Share your code to start earning!</Text>
              </View>
            ) : (
              <View style={{ gap: 0, marginTop: 4 }}>
                {referrals.map((entry: (typeof referrals)[number], idx: number) => {
                  const cfg = STATUS_CONFIG[entry.status] ?? STATUS_CONFIG.pending;
                  return (
                    <View key={entry.id} style={[s.historyRow, { borderBottomColor: colors.border, borderBottomWidth: idx < referrals.length - 1 ? 1 : 0 }]}>
                      <View style={[s.historyAvatar, { backgroundColor: P + "15" }]}>
                        <IconSymbol name={entry.status === "completed" ? "person.fill" : "clock.fill"} size={18} color={entry.status === "completed" ? P : A} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ fontWeight: "600", fontSize: 14, color: colors.foreground }}>
                          {entry.referralCode}
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.muted }}>{formatDate(entry.createdAt)}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 4 }}>
                        <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
                          <Text style={{ fontSize: 11, fontWeight: "700", color: cfg.fg }}>{cfg.label}</Text>
                        </View>
                        {entry.amount > 0 && entry.status === "completed" && (
                          <Text style={{ fontSize: 14, fontWeight: "700", color: G }}>+${entry.amount.toFixed(2)}</Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* ── Terms & Conditions ──────────────────────────────────────────── */}
          <View style={[s.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TouchableOpacity onPress={() => setTermsExpanded(!termsExpanded)} style={s.termsHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <IconSymbol name="doc.text.fill" size={18} color={colors.muted} />
                <Text style={{ fontWeight: "600", fontSize: 15, color: colors.foreground }}>Terms & Conditions</Text>
              </View>
              <IconSymbol name={termsExpanded ? "chevron.up" : "chevron.down"} size={18} color={colors.muted} />
            </TouchableOpacity>
            {termsExpanded && (
              <View style={{ gap: 8, marginTop: 14 }}>
                {TERMS.map((term, i) => (
                  <View key={i} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                    <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>{"•"}</Text>
                    <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20, flex: 1 }}>{term}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const centered = { alignItems: "center" as const, justifyContent: "center" as const };
const row = { flexDirection: "row" as const, alignItems: "center" as const };

const s = StyleSheet.create({
  header: { paddingTop: 56, paddingBottom: 48, paddingHorizontal: 20, overflow: "hidden" },
  backBtn: { ...row, gap: 4, marginBottom: 20 },
  headerContent: { ...row, justifyContent: "space-between" },
  headerTitle: { fontSize: 30, fontWeight: "800", color: "#fff" },
  headerSubtitle: { fontSize: 15, color: "rgba(255,255,255,0.8)", marginTop: 4 },
  headerIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(255,255,255,0.15)", ...centered },
  earningsCard: { borderRadius: 16, borderWidth: 1, padding: 24, alignItems: "center", position: "relative", shadowColor: "#000", shadowOpacity: 0.06, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 3 },
  earningsSparkle: { position: "absolute", top: 14, right: 16 },
  codeCard: { borderRadius: 16, borderWidth: 1, padding: 20, alignItems: "center", gap: 12 },
  codeRow: { ...row, gap: 12 },
  codeText: { fontSize: 28, fontWeight: "800", letterSpacing: 3, color: P },
  copyBtn: { ...row, gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  shareRow: { flexDirection: "row", gap: 10 },
  shareBtn: { flex: 1, borderRadius: 14, paddingVertical: 16, alignItems: "center", gap: 8 },
  shareBtnIcon: { width: 40, height: 40, borderRadius: 20, ...centered },
  shareBtnLabel: { fontSize: 13, fontWeight: "700" },
  sectionCard: { borderRadius: 16, borderWidth: 1, padding: 18, shadowColor: "#000", shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 }, shadowRadius: 6, elevation: 2 },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 4 },
  stepRow: { flexDirection: "row", gap: 14 },
  stepIndicator: { alignItems: "center", width: 28 },
  stepCircle: { width: 28, height: 28, borderRadius: 14, ...centered },
  stepNum: { color: "#fff", fontWeight: "800", fontSize: 13 },
  stepLine: { width: 2, flex: 1, marginTop: 4 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statItem: { width: "48%" as unknown as number, flexGrow: 1, flexBasis: "45%" as unknown as number, borderRadius: 14, borderWidth: 1, padding: 16, alignItems: "center" },
  historyRow: { ...row, gap: 12, paddingVertical: 14 },
  historyAvatar: { width: 40, height: 40, borderRadius: 20, ...centered },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  termsHeader: { ...row, justifyContent: "space-between" },
});

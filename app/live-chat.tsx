/**
 * Live Chat — Real-time chat with support agents.
 * States: idle → requesting → waiting → active → ended
 */
import { useRouter, useLocalSearchParams, type Href } from "expo-router";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

const CHAT_CATEGORIES = [
  { value: "general", label: "General", emoji: "💡" },
  { value: "ride_issue", label: "Ride Issue", emoji: "🚗" },
  { value: "payment", label: "Payment", emoji: "💳" },
  { value: "account", label: "Account", emoji: "👤" },
  { value: "technical", label: "Technical", emoji: "🔧" },
  { value: "safety", label: "Safety", emoji: "🛡️" },
  { value: "driver_support", label: "Driver Support", emoji: "🧑‍✈️" },
  { value: "other", label: "Other", emoji: "📌" },
] as const;

const STATUS_LABELS: Record<string, string> = {
  waiting: "Waiting", active: "Active", ended: "Ended", missed: "Missed", rejected: "Rejected",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function LiveChatScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const paramSessionId = params.sessionId as string | undefined;

  const [activeSessionId, setActiveSessionId] = useState<string | null>(paramSessionId || null);
  const [category, setCategory] = useState<string>("general");
  const [issueDesc, setIssueDesc] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);
  const [rating, setRating] = useState(0);
  const [ratingFeedback, setRatingFeedback] = useState("");
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const flatListRef = useRef<any>(null);
  const utils = trpc.useUtils();

  // ── Queries
  const { data: sessions = [] } = trpc.liveChat.getMySessions.useQuery(undefined, {
    refetchInterval: 8000,
  });

  const { data: sessionDetail, refetch: refetchDetail } = trpc.liveChat.getSessionDetail.useQuery(
    { sessionId: activeSessionId! },
    {
      enabled: !!activeSessionId,
      refetchInterval: activeSessionId ? 2000 : false,
    },
  );

  // ── Mutations
  const requestChatMut = trpc.liveChat.requestChat.useMutation();
  const sendMessageMut = trpc.liveChat.sendMessage.useMutation();
  const endChatMut = trpc.liveChat.endChat.useMutation();
  const rateChatMut = trpc.liveChat.rateChat.useMutation();

  // Auto-detect active session on mount
  useEffect(() => {
    if (!paramSessionId && sessions.length > 0) {
      const active = (sessions as any[]).find(
        (s: any) => s.status === "waiting" || s.status === "active",
      );
      if (active) setActiveSessionId(active.sessionId);
    }
  }, [sessions, paramSessionId]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (sessionDetail?.messages?.length) {
      setTimeout(() => flatListRef.current?.scrollToEnd?.({ animated: true }), 200);
    }
  }, [sessionDetail?.messages?.length]);

  const currentSession = sessionDetail as any;
  const sessionStatus = currentSession?.status;

  // ── Handlers
  const handleStartChat = useCallback(async () => {
    if (issueDesc.trim().length < 5) {
      if (Platform.OS === "web") alert("Please describe your issue (min 5 characters).");
      return;
    }
    setStarting(true);
    try {
      const result = await requestChatMut.mutateAsync({
        category: category as any,
        issueDescription: issueDesc.trim(),
      });
      setActiveSessionId((result as any).session.sessionId);
      utils.liveChat.getMySessions.invalidate();
    } catch (err: any) {
      if (Platform.OS === "web") alert(err.message || "Failed to start chat.");
    } finally {
      setStarting(false);
    }
  }, [category, issueDesc, requestChatMut, utils]);

  const handleSend = useCallback(async () => {
    if (!message.trim() || !activeSessionId || sending) return;
    setSending(true);
    try {
      await sendMessageMut.mutateAsync({
        sessionId: activeSessionId,
        content: message.trim(),
      });
      setMessage("");
      refetchDetail();
    } catch (err: any) {
      if (Platform.OS === "web") alert(err.message);
    } finally {
      setSending(false);
    }
  }, [message, activeSessionId, sending, sendMessageMut, refetchDetail]);

  const handleEndChat = useCallback(async () => {
    if (!activeSessionId) return;
    const doEnd = Platform.OS === "web"
      ? confirm("End this chat session?")
      : true; // On mobile we'd use Alert but skip for simplicity
    if (!doEnd) return;
    try {
      await endChatMut.mutateAsync({ sessionId: activeSessionId });
      refetchDetail();
      utils.liveChat.getMySessions.invalidate();
    } catch (err: any) {
      if (Platform.OS === "web") alert(err.message);
    }
  }, [activeSessionId, endChatMut, refetchDetail, utils]);

  const handleRateChat = useCallback(async () => {
    if (!activeSessionId || rating === 0) return;
    try {
      await rateChatMut.mutateAsync({
        sessionId: activeSessionId,
        rating,
        feedback: ratingFeedback.trim() || undefined,
      });
      setRatingSubmitted(true);
    } catch (err: any) {
      if (Platform.OS === "web") alert(err.message);
    }
  }, [activeSessionId, rating, ratingFeedback, rateChatMut]);

  const handleNewChat = useCallback(() => {
    setActiveSessionId(null);
    setCategory("general");
    setIssueDesc("");
    setRating(0);
    setRatingFeedback("");
    setRatingSubmitted(false);
  }, []);

  // ── Renders

  const adminInitial = currentSession?.adminName?.[0] || "A";

  const renderMessage = useCallback(({ item }: { item: any }) => {
    if (item.senderType === "system") {
      return (
        <View style={styles.systemMsg}>
          <Text style={styles.systemMsgText}>{item.content}</Text>
          <Text style={styles.systemMsgTime}>{timeAgo(item.createdAt)}</Text>
        </View>
      );
    }
    const isUser = item.senderType === "user";
    return (
      <View style={[styles.msgRow, isUser ? styles.msgRowRight : styles.msgRowLeft]}>
        {!isUser && (
          <View style={styles.msgAvatar}>
            <Text style={styles.msgAvatarText}>{adminInitial}</Text>
          </View>
        )}
        <View style={[
          styles.msgBubble,
          isUser ? styles.msgBubbleUser : styles.msgBubbleAdmin,
        ]}>
          <Text style={[styles.msgText, { color: isUser ? "#fff" : "#E5E7EB" }]}>{item.content}</Text>
          <Text style={[styles.msgTime, { color: isUser ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.4)" }]}>
            {timeAgo(item.createdAt)}
          </Text>
        </View>
      </View>
    );
  }, [adminInitial]);

  // ═══════════════════════════════════════════════════════════════════════════
  // No active session — Start Chat form
  // ═══════════════════════════════════════════════════════════════════════════
  if (!activeSessionId) {
    return (
      <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Header */}
          <View style={[styles.header, { backgroundColor: "#1E88FF" }]}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <IconSymbol name="chevron.left" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Live Chat</Text>
            <View style={{ width: 32 }} />
          </View>

          {/* Start Chat Card */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.startChatIcon}>
              <Text style={{ fontSize: 40 }}>💬</Text>
            </View>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Chat with Support</Text>
            <Text style={[styles.cardSub, { color: colors.muted }]}>
              Get instant help from our team. Select a category and describe your issue.
            </Text>

            {/* Category */}
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>What do you need help with?</Text>
            <View style={styles.catGrid}>
              {CHAT_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.value}
                  style={[
                    styles.catGridItem,
                    {
                      backgroundColor: category === cat.value ? colors.primary + "15" : colors.background,
                      borderColor: category === cat.value ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setCategory(cat.value)}
                >
                  <Text style={{ fontSize: 20 }}>{cat.emoji}</Text>
                  <Text style={{
                    fontSize: 11, fontWeight: "600", marginTop: 4,
                    color: category === cat.value ? colors.primary : colors.muted,
                  }}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Description */}
            <Text style={[styles.fieldLabel, { color: colors.foreground, marginTop: 14 }]}>Describe your issue</Text>
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Tell us what's going on..."
              placeholderTextColor={colors.muted}
              value={issueDesc}
              onChangeText={setIssueDesc}
              multiline
              numberOfLines={4}
              maxLength={2000}
              textAlignVertical="top"
            />

            {/* Start button */}
            <TouchableOpacity
              style={[styles.startBtn, { opacity: starting ? 0.6 : 1 }]}
              onPress={handleStartChat}
              disabled={starting}
            >
              {starting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <IconSymbol name="bubble.left.fill" size={18} color="#fff" />
                  <Text style={styles.startBtnText}>Start Chat</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Previous Chats */}
          {(sessions as any[]).length > 0 && (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Previous Chats</Text>
              {(sessions as any[]).slice(0, 10).map((s: any) => (
                <TouchableOpacity
                  key={s.sessionId}
                  style={[styles.prevChat, { borderColor: colors.border }]}
                  onPress={() => setActiveSessionId(s.sessionId)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
                      {s.issueDescription}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
                      <View style={[styles.statusDot, {
                        backgroundColor: s.status === "active" ? "#16A34A" :
                          s.status === "waiting" ? "#F59E0B" : "#6B7280",
                      }]} />
                      <Text style={{ fontSize: 11, color: colors.muted }}>
                        {STATUS_LABELS[s.status] ?? s.status} • {timeAgo(s.createdAt)}
                      </Text>
                    </View>
                  </View>
                  <IconSymbol name="chevron.right" size={14} color={colors.muted} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      </ScreenContainer>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Waiting for agent
  // ═══════════════════════════════════════════════════════════════════════════
  if (sessionStatus === "waiting") {
    return (
      <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
        <View style={[styles.header, { backgroundColor: "#1E88FF" }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <IconSymbol name="chevron.left" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Connecting...</Text>
          <View style={{ width: 32 }} />
        </View>

        <View style={styles.waitingContainer}>
          <View style={styles.waitingPulse}>
            <Text style={{ fontSize: 48 }}>💬</Text>
          </View>
          <Text style={[styles.waitingTitle, { color: colors.foreground }]}>
            Connecting you to a support agent
          </Text>
          <Text style={[styles.waitingSub, { color: colors.muted }]}>
            Please wait while we find an available agent. This usually takes less than a minute.
          </Text>

          <View style={[styles.waitingInfoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.waitingInfoRow}>
              <Text style={{ fontSize: 12, color: colors.muted }}>Category</Text>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
                {CHAT_CATEGORIES.find(c => c.value === currentSession?.category)?.label ?? currentSession?.category}
              </Text>
            </View>
            <View style={styles.waitingInfoRow}>
              <Text style={{ fontSize: 12, color: colors.muted }}>Issue</Text>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }} numberOfLines={2}>
                {currentSession?.issueDescription}
              </Text>
            </View>
          </View>

          <ActivityIndicator color={colors.primary} size="large" style={{ marginVertical: 20 }} />

          <TouchableOpacity
            style={[styles.cancelBtn, { borderColor: "#EF4444" }]}
            onPress={handleEndChat}
          >
            <Text style={{ color: "#EF4444", fontSize: 14, fontWeight: "600" }}>Cancel Request</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Ended / Rejected — Clean minimal UI (no chat history)
  // ═══════════════════════════════════════════════════════════════════════════
  if (sessionStatus === "ended" || sessionStatus === "rejected" || sessionStatus === "missed") {
    const ratingLabels = ["", "Poor", "Fair", "Good", "Great", "Excellent!"];
    const isRejected = sessionStatus === "rejected";

    return (
      <ScreenContainer edges={["top", "left", "right", "bottom"]} containerClassName="bg-background">
        {/* Header */}
        <View style={[styles.header, { backgroundColor: isRejected ? "#DC2626" : "#1F2937" }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <IconSymbol name="chevron.left" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isRejected ? "Chat Declined" : "Chat Ended"}
          </Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Icon + Title */}
          <View style={{ alignItems: "center", marginBottom: 32 }}>
            <View style={{
              width: 72, height: 72, borderRadius: 36,
              backgroundColor: isRejected ? "#FEE2E2" : "#DCFCE7",
              alignItems: "center", justifyContent: "center", marginBottom: 16,
            }}>
              <IconSymbol
                name={isRejected ? "xmark.circle.fill" : "checkmark.circle.fill"}
                size={40}
                color={isRejected ? "#DC2626" : "#16A34A"}
              />
            </View>
            <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground, textAlign: "center" }}>
              {isRejected ? "Chat Declined" : "Session Complete"}
            </Text>
            {currentSession?.adminName && !isRejected && (
              <Text style={{ fontSize: 14, color: colors.muted, marginTop: 6 }}>
                Assisted by {currentSession.adminName}
              </Text>
            )}
          </View>

          {isRejected && currentSession?.rejectionReason && (
            <View style={{ padding: 14, backgroundColor: "#FEF2F2", borderRadius: 12, borderWidth: 1, borderColor: "#FECACA", marginBottom: 24 }}>
              <Text style={{ color: "#991B1B", fontSize: 13, textAlign: "center" }}>{currentSession.rejectionReason}</Text>
            </View>
          )}

          {/* Rating Section */}
          {sessionStatus === "ended" && !ratingSubmitted && !currentSession?.rating && (
            <View style={{
              backgroundColor: colors.surface, borderRadius: 20,
              padding: 28, alignItems: "center",
              shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
            }}>
              <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}>
                How was your experience?
              </Text>
              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 24 }}>
                Your feedback helps us improve
              </Text>

              {/* Stars */}
              <View style={{ flexDirection: "row", gap: 16, marginBottom: 8 }}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => setRating(s)}
                    activeOpacity={0.7}
                  >
                    <IconSymbol
                      name={s <= rating ? "star.fill" : "star"}
                      size={40}
                      color={s <= rating ? "#F59E0B" : "#D1D5DB"}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              {rating > 0 && (
                <Text style={{
                  fontSize: 15, fontWeight: "700", marginTop: 6, marginBottom: 20,
                  color: rating >= 4 ? "#16A34A" : rating >= 3 ? "#F59E0B" : "#EF4444",
                }}>
                  {ratingLabels[rating]}
                </Text>
              )}

              {/* Feedback */}
              <TextInput
                style={{
                  width: "100%", borderRadius: 14, borderWidth: 1.5,
                  borderColor: colors.border, backgroundColor: colors.background,
                  color: colors.foreground, padding: 14, fontSize: 14,
                  minHeight: 70, textAlignVertical: "top",
                }}
                placeholder="Additional feedback (optional)"
                placeholderTextColor={colors.muted}
                value={ratingFeedback}
                onChangeText={setRatingFeedback}
                multiline
                maxLength={1000}
              />

              {/* Submit */}
              <TouchableOpacity
                style={{
                  width: "100%", marginTop: 18, paddingVertical: 16,
                  borderRadius: 14, alignItems: "center",
                  backgroundColor: rating > 0 ? "#1A1A2E" : "#CBD5E1",
                }}
                onPress={handleRateChat}
                disabled={rating === 0}
                activeOpacity={0.8}
              >
                <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Submit</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Submitted confirmation */}
          {(ratingSubmitted || currentSession?.rating) && (
            <View style={{
              padding: 24, backgroundColor: "#F0FDF4", borderRadius: 20, alignItems: "center",
            }}>
              <IconSymbol name="checkmark.circle.fill" size={32} color="#16A34A" />
              <Text style={{ color: "#166534", fontSize: 17, fontWeight: "700", marginTop: 10 }}>
                Thank you for your feedback!
              </Text>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 10 }}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <IconSymbol
                    key={s}
                    name={s <= (currentSession?.rating || rating) ? "star.fill" : "star"}
                    size={22}
                    color={s <= (currentSession?.rating || rating) ? "#F59E0B" : "#CBD5E1"}
                  />
                ))}
              </View>
            </View>
          )}

          {/* Action Buttons */}
          <View style={{ flexDirection: "row", gap: 12, marginTop: 28 }}>
            <TouchableOpacity
              style={{
                flex: 1, paddingVertical: 16, borderRadius: 14,
                backgroundColor: "#1E88FF", alignItems: "center",
                flexDirection: "row", justifyContent: "center", gap: 8,
              }}
              onPress={handleNewChat}
              activeOpacity={0.8}
            >
              <IconSymbol name="bubble.left.fill" size={18} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>New Chat</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                flex: 1, paddingVertical: 16, borderRadius: 14,
                backgroundColor: colors.surface, alignItems: "center",
                flexDirection: "row", justifyContent: "center", gap: 8,
                borderWidth: 1.5, borderColor: colors.border,
              }}
              onPress={() => router.push("/help-support" as Href)}
              activeOpacity={0.8}
            >
              <IconSymbol name="questionmark.circle.fill" size={18} color={colors.foreground} />
              <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "600" }}>Help Center</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </ScreenContainer>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Active chat
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
      {/* Header */}
      <View style={[styles.header, { backgroundColor: "#1E88FF" }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <IconSymbol name="chevron.left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={[styles.statusDot, { backgroundColor: "#22C55E" }]} />
            <Text style={styles.headerTitle}>
              {currentSession?.adminName || "Support Agent"}
            </Text>
          </View>
          <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 11 }}>
            {CHAT_CATEGORIES.find(c => c.value === currentSession?.category)?.label ?? "Support"}
          </Text>
        </View>
        <TouchableOpacity onPress={handleEndChat} style={styles.endBtn}>
          <IconSymbol name="xmark" size={16} color="#fff" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 52 : 0}
      >
        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={currentSession?.messages || []}
          keyExtractor={(item: any) => String(item.id)}
          renderItem={renderMessage}
          contentContainerStyle={styles.msgList}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onContentSizeChange={() => flatListRef.current?.scrollToEnd?.({ animated: false })}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 40 }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          }
        />

        {/* Input bar — sits directly above keyboard */}
        <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: Math.max(8, insets.bottom) }]}>
          <TextInput
            style={[styles.chatInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            placeholder="Type a message..."
            placeholderTextColor={colors.muted}
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={5000}
          />
          <TouchableOpacity
            style={[styles.sendBtn, { opacity: !message.trim() || sending ? 0.5 : 1 }]}
            onPress={handleSend}
            disabled={!message.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <IconSymbol name="arrow.up" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

// ─── styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { width: 32, alignItems: "center" },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#fff" },
  endBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center",
  },

  card: {
    marginHorizontal: 16, marginTop: 16, borderRadius: 18, borderWidth: 1, padding: 16,
  },
  cardTitle: { fontSize: 17, fontWeight: "800", marginBottom: 8 },
  cardSub: { fontSize: 13, lineHeight: 19, marginBottom: 16, textAlign: "center" },

  startChatIcon: { alignItems: "center", marginBottom: 12, marginTop: 8 },

  catGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8,
  },
  catGridItem: {
    width: "22.5%", alignItems: "center", paddingVertical: 12,
    borderRadius: 12, borderWidth: 1,
  },

  fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 8 },
  input: {
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14,
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },

  startBtn: {
    backgroundColor: "#1E88FF", borderRadius: 12, paddingVertical: 14,
    alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 12,
  },
  startBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  cancelBtn: {
    borderRadius: 12, paddingVertical: 14, alignItems: "center",
    borderWidth: 1.5,
  },

  prevChat: {
    flexDirection: "row", alignItems: "center", paddingVertical: 12,
    borderBottomWidth: 1,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },

  // Waiting
  waitingContainer: { flex: 1, alignItems: "center", paddingTop: 50, paddingHorizontal: 24 },
  waitingPulse: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center", marginBottom: 20,
  },
  waitingTitle: { fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 8 },
  waitingSub: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  waitingInfoCard: {
    borderRadius: 14, borderWidth: 1, padding: 16, width: "100%", marginTop: 24,
  },
  waitingInfoRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8,
  },

  // Ended
  endedTitle: { fontSize: 20, fontWeight: "800", marginBottom: 8 },
  rejectionCard: {
    marginHorizontal: 16, marginTop: 12, borderRadius: 12, borderWidth: 1, padding: 14,
  },
  starRow: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 12 },

  // Messages
  msgList: { paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 8 },
  msgRow: { marginBottom: 12, flexDirection: "row", alignItems: "flex-end" },
  msgRowRight: { justifyContent: "flex-end" },
  msgRowLeft: { justifyContent: "flex-start" },
  msgAvatar: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: "#4B5563",
    alignItems: "center", justifyContent: "center", marginRight: 6,
  },
  msgAvatarText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  msgBubble: {
    maxWidth: "75%", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10,
  },
  msgBubbleUser: { backgroundColor: "#1E88FF", borderBottomRightRadius: 4 },
  msgBubbleAdmin: { backgroundColor: "#374151", borderBottomLeftRadius: 4 },
  msgText: { fontSize: 14, lineHeight: 20 },
  msgTime: { fontSize: 10, marginTop: 4, textAlign: "right" },
  systemMsg: { alignItems: "center", marginVertical: 8 },
  systemMsgText: { fontSize: 12, color: "#9CA3AF", fontStyle: "italic", textAlign: "center" },
  systemMsgTime: { fontSize: 10, color: "#6B7280", marginTop: 2 },

  // Input bar
  inputBar: {
    flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 12,
    paddingTop: 10, paddingBottom: 10, borderTopWidth: 1, gap: 8,
  },
  chatInput: {
    flex: 1, borderRadius: 22, borderWidth: 1.5, paddingHorizontal: 16,
    paddingVertical: 12, fontSize: 15, maxHeight: 100, minHeight: 44,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: "#1E88FF",
    alignItems: "center", justifyContent: "center",
  },
});

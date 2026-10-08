/**
 * Ticket Detail — chat-like interface for a support ticket conversation.
 */
import { useRouter, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useNotification } from "@/lib/use-notification";
import { trpc } from "@/lib/trpc";

const STATUS_COLORS: Record<string, string> = {
  open: "#1E88FF",
  in_progress: "#F59E0B",
  resolved: "#16A34A",
  closed: "#6B7280",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

const CATEGORY_LABELS: Record<string, string> = {
  ride_issue: "Ride Issue",
  payment: "Payment",
  account: "Account",
  driver: "Driver",
  safety: "Safety",
  app_bug: "App Bug",
  feedback: "Feedback",
  other: "Other",
};

export default function TicketDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const notify = useNotification();
  const params = useLocalSearchParams();
  const ticketId = (params.ticketId as string) || "";
  const flatListRef = useRef<any>(null);

  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const { data, isLoading, refetch } = trpc.support.getTicketDetail.useQuery(
    { ticketId },
    { enabled: !!ticketId, refetchInterval: 10000 },
  );
  const addMessageMut = trpc.support.addMessage.useMutation();
  const closeTicketMut = trpc.support.closeTicket.useMutation();

  const ticket = data?.ticket;
  const messages = (data?.messages ?? []) as any[];

  const isClosed = ticket?.status === "closed" || ticket?.status === "resolved";

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 200);
    }
  }, [messages.length]);

  const handleSend = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    try {
      await addMessageMut.mutateAsync({ ticketId, message: message.trim() });
      setMessage("");
      refetch();
    } catch (err: any) {
      notify.showError(err.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    const doClose = async () => {
      try {
        await closeTicketMut.mutateAsync({ ticketId });
        refetch();
        notify.showSuccess("Ticket closed successfully.");
      } catch (err: any) {
        notify.showError(err.message || "Failed to close ticket.");
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm("Close this ticket? You can still view it but cannot send more messages.")) {
        doClose();
      }
    } else {
      Alert.alert("Close Ticket?", "You can still view it but cannot send more messages.", [
        { text: "Cancel", style: "cancel" },
        { text: "Close", style: "destructive", onPress: doClose },
      ]);
    }
  };

  const renderMessage = ({ item }: { item: any }) => {
    const isUser = item.senderType === "user";
    return (
      <View style={[styles.msgRow, isUser ? styles.msgRowRight : styles.msgRowLeft]}>
        {!isUser && (
          <View style={[styles.adminAvatar, { backgroundColor: colors.primary }]}>
            <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>S</Text>
          </View>
        )}
        <View
          style={[
            styles.msgBubble,
            isUser
              ? { backgroundColor: colors.primary, borderBottomRightRadius: 4 }
              : { backgroundColor: colors.border + "60", borderBottomLeftRadius: 4 },
          ]}
        >
          <Text style={{ fontSize: 14, color: isUser ? "#fff" : colors.foreground, lineHeight: 20 }}>
            {item.message}
          </Text>
          <Text
            style={{
              fontSize: 10,
              color: isUser ? "rgba(255,255,255,0.6)" : colors.muted,
              marginTop: 4,
              textAlign: isUser ? "right" : "left",
            }}
          >
            {item.createdAt ? new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
          </Text>
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (!ticket) {
    return (
      <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <IconSymbol name="chevron.left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Ticket</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 16, color: colors.muted }}>Ticket not found.</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={90}
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <IconSymbol name="chevron.left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
              {ticket.subject}
            </Text>
            <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
              <View style={[styles.badge, { backgroundColor: (STATUS_COLORS[ticket.status] ?? "#6B7280") + "20" }]}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: STATUS_COLORS[ticket.status] ?? "#6B7280" }}>
                  {STATUS_LABELS[ticket.status] ?? ticket.status}
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: colors.primary + "15" }]}>
                <Text style={{ fontSize: 10, fontWeight: "600", color: colors.primary }}>
                  {CATEGORY_LABELS[ticket.category] ?? ticket.category}
                </Text>
              </View>
            </View>
          </View>
          {!isClosed && (
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <IconSymbol name="xmark.circle.fill" size={22} color="#EF4444" />
            </TouchableOpacity>
          )}
          {isClosed && <View style={{ width: 32 }} />}
        </View>

        {/* Closed banner */}
        {isClosed && (
          <View style={[styles.closedBanner, { backgroundColor: "#6B728020" }]}>
            <IconSymbol name="lock.fill" size={14} color="#6B7280" />
            <Text style={{ fontSize: 13, color: "#6B7280", marginLeft: 6, fontWeight: "600" }}>
              This ticket is {ticket.status === "resolved" ? "resolved" : "closed"}.
            </Text>
          </View>
        )}

        {/* Ticket description as first "message" */}
        <FlatList
          ref={flatListRef}
          data={[
            { id: -1, senderType: "user", message: ticket.description, createdAt: ticket.createdAt, isDescription: true },
            ...messages,
          ]}
          keyExtractor={(item: any) => String(item.id)}
          renderItem={({ item }: { item: any }) => {
            if (item.isDescription) {
              return (
                <View style={[styles.descCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: 4 }}>
                    Original Description
                  </Text>
                  <Text style={{ fontSize: 14, color: colors.foreground, lineHeight: 20 }}>
                    {item.message}
                  </Text>
                  <Text style={{ fontSize: 10, color: colors.muted, marginTop: 6 }}>
                    {item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}
                  </Text>
                </View>
              );
            }
            return renderMessage({ item });
          }}
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />

        {/* Input bar */}
        {!isClosed && (
          <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <TextInput
              style={[styles.inputField, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Type a message..."
              placeholderTextColor={colors.muted}
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={5000}
            />
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: sending || !message.trim() ? 0.5 : 1 }]}
              onPress={handleSend}
              disabled={sending || !message.trim()}
            >
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <IconSymbol name="paperplane.fill" size={18} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: 32, alignItems: "center" },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  closeBtn: { width: 32, alignItems: "center" },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },

  closedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },

  descCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },

  msgRow: { marginBottom: 10 },
  msgRowRight: { flexDirection: "row", justifyContent: "flex-end" },
  msgRowLeft: { flexDirection: "row", justifyContent: "flex-start", alignItems: "flex-end", gap: 8 },
  adminAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  msgBubble: {
    maxWidth: "75%",
    borderRadius: 16,
    padding: 12,
  },

  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  inputField: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
});

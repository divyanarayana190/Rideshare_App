/**
 * Chat Screen — Real-time per-ride chat between driver and passenger.
 *
 * Uses tRPC chat.getMessages (polls every 3s) and chat.sendMessage.
 * Resolves the other party's name/phone from the ride data.
 */
import { useRouter, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
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
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context-v2";
import { useRideEvents } from "@/lib/use-ride-events";

export default function ChatScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const myUserId = user?.id ?? 0;

  // Accept either the string rideId (ride_xxx) or pass-through params
  const rideIdParam = (params.rideId as string) || "";

  // Fetch ride data to get numeric id + other party info
  const { data: rideData, isLoading: rideLoading } = trpc.rides.getRide.useQuery(
    { rideId: rideIdParam },
    { enabled: !!rideIdParam },
  );

  const numericRideId = rideData?.id ?? 0;

  // Determine the other party (user.id is string, driverId is number — coerce both)
  const isDriver = Number(myUserId) === Number(rideData?.driverId);
  const otherName = isDriver
    ? (rideData?.passengerInfo?.name ?? "Passenger")
    : (rideData?.driverInfo?.name ?? "Driver");
  const otherPhone = isDriver
    ? (rideData?.passengerInfo?.phone ?? "")
    : (rideData?.driverInfo?.phone ?? "");
  const otherId = isDriver
    ? (rideData?.passengerInfo?.id ?? 0)
    : Number(rideData?.driverInfo?.id ?? 0);

  // Avatar initial
  const avatarInitial = (otherName[0] ?? "?").toUpperCase();

  // Fetch messages (poll every 3s)
  const { data: messagesData } = trpc.chat.getMessages.useQuery(
    { rideId: numericRideId },
    { enabled: numericRideId > 0, refetchInterval: 3_000 },
  );

  // Mark messages as read
  const markReadMut = trpc.chat.markRead.useMutation();
  useEffect(() => {
    if (numericRideId > 0) {
      markReadMut.mutate({ rideId: numericRideId });
    }
  }, [numericRideId, messagesData?.length, markReadMut]);

  const utils = trpc.useUtils();

  const { lastChatMessage } = useRideEvents(numericRideId > 0);
  useEffect(() => {
    if (lastChatMessage && lastChatMessage.rideId === numericRideId) {
      utils.chat.getMessages.invalidate({ rideId: numericRideId });
    }
  }, [lastChatMessage, numericRideId, utils.chat.getMessages]);

  // Send message
  const sendMut = trpc.chat.sendMessage.useMutation();
  const [inputText, setInputText] = useState("");

  const handleSend = () => {
    const text = inputText.trim();
    if (!text || numericRideId === 0 || otherId === 0) return;

    sendMut.mutate(
      { rideId: numericRideId, recipientId: otherId, message: text },
      {
        onSuccess: () => {
          utils.chat.getMessages.invalidate({ rideId: numericRideId });
        },
      },
    );
    setInputText("");
  };

  // Format messages for display
  const displayMessages = (messagesData ?? []).map((msg: { id: number; message: string; senderId: number; createdAt: string }) => ({
    id: String(msg.id),
    message: msg.message,
    isMe: Number(msg.senderId) === Number(myUserId),
    timestamp: new Date(msg.createdAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));

  const flatListRef = useRef<typeof FlatList.prototype>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (displayMessages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [displayMessages.length]);

  if (rideLoading) {
    return (
      <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: "#1E88FF" }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <IconSymbol name="chevron.left.forwardslash.chevron.right" size={20} color="#fff" />
        </TouchableOpacity>

        {/* Avatar circle */}
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{avatarInitial}</Text>
        </View>

        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.headerName}>{otherName}</Text>
          {otherPhone ? (
            <View style={styles.headerPhoneRow}>
              <IconSymbol name="phone.fill" size={10} color="rgba(255,255,255,0.8)" />
              <Text style={styles.headerPhone}>{otherPhone}</Text>
            </View>
          ) : (
            <Text style={styles.headerOnline}>Online</Text>
          )}
        </View>

        {otherPhone ? (
          <TouchableOpacity
            style={styles.headerActionBtn}
            onPress={() => {
              Linking.openURL(`tel:${otherPhone}`);
            }}
          >
            <IconSymbol name="phone.fill" size={18} color="#fff" />
          </TouchableOpacity>
        ) : null}

        <View style={styles.headerBrand}>
          <Text style={{ fontSize: 18 }}>🚗</Text>
        </View>
      </View>

      {/* Messages area with branded background */}
      <View style={{ flex: 1, position: "relative" }}>
        {/* Watermark background */}
        <View style={styles.watermarkContainer} pointerEvents="none">
          <Text style={{ fontSize: 60 }}>🚗</Text>
          <Text style={[styles.watermarkText, { color: colors.border }]}>YOO</Text>
        </View>

        <FlatList
          ref={flatListRef}
          data={displayMessages}
          keyExtractor={(item: { id: string; message: string; isMe: boolean; timestamp: string }) => item.id}
          renderItem={({ item }: { item: { id: string; message: string; isMe: boolean; timestamp: string } }) => (
            <View style={[styles.messageRow, item.isMe ? styles.messageRowMe : styles.messageRowOther]}>
              {/* Other person's avatar on left */}
              {!item.isMe && (
                <View style={[styles.msgAvatar, { backgroundColor: "#e8735a" }]}>
                  <Text style={styles.msgAvatarText}>{avatarInitial}</Text>
                </View>
              )}
              <View
                style={[
                  styles.messageBubble,
                  item.isMe
                    ? { backgroundColor: "#1E88FF", borderBottomRightRadius: 4 }
                    : { backgroundColor: colors.surface, borderBottomLeftRadius: 4, borderColor: colors.border, borderWidth: 1 },
                ]}
              >
                <Text style={{ color: item.isMe ? "#fff" : colors.foreground, fontSize: 14, lineHeight: 20 }}>
                  {item.message}
                </Text>
                <Text
                  style={{
                    color: item.isMe ? "rgba(255,255,255,0.6)" : colors.muted,
                    fontSize: 10,
                    marginTop: 4,
                    textAlign: "right",
                  }}
                >
                  {item.timestamp}
                </Text>
              </View>
            </View>
          )}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <IconSymbol name="message.fill" size={32} color="#1E88FF" />
              </View>
              <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "600", marginTop: 12 }}>
                Start the conversation
              </Text>
              <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
                Send a message to {otherName}
              </Text>
            </View>
          }
        />
      </View>

      {/* Input bar */}
      <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TextInput
          value={inputText}
          onChangeText={setInputText}
          placeholder={`Message ${otherName}...`}
          placeholderTextColor={colors.muted}
          style={[
            styles.input,
            { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border },
          ]}
          multiline
          maxLength={500}
          returnKeyType="send"
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: inputText.trim() ? "#1E88FF" : colors.muted }]}
          onPress={handleSend}
          disabled={!inputText.trim() || sendMut.isPending}
        >
          {sendMut.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <IconSymbol name="paperplane.fill" size={18} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
  },
  avatarText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  headerName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  headerPhoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  headerPhone: {
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
  },
  headerOnline: {
    fontSize: 12,
    color: "#6ee7b7",
    marginTop: 2,
  },
  headerActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  headerBrand: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  watermarkContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.08,
  },
  watermarkText: {
    fontSize: 48,
    fontWeight: "900",
    letterSpacing: 4,
  },
  messageRow: {
    flexDirection: "row",
    marginVertical: 4,
    alignItems: "flex-end",
  },
  messageRowMe: { justifyContent: "flex-end" },
  messageRowOther: { justifyContent: "flex-start" },
  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  msgAvatarText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  messageBubble: {
    maxWidth: "75%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(26,115,232,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
    borderWidth: 1,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
});

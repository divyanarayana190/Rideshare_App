/**
 * Carpool Group Chat
 * Real-time group chat for all participants in a P2P shared ride.
 * Polls every 3 s and broadcasts to all approved members via the
 * existing ride-scoped chat.getMessages / chat.sendMessage APIs.
 */
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth } from "@/lib/auth-context-v2";
import { trpc } from "@/lib/trpc";

// ─── Tokens ───────────────────────────────────────────────────────────────────
const BG     = "#05071A";
const LAYER  = "#0D1230";
const CARD   = "#121838";
const BORD   = "rgba(80,110,255,0.14)";
const DIVID  = "rgba(255,255,255,0.06)";
const TX     = "#FFFFFF";
const TX2    = "rgba(255,255,255,0.60)";
const TX3    = "rgba(255,255,255,0.30)";
const BLUE   = "#3D74FF";
const GREEN  = "#00D166";
const AMBER  = "#F5A623";
const VIOLET = "#9B6DFF";

const AVATAR_COLORS = [BLUE, GREEN, "#F062B0", AMBER, VIOLET, "#0EA5E9", "#10B981"];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}
function timeStr(iso: string) {
  const d = new Date(iso);
  const h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m < 10 ? "0" : ""}${m} ${ampm}`;
}
function useDepartureCountdown(iso: string | null | undefined) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    if (!iso) return;
    const update = () => {
      const diff = Math.floor((new Date(iso).getTime() - Date.now()) / 1000);
      if (diff <= 0) { setLabel("Departing now"); return; }
      if (diff < 60)   { setLabel(`${diff}s`); return; }
      if (diff < 3600) { setLabel(`${Math.floor(diff / 60)}m ${diff % 60}s`); return; }
      const h = Math.floor(diff / 3600), mn = Math.floor((diff % 3600) / 60);
      setLabel(`${h}h ${mn}m`);
    };
    update();
    const id = setInterval(update, 5000);
    return () => clearInterval(id);
  }, [iso]);
  return label;
}

// ─── Participant Avatars Bar ───────────────────────────────────────────────────
function ParticipantBar({ participants }: { participants: { name: string; isOrganizer?: boolean }[] }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: LAYER, borderBottomWidth: 1, borderBottomColor: DIVID }}>
      <View style={{ flexDirection: "row" }}>
        {participants.slice(0, 5).map((p, i) => {
          const c = avatarColor(p.name);
          return (
            <View key={i} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c + "30", borderWidth: 2, borderColor: c, alignItems: "center", justifyContent: "center", marginLeft: i === 0 ? 0 : -8 }}>
              <Text style={{ fontSize: 11, fontWeight: "800", color: c }}>{p.name.charAt(0).toUpperCase()}</Text>
            </View>
          );
        })}
      </View>
      <Text style={{ fontSize: 12, color: TX2, flex: 1 }}>
        {participants.length} members · {participants.find(p => p.isOrganizer)?.name ?? "Organizer"} posted
      </Text>
    </View>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────
function MessageBubble({
  msg, isMe, senderName,
}: {
  msg: { message: string; createdAt: string; senderId: number };
  isMe: boolean;
  senderName: string;
}) {
  const color = avatarColor(senderName);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, marginBottom: 10, justifyContent: isMe ? "flex-end" : "flex-start" }}>
      {!isMe && (
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: color + "30", borderWidth: 1.5, borderColor: color, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 11, fontWeight: "800", color }}>{senderName.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={{ maxWidth: "75%" }}>
        {!isMe && (
          <Text style={{ fontSize: 10, color, fontWeight: "700", marginBottom: 3, marginLeft: 4 }}>{senderName}</Text>
        )}
        <View style={[st.bubble, isMe ? st.bubbleMe : st.bubbleThem]}>
          <Text style={{ fontSize: 14, color: isMe ? "#fff" : TX, lineHeight: 20 }}>{msg.message}</Text>
        </View>
        <Text style={{ fontSize: 10, color: TX3, marginTop: 2, textAlign: isMe ? "right" : "left", marginHorizontal: 4 }}>
          {timeStr(msg.createdAt)}
        </Text>
      </View>
      {isMe && (
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: BLUE + "30", borderWidth: 1.5, borderColor: BLUE, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 11, fontWeight: "800", color: BLUE }}>{senderName.charAt(0).toUpperCase()}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Pinned Info Banner ───────────────────────────────────────────────────────
function PinnedBanner({ pickup, depTime, countdown }: { pickup: string; depTime: string; countdown: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <TouchableOpacity
      onPress={() => setExpanded(e => !e)}
      style={{ backgroundColor: BLUE + "12", borderBottomWidth: 1, borderBottomColor: BLUE + "25", paddingHorizontal: 16, paddingVertical: 10 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <IconSymbol name="mappin.circle.fill" size={14} color={BLUE} />
        <Text style={{ flex: 1, fontSize: 12, fontWeight: "700", color: BLUE }}>
          Meet at: {pickup.split(",")[0]} · {countdown ? `Departs in ${countdown}` : depTime}
        </Text>
        <IconSymbol name={expanded ? "chevron.up" : "chevron.down"} size={11} color={BLUE} />
      </View>
      {expanded && (
        <View style={{ marginTop: 8, gap: 5 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
            <IconSymbol name="location.fill" size={11} color={TX2} />
            <Text style={{ fontSize: 12, color: TX2, flex: 1 }}>{pickup}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
            <IconSymbol name="clock.fill" size={11} color={AMBER} />
            <Text style={{ fontSize: 12, color: AMBER }}>{depTime}</Text>
          </View>
          <Text style={{ fontSize: 11, color: TX3, marginTop: 2 }}>
            {'Tap "View Ride" to track live departure status.'}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function CarpoolChatScreen() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const { user } = useAuth();
  const myUserId = user?.id ?? 0;
  const flatRef  = useRef<{ scrollToEnd: (params?: { animated?: boolean }) => void }>(null);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  // Load ride + passengers
  const { data: detail } = trpc.carpool.getCarpoolDetail.useQuery(
    { rideId: rideId ?? "" },
    { enabled: !!rideId, staleTime: 30_000 }
  );

  // Load messages — poll every 3 s
  const { data: rideData } = trpc.rides.getRide.useQuery(
    { rideId: rideId ?? "" },
    { enabled: !!rideId }
  );
  const numericRideId = rideData?.id ?? 0;

  const { data: messages = [], refetch } = trpc.chat.getMessages.useQuery(
    { rideId: numericRideId },
    { enabled: numericRideId > 0, refetchInterval: 3000, staleTime: 0 }
  );

  const sendMut = trpc.chat.sendMessage.useMutation();
  const markRead = trpc.chat.markRead.useMutation();

  const countdown = useDepartureCountdown(detail?.ride?.departureTime);

  // Build participant name map
  const participantNames: Record<number, string> = {};
  if (detail) {
    participantNames[detail.driver.id] = detail.driver.name;
    (detail.passengers ?? []).forEach((p: any) => {
      participantNames[p.id ?? p.passengerId] = p.name ?? p.passengerName ?? "Passenger";
    });
  }

  const myName = user?.name ?? participantNames[Number(myUserId)] ?? "You";

  // Participants list for header
  const participants = Object.entries(participantNames).map(([id, name]) => ({
    name,
    isOrganizer: Number(id) === detail?.driver.id,
  }));

  // Mark read on mount + on new messages
  useEffect(() => {
    if (numericRideId > 0) markRead.mutate({ rideId: numericRideId });
  }, [numericRideId, messages.length, markRead]);

  // Scroll to bottom on new messages
  const messageCount = (messages as any[]).length;
  useEffect(() => {
    if (messageCount > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messageCount]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !numericRideId) return;
    setSending(true);
    try {
      // Broadcast to organizer as "recipient" (group pattern: all msgs per rideId are visible to all)
      const recipientId = detail?.driver.id === Number(myUserId)
        ? (detail?.passengers?.[0] as any)?.id ?? detail?.driver.id
        : detail?.driver.id ?? Number(myUserId);

      await sendMut.mutateAsync({ rideId: numericRideId, recipientId, message: trimmed });
      setText("");
      refetch();
    } catch {}
    setSending(false);
  };

  const depTime = detail?.ride?.departureTime
    ? new Date(detail.ride.departureTime).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <View style={{ flex: 1, backgroundColor: BG, paddingTop: insets.top }}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: LAYER, borderBottomWidth: 1, borderBottomColor: DIVID, gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()} style={st.iconBtn}>
          <IconSymbol name="arrow.left" size={18} color={TX2} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: TX }}>
            {(detail?.ride as any)?.carpoolTitle ?? "Group Chat"}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN }} />
            <Text style={{ fontSize: 11, color: TX2 }}>{participants.length} members · Live</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => router.push(`/carpool-detail?rideId=${rideId}` as Href)}
          style={[st.iconBtn, { backgroundColor: BLUE + "18", borderColor: BLUE + "40" }]}
        >
          <IconSymbol name="info.circle.fill" size={16} color={BLUE} />
        </TouchableOpacity>
      </View>

      {/* Participants bar */}
      {participants.length > 0 && <ParticipantBar participants={participants} />}

      {/* Pinned meetup banner */}
      {detail?.ride && (detail.ride as any).pickupAddress && (
        <PinnedBanner
          pickup={(detail.ride as any).pickupAddress ?? ""}
          depTime={depTime}
          countdown={countdown}
        />
      )}

      {/* Messages */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatRef}
          data={messages as any[]}
          keyExtractor={(item: any) => item.messageId ?? item.id ?? String(Math.random())}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16, gap: 2 }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 40, gap: 10 }}>
              <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: BLUE + "14", alignItems: "center", justifyContent: "center" }}>
                <IconSymbol name="bubble.left.and.bubble.right.fill" size={26} color={BLUE + "70"} />
              </View>
              <Text style={{ fontSize: 16, fontWeight: "800", color: TX2 }}>Start the conversation</Text>
              <Text style={{ fontSize: 13, color: TX3, textAlign: "center", maxWidth: 240, lineHeight: 19 }}>
                Coordinate your pickup, share your ETA, or just say hello to your co-riders.
              </Text>
            </View>
          }
          renderItem={({ item }: { item: any }) => {
            const isMe = Number(item.senderId) === Number(myUserId);
            const name = isMe ? myName : (participantNames[Number(item.senderId)] ?? "Passenger");
            return <MessageBubble msg={item} isMe={isMe} senderName={name} />;
          }}
        />

        {/* Input bar */}
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 14, paddingVertical: 10, paddingBottom: Math.max(insets.bottom, 10), backgroundColor: LAYER, borderTopWidth: 1, borderTopColor: DIVID }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Message the group…"
            placeholderTextColor={TX3}
            multiline
            maxLength={1000}
            onSubmitEditing={handleSend}
            style={[st.input, { flex: 1 }]}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!text.trim() || sending}
            style={[st.sendBtn, { opacity: text.trim() && !sending ? 1 : 0.4 }]}
          >
            {sending
              ? <ActivityIndicator color="#fff" size="small" />
              : <IconSymbol name="arrow.up" size={16} color="#fff" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const st = StyleSheet.create({
  bubble: {
    borderRadius: 16, paddingHorizontal: 13, paddingVertical: 9,
    maxWidth: 280,
  },
  bubbleMe: {
    backgroundColor: BLUE, borderBottomRightRadius: 4,
  },
  bubbleThem: {
    backgroundColor: CARD, borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: BORD,
  },
  input: {
    backgroundColor: CARD, borderWidth: 1.5, borderColor: BORD, borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: TX,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: BLUE,
    alignItems: "center", justifyContent: "center",
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: BORD, alignItems: "center", justifyContent: "center",
  },
});

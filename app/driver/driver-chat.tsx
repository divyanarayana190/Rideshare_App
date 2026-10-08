import { trpc } from '@/lib/trpc';
import { useChatStore, useRideStore, useToastStore, type ChatMessage } from '@/lib/stores';
import { useRideEvents } from '@/lib/use-ride-events';
import { useAuth } from '@/lib/auth-context-v2';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const C = {
  bg: '#0A0A0A', surface: '#141414', surface2: '#1A1A1A', border: '#1E1E1E',
  green: '#22C55E', blue: '#3B82F6', gray: '#6B7280', white: '#FFFFFF',
};

const EMPTY_MESSAGES: ChatMessage[] = [];

const QUICK_REPLIES = [
  "I'm on my way",
  "Arrived at pickup",
  "Running 2 min late",
  "Please come outside",
  "Got it, thanks!",
];

export default function DriverChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const show = useToastStore((s) => s.show);
  const { user } = useAuth();
  const myUserId = user?.id ?? 0;
  const [text, setText] = useState('');
  const listRef = useRef<InstanceType<typeof FlatList>>(null);

  const rideFromStore = useRideStore((s) => s.acceptedRides.find((r) => r.rideId === rideId));
  const messages = useChatStore((s) => s.messages[rideId] ?? EMPTY_MESSAGES);
  const addMessage = useChatStore((s) => s.addMessage);

  // Resolve numeric rideId and passengerId from backend (rideId param is a string like "ride_xxx")
  const { data: rideData } = trpc.rides.getRide.useQuery({ rideId }, { enabled: !!rideId });
  const numericRideId = rideData?.id ?? 0;
  const passengerId = rideData?.passengerInfo?.id ?? rideFromStore?.passengerId ?? 0;
  const passengerName =
    rideData?.passengerInfo?.name ?? rideFromStore?.passengerName ?? 'Passenger';

  const utils = trpc.useUtils();

  const { data: chatData } = trpc.chat.getMessages.useQuery(
    { rideId: numericRideId },
    { enabled: numericRideId > 0, refetchInterval: 3_000 },
  );

  // Instantly refetch when SSE delivers a chat_message for this ride
  const { lastChatMessage } = useRideEvents(numericRideId > 0);
  React.useEffect(() => {
    if (lastChatMessage && lastChatMessage.rideId === numericRideId) {
      utils.chat.getMessages.invalidate({ rideId: numericRideId });
    }
  }, [lastChatMessage, numericRideId, utils.chat.getMessages]);

  React.useEffect(() => {
    if (!chatData) return;
    const current = useChatStore.getState().messages[rideId] ?? [];
    for (const m of chatData) {
      if (!current.find((msg) => msg.id === String(m.id))) {
        addMessage(rideId, {
          id: String(m.id),
          senderId: String(m.senderId),
          text: (m as any).message ?? '',
          ts: new Date((m as any).createdAt ?? Date.now()).getTime(),
          isMe: Number(m.senderId) === Number(myUserId),
        });
      }
    }
  }, [chatData, rideId, addMessage, myUserId]);

  const sendMsg = trpc.chat.sendMessage.useMutation();

  const handleSend = async (content?: string) => {
    const msg = content ?? text.trim();
    if (!msg) return;
    setText('');

    const tempId = `temp-${Date.now()}`;
    addMessage(rideId, {
      id: tempId,
      senderId: 'me',
      text: msg,
      ts: Date.now(),
      isMe: true,
    });

    if (numericRideId > 0 && passengerId > 0) {
      try {
        await sendMsg.mutateAsync({ rideId: numericRideId, recipientId: passengerId, message: msg });
      } catch (err: any) {
        show(err?.message ?? 'Failed to send', 'error');
      }
    }
  };

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const all = [...messages].sort((a, b) => a.ts - b.ts);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      {/* Navbar */}
      <View style={s.navbar}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.white} />
        </Pressable>
        <View style={s.navCenter}>
          <View style={s.avatarSmall}>
            <Text style={s.avatarSmallText}>{passengerName[0].toUpperCase()}</Text>
          </View>
          <View>
            <Text style={s.navName}>{passengerName}</Text>
            <Text style={s.navSub}>Ride Chat</Text>
          </View>
        </View>
        <View style={{ width: 34 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        <FlatList
          ref={listRef}
          data={all}
          keyExtractor={(m: ChatMessage) => m.id}
          contentContainerStyle={s.msgList}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }: { item: ChatMessage }) => (
            <View style={[s.msgRow, item.isMe && s.msgRowMe]}>
              {!item.isMe && (
                <View style={s.msgAvatar}>
                  <Text style={s.msgAvatarText}>{passengerName[0].toUpperCase()}</Text>
                </View>
              )}
              <View style={[s.bubble, item.isMe ? s.bubbleMe : s.bubbleThem]}>
                <Text style={[s.bubbleText, item.isMe && s.bubbleTextMe]}>{item.text}</Text>
                <Text style={s.bubbleTime}>
                  {new Date(item.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            </View>
          )}
          ListEmptyComponent={() => (
            <View style={s.emptyChat}>
              <Ionicons name="chatbubbles-outline" size={32} color={C.gray} />
              <Text style={s.emptyChatText}>No messages yet</Text>
            </View>
          )}
        />

        {/* Quick replies */}
        <View style={s.quickRow}>
          {QUICK_REPLIES.map((r) => (
            <Pressable key={r} style={s.quickPill} onPress={() => handleSend(r)}>
              <Text style={s.quickText}>{r}</Text>
            </Pressable>
          ))}
        </View>

        {/* Input */}
        <View style={[s.inputRow, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <TextInput
            style={s.input}
            value={text}
            onChangeText={setText}
            placeholder="Type a message…"
            placeholderTextColor={C.gray}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={() => handleSend()}
          />
          <Pressable
            style={[s.sendBtn, !text.trim() && s.sendBtnDisabled]}
            onPress={() => handleSend()}
            disabled={!text.trim()}
          >
            <Ionicons name="send" size={18} color={text.trim() ? '#000' : C.gray} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: C.bg },
  navbar:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn:        { padding: 6, borderRadius: 12, backgroundColor: C.surface },
  navCenter:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarSmall:    { width: 34, height: 34, borderRadius: 17, backgroundColor: C.green + '22', alignItems: 'center', justifyContent: 'center' },
  avatarSmallText:{ fontSize: 14, fontWeight: '700', color: C.green },
  navName:        { fontSize: 15, fontWeight: '700', color: C.white },
  navSub:         { fontSize: 11, color: C.gray },
  msgList:        { padding: 16, gap: 10, paddingBottom: 8 },
  msgRow:         { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  msgRowMe:       { flexDirection: 'row-reverse' },
  msgAvatar:      { width: 28, height: 28, borderRadius: 14, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  msgAvatarText:  { fontSize: 11, fontWeight: '700', color: C.gray },
  bubble:         { maxWidth: '75%', borderRadius: 16, padding: 10, gap: 3 },
  bubbleMe:       { backgroundColor: C.green, borderBottomRightRadius: 4 },
  bubbleThem:     { backgroundColor: C.surface, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: C.border },
  bubbleText:     { fontSize: 14, color: C.white, lineHeight: 20 },
  bubbleTextMe:   { color: '#000' },
  bubbleTime:     { fontSize: 10, color: 'rgba(255,255,255,0.5)', alignSelf: 'flex-end' },
  emptyChat:      { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
  emptyChatText:  { fontSize: 14, color: C.gray },
  quickRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  quickPill:      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  quickText:      { fontSize: 12, color: C.gray },
  inputRow:       { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border },
  input:          { flex: 1, backgroundColor: C.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: C.white, maxHeight: 100, borderWidth: 1, borderColor: C.border },
  sendBtn:        { width: 42, height: 42, borderRadius: 21, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled:{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
});

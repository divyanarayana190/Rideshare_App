import { useToastStore, type ToastType } from '@/lib/stores';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ICON_MAP: Record<ToastType, { name: string; color: string; bg: string; border: string }> = {
  success: { name: 'checkmark-circle', color: '#22C55E', bg: '#0D2818', border: '#1A4029' },
  error:   { name: 'close-circle',     color: '#EF4444', bg: '#3A0A0A', border: '#5A1010' },
  info:    { name: 'information-circle',color: '#3B82F6', bg: '#0D1A40', border: '#1A2A5E' },
  warning: { name: 'warning',           color: '#F97316', bg: '#2A1A00', border: '#3D2700' },
  loading: { name: 'reload',            color: '#60A5FA', bg: '#0D1A40', border: '#1A2A5E' },
};

function ToastItem({ id, message, type }: { id: string; message: string; type: ToastType }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const translateY = useRef(new Animated.Value(-72)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 85, friction: 11 }),
      Animated.timing(opacity,    { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(scale,      { toValue: 1, useNativeDriver: true, tension: 85, friction: 11 }),
    ]).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- opacity, scale, translateY are stable Animated.Value refs

  const { name, color, bg, border } = ICON_MAP[type] ?? ICON_MAP.info;
  const isLoading = type === 'loading';

  return (
    <Animated.View style={[s.toast, { backgroundColor: bg, borderColor: border, transform: [{ translateY }, { scale }], opacity }]}>
      {isLoading
        ? <ActivityIndicator size="small" color={color} style={{ width: 20 }} />
        : <Ionicons name={name as any} size={20} color={color} />}
      <Text style={[s.toastText, { color }]} numberOfLines={2}>{message}</Text>
      {!isLoading && (
        <Pressable onPress={() => dismiss(id)} hitSlop={14}>
          <Ionicons name="close" size={16} color={color} style={{ opacity: 0.55 }} />
        </Pressable>
      )}
    </Animated.View>
  );
}

export function ToastOverlay() {
  const toasts = useToastStore((s) => s.toasts);
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  return (
    <View style={[s.container, { top: insets.top + 8 }]} pointerEvents="box-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} {...t} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  container: { position: 'absolute', left: 16, right: 16, zIndex: 9999, gap: 8 },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12,
    shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  toastText: { flex: 1, fontSize: 14, fontWeight: '600', lineHeight: 19 },
});

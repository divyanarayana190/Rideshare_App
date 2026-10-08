import { useIsFocused } from '@/hooks/use-is-focused';
import { trpc } from '@/lib/trpc';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const C = {
  bg: '#0A0A0A', surface: '#141414', border: '#252525',
  green: '#22C55E', text: '#F9FAFB', textSub: '#9CA3AF', textMuted: '#6B7280',
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const RIDE_TYPES = ['instant', 'scheduled', 'shared'] as const;

export default function DriverScheduleScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isFocused = useIsFocused();
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [selectedDay, setSelectedDay] = useState(1);

  const { data, isLoading, refetch, error } = trpc.driver.getSchedule.useQuery(undefined, {
    enabled: isFocused,
  });
  const migrationRequired =
    error?.data?.code === 'PRECONDITION_FAILED'
    || (error?.message ?? '').includes('database migration');
  const updateSchedule = trpc.driver.updateSchedule.useMutation();
  const addSlot = trpc.driver.addAvailabilitySlot.useMutation();
  const removeSlot = trpc.driver.removeAvailabilitySlot.useMutation();

  const settings = data?.settings;
  const slots = data?.slots ?? [];

  const toggleRideType = (type: (typeof RIDE_TYPES)[number]) => {
    const current = settings?.rideTypesAccepted ?? [...RIDE_TYPES];
    const next = current.includes(type)
      ? current.filter((t: string) => t !== type)
      : [...current, type];
    void updateSchedule.mutateAsync({ rideTypesAccepted: next as ('instant' | 'scheduled' | 'shared')[] }).then(() => refetch());
  };

  const handleAddSlot = () => {
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
      Alert.alert('Invalid time', 'Use HH:MM format (e.g. 09:00).');
      return;
    }
    void addSlot.mutateAsync({
      slotType: 'recurring',
      dayOfWeek: selectedDay,
      startTime,
      endTime,
    }).then(() => refetch());
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </Pressable>
        <Text style={s.title}>My Schedule</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator color={C.green} />
        </View>
      ) : migrationRequired ? (
        <View style={s.center}>
          <Ionicons name="cloud-offline-outline" size={40} color={C.textMuted} />
          <Text style={[s.title, { marginTop: 16, fontSize: 18, textAlign: 'center' }]}>
            Driver schedule is not available yet
          </Text>
          <Text style={[s.empty, { textAlign: 'center', marginTop: 8, paddingHorizontal: 24 }]}>
            Please run database migration: pnpm db:push
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]}>
          <Text style={s.sectionTitle}>Preferences</Text>
          <View style={s.card}>
            <View style={s.rowBetween}>
              <Text style={s.label}>Scheduled rides</Text>
              <Switch
                value={settings?.scheduledRidesEnabled ?? true}
                onValueChange={(v: boolean) => void updateSchedule.mutateAsync({ scheduledRidesEnabled: v }).then(() => refetch())}
                trackColor={{ false: '#333', true: C.green }}
              />
            </View>
            <View style={s.rowBetween}>
              <Text style={s.label}>Max distance (km)</Text>
              <TextInput
                style={s.input}
                keyboardType="numeric"
                defaultValue={String(settings?.maxDistanceKm ?? 25)}
                onEndEditing={(e: { nativeEvent: { text: string } }) => {
                  const n = parseInt(e.nativeEvent.text, 10);
                  if (n > 0) void updateSchedule.mutateAsync({ maxDistanceKm: n }).then(() => refetch());
                }}
              />
            </View>
            <Text style={[s.label, { marginTop: 12 }]}>Ride types accepted</Text>
            <View style={s.chipRow}>
              {RIDE_TYPES.map((type) => {
                const active = (settings?.rideTypesAccepted ?? RIDE_TYPES).includes(type);
                return (
                  <Pressable
                    key={type}
                    style={[s.chip, active && s.chipActive]}
                    onPress={() => toggleRideType(type)}
                  >
                    <Text style={[s.chipText, active && s.chipTextActive]}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Text style={s.sectionTitle}>Weekly availability</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.dayRow}>
            {DAY_LABELS.map((d, i) => (
              <Pressable
                key={d}
                style={[s.dayChip, selectedDay === i && s.dayChipActive]}
                onPress={() => setSelectedDay(i)}
              >
                <Text style={[s.dayChipText, selectedDay === i && s.dayChipTextActive]}>{d}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={s.card}>
            <View style={s.timeRow}>
              <TextInput style={s.timeInput} value={startTime} onChangeText={setStartTime} placeholder="09:00" />
              <Text style={s.toText}>to</Text>
              <TextInput style={s.timeInput} value={endTime} onChangeText={setEndTime} placeholder="17:00" />
            </View>
            <Pressable style={s.addBtn} onPress={handleAddSlot} disabled={addSlot.isPending}>
              <Text style={s.addBtnText}>{addSlot.isPending ? 'Adding…' : 'Add availability slot'}</Text>
            </Pressable>
          </View>

          <Text style={s.sectionTitle}>Your slots</Text>
          {slots.length === 0 ? (
            <Text style={s.empty}>No availability slots yet. Add hours above.</Text>
          ) : (
            slots.map((slot: { slotId: string; slotType: string; dayOfWeek: number | null; startTime: string; endTime: string }) => (
              <View key={slot.slotId} style={s.slotCard}>
                <View style={{ flex: 1 }}>
                  <Text style={s.slotTitle}>
                    {slot.slotType === 'recurring' && slot.dayOfWeek != null
                      ? DAY_LABELS[slot.dayOfWeek]
                      : 'One-time'}
                  </Text>
                  <Text style={s.slotSub}>{slot.startTime} – {slot.endTime}</Text>
                </View>
                <Pressable onPress={() => void removeSlot.mutateAsync({ slotId: slot.slotId }).then(() => refetch())}>
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: C.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, gap: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginTop: 8 },
  card: { backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, gap: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 14, color: C.textSub },
  input: { minWidth: 56, textAlign: 'right', color: C.text, fontWeight: '600', paddingVertical: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#1C1C1C', borderWidth: 1, borderColor: C.border },
  chipActive: { backgroundColor: C.green, borderColor: C.green },
  chipText: { fontSize: 12, fontWeight: '600', color: C.textSub },
  chipTextActive: { color: '#000' },
  dayRow: { gap: 8, paddingVertical: 4 },
  dayChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  dayChipActive: { backgroundColor: C.green, borderColor: C.green },
  dayChipText: { fontSize: 13, fontWeight: '600', color: C.textSub },
  dayChipTextActive: { color: '#000' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timeInput: { flex: 1, backgroundColor: '#1C1C1C', borderRadius: 10, borderWidth: 1, borderColor: C.border, color: C.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, fontWeight: '600' },
  toText: { color: C.textMuted },
  addBtn: { backgroundColor: C.green, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  addBtnText: { fontSize: 14, fontWeight: '700', color: '#000' },
  empty: { color: C.textMuted, fontSize: 14, paddingVertical: 8 },
  slotCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 8 },
  slotTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  slotSub: { fontSize: 12, color: C.textMuted, marginTop: 2 },
});

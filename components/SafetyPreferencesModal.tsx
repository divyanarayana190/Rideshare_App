/**
 * SafetyPreferencesModal — Bottom sheet for shared ride safety preferences
 * Shows driver gender preference, co-rider preference, and seat count selector.
 */
import { useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/lib/auth-context-v2";

export type DriverGenderPref = "no_preference" | "prefer_woman" | "prefer_man";
export type CoRiderPref = "no_preference" | "women_only" | "men_only";

export interface SafetyPreferences {
  driverGenderPref: DriverGenderPref;
  coRiderPref: CoRiderPref;
  seats: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: (prefs: SafetyPreferences) => void;
}

function OptionButton({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: string;
}) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.optionBtn,
        {
          borderColor: selected ? "#7C3AED" : colors.border,
          backgroundColor: selected ? "#7C3AED08" : colors.surface,
          borderWidth: selected ? 2 : 1,
        },
      ]}
    >
      {selected && (
        <IconSymbol name="checkmark.circle.fill" size={20} color="#7C3AED" />
      )}
      {!selected && icon && (
        <IconSymbol name={icon as any} size={18} color={colors.muted} />
      )}
      <Text
        style={[
          styles.optionText,
          { color: selected ? "#7C3AED" : colors.foreground, fontWeight: selected ? "700" : "500" },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function SafetyPreferencesModal({ visible, onClose, onConfirm }: Props) {
  const colors = useColors();
  const { user } = useAuth();
  const isFemale = user?.gender === "female";
  const [driverGenderPref, setDriverGenderPref] = useState<DriverGenderPref>("no_preference");
  const [coRiderPref, setCoRiderPref] = useState<CoRiderPref>("no_preference");
  const [seats, setSeats] = useState(1);

  const handleConfirm = () => {
    onConfirm({ driverGenderPref, coRiderPref, seats });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          {/* Handle bar */}
          <View style={styles.handleBar}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </View>

          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.foreground }]}>
                Safety & Preferences
              </Text>
              <Text style={[styles.subtitle, { color: colors.muted }]}>
                Customize your shared ride
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <IconSymbol name="xmark" size={18} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingBottom: 20 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Driver Gender Preference */}
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.sectionHeader}>
                <View style={[styles.iconCircle, { backgroundColor: "#7C3AED15" }]}>
                  <IconSymbol name="person.fill" size={18} color="#7C3AED" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                    Driver Gender Preference
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    (Optional - helps match you with preferred drivers)
                  </Text>
                </View>
              </View>
              <View style={{ gap: 8, marginTop: 12 }}>
                <OptionButton
                  label="No Preference"
                  selected={driverGenderPref === "no_preference"}
                  onPress={() => setDriverGenderPref("no_preference")}
                />
                {isFemale && (
                  <OptionButton
                    label="Prefer Woman Driver"
                    selected={driverGenderPref === "prefer_woman"}
                    onPress={() => setDriverGenderPref("prefer_woman")}
                    icon="person.fill"
                  />
                )}
                <OptionButton
                  label="Prefer Man Driver"
                  selected={driverGenderPref === "prefer_man"}
                  onPress={() => setDriverGenderPref("prefer_man")}
                  icon="person.fill"
                />
              </View>
            </View>

            {/* Co-Rider Preference */}
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.sectionHeader}>
                <View style={[styles.iconCircle, { backgroundColor: "#1E88FF15" }]}>
                  <IconSymbol name="person.2.fill" size={18} color="#1E88FF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                    Co-Rider Preference
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    (Optional - only applies when booking shared rides)
                  </Text>
                </View>
              </View>
              <View style={{ gap: 8, marginTop: 12 }}>
                <OptionButton
                  label="No Preference"
                  selected={coRiderPref === "no_preference"}
                  onPress={() => setCoRiderPref("no_preference")}
                />
                {isFemale && (
                  <OptionButton
                    label="Prefer Women-Only Ride"
                    selected={coRiderPref === "women_only"}
                    onPress={() => setCoRiderPref("women_only")}
                    icon="person.2.fill"
                  />
                )}
                <OptionButton
                  label="Prefer Men-Only Ride"
                  selected={coRiderPref === "men_only"}
                  onPress={() => setCoRiderPref("men_only")}
                  icon="person.2.fill"
                />
              </View>
            </View>

            {/* Seats Needed */}
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.sectionHeader}>
                <View style={[styles.iconCircle, { backgroundColor: "#16A34A15" }]}>
                  <IconSymbol name="person.3.fill" size={18} color="#16A34A" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                    Seats Needed
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    Maximum 3 seats per booking
                  </Text>
                </View>
              </View>
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  onPress={() => setSeats(Math.max(1, seats - 1))}
                  style={[
                    styles.stepperBtn,
                    {
                      backgroundColor: seats <= 1 ? colors.border + "50" : "#7C3AED15",
                      borderColor: seats <= 1 ? colors.border : "#7C3AED",
                    },
                  ]}
                  disabled={seats <= 1}
                >
                  <IconSymbol name="minus" size={18} color={seats <= 1 ? colors.muted : "#7C3AED"} />
                </TouchableOpacity>

                <View style={styles.stepperValue}>
                  <Text style={[styles.stepperNumber, { color: colors.foreground }]}>{seats}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    {seats === 1 ? "seat" : "seats"}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => setSeats(Math.min(3, seats + 1))}
                  style={[
                    styles.stepperBtn,
                    {
                      backgroundColor: seats >= 3 ? colors.border + "50" : "#7C3AED15",
                      borderColor: seats >= 3 ? colors.border : "#7C3AED",
                    },
                  ]}
                  disabled={seats >= 3}
                >
                  <IconSymbol name="plus" size={18} color={seats >= 3 ? colors.muted : "#7C3AED"} />
                </TouchableOpacity>
              </View>
              {/* Seat indicators */}
              <View style={styles.seatIndicators}>
                {[1, 2, 3].map((s) => (
                  <View key={s} style={{ alignItems: "center", gap: 4 }}>
                    <View
                      style={[
                        styles.seatDot,
                        { backgroundColor: s <= seats ? "#7C3AED" : colors.border },
                      ]}
                    >
                      <IconSymbol name="person.fill" size={14} color={s <= seats ? "#fff" : colors.muted} />
                    </View>
                    <Text style={{ fontSize: 11, color: s <= seats ? "#7C3AED" : colors.muted, fontWeight: "600" }}>
                      {s}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>

          {/* Continue button */}
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={handleConfirm}
              activeOpacity={0.85}
            >
              <IconSymbol name="checkmark.shield.fill" size={20} color="#fff" />
              <Text style={styles.confirmBtnText}>
                Continue with {seats} seat{seats > 1 ? "s" : ""}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    paddingHorizontal: 20,
  },
  handleBar: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  optionBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  optionText: {
    fontSize: 15,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    gap: 24,
  },
  stepperBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperValue: {
    alignItems: "center",
    minWidth: 60,
  },
  stepperNumber: {
    fontSize: 36,
    fontWeight: "800",
  },
  seatIndicators: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
    marginTop: 16,
  },
  seatDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    borderTopWidth: 1,
    paddingVertical: 16,
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#7C3AED",
    borderRadius: 14,
    paddingVertical: 16,
    gap: 8,
  },
  confirmBtnText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
});

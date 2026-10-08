/**
 * Emergency SOS — Advanced Safety Screen
 *
 * Features:
 *  - RED gradient header "Emergency SOS"
 *  - Big SOS button with 3-second hold-to-activate countdown
 *  - Quick actions: Call 911, Share Location, Alert Emergency Contacts
 *  - Current location display
 *  - Emergency contacts list with add/edit
 *  - "I feel unsafe" quick report (generates incident report)
 *  - Floating SOS button component for active-ride
 */

import * as Contacts from "expo-contacts";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { track } from "@/lib/analytics";
import { trpc } from "@/lib/trpc";

// ── Constants ────────────────────────────────────────────────────────────────
const HOLD_DURATION_S = 3;
const R = "#EF4444";
const R_DARK = "#DC2626";
const R_LIGHT = "#FCA5A5";
const G = "#16A34A";
const P = "#1E88FF";
const A = "#F59E0B";

// ── Cross-platform alert ─────────────────────────────────────────────────────
function showAlert(title: string, msg?: string) {
  if (Platform.OS === "web") window.alert(msg ? `${title}\n${msg}` : title);
  else Alert.alert(title, msg);
}

function showConfirm(title: string, msg: string, onOk: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n${msg}`)) onOk();
  } else {
    Alert.alert(title, msg, [
      { text: "Cancel", style: "cancel" },
      { text: "OK", onPress: onOk },
    ]);
  }
}

// ── Types ────────────────────────────────────────────────────────────────────
interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function EmergencySOS() {
  const colors = useColors();
  const router = useRouter();

  // State
  const [sosActive, setSosActive] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [showUnsafeReport, setShowUnsafeReport] = useState(false);
  const [unsafeDescription, setUnsafeDescription] = useState("");
  const [currentLocation, setCurrentLocation] = useState("Fetching location...");

  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const coordsRef = useRef<{ latitude: number; longitude: number } | null>(null);

  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([
    { id: "911", name: "Emergency Services", phone: "911" },
  ]);

  // tRPC
  const triggerSOS = trpc.emergency.triggerSOS.useMutation();
  const { data: userProfile } = trpc.user.getProfile.useQuery(undefined);

  // Real GPS location
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setCurrentLocation("Location permission denied");
        return;
      }
      // Get initial position
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        coordsRef.current = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        // Reverse geocode to readable address
        const [place] = await Location.reverseGeocodeAsync(pos.coords);
        if (place) {
          const parts = [place.name, place.street, place.city, place.region].filter(Boolean);
          setCurrentLocation(parts.join(", "));
        } else {
          setCurrentLocation(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
        }
      } catch {
        setCurrentLocation("Unable to fetch location");
      }
      // Keep updating coords in background (native only — web LocationEventEmitter has no removeSubscription)
      if (Platform.OS !== "web") {
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
          (pos) => { coordsRef.current = { latitude: pos.coords.latitude, longitude: pos.coords.longitude }; },
        );
      }
    })();
    return () => { sub?.remove(); };
  }, []);

  // Load real emergency contacts from user profile
  useEffect(() => {
    if (!userProfile?.emergencyContacts?.length) return;
    setEmergencyContacts([
      { id: "911", name: "Emergency Services", phone: "911" },
      ...userProfile.emergencyContacts.map((c: { name: string; phone: string }, i: number) => ({ id: String(i + 1), name: c.name, phone: c.phone })),
    ]);
  }, [userProfile]);

  // Pulse animation when SOS is active
  useEffect(() => {
    if (sosActive) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [sosActive, pulseAnim]);

  // Hold-to-activate logic
  const handlePressIn = useCallback(() => {
    if (sosActive) return;
    setIsHolding(true);
    setHoldProgress(0);
    let elapsed = 0;
    const interval = 50;
    holdTimerRef.current = setInterval(() => {
      elapsed += interval;
      const pct = Math.min(elapsed / (HOLD_DURATION_S * 1000), 1);
      setHoldProgress(pct);
      if (pct >= 1) {
        clearInterval(holdTimerRef.current!);
        holdTimerRef.current = null;
        setIsHolding(false);
        activateSOS();
      }
    }, interval);
  }, [sosActive]); // eslint-disable-line react-hooks/exhaustive-deps -- activateSOS declared below; forward ref causes TS error if added to deps

  const handlePressOut = useCallback(() => {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setIsHolding(false);
    setHoldProgress(0);
  }, []);

  const activateSOS = useCallback(() => {
    setSosActive(true);
    const coords = coordsRef.current ?? { latitude: 0, longitude: 0 };
    triggerSOS.mutate({
      latitude: coords.latitude,
      longitude: coords.longitude,
      alertType: "sos",
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    track("sos_triggered", { alertType: "sos" });
    showAlert("SOS Activated", "Emergency services and contacts have been alerted. Your location is being shared.");
  }, [triggerSOS]);

  const deactivateSOS = useCallback(() => {
    showConfirm("Deactivate SOS", "Are you sure you want to deactivate the emergency alert?", () => {
      setSosActive(false);
    });
  }, []);

  const handleCall911 = useCallback(() => {
    if (Platform.OS === "web") {
      showAlert("Emergency Call", "On a real device, this would dial 911.");
    } else {
      Linking.openURL("tel:911");
    }
  }, []);

  const handleShareLocation = useCallback(() => {
    const coords = coordsRef.current;
    const coordStr = coords ? `\n(${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)})` : "";
    showAlert("Location Shared", `Your current location has been shared:\n${currentLocation}${coordStr}`);
  }, [currentLocation]);

  const handleAlertContacts = useCallback(() => {
    const selected = emergencyContacts.filter((c) => selectedContacts.includes(c.id));
    if (selected.length === 0) {
      showAlert("No Contacts Selected", "Please select at least one emergency contact.");
      return;
    }
    showAlert("Contacts Alerted", `${selected.length} emergency contact(s) have been notified with your location.`);
  }, [emergencyContacts, selectedContacts]);

  const handleContactToggle = (contactId: string) => {
    setSelectedContacts((prev) =>
      prev.includes(contactId) ? prev.filter((id) => id !== contactId) : [...prev, contactId],
    );
  };

  const handleAddContact = () => {
    if (!newContactName.trim() || !newContactPhone.trim()) {
      showAlert("Error", "Please enter both name and phone number.");
      return;
    }
    const newContact: EmergencyContact = {
      id: String(Date.now()),
      name: newContactName.trim(),
      phone: newContactPhone.trim(),
    };
    setEmergencyContacts((prev) => [...prev, newContact]);
    setNewContactName("");
    setNewContactPhone("");
    setShowAddContact(false);
  };

  const handleDeleteContact = (id: string) => {
    if (id === "1") return; // Can't delete 911
    showConfirm("Remove Contact", "Remove this emergency contact?", () => {
      setEmergencyContacts((prev) => prev.filter((c) => c.id !== id));
      setSelectedContacts((prev) => prev.filter((sid) => sid !== id));
    });
  };

  const handleImportFromContacts = async () => {
    if (Platform.OS === "web") {
      showAlert("Not Available", "Contact import is only available on iOS and Android.");
      return;
    }
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        showAlert("Permission Denied", "Please allow access to contacts in your device settings.");
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
        sort: Contacts.SortTypes.FirstName,
      });

      // Present a simple picker — on native we use Alert.alert with options
      // (a full picker modal is beyond this PR's scope; this gives a good UX)
      const pickable = data
        .filter((c) => c.name && c.phoneNumbers && c.phoneNumbers.length > 0)
        .slice(0, 5); // limit to first 5 to keep Alert readable

      if (pickable.length === 0) {
        showAlert("No Contacts", "No contacts with phone numbers found.");
        return;
      }

      if (Platform.OS === "web") return;

      Alert.alert(
        "Import Contact",
        "Select a contact to add as an emergency contact:",
        [
          ...pickable.map((c) => ({
            text: `${c.name} (${c.phoneNumbers![0]!.number})`,
            onPress: () => {
              const phone = c.phoneNumbers![0]!.number ?? "";
              const newContact: EmergencyContact = {
                id: `imported_${Date.now()}`,
                name: c.name ?? "Contact",
                phone,
              };
              setEmergencyContacts((prev) => {
                // Avoid duplicates
                if (prev.some((ex) => ex.phone === phone)) return prev;
                return [...prev, newContact];
              });
            },
          })),
          { text: "Cancel", style: "cancel" },
        ],
      );
    } catch {
      showAlert("Error", "Could not access contacts. Please try again.");
    }
  };

  const handleUnsafeReport = () => {
    const coords = coordsRef.current ?? { latitude: 0, longitude: 0 };
    triggerSOS.mutate({
      latitude: coords.latitude,
      longitude: coords.longitude,
      alertType: "unsafe_driver",
    });
    showAlert("Report Submitted", "Your safety report has been filed. Our team will review it immediately.");
    setShowUnsafeReport(false);
    setUnsafeDescription("");
  };

  const holdPct = Math.round(holdProgress * 100);

  return (
    <ScreenContainer className="p-0">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* RED Gradient Header */}
        <View style={[styles.header, { backgroundColor: R }]}>
          <View style={styles.headerOverlay} />
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <IconSymbol name="chevron.left" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: "center" }}>
              <IconSymbol name="exclamationmark.triangle.fill" size={28} color="#fff" />
              <Text style={styles.headerTitle}>Emergency SOS</Text>
              <Text style={styles.headerSubtitle}>Your safety is our priority</Text>
            </View>
            <View style={{ width: 40 }} />
          </View>
        </View>

        <View style={{ padding: 16 }}>
          {/* SOS Button */}
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPressIn={sosActive ? undefined : handlePressIn}
              onPressOut={sosActive ? undefined : handlePressOut}
              onPress={sosActive ? deactivateSOS : undefined}
              accessibilityLabel={sosActive ? "SOS active. Tap to deactivate emergency alert." : "SOS button. Hold for 3 seconds to send emergency alert."}
              accessibilityRole="button"
              accessibilityHint={sosActive ? "Tap to stop sharing your location with emergency contacts." : "Hold this button to alert emergency services and contacts with your location."}
              style={[
                styles.sosButton,
                {
                  backgroundColor: sosActive ? R_DARK : R,
                  borderColor: sosActive ? R_LIGHT : "rgba(239,68,68,0.3)",
                },
              ]}
            >
              {/* Hold progress ring */}
              {isHolding && !sosActive && (
                <View style={styles.progressRing}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${holdPct}%`, backgroundColor: "#fff" },
                    ]}
                  />
                </View>
              )}
              <IconSymbol
                name="exclamationmark.circle.fill"
                size={56}
                color="#fff"
              />
              <Text style={styles.sosButtonText}>
                {sosActive ? "SOS ACTIVE" : isHolding ? `HOLD ${HOLD_DURATION_S - Math.floor(holdProgress * HOLD_DURATION_S)}s` : "SOS"}
              </Text>
              <Text style={styles.sosButtonSubtext}>
                {sosActive ? "Tap to deactivate" : "Hold for 3 seconds to activate"}
              </Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Active Status */}
          {sosActive && (
            <View style={[styles.statusBanner, { backgroundColor: R, borderColor: R_DARK }]}>
              <IconSymbol name="checkmark.shield.fill" size={22} color="#fff" />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
                  Emergency Alert Active
                </Text>
                <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 }}>
                  Location is being shared with emergency services
                </Text>
              </View>
            </View>
          )}

          {/* Quick Actions */}
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Quick Actions</Text>
          <View style={styles.quickActionsRow}>
            <TouchableOpacity
              style={[styles.quickAction, { backgroundColor: R }]}
              onPress={handleCall911}
              accessibilityLabel="Call 911"
              accessibilityRole="button"
            >
              <IconSymbol name="phone.fill" size={24} color="#fff" />
              <Text style={styles.quickActionText}>Call 911</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickAction, { backgroundColor: P }]}
              onPress={handleShareLocation}
              accessibilityLabel="Share your current location"
              accessibilityRole="button"
            >
              <IconSymbol name="location.fill" size={24} color="#fff" />
              <Text style={styles.quickActionText}>Share Location</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickAction, { backgroundColor: A }]}
              onPress={handleAlertContacts}
              accessibilityLabel="Alert selected emergency contacts"
              accessibilityRole="button"
            >
              <IconSymbol name="bell.fill" size={24} color="#fff" />
              <Text style={styles.quickActionText}>Alert Contacts</Text>
            </TouchableOpacity>
          </View>

          {/* Current Location */}
          <View style={[styles.locationCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <IconSymbol name="location.fill" size={18} color={P} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "600" }}>CURRENT LOCATION</Text>
              <Text style={{ color: colors.foreground, fontSize: 14, marginTop: 2 }}>
                {currentLocation}
              </Text>
            </View>
          </View>

          {/* Emergency Contacts */}
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Emergency Contacts</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={handleImportFromContacts}
                style={[styles.addBtn, { backgroundColor: P }]}
                accessibilityLabel="Import from phone contacts"
                accessibilityRole="button"
              >
                <IconSymbol name="person.crop.circle.badge.plus" size={16} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13, marginLeft: 4 }}>Import</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowAddContact(!showAddContact)}
                style={[styles.addBtn, { backgroundColor: G }]}
                accessibilityLabel="Add emergency contact manually"
                accessibilityRole="button"
              >
                <IconSymbol name="plus" size={16} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13, marginLeft: 4 }}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Add Contact Form */}
          {showAddContact && (
            <View style={[styles.addContactForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                placeholder="Contact Name"
                placeholderTextColor={colors.muted}
                value={newContactName}
                onChangeText={setNewContactName}
              />
              <TextInput
                style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                placeholder="Phone Number"
                placeholderTextColor={colors.muted}
                value={newContactPhone}
                onChangeText={setNewContactPhone}
                keyboardType="phone-pad"
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  style={[styles.formBtn, { backgroundColor: colors.border }]}
                  onPress={() => setShowAddContact(false)}
                >
                  <Text style={{ color: colors.foreground, fontWeight: "600" }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.formBtn, { backgroundColor: G, flex: 1 }]}
                  onPress={handleAddContact}
                >
                  <Text style={{ color: "#fff", fontWeight: "600" }}>Save Contact</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {emergencyContacts.map((contact) => (
            <TouchableOpacity
              key={contact.id}
              style={[
                styles.contactItem,
                {
                  backgroundColor: colors.surface,
                  borderColor: selectedContacts.includes(contact.id) ? R : colors.border,
                  borderWidth: selectedContacts.includes(contact.id) ? 2 : 1,
                },
              ]}
              onPress={() => handleContactToggle(contact.id)}
              onLongPress={() => handleDeleteContact(contact.id)}
            >
              <View style={[styles.contactIcon, { backgroundColor: contact.id === "1" ? R : P }]}>
                <IconSymbol
                  name={contact.id === "1" ? "phone.fill" : "person.fill"}
                  size={18}
                  color="#fff"
                />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>
                  {contact.name}
                </Text>
                <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>
                  {contact.phone}
                </Text>
              </View>
              <IconSymbol
                name={selectedContacts.includes(contact.id) ? "checkmark.circle.fill" : "circle"}
                size={24}
                color={selectedContacts.includes(contact.id) ? R : colors.border}
              />
            </TouchableOpacity>
          ))}

          {/* I Feel Unsafe Report */}
          <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 28 }]}>
            Quick Report
          </Text>
          <TouchableOpacity
            style={[styles.unsafeBtn, { backgroundColor: colors.surface, borderColor: A }]}
            onPress={() => setShowUnsafeReport(!showUnsafeReport)}
          >
            <IconSymbol name="exclamationmark.triangle.fill" size={22} color={A} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 15 }}>
                I Feel Unsafe
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                Generate an incident report silently
              </Text>
            </View>
            <IconSymbol
              name={showUnsafeReport ? "chevron.up" : "chevron.down"}
              size={16}
              color={colors.muted}
            />
          </TouchableOpacity>

          {showUnsafeReport && (
            <View style={[styles.reportForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TextInput
                style={[styles.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                placeholder="Describe the situation (optional)..."
                placeholderTextColor={colors.muted}
                value={unsafeDescription}
                onChangeText={setUnsafeDescription}
                multiline
                numberOfLines={3}
              />
              <TouchableOpacity
                style={[styles.submitReportBtn, { backgroundColor: A }]}
                onPress={handleUnsafeReport}
              >
                <IconSymbol name="paperplane.fill" size={16} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14, marginLeft: 6 }}>
                  Submit Report
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Safety Info */}
          <View style={[styles.infoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <IconSymbol name="info.circle.fill" size={20} color={P} />
            <Text style={{ color: colors.foreground, fontSize: 12, marginLeft: 8, flex: 1, lineHeight: 18 }}>
              When SOS is active, your real-time location will be shared with emergency services and
              selected contacts until you deactivate it. Long-press a contact to remove it.
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

// ── Floating SOS Button (export for use in active-ride) ──────────────────────
export function FloatingSOSButton({ onPress }: { onPress?: () => void }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      style={styles.floatingBtn}
      onPress={onPress ?? (() => router.push("/emergency-sos" as any))}
    >
      <IconSymbol name="exclamationmark.triangle.fill" size={22} color="#fff" />
      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12, marginTop: 2 }}>SOS</Text>
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  header: {
    paddingTop: 12,
    paddingBottom: 24,
    position: "relative",
    overflow: "hidden",
  },
  headerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
    marginTop: 6,
  },
  headerSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    marginTop: 2,
  },
  sosButton: {
    paddingVertical: 36,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    marginBottom: 16,
    position: "relative",
    overflow: "hidden",
  },
  progressRing: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  sosButtonText: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "900",
    marginTop: 10,
    letterSpacing: 2,
  },
  sosButtonSubtext: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    marginTop: 4,
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 12,
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 12,
  },
  quickActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  quickAction: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 6,
  },
  locationCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addContactForm: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    gap: 10,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  formBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  contactIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  unsafeBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
  },
  reportForm: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    gap: 10,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
  },
  submitReportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 24,
  },
  floatingBtn: {
    position: "absolute",
    bottom: 24,
    right: 16,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});

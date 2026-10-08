import { Text, TouchableOpacity, View } from "react-native";
import { GradientView } from "@/components/GradientView";
import { IconSymbol } from "@/components/ui/icon-symbol";
import type { ComponentProps } from "react";
import { RQ } from "./theme";
import type { TabKey } from "./types";

type IconName = ComponentProps<typeof IconSymbol>["name"];

function EmptyIllustration({ color }: { color: string }) {
  return (
    <View style={{ width: 160, height: 160, alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
      <View style={{ position: "absolute", width: 150, height: 150, borderRadius: 75, borderWidth: 2, borderColor: RQ.border, borderStyle: "dashed" }} />
      <View style={{ position: "absolute", width: 110, height: 110, borderRadius: 55, borderWidth: 2, borderColor: color + "30", borderStyle: "dashed" }} />
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: color + "12", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: color + "30" }}>
        <IconSymbol name="bell.slash.fill" size={34} color={color} />
      </View>
      <View style={{ position: "absolute", top: 18, right: 28, width: 10, height: 10, borderRadius: 5, backgroundColor: RQ.blue }} />
      <View style={{ position: "absolute", bottom: 24, left: 24, width: 8, height: 8, borderRadius: 4, backgroundColor: RQ.green }} />
    </View>
  );
}

interface RequestsEmptyStateProps {
  tab: TabKey;
  hasPostedRides: boolean;
  onPrimary?: () => void;
  onSecondary?: () => void;
  onEnableNotifications?: () => void;
}

export function RequestsEmptyState({ tab, hasPostedRides, onPrimary, onSecondary, onEnableNotifications }: RequestsEmptyStateProps) {
  const cfg: Record<TabKey, { icon: IconName; color: string; title: string; body: string; primary: string | null; secondary: string | null }> = {
    all: hasPostedRides
      ? {
          icon: "bell.slash.fill",
          color: RQ.orange,
          title: "No join requests yet",
          body: "We'll notify you when riders ask to join your posted rides. Higher acceptance improves your visibility.",
          primary: "Enable Notifications",
          secondary: "How it works",
        }
      : {
          icon: "plus.circle.fill",
          color: RQ.blue,
          title: "Post a shared ride",
          body: "Post a shared ride and others can request to join from Find Carpool.",
          primary: "Create New Ride",
          secondary: "How it works",
        },
    pending: {
      icon: "bell.fill",
      color: RQ.orange,
      title: "No pending requests",
      body: "New join requests will appear here for you to approve or reject.",
      primary: null,
      secondary: "Enable Notifications",
    },
    accepted: {
      icon: "checkmark.circle.fill",
      color: RQ.green,
      title: "No accepted riders yet",
      body: "Approved passengers will appear here after you accept join requests.",
      primary: "View All Requests",
      secondary: null,
    },
    rejected: {
      icon: "xmark.circle.fill",
      color: RQ.red,
      title: "No rejected requests",
      body: "Requests you decline will be archived here for your records.",
      primary: null,
      secondary: null,
    },
  };

  const c = cfg[tab];

  return (
    <View style={{ alignItems: "center", paddingHorizontal: 24, paddingVertical: 28 }}>
      <View style={{ width: "100%", backgroundColor: RQ.surface, borderRadius: RQ.radius, borderWidth: 1, borderColor: RQ.border, padding: 24, alignItems: "center", ...RQ.shadow }}>
        <EmptyIllustration color={c.color} />
        <Text style={{ fontSize: 22, fontWeight: "800", color: RQ.text, textAlign: "center", letterSpacing: -0.3 }}>{c.title}</Text>
        <Text style={{ fontSize: 14, color: RQ.textSecondary, textAlign: "center", lineHeight: 22, marginTop: 10, maxWidth: 300 }}>{c.body}</Text>

        {c.primary && (onPrimary || onEnableNotifications) ? (
          <TouchableOpacity onPress={c.primary === "Enable Notifications" ? onEnableNotifications : onPrimary} style={{ width: "100%", marginTop: 20 }}>
            <GradientView style={{ borderRadius: 16, paddingVertical: 15, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, backgroundColor: RQ.blue }}>
              <IconSymbol name={c.primary === "Enable Notifications" ? "bell.fill" : "plus.circle.fill"} size={18} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{c.primary}</Text>
              <IconSymbol name="chevron.right" size={14} color="#fff" />
            </GradientView>
          </TouchableOpacity>
        ) : null}

        {c.secondary && (onSecondary || onEnableNotifications) ? (
          <TouchableOpacity
            onPress={c.secondary === "Enable Notifications" ? onEnableNotifications : onSecondary}
            style={{ width: "100%", marginTop: 10, paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, borderColor: RQ.border, backgroundColor: RQ.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}
          >
            <IconSymbol name="info.circle" size={16} color={RQ.blue} />
            <Text style={{ fontSize: 14, fontWeight: "700", color: RQ.blue }}>{c.secondary}</Text>
            <IconSymbol name="chevron.right" size={12} color={RQ.blue} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

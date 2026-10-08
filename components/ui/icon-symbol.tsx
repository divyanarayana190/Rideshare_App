// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>;
export type IconSymbolName = keyof typeof MAPPING;

const MAPPING = {
  // Navigation
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "chevron.left": "chevron-left",
  // Rides
  "car.fill": "directions-car",
  "car.2.fill": "commute",
  "map.fill": "map",
  "location.fill": "my-location",
  "location.circle.fill": "my-location",
  "mappin.and.ellipse": "place",
  "mappin": "location-on",
  "mappin.fill": "location-on",
  "mappin.circle.fill": "place",
  "road.lanes": "route",
  "figure.walk": "directions-walk",
  // People
  "person.fill": "person",
  "person.2.fill": "group",
  "person.3.fill": "groups",
  "person.crop.circle.fill": "account-circle",
  // Actions
  "plus": "add",
  "plus.circle.fill": "add-circle",
  "minus": "remove",
  "xmark": "close",
  "xmark.circle.fill": "cancel",
  "checkmark": "check",
  "checkmark.circle.fill": "check-circle",
  "arrow.left": "arrow-back",
  "arrow.right": "arrow-forward",
  "arrow.up.arrow.down": "swap-vert",
  "arrow.up.circle.fill": "arrow-upward",
  "arrow.2.squarepath": "loop",
  "arrow.triangle.2.circlepath": "refresh",
  "square.and.arrow.up": "share",
  // Status & Info
  "clock.fill": "access-time",
  "star.fill": "star",
  "heart.fill": "favorite",
  "dollarsign.circle.fill": "attach-money",
  "creditcard.fill": "credit-card",
  "wallet.pass.fill": "account-balance-wallet",
  "bell.fill": "notifications",
  "bell": "notifications-none",
  "info.circle": "info",
  "info.circle.fill": "info",
  "exclamationmark.triangle.fill": "warning",
  "exclamationmark.circle.fill": "error",
  // Tools & Misc
  "gear": "settings",
  "shield.fill": "security",
  "phone.fill": "phone",
  "message.fill": "message",
  "hand.thumbsup.fill": "thumb-up",
  "doc.text.fill": "receipt",
  "toggle.on": "toggle-on",
  "toggle.off": "toggle-off",
  "bolt.fill": "bolt",
  "leaf.fill": "eco",
  "magnifyingglass": "search",
  // Additional icons
  "gift.fill": "card-giftcard",
  "chart.bar.fill": "bar-chart",
  "creditcard": "credit-card",
  "clock.arrow.circlepath": "history",
  "arrow.down.circle.fill": "arrow-downward",
  "repeat": "repeat",
  "calendar": "event",
  "calendar.badge.clock": "event",
  "scope": "gps-fixed",
  "eye.fill": "visibility",
  "eye.slash.fill": "visibility-off",
  "pencil": "edit",
  "trash.fill": "delete",
  "flag.fill": "flag",
  "photo.fill": "photo",
  "arrow.right.square.fill": "logout",
  "point.topleft.down.to.point.bottomright.curvepath.fill": "timeline",
  "exclamationmark.bubble.fill": "feedback",
  "arrow.counterclockwise": "undo",
  "lock.shield.fill": "enhanced-encryption",
  "checkmark.shield.fill": "verified-user",
  "checkmark.seal.fill": "verified",
  "graduationcap.fill": "school",
  "arrow.left.arrow.right": "swap-horiz",
  "checkmark.shield": "verified-user",
  "arrow.down.right": "south-east",
  "arrow.up.left.and.arrow.down.right": "fullscreen",
  "arrow.down.right.and.arrow.up.left": "fullscreen-exit",
  "sparkles": "auto-awesome",
  "wifi.slash": "wifi-off",
  "play.fill": "play-arrow",
  "person.badge.plus": "person-add",
  "bell.slash.fill": "notifications-off",
  "trash": "delete-outline",
  "clock": "schedule",
  "chevron.up": "expand-less",
  "chevron.down": "expand-more",
  "timer": "timer",
  "arrow.2.circlepath": "sync",
  // Chat & Support
  "bubble.left.fill": "chat-bubble",
  "arrow.up": "arrow-upward",
  // Documents & Files
  "doc.text": "description",
  "arrow.down.doc": "file-download",
  // Security & Lock
  "lock.fill": "lock",
  "plus.circle": "add-circle-outline",
  // Navigation & Transport
  "arrow.clockwise": "refresh",
  "steeringwheel": "directions-car",
  "arrow.right.circle.fill": "arrow-forward",
  "speedometer": "speed",
  // Status & Alerts
  "sos": "sos",
  "exclamationmark.triangle": "warning",
  "exclamationmark.circle": "error-outline",
  // Misc
  "lightbulb.fill": "lightbulb",
  "flame.fill": "local-fire-department",
  "chart.line.uptrend.xyaxis": "trending-up",
  "viewport": "crop-free",
  "envelope": "email",
  "notifications": "notifications",
  "wallet": "account-balance-wallet",
  "dollarsign.circle": "attach-money",
  "map": "map",
  "briefcase.fill": "work",
  "airplane.fill": "flight",
  "tram.fill": "train",
  "camera.fill": "photo-camera",
  "ticket.fill": "confirmation-number",
  "wrench.fill": "build",
  "exclamationmark.shield.fill": "gpp-bad",
  "crown.fill": "workspace-premium",
  "list.bullet": "format-list-bulleted",
  "bag.fill": "luggage",
  "antenna.radiowaves.left.and.right": "sensors",
} as unknown as IconMapping;

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}

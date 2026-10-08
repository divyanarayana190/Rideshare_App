/** Light-mode design system for Communities (8pt grid, premium). */
export const cardShadow = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 10,
  elevation: 2,
} as const;

/** @deprecated use cardShadow — kept for community detail/create screens */
export const legacyShadow = cardShadow;

export const C = {
  bg: "#FFFFFF",
  surface: "#FFFFFF",
  canvas: "#F8FAFC",
  border: "#E2E8F0",
  text: "#0F172A",
  muted: "#64748B",
  meta: "#94A3B8",
  blue: "#1E88FF",
  blueDark: "#1565D8",
  blueLight: "#E8F2FF",
  green: "#22C55E",
  orange: "#F59E0B",
  purple: "#8B5CF6",
  pink: "#EC4899",
  teal: "#14B8A6",
  cyan: "#06B6D4",
  red: "#EF4444",
  shadow: cardShadow,
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 0,
    padding: 16,
  },
} as const;

export const SPACE = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const RADIUS = {
  sm: 12,
  md: 16,
  lg: 24,
  xl: 28,
  pill: 999,
} as const;

export const TYPE = {
  sectionTitle: { fontSize: 18, fontWeight: "800" as const, color: C.text, letterSpacing: -0.3 },
  communityName: { fontSize: 16, fontWeight: "700" as const, color: C.text },
  category: { fontSize: 11, fontWeight: "500" as const },
  members: { fontSize: 12, fontWeight: "500" as const, color: C.muted },
  online: { fontSize: 12, fontWeight: "600" as const, color: C.green },
  description: { fontSize: 13, fontWeight: "400" as const, color: C.muted, lineHeight: 18 },
  viewAll: { fontSize: 14, fontWeight: "600" as const, color: C.blue },
} as const;

export type BadgeTone =
  | "university"
  | "company"
  | "city"
  | "apartment"
  | "event"
  | "travel"
  | "women"
  | "airport"
  | "custom"
  | "public"
  | "private"
  | "pending";

export const BADGE: Record<BadgeTone, { bg: string; text: string; label: string }> = {
  university: { bg: "#FEE2E2", text: "#B91C1C", label: "University" },
  company: { bg: "#DBEAFE", text: "#1D4ED8", label: "Company" },
  city: { bg: "#FFEDD5", text: "#C2410C", label: "City" },
  apartment: { bg: "#DCFCE7", text: "#15803D", label: "Apartment" },
  event: { bg: "#EDE9FE", text: "#6D28D9", label: "Events" },
  travel: { bg: "#CCFBF1", text: "#0F766E", label: "Travel" },
  women: { bg: "#FCE7F3", text: "#BE185D", label: "Women" },
  airport: { bg: "#CFFAFE", text: "#0E7490", label: "Airport" },
  custom: { bg: "#F1F5F9", text: "#475569", label: "Custom" },
  public: { bg: "#E8F2FF", text: "#1E88FF", label: "Public" },
  private: { bg: "#FFEDD5", text: "#C2410C", label: "Private" },
  pending: { bg: "#FEF3C7", text: "#B45309", label: "Pending Approval" },
};

export function categoryBadgeTone(category: string): BadgeTone {
  switch (category) {
    case "university": return "university";
    case "company": return "company";
    case "city": return "city";
    case "apartment": return "apartment";
    case "event": return "event";
    case "travel": return "travel";
    case "private_group": return "women";
    default: return "custom";
  }
}

export function visibilityBadgeTone(visibility?: string | null): BadgeTone {
  if (visibility === "private" || visibility === "invite_only") return "private";
  return "public";
}

export const searchShadow = {
  shadowColor: "#0F172A",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.04,
  shadowRadius: 6,
  elevation: 1,
} as const;

import type { CommunityCategory, CommunityVisibility } from "@/shared/community";

export type CommunityItem = {
  id: number;
  name: string;
  category: string;
  visibility?: CommunityVisibility | string;
  memberCount: number;
  onlineCount?: number;
  logoUrl?: string | null;
  membershipStatus?: string | null;
  isVerified?: boolean;
  themeColor?: string | null;
  distanceMiles?: number;
  trendingScore?: number;
};

export type CommunitySectionState =
  | "loading"
  | "refreshing"
  | "empty"
  | "error"
  | "offline"
  | "locationDenied"
  | "locationLoading"
  | "ready";

export type TypeBadgeLabel = "University" | "Company" | "City" | "Public" | "Private";

export function getTypeBadge(
  category: string,
  visibility?: string | null,
): TypeBadgeLabel {
  if (category === "university") return "University";
  if (category === "company") return "Company";
  if (category === "city" || category === "apartment") return "City";
  if (visibility === "private" || visibility === "invite_only") return "Private";
  return "Public";
}

export function formatMilesAway(miles: number | null | undefined): string {
  if (miles == null || !Number.isFinite(miles)) return "";
  if (miles < 0.1) return "< 0.1 mi away";
  return `${miles.toFixed(1)} mi away`;
}

export const H_PAD = 20;
export const GRID_GAP = 16;
export const MY_CARD_WIDTH = 156;
export const MY_CARD_HEIGHT = 196;

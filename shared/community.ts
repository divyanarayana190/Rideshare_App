export const COMMUNITY_CATEGORIES = [
  "university",
  "company",
  "city",
  "apartment",
  "event",
  "travel",
  "private_group",
  "custom",
] as const;

export type CommunityCategory = (typeof COMMUNITY_CATEGORIES)[number];

export const COMMUNITY_VISIBILITY = ["public", "private", "invite_only"] as const;
export type CommunityVisibility = (typeof COMMUNITY_VISIBILITY)[number];

export const COMMUNITY_VERIFICATION_TYPES = [
  "none",
  "edu_email",
  "company_email",
  "invite_code",
  "manual_approval",
] as const;
export type CommunityVerificationType = (typeof COMMUNITY_VERIFICATION_TYPES)[number];

export const COMMUNITY_MEMBER_ROLES = ["owner", "admin", "moderator", "member"] as const;
export type CommunityMemberRole = (typeof COMMUNITY_MEMBER_ROLES)[number];

export const COMMUNITY_MEMBER_STATUSES = [
  "active",
  "pending",
  "rejected",
  "banned",
  "left",
] as const;
export type CommunityMemberStatus = (typeof COMMUNITY_MEMBER_STATUSES)[number];

export const COMMUNITY_STATUSES = ["active", "archived", "suspended"] as const;
export type CommunityStatus = (typeof COMMUNITY_STATUSES)[number];

export const DEFAULT_COMMUNITY_RULES = [
  "Be respectful and kind to others",
  "No spam or self-promotion",
  "Share accurate ride details",
  "Follow YOO community guidelines",
] as const;

export const CATEGORY_LABELS: Record<CommunityCategory, string> = {
  university: "University",
  company: "Company",
  city: "City",
  apartment: "Apartment",
  event: "Events",
  travel: "Travel",
  private_group: "Private Group",
  custom: "Custom",
};

export const VISIBILITY_LABELS: Record<CommunityVisibility, string> = {
  public: "Public",
  private: "Private",
  invite_only: "Invite Only",
};

export function slugifyCommunityName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "community";
}

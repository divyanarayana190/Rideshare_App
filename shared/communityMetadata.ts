/** Optional JSON stored on communities.metadata */
export type CommunityMetadata = {
  themeColor?: string;
  tags?: string[];
  location?: {
    city?: string;
    region?: string;
    lat?: number;
    lng?: number;
  };
  featured?: boolean;
  isVerified?: boolean;
  searchKeywords?: string[];
  universityRef?: string;
  companyRef?: string;
  trendingScore?: number;
};

export function parseCommunityMetadata(raw: unknown): CommunityMetadata {
  if (!raw || typeof raw !== "object") return {};
  return raw as CommunityMetadata;
}

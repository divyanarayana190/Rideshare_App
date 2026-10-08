import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  CommunityCategory,
  CommunityVerificationType,
  CommunityVisibility,
} from "@/shared/community";

export type CommunityDraft = {
  step: number;
  name: string;
  description: string;
  category: CommunityCategory | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  visibility: CommunityVisibility | null;
  verificationType: CommunityVerificationType | null;
  verificationDomain: string;
  customInviteCode: string;
  rules: string[];
};

export const EMPTY_DRAFT: CommunityDraft = {
  step: 0,
  name: "",
  description: "",
  category: null,
  logoUrl: null,
  bannerUrl: null,
  visibility: null,
  verificationType: null,
  verificationDomain: "",
  customInviteCode: "",
  rules: [],
};

function key(userId: number) {
  return `yoo:community-draft:${userId}`;
}

export async function loadCommunityDraft(userId: number): Promise<CommunityDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    if (!raw) return null;
    return JSON.parse(raw) as CommunityDraft;
  } catch {
    return null;
  }
}

export async function saveCommunityDraft(userId: number, draft: CommunityDraft) {
  await AsyncStorage.setItem(key(userId), JSON.stringify(draft));
}

export async function clearCommunityDraft(userId: number) {
  await AsyncStorage.removeItem(key(userId));
}

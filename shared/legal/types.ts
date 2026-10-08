export interface LegalSection {
  id: string;
  title: string;
  content: string;
}

export interface LegalDocument {
  id: string;
  slug: string;
  title: string;
  version: string;
  effectiveDate?: string;
  lastUpdated: string;
  description: string;
  sections: LegalSection[];
}

export type LegalDocumentSlug =
  | "privacy"
  | "terms"
  | "driver-terms"
  | "community-guidelines"
  | "safety-policy"
  | "cookie-policy"
  | "data-retention"
  | "account-deletion";

export interface LegalAcceptancePayload {
  legalVersion: string;
  acceptTerms: true;
  acceptPrivacy: true;
  acceptCommunity: true;
  termsAcceptedAt: string;
  privacyAcceptedAt: string;
  communityAcceptedAt: string;
  deviceInfo?: string;
}

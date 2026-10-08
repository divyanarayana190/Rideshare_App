import type { LegalDocument } from "./types";
import { termsOfService } from "./documents/terms-of-service";
import { privacyPolicy } from "./documents/privacy-policy";
import { communityGuidelines } from "./documents/remaining-policies";
import { CURRENT_LEGAL_VERSION } from "./version";

export const LEGAL_EFFECTIVE_DATE = "2026-06-09";

function withEffectiveDate(doc: LegalDocument): LegalDocument {
  return {
    ...doc,
    effectiveDate: doc.effectiveDate ?? doc.lastUpdated ?? LEGAL_EFFECTIVE_DATE,
    version: CURRENT_LEGAL_VERSION,
  };
}

/** Signup / re-acceptance legal documents — version 1.0 */
export const LEGAL_TERMS_V1 = withEffectiveDate(termsOfService);
export const LEGAL_PRIVACY_V1 = withEffectiveDate(privacyPolicy);
export const LEGAL_COMMUNITY_V1 = withEffectiveDate(communityGuidelines);

export type SignupLegalDocKey = "terms" | "privacy" | "community";

export const SIGNUP_LEGAL_DOCUMENTS: {
  key: SignupLegalDocKey;
  document: LegalDocument;
  label: string;
  reviewLabel: string;
}[] = [
  {
    key: "terms",
    document: LEGAL_TERMS_V1,
    label: "Terms of Service",
    reviewLabel: "Review and accept Terms of Service",
  },
  {
    key: "privacy",
    document: LEGAL_PRIVACY_V1,
    label: "Privacy Policy",
    reviewLabel: "Review and accept Privacy Policy",
  },
  {
    key: "community",
    document: LEGAL_COMMUNITY_V1,
    label: "Community Guidelines",
    reviewLabel: "Review and accept Community Guidelines",
  },
];

export function getSignupLegalDocument(key: SignupLegalDocKey): LegalDocument {
  const row = SIGNUP_LEGAL_DOCUMENTS.find((d) => d.key === key);
  if (!row) throw new Error(`Unknown legal document key: ${key}`);
  return row.document;
}

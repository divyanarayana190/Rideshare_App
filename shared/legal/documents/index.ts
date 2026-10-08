import type { LegalDocument, LegalDocumentSlug } from "../types";
import { privacyPolicy } from "./privacy-policy";
import { termsOfService } from "./terms-of-service";
import { driverTerms } from "./driver-terms";
import {
  communityGuidelines,
  safetyPolicy,
  cookiePolicy,
  dataRetentionPolicy,
  accountDeletionPolicy,
} from "./remaining-policies";

export const LEGAL_DOCUMENTS: LegalDocument[] = [
  privacyPolicy,
  termsOfService,
  driverTerms,
  communityGuidelines,
  safetyPolicy,
  cookiePolicy,
  dataRetentionPolicy,
  accountDeletionPolicy,
];

export const LEGAL_DOCUMENT_MAP: Record<LegalDocumentSlug, LegalDocument> = {
  privacy: privacyPolicy,
  terms: termsOfService,
  "driver-terms": driverTerms,
  "community-guidelines": communityGuidelines,
  "safety-policy": safetyPolicy,
  "cookie-policy": cookiePolicy,
  "data-retention": dataRetentionPolicy,
  "account-deletion": accountDeletionPolicy,
};

export function getLegalDocument(slug: string): LegalDocument | undefined {
  return LEGAL_DOCUMENT_MAP[slug as LegalDocumentSlug] ?? LEGAL_DOCUMENTS.find((d) => d.slug === slug);
}

export {
  privacyPolicy,
  termsOfService,
  driverTerms,
  communityGuidelines,
  safetyPolicy,
  cookiePolicy,
  dataRetentionPolicy,
  accountDeletionPolicy,
};

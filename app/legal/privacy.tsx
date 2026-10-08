import { LegalDocScreen } from "@/components/legal/LegalDocScreen";
import { LEGAL_PRIVACY_V1 } from "@/shared/legal/constants";

export default function PrivacyPolicyScreen() {
  return <LegalDocScreen document={LEGAL_PRIVACY_V1} />;
}

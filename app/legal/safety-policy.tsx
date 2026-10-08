import { LegalDocScreen } from "@/components/legal/LegalDocScreen";
import { safetyPolicy } from "@/shared/legal/documents/remaining-policies";
export default function SafetyPolicyScreen() { return <LegalDocScreen document={safetyPolicy} />; }

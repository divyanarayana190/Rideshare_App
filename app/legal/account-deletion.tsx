import { LegalDocScreen } from "@/components/legal/LegalDocScreen";
import { accountDeletionPolicy } from "@/shared/legal/documents/remaining-policies";

export default function AccountDeletionPolicyScreen() {
  return <LegalDocScreen document={accountDeletionPolicy} />;
}

import { LegalPage } from "@/components/legal/legal-page";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";

export default function PrivacyPolicyPage() {
  return <LegalPage document={LEGAL_DOCUMENTS.privacyPolicy} />;
}

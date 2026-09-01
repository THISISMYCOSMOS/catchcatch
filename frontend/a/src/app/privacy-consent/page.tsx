import { LegalPage } from "@/components/legal/legal-page";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";

export default function PrivacyConsentPage() {
  return <LegalPage document={LEGAL_DOCUMENTS.privacyConsent} />;
}

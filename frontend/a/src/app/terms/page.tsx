import { LegalPage } from "@/components/legal/legal-page";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";

export default function TermsPage() {
  return <LegalPage document={LEGAL_DOCUMENTS.terms} />;
}

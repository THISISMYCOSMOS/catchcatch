import { AuthShell } from "@/components/auth/auth-shell";
import { LegalDocumentContent } from "@/components/legal/legal-document-content";
import type { LegalDocument } from "@/lib/legal/documents";
import styles from "./legal-document.module.css";

type LegalPageProps = {
  document: LegalDocument;
};

export function LegalPage({ document }: LegalPageProps) {
  return (
    <AuthShell title={document.title} backHref="/signup" className="legal-page-card">
      <LegalDocumentContent document={document} className={styles.pageContent} />
    </AuthShell>
  );
}

"use client";

import { KeyboardEvent, MouseEvent, UIEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { LEGAL_DOCUMENTS, type LegalDocumentId } from "@/lib/legal/documents";
import { LegalDocumentContent } from "./legal-document-content";
import styles from "./legal-document.module.css";

type LegalDocumentDialogProps = {
  documentId: LegalDocumentId;
  onClose: () => void;
};

export function LegalDocumentDialog({ documentId, onClose }: LegalDocumentDialogProps) {
  const [activeDocumentId, setActiveDocumentId] = useState<LegalDocumentId>(documentId);
  const document = LEGAL_DOCUMENTS[activeDocumentId];
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const [isAtEnd, setIsAtEnd] = useState(false);
  const hasPrivacyTabs = documentId === "privacyConsent";
  const titleId = hasPrivacyTabs
    ? `legal-dialog-tab-${document.id}`
    : `legal-dialog-title-${document.id}`;
  const contentId = hasPrivacyTabs ? "legal-dialog-privacy-content" : undefined;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useLayoutEffect(() => {
    const previousFocus = globalThis.document.activeElement instanceof HTMLElement
      ? globalThis.document.activeElement
      : null;
    const previousOverflow = globalThis.document.body.style.overflow;
    globalThis.document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseRef.current();
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
      globalThis.document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  useLayoutEffect(() => {
    if (!scrollContainerRef.current) return;
    scrollContainerRef.current.scrollTop = 0;
    setIsAtEnd(isScrollAtEnd(scrollContainerRef.current));
  }, [activeDocumentId]);

  function keepFocusInside(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])",
    );
    if (!focusableElements?.length) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (event.shiftKey && globalThis.document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && globalThis.document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  function closeFromOverlay(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  function showNextContent() {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;
    scrollContainer.scrollBy({
      top: scrollContainer.clientHeight * 0.88,
      behavior: "smooth",
    });
  }

  function syncScrollState(event: UIEvent<HTMLDivElement>) {
    setIsAtEnd(isScrollAtEnd(event.currentTarget));
  }

  return (
    <div className={styles.overlay} onMouseDown={closeFromOverlay}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={keepFocusInside}
      >
        <header className={styles.dialogHeader}>
          {hasPrivacyTabs ? (
            <div className={styles.dialogTabs} role="tablist" aria-label="개인정보 문서">
              {(["privacyConsent", "privacyPolicy"] as const).map((tabDocumentId) => {
                const tabDocument = LEGAL_DOCUMENTS[tabDocumentId];
                const isSelected = activeDocumentId === tabDocumentId;

                return (
                  <button
                    className={[styles.dialogTab, isSelected ? styles.dialogTabActive : ""].filter(Boolean).join(" ")}
                    id={`legal-dialog-tab-${tabDocumentId}`}
                    key={tabDocumentId}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    aria-controls={contentId}
                    onClick={() => setActiveDocumentId(tabDocumentId)}
                  >
                    {tabDocument.title}
                  </button>
                );
              })}
            </div>
          ) : (
            <h2 id={titleId}>{document.title}</h2>
          )}
          <button
            className={styles.close}
            type="button"
            aria-label="닫기"
            onClick={onClose}
            ref={closeButtonRef}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </header>
        <div className={[styles.dialogContent, isAtEnd ? "" : styles.dialogContentHasMore].filter(Boolean).join(" ")}>
          <div
            className={styles.dialogBody}
            id={contentId}
            ref={scrollContainerRef}
            role={hasPrivacyTabs ? "tabpanel" : undefined}
            aria-labelledby={hasPrivacyTabs ? titleId : undefined}
            tabIndex={hasPrivacyTabs ? 0 : undefined}
            onScroll={syncScrollState}
          >
            <LegalDocumentContent document={document} />
          </div>
          <div className={styles.dialogAction}>
            {isAtEnd ? (
              <button className={`button button-primary ${styles.confirm}`} type="button" onClick={onClose}>확인</button>
            ) : (
              <button className={styles.next} type="button" aria-label="다음 내용" onClick={showNextContent}>
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function isScrollAtEnd(element: HTMLDivElement) {
  const threshold = 20;
  return element.scrollTop + element.clientHeight >= element.scrollHeight - threshold;
}

"use client";

import { KeyboardEvent, MouseEvent, useEffect, useRef } from "react";
import { HomeNotificationItem } from "@/lib/mock/home";

type NotificationDetailDialogProps = {
  notification: HomeNotificationItem;
  onClose: () => void;
};

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function NotificationDetailDialog({ notification, onClose }: NotificationDetailDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseRef.current();
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
      previousFocus?.focus();
    };
  }, []);

  function keepFocusInside(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), [tabindex]:not([tabindex='-1'])",
    );
    if (!focusableElements?.length) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  const titleId = `notification-detail-title-${notification.id}`;

  function closeFromControl(event: MouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    onClose();
  }

  function closeFromOverlay(event: MouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    event.stopPropagation();
    onClose();
  }

  return (
    <div className="previous-analysis-overlay notification-detail-overlay" onClick={closeFromOverlay}>
      <div
        className="previous-analysis-dialog notification-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-notification-id={notification.id}
        ref={dialogRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={keepFocusInside}
      >
        <header className="previous-analysis-header">
          <h2 id={titleId}>{notification.title}</h2>
          <button
            className="previous-analysis-close"
            type="button"
            aria-label="알림 상세 닫기"
            onClick={closeFromControl}
            ref={closeButtonRef}
          >
            <CloseIcon />
          </button>
        </header>
        <div className="previous-analysis-content notification-detail-content">
          <div className="notification-detail-message">
            <p>{notification.message}</p>
            <time>{notification.createdAtLabel}</time>
          </div>
        </div>
      </div>
    </div>
  );
}

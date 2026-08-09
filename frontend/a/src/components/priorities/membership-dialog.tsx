"use client";

import { KeyboardEvent, MouseEvent, useEffect, useLayoutEffect, useRef } from "react";
import { MembershipId, MEMBERSHIP_OPTIONS, MembershipPreferences } from "@/lib/memberships";

type MembershipDialogProps = {
  preferences: MembershipPreferences;
  onChange: (preferences: MembershipPreferences) => void;
  onCancel: () => void;
  onSave: () => void;
};

export function MembershipDialog({ preferences, onChange, onCancel, onSave }: MembershipDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useLayoutEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCancelRef.current();
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = previousOverflow;
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

  function closeFromOverlay(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onCancel();
  }

  function toggleMembership(id: MembershipId) {
    onChange({
      ...preferences,
      hasNoMemberships: false,
      [id]: !preferences[id],
    });
  }

  function toggleNoMemberships() {
    const nextSelected = !preferences.hasNoMemberships;
    onChange({
      hasNoMemberships: nextSelected,
      coupangWow: false,
      oliveyoung: false,
      musinsa: false,
    });
  }

  return (
    <div className="membership-modal-overlay" onClick={closeFromOverlay}>
      <div
        className="membership-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="membership-dialog-title"
        aria-describedby="membership-dialog-description"
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={keepFocusInside}
      >
        <header className="membership-modal-header">
          <h2 id="membership-dialog-title">사용 중인 멤버십이 있나요?</h2>
          <p id="membership-dialog-description">이용 중인 멤버십을 모두 선택해 주세요.</p>
        </header>

        <div className="membership-option-list">
          {MEMBERSHIP_OPTIONS.map((membership) => (
            <button
              className={preferences[membership.id] ? "membership-simple-option is-selected" : "membership-simple-option"}
              type="button"
              aria-pressed={preferences[membership.id]}
              onClick={() => toggleMembership(membership.id)}
              key={membership.id}
            >
              <span>{membership.label}</span>
              <span className="membership-check" aria-hidden="true">{preferences[membership.id] ? "✓" : ""}</span>
            </button>
          ))}
          <button
            className={preferences.hasNoMemberships ? "membership-simple-option is-selected" : "membership-simple-option"}
            type="button"
            aria-pressed={preferences.hasNoMemberships}
            onClick={toggleNoMemberships}
          >
            <span>사용 중인 멤버십 없음</span>
            <span className="membership-check" aria-hidden="true">{preferences.hasNoMemberships ? "✓" : ""}</span>
          </button>
        </div>

        <div className="membership-modal-actions">
          <button className="button button-secondary" type="button" onClick={onCancel}>취소</button>
          <button className="button button-primary" type="button" onClick={onSave}>저장</button>
        </div>
      </div>
    </div>
  );
}

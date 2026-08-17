"use client";

import { FormEvent, KeyboardEvent, MouseEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FormField } from "@/components/auth/form-field";
import { getEmailError } from "@/lib/validation/auth";
import styles from "./password-recovery-dialog.module.css";

type PasswordRecoveryDialogProps = {
  onClose: () => void;
};

function CloseIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg>;
}

export function PasswordRecoveryDialog({ onClose }: PasswordRecoveryDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useLayoutEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseRef.current();
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
      "button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])",
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
    if (event.target === event.currentTarget) onClose();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = getEmailError(email);
    setEmailError(error ?? "");
    if (error) return;
    // 비밀번호 재설정 API가 연결되기 전까지 메일 발송이나 성공 상태를 만들지 않습니다.
  }

  return (
    <div className="membership-modal-overlay" onClick={closeFromOverlay}>
      <div
        className={`membership-modal ${styles.modal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-recovery-title"
        aria-describedby="password-recovery-description"
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={keepFocusInside}
      >
        <header className={`membership-modal-header ${styles.header}`}>
          <h2 id="password-recovery-title">비밀번호 찾기</h2>
          <p id="password-recovery-description">가입한 이메일을 입력해주세요.</p>
          <button className={styles.close} type="button" aria-label="비밀번호 찾기 닫기" onClick={onClose} ref={closeButtonRef}>
            <CloseIcon />
          </button>
        </header>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <FormField
            id="recovery-email"
            label="이메일"
            type="email"
            homeLinkFocus
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setEmailError("");
            }}
            error={emailError || undefined}
          />
          <button className="button button-primary" type="submit" disabled={!email.trim()}>
            확인
          </button>
        </form>
      </div>
    </div>
  );
}

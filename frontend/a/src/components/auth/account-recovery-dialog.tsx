"use client";

import { FormEvent, KeyboardEvent, MouseEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FormField, PasswordVisibilityButton } from "@/components/auth/form-field";
import { formatKoreanPhoneInput } from "@/lib/phone";
import { getPasswordError } from "@/lib/validation/auth";
import styles from "./account-recovery-dialog.module.css";

export type AccountRecoveryMode = "accountId" | "password";

type AccountIdRecoveryStep = "phone" | "otp" | "result";
type PasswordRecoveryStep = "identity" | "otp" | "newPassword" | "complete";

type AccountIdRecoveryState = {
  step: AccountIdRecoveryStep;
  phone: string;
  otp: string;
  maskedAccountId: string | null;
};

type PasswordRecoveryState = {
  step: PasswordRecoveryStep;
  accountId: string;
  phone: string;
  otp: string;
  newPassword: string;
  newPasswordConfirmation: string;
};

type AccountRecoveryDialogProps = {
  mode: AccountRecoveryMode;
  onClose: () => void;
};

const PREPARING_NOTICE = "계정 찾기 기능을 준비 중이에요.";

function CloseIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg>;
}

export function AccountRecoveryDialog({ mode, onClose }: AccountRecoveryDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const [notice, setNotice] = useState("");

  // API 연결 후 성공 응답에서만 step과 결과 데이터를 다음 단계로 갱신합니다.
  const [accountIdRecovery, setAccountIdRecovery] = useState<AccountIdRecoveryState>({
    step: "phone",
    phone: "",
    otp: "",
    maskedAccountId: null,
  });
  const [passwordRecovery, setPasswordRecovery] = useState<PasswordRecoveryState>({
    step: "identity",
    accountId: "",
    phone: "",
    otp: "",
    newPassword: "",
    newPasswordConfirmation: "",
  });
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showNewPasswordConfirmation, setShowNewPasswordConfirmation] = useState(false);
  const [newPasswordError, setNewPasswordError] = useState("");
  const [newPasswordConfirmationError, setNewPasswordConfirmationError] = useState("");

  const title = mode === "accountId" ? "아이디 찾기" : "비밀번호 찾기";
  const description = mode === "accountId"
    ? "가입할 때 인증한 휴대폰 번호를 입력해주세요."
    : "본인 확인 후 새로운 비밀번호를 설정할 수 있어요.";
  const titleId = `${mode}-recovery-title`;
  const descriptionId = `${mode}-recovery-description`;

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

  function showPreparingNotice(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setNotice(PREPARING_NOTICE);
  }

  function handlePasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const passwordError = getPasswordError(passwordRecovery.newPassword) ?? "";
    const confirmationError = !passwordRecovery.newPasswordConfirmation
      ? "비밀번호를 다시 입력해주세요."
      : passwordRecovery.newPasswordConfirmation !== passwordRecovery.newPassword
        ? "비밀번호가 일치하지 않습니다."
        : "";
    setNewPasswordError(passwordError);
    setNewPasswordConfirmationError(confirmationError);
    if (passwordError || confirmationError) return;
    setNotice(PREPARING_NOTICE);
  }

  function renderAccountIdContent() {
    if (accountIdRecovery.step === "result" && accountIdRecovery.maskedAccountId) {
      return (
        <div className={styles.result} role="status">
          <p>가입한 아이디</p>
          <strong>{accountIdRecovery.maskedAccountId}</strong>
        </div>
      );
    }

    if (accountIdRecovery.step === "otp") {
      return (
        <form className={styles.form} onSubmit={showPreparingNotice} noValidate>
          <p className={styles.instruction}>전송된 인증번호를 입력해주세요.</p>
          <div className={styles.fieldActionRow}>
            <FormField
              id="account-id-recovery-otp"
              label="인증번호"
              type="text"
              homeLinkFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="6자리 숫자"
              value={accountIdRecovery.otp}
              onChange={(event) => {
                const otp = event.target.value.replace(/\D/g, "").slice(0, 6);
                setAccountIdRecovery((current) => ({ ...current, otp }));
                setNotice("");
              }}
            />
            <button className={styles.inlineButton} type="button" onClick={() => setNotice(PREPARING_NOTICE)}>
              재전송
            </button>
          </div>
          <button className="button button-primary" type="submit" disabled={accountIdRecovery.otp.length !== 6}>
            확인
          </button>
        </form>
      );
    }

    return (
      <form className={styles.form} onSubmit={showPreparingNotice} noValidate>
        <FormField
          id="account-id-recovery-phone"
          label="휴대폰 번호"
          type="tel"
          homeLinkFocus
          inputMode="tel"
          autoComplete="tel"
          maxLength={13}
          placeholder="010-1234-5678"
          value={accountIdRecovery.phone}
          onChange={(event) => {
            const phone = formatKoreanPhoneInput(event.target.value);
            setAccountIdRecovery((current) => ({ ...current, phone }));
            setNotice("");
          }}
        />
        <button className="button button-primary" type="submit" disabled={!accountIdRecovery.phone.trim()}>
          인증번호 전송
        </button>
      </form>
    );
  }

  function renderPasswordContent() {
    if (passwordRecovery.step === "complete") {
      return (
        <div className={styles.result} role="status">
          <strong>비밀번호가 변경되었어요.</strong>
          <button className="button button-primary" type="button" onClick={onClose}>로그인하기</button>
        </div>
      );
    }

    if (passwordRecovery.step === "newPassword") {
      return (
        <form className={styles.form} onSubmit={handlePasswordReset} noValidate>
          <FormField
            id="recovery-new-password"
            label="새 비밀번호"
            type={showNewPassword ? "text" : "password"}
            homeLinkFocus
            autoComplete="new-password"
            placeholder="영문, 숫자, 특수문자 조합 8~16자"
            value={passwordRecovery.newPassword}
            onChange={(event) => {
              const newPassword = event.target.value;
              setPasswordRecovery((current) => ({ ...current, newPassword }));
              setNewPasswordError("");
              setNewPasswordConfirmationError("");
              setNotice("");
            }}
            error={newPasswordError || undefined}
            trailingControl={(
              <PasswordVisibilityButton
                visible={showNewPassword}
                onToggle={() => setShowNewPassword((value) => !value)}
              />
            )}
          />
          <FormField
            id="recovery-new-password-confirmation"
            label="새 비밀번호 확인"
            type={showNewPasswordConfirmation ? "text" : "password"}
            homeLinkFocus
            autoComplete="new-password"
            placeholder="비밀번호를 한 번 더 입력해주세요."
            value={passwordRecovery.newPasswordConfirmation}
            onChange={(event) => {
              const newPasswordConfirmation = event.target.value;
              setPasswordRecovery((current) => ({ ...current, newPasswordConfirmation }));
              setNewPasswordConfirmationError("");
              setNotice("");
            }}
            error={newPasswordConfirmationError || undefined}
            trailingControl={(
              <PasswordVisibilityButton
                visible={showNewPasswordConfirmation}
                onToggle={() => setShowNewPasswordConfirmation((value) => !value)}
              />
            )}
          />
          <button className="button button-primary" type="submit">비밀번호 변경</button>
        </form>
      );
    }

    if (passwordRecovery.step === "otp") {
      return (
        <form className={styles.form} onSubmit={showPreparingNotice} noValidate>
          <p className={styles.instruction}>전송된 인증번호를 입력해주세요.</p>
          <div className={styles.fieldActionRow}>
            <FormField
              id="password-recovery-otp"
              label="인증번호"
              type="text"
              homeLinkFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="6자리 숫자"
              value={passwordRecovery.otp}
              onChange={(event) => {
                const otp = event.target.value.replace(/\D/g, "").slice(0, 6);
                setPasswordRecovery((current) => ({ ...current, otp }));
                setNotice("");
              }}
            />
            <button className={styles.inlineButton} type="button" onClick={() => setNotice(PREPARING_NOTICE)}>
              재전송
            </button>
          </div>
          <button className="button button-primary" type="submit" disabled={passwordRecovery.otp.length !== 6}>
            본인 확인
          </button>
        </form>
      );
    }

    return (
      <form className={styles.form} onSubmit={showPreparingNotice} noValidate>
        <FormField
          id="password-recovery-account-id"
          label="아이디"
          type="text"
          homeLinkFocus
          autoComplete="username"
          placeholder="아이디 입력"
          value={passwordRecovery.accountId}
          onChange={(event) => {
            const accountId = event.target.value;
            setPasswordRecovery((current) => ({ ...current, accountId }));
            setNotice("");
          }}
        />
        <FormField
          id="password-recovery-phone"
          label="휴대폰 번호"
          type="tel"
          homeLinkFocus
          inputMode="tel"
          autoComplete="tel"
          maxLength={13}
          placeholder="010-1234-5678"
          value={passwordRecovery.phone}
          onChange={(event) => {
            const phone = formatKoreanPhoneInput(event.target.value);
            setPasswordRecovery((current) => ({ ...current, phone }));
            setNotice("");
          }}
        />
        <button className="button button-primary" type="submit" disabled={!passwordRecovery.accountId.trim() || !passwordRecovery.phone.trim()}>
          인증번호 전송
        </button>
      </form>
    );
  }

  return (
    <div className="membership-modal-overlay" onClick={closeFromOverlay}>
      <div
        className={`membership-modal ${styles.modal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={keepFocusInside}
      >
        <header className={`membership-modal-header ${styles.header}`}>
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{description}</p>
          <button className={styles.close} type="button" aria-label={`${title} 닫기`} onClick={onClose} ref={closeButtonRef}>
            <CloseIcon />
          </button>
        </header>

        {mode === "accountId" ? renderAccountIdContent() : renderPasswordContent()}
        {notice ? <p className={styles.notice} role="status" aria-live="polite">{notice}</p> : null}
      </div>
    </div>
  );
}

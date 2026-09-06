"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FormField, PasswordVisibilityButton } from "@/components/auth/form-field";
import { LegalDocumentDialog } from "@/components/legal/legal-document-dialog";
import { checkAccountIdAvailability, restoreAuthenticatedUser, sendPhoneOtp, verifyPhoneOtp } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { authenticatedRoute } from "@/lib/api/user-preferences";
import type { LegalDocumentId } from "@/lib/legal/documents";
import { formatKoreanPhoneInput, toE164KoreanPhone } from "@/lib/phone";
import { getSignupError, isSignupValid, type SignupField, type SignupValues } from "@/lib/validation/auth";
import styles from "./phone-auth-form.module.css";

const INITIAL_VALUES: SignupValues = {
  username: "",
  password: "",
  passwordConfirmation: "",
  agreedToTerms: false,
};

type AccountIdCheckStatus = "idle" | "checking" | "available" | "duplicate" | "unavailable";

const ACCOUNT_ID_CHECK_MESSAGES: Partial<Record<AccountIdCheckStatus, string>> = {
  available: "사용 가능한 아이디예요.",
  duplicate: "이미 사용 중인 아이디예요.",
  unavailable: "중복 확인 기능에 연결할 수 없어요.",
};

function formatRemainingTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function PhoneAuthForm() {
  const router = useRouter();
  const [values, setValues] = useState(INITIAL_VALUES);
  const [phone, setPhone] = useState("");
  const [verifiedPhone, setVerifiedPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<SignupField, boolean>>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false);
  const [openLegalDocument, setOpenLegalDocument] = useState<LegalDocumentId | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingAction, setPendingAction] = useState<"send" | "resend" | "verify" | null>(null);
  const [otpExpiresAtMs, setOtpExpiresAtMs] = useState<number | null>(null);
  const [otpTimerNowMs, setOtpTimerNowMs] = useState(() => Date.now());
  const [accountIdCheckStatus, setAccountIdCheckStatus] = useState<AccountIdCheckStatus>("idle");
  const accountIdCheckRequestRef = useRef(0);
  const isSubmitting = pendingAction !== null;
  const accountIdCheckMessage = ACCOUNT_ID_CHECK_MESSAGES[accountIdCheckStatus];
  const otpRemainingSeconds = otpExpiresAtMs === null
    ? null
    : Math.max(0, Math.ceil((otpExpiresAtMs - otpTimerNowMs) / 1000));
  const isOtpExpired = otpRemainingSeconds === 0;

  useEffect(() => {
    let cancelled = false;
    void restoreAuthenticatedUser().then(async (user) => {
      if (!user || cancelled) return;
      const route = await authenticatedRoute(user);
      if (!cancelled) router.replace(route);
    });
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    if (otpExpiresAtMs === null || otpExpiresAtMs <= Date.now()) return;

    const intervalId = window.setInterval(() => {
      const nowMs = Date.now();
      setOtpTimerNowMs(nowMs);
      if (nowMs >= otpExpiresAtMs) window.clearInterval(intervalId);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [otpExpiresAtMs]);

  function invalidateOtp() {
    setVerifiedPhone("");
    setOtp("");
    setNotice("");
    setOtpExpiresAtMs(null);
  }

  function applyOtpExpiration(expiresAtMs: number | null) {
    setOtpExpiresAtMs(expiresAtMs);
    setOtpTimerNowMs(Date.now());
  }

  function update(field: SignupField, value: string | boolean) {
    setValues((current) => ({ ...current, [field]: value }));
    invalidateOtp();
    setError("");
  }

  function updateAccountId(value: string) {
    accountIdCheckRequestRef.current += 1;
    setAccountIdCheckStatus("idle");
    update("username", value);
  }

  async function checkAccountId() {
    setTouched((current) => ({ ...current, username: true }));
    if (getSignupError("username", values) || accountIdCheckStatus === "checking") return;

    const accountId = values.username.trim();
    const requestId = accountIdCheckRequestRef.current + 1;
    accountIdCheckRequestRef.current = requestId;
    setAccountIdCheckStatus("checking");

    try {
      const available = await checkAccountIdAvailability(accountId);
      if (accountIdCheckRequestRef.current !== requestId) return;
      setAccountIdCheckStatus(available ? "available" : "duplicate");
    } catch {
      if (accountIdCheckRequestRef.current !== requestId) return;
      setAccountIdCheckStatus("unavailable");
    }
  }

  function errorFor(field: SignupField) {
    return touched[field] ? getSignupError(field, values) : undefined;
  }

  async function requestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({ username: true, password: true, passwordConfirmation: true, agreedToTerms: true });
    if (accountIdCheckStatus === "duplicate") return;
    const normalizedPhone = toE164KoreanPhone(phone);
    if (!isSignupValid(values) || !agreedToPrivacy) {
      if (!agreedToPrivacy) setError("필수 약관에 모두 동의해주세요.");
      return;
    }
    if (!normalizedPhone) {
      setError("휴대폰 번호를 정확히 입력해주세요.");
      return;
    }

    setPendingAction("send");
    setError("");
    setNotice("");
    try {
      const { expiresAtMs } = await sendPhoneOtp(normalizedPhone);
      setVerifiedPhone(normalizedPhone);
      setOtp("");
      applyOtpExpiration(expiresAtMs);
      setNotice("인증번호를 전송했습니다.");
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 429
        ? "인증 요청이 너무 많습니다. 잠시 후 다시 시도해주세요."
        : "인증번호를 보내지 못했습니다. 번호를 확인한 뒤 다시 시도해주세요.");
    } finally {
      setPendingAction(null);
    }
  }

  async function resendOtp() {
    const normalizedPhone = toE164KoreanPhone(phone);
    if (!normalizedPhone || normalizedPhone !== verifiedPhone) {
      invalidateOtp();
      setError("휴대폰 번호를 다시 확인한 뒤 인증번호를 요청해주세요.");
      return;
    }

    setPendingAction("resend");
    setError("");
    setNotice("");
    try {
      const { expiresAtMs } = await sendPhoneOtp(normalizedPhone);
      setOtp("");
      applyOtpExpiration(expiresAtMs);
      setNotice("인증번호를 다시 전송했습니다.");
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 429
        ? "인증 요청이 너무 많습니다. 잠시 후 다시 시도해주세요."
        : "인증번호를 다시 보내지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setPendingAction(null);
    }
  }

  async function confirmOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (accountIdCheckStatus === "duplicate") return;
    if (!/^\d{6}$/.test(otp)) {
      setError("6자리 인증번호를 입력해주세요.");
      return;
    }
    if (!isSignupValid(values) || !agreedToPrivacy || toE164KoreanPhone(phone) !== verifiedPhone) {
      invalidateOtp();
      setError("가입 정보를 다시 확인한 뒤 인증번호를 요청해주세요.");
      return;
    }
    setPendingAction("verify");
    setError("");
    setNotice("");
    try {
      const user = await verifyPhoneOtp(
        verifiedPhone,
        otp,
        values.username.trim(),
        values.password,
      );
      setOtpExpiresAtMs(null);
      let destination: "/priorities" | "/home" = "/priorities";
      try {
        destination = await authenticatedRoute(user);
      } catch {
        // Account creation already succeeded. A follow-up preference lookup must
        // never be reported as an invalid or expired one-time code.
      }
      router.replace(destination);
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 401
        ? "인증번호가 일치하지 않거나 만료되었습니다."
        : cause instanceof ApiError && cause.status === 409
          ? "이미 사용 중인 아이디입니다."
          : cause instanceof ApiError && cause.status === 403
            ? "현재 약관 동의가 필요합니다."
            : "회원가입 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <form className="stage-form" onSubmit={verifiedPhone ? confirmOtp : requestOtp} noValidate>
      <div className={styles.accountIdField}>
        <FormField id="signup-username" label="아이디" type="text" homeLinkFocus placeholder="영문/숫자 4~12자" autoComplete="username" value={values.username} onChange={(event) => updateAccountId(event.target.value)} onBlur={() => setTouched((current) => ({ ...current, username: true }))} error={errorFor("username")} disabled={isSubmitting} autoFocus />
        <div className={styles.accountIdCheckRow}>
          {accountIdCheckMessage ? (
            <p
              className={styles.accountIdStatus}
              data-status={accountIdCheckStatus}
              role={accountIdCheckStatus === "duplicate" ? "alert" : "status"}
              aria-live="polite"
            >
              {accountIdCheckMessage}
            </p>
          ) : null}
          <button
            className={styles.accountIdCheckButton}
            type="button"
            disabled={isSubmitting || accountIdCheckStatus === "checking" || !values.username.trim()}
            onClick={checkAccountId}
          >
            {accountIdCheckStatus === "checking" ? "확인 중" : "중복 확인"}
          </button>
        </div>
      </div>
      <FormField id="signup-password" label="비밀번호" type={showPassword ? "text" : "password"} homeLinkFocus placeholder="영문, 숫자, 특수문자 조합 8~16자" autoComplete="new-password" value={values.password} onChange={(event) => update("password", event.target.value)} onBlur={() => setTouched((current) => ({ ...current, password: true }))} error={errorFor("password")} disabled={isSubmitting} trailingControl={<PasswordVisibilityButton visible={showPassword} onToggle={() => setShowPassword((value) => !value)} />} />
      <FormField id="password-confirmation" label="비밀번호 재확인" type={showPasswordConfirmation ? "text" : "password"} homeLinkFocus placeholder="비밀번호를 한 번 더 입력해주세요." autoComplete="new-password" value={values.passwordConfirmation} onChange={(event) => update("passwordConfirmation", event.target.value)} onBlur={() => setTouched((current) => ({ ...current, passwordConfirmation: true }))} error={errorFor("passwordConfirmation")} disabled={isSubmitting} trailingControl={<PasswordVisibilityButton visible={showPasswordConfirmation} onToggle={() => setShowPasswordConfirmation((value) => !value)} />} />
      <FormField id="signup-phone" label="휴대폰 번호" type="tel" inputMode="tel" autoComplete="tel" maxLength={13} placeholder="010-1234-5678" value={phone} onChange={(event) => { setPhone(formatKoreanPhoneInput(event.target.value)); invalidateOtp(); setError(""); }} disabled={isSubmitting} />
      {verifiedPhone ? (
        <div className={styles.otpSection}>
          <p className={styles.otpInstruction}>전송된 인증번호를 입력해주세요.</p>
          <FormField
            id="signup-otp"
            label="인증번호"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="6자리 숫자"
            value={otp}
            onChange={(event) => { setOtp(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); setNotice(""); }}
            error={error || undefined}
            disabled={isSubmitting}
            autoFocus
            trailingControl={otpRemainingSeconds !== null ? (
              <span
                className={`${styles.otpTimer} ${isOtpExpired ? styles.otpTimerExpired : ""}`}
                role="timer"
                aria-label={`인증번호 만료까지 ${formatRemainingTime(otpRemainingSeconds)}`}
              >
                {formatRemainingTime(otpRemainingSeconds)}
              </span>
            ) : undefined}
          />
          {isOtpExpired ? (
            <p className={styles.otpExpiredNotice} role="status">인증번호가 만료되었어요. 다시 전송해주세요.</p>
          ) : null}
          <button className={styles.resendButton} type="button" disabled={isSubmitting} onClick={resendOtp}>
            {pendingAction === "resend" ? "재전송 중..." : "인증번호 재전송"}
          </button>
          {notice ? <p className={styles.notice} role="status" aria-live="polite">{notice}</p> : null}
        </div>
      ) : null}
      <div className="terms-group">
        <div className="terms-row">
          <label className="checkbox-label">
            <input type="checkbox" checked={values.agreedToTerms} onChange={(event) => { update("agreedToTerms", event.target.checked); setTouched((current) => ({ ...current, agreedToTerms: true })); }} disabled={isSubmitting} />
            <span className="terms-copy"><span className="terms-required">[필수]</span><span>서비스 이용약관에 동의합니다.</span></span>
          </label>
          <button className="terms-view-button" type="button" onClick={() => setOpenLegalDocument("terms")}>보기</button>
        </div>
        <div className="terms-row">
          <label className="checkbox-label">
            <input type="checkbox" checked={agreedToPrivacy} onChange={(event) => { setAgreedToPrivacy(event.target.checked); invalidateOtp(); setError(""); }} disabled={isSubmitting} />
            <span className="terms-copy"><span className="terms-required">[필수]</span><span>개인정보 수집·이용에 동의합니다.</span></span>
          </label>
          <button className="terms-view-button" type="button" onClick={() => setOpenLegalDocument("privacyConsent")}>보기</button>
        </div>
      </div>
      {error && !verifiedPhone ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="button-stack">
        <button className="button button-primary" type="submit" disabled={isSubmitting || accountIdCheckStatus === "duplicate" || !phone.trim() || !isSignupValid(values) || !agreedToPrivacy || (Boolean(verifiedPhone) && otp.length !== 6)}>
          {pendingAction === "send" ? "전송 중..." : pendingAction === "verify" ? "확인 중..." : verifiedPhone ? "인증하고 가입하기" : "인증번호 받기"}
        </button>
        <Link className="button button-secondary" href="/login">로그인</Link>
      </div>
      {openLegalDocument ? <LegalDocumentDialog documentId={openLegalDocument} onClose={() => setOpenLegalDocument(null)} /> : null}
    </form>
  );
}

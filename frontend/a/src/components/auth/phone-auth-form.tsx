"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FormField, PasswordVisibilityButton } from "@/components/auth/form-field";
import { LegalDocumentDialog } from "@/components/legal/legal-document-dialog";
import { restoreAuthenticatedUser, sendPhoneOtp, verifyPhoneOtp } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { authenticatedRoute } from "@/lib/api/user-preferences";
import type { LegalDocumentId } from "@/lib/legal/documents";
import { formatE164Phone, formatKoreanPhoneInput, toE164KoreanPhone } from "@/lib/phone";
import { getSignupError, isSignupValid, type SignupField, type SignupValues } from "@/lib/validation/auth";

const INITIAL_VALUES: SignupValues = {
  username: "",
  password: "",
  passwordConfirmation: "",
  agreedToTerms: false,
};

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
  const [step, setStep] = useState<"details" | "otp">("details");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void restoreAuthenticatedUser().then(async (user) => {
      if (!user || cancelled) return;
      const route = await authenticatedRoute(user);
      if (!cancelled) router.replace(route);
    });
    return () => { cancelled = true; };
  }, [router]);

  function update(field: SignupField, value: string | boolean) {
    setValues((current) => ({ ...current, [field]: value }));
    setError("");
  }

  function errorFor(field: SignupField) {
    return touched[field] ? getSignupError(field, values) : undefined;
  }

  async function requestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({ username: true, password: true, passwordConfirmation: true, agreedToTerms: true });
    const normalizedPhone = toE164KoreanPhone(phone);
    if (!isSignupValid(values) || !agreedToPrivacy) {
      if (!agreedToPrivacy) setError("필수 약관에 모두 동의해주세요.");
      return;
    }
    if (!normalizedPhone) {
      setError("휴대폰 번호를 정확히 입력해주세요.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      await sendPhoneOtp(normalizedPhone);
      setVerifiedPhone(normalizedPhone);
      setStep("otp");
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 429
        ? "인증 요청이 너무 많습니다. 잠시 후 다시 시도해주세요."
        : "인증번호를 보내지 못했습니다. 번호를 확인한 뒤 다시 시도해주세요.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function confirmOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(otp)) {
      setError("6자리 인증번호를 입력해주세요.");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      const user = await verifyPhoneOtp(
        verifiedPhone,
        otp,
        values.username.trim(),
        values.password,
      );
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
      setIsSubmitting(false);
    }
  }

  if (step === "otp") {
    return (
      <form className="stage-form" onSubmit={confirmOtp} noValidate>
        <p className="stage-description">{formatE164Phone(verifiedPhone)}로 전송된 인증번호를 입력해주세요.</p>
        <FormField id="signup-otp" label="인증번호" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6자리 숫자" value={otp} onChange={(event) => { setOtp(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} error={error || undefined} autoFocus />
        <div className="button-stack">
          <button className="button button-primary" type="submit" disabled={isSubmitting || otp.length !== 6}>{isSubmitting ? "확인 중..." : "인증하고 가입하기"}</button>
          <button className="button button-secondary" type="button" disabled={isSubmitting} onClick={() => { setStep("details"); setOtp(""); setError(""); }}>정보 다시 입력</button>
        </div>
      </form>
    );
  }

  return (
    <form className="stage-form" onSubmit={requestOtp} noValidate>
      <FormField id="signup-username" label="아이디" type="text" homeLinkFocus placeholder="영문/숫자 4~12자" autoComplete="username" value={values.username} onChange={(event) => update("username", event.target.value)} onBlur={() => setTouched((current) => ({ ...current, username: true }))} error={errorFor("username")} autoFocus />
      <FormField id="signup-password" label="비밀번호" type={showPassword ? "text" : "password"} homeLinkFocus placeholder="영문, 숫자, 특수문자 조합 8~16자" autoComplete="new-password" value={values.password} onChange={(event) => update("password", event.target.value)} onBlur={() => setTouched((current) => ({ ...current, password: true }))} error={errorFor("password")} trailingControl={<PasswordVisibilityButton visible={showPassword} onToggle={() => setShowPassword((value) => !value)} />} />
      <FormField id="password-confirmation" label="비밀번호 재확인" type={showPasswordConfirmation ? "text" : "password"} homeLinkFocus placeholder="비밀번호를 한 번 더 입력해주세요." autoComplete="new-password" value={values.passwordConfirmation} onChange={(event) => update("passwordConfirmation", event.target.value)} onBlur={() => setTouched((current) => ({ ...current, passwordConfirmation: true }))} error={errorFor("passwordConfirmation")} trailingControl={<PasswordVisibilityButton visible={showPasswordConfirmation} onToggle={() => setShowPasswordConfirmation((value) => !value)} />} />
      <FormField id="signup-phone" label="휴대폰 번호" type="tel" inputMode="tel" autoComplete="tel" maxLength={13} placeholder="010-1234-5678" value={phone} onChange={(event) => { setPhone(formatKoreanPhoneInput(event.target.value)); setError(""); }} />
      <div className="terms-group">
        <div className="terms-row">
          <label className="checkbox-label">
            <input type="checkbox" checked={values.agreedToTerms} onChange={(event) => { update("agreedToTerms", event.target.checked); setTouched((current) => ({ ...current, agreedToTerms: true })); }} />
            <span className="terms-copy"><span className="terms-required">[필수]</span><span>서비스 이용약관에 동의합니다.</span></span>
          </label>
          <button className="terms-view-button" type="button" onClick={() => setOpenLegalDocument("terms")}>보기</button>
        </div>
        <div className="terms-row">
          <label className="checkbox-label">
            <input type="checkbox" checked={agreedToPrivacy} onChange={(event) => { setAgreedToPrivacy(event.target.checked); setError(""); }} />
            <span className="terms-copy"><span className="terms-required">[필수]</span><span>개인정보 수집·이용에 동의합니다.</span></span>
          </label>
          <button className="terms-view-button" type="button" onClick={() => setOpenLegalDocument("privacyConsent")}>보기</button>
        </div>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="button-stack">
        <button className="button button-primary" type="submit" disabled={isSubmitting || !phone.trim() || !isSignupValid(values) || !agreedToPrivacy}>{isSubmitting ? "전송 중..." : "인증번호 받기"}</button>
        <Link className="button button-secondary" href="/login">로그인</Link>
      </div>
      {openLegalDocument ? <LegalDocumentDialog documentId={openLegalDocument} onClose={() => setOpenLegalDocument(null)} /> : null}
    </form>
  );
}

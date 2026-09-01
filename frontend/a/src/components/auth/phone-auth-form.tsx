"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FormField } from "@/components/auth/form-field";
import { restoreAuthenticatedUser, sendPhoneOtp, verifyPhoneOtp, type PhoneAuthPurpose } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { authenticatedRoute } from "@/lib/api/user-preferences";

type Props = {
  purpose: PhoneAuthPurpose;
};

export function PhoneAuthForm({ purpose }: Props) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [verifiedPhone, setVerifiedPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSignup = purpose === "signup";

  useEffect(() => {
    let cancelled = false;
    void restoreAuthenticatedUser().then(async (user) => {
      if (!user || cancelled) return;
      const route = await authenticatedRoute(user);
      if (!cancelled) router.replace(route);
    });
    return () => { cancelled = true; };
  }, [router]);

  async function requestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedPhone = toE164KoreanPhone(phone);
    if (!normalizedPhone) {
      setError("휴대폰 번호를 정확히 입력해주세요.");
      return;
    }
    if (isSignup && !agreedToTerms) {
      setError("서비스 이용약관에 동의해주세요.");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      await sendPhoneOtp(normalizedPhone, purpose);
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
      const user = await verifyPhoneOtp(verifiedPhone, otp, isSignup && agreedToTerms);
      router.replace(await authenticatedRoute(user));
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 401
        ? "인증번호가 일치하지 않거나 만료되었습니다."
        : cause instanceof ApiError && cause.status === 403
          ? "현재 약관 동의가 필요합니다. 회원가입 화면에서 약관에 동의한 뒤 인증해주세요."
          : "인증 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (step === "otp") {
    return (
      <form className="stage-form" onSubmit={confirmOtp} noValidate>
        <p className="stage-description">{formatE164Phone(verifiedPhone)}로 전송된 인증번호를 입력해주세요.</p>
        <FormField
          id={`${purpose}-otp`}
          label="인증번호"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="6자리 숫자"
          value={otp}
          onChange={(event) => { setOtp(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
          error={error || undefined}
          autoFocus
        />
        <div className="button-stack">
          <button className="button button-primary" type="submit" disabled={isSubmitting || otp.length !== 6}>
            {isSubmitting ? "확인 중..." : isSignup ? "인증하고 가입하기" : "인증하고 로그인"}
          </button>
          <button className="button button-secondary" type="button" disabled={isSubmitting} onClick={() => { setStep("phone"); setOtp(""); setError(""); }}>
            번호 다시 입력
          </button>
        </div>
      </form>
    );
  }

  return (
    <form className="stage-form" onSubmit={requestOtp} noValidate>
      <FormField
        id={`${purpose}-phone`}
        label="휴대폰 번호"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="010-1234-5678"
        value={phone}
        onChange={(event) => { setPhone(event.target.value); setError(""); }}
        error={error || undefined}
        autoFocus
      />
      {isSignup ? (
        <div className="terms-group">
          <label className="checkbox-label">
            <input type="checkbox" checked={agreedToTerms} onChange={(event) => { setAgreedToTerms(event.target.checked); setError(""); }} />
            <span>[필수] 서비스 이용약관에 동의합니다.</span>
          </label>
        </div>
      ) : null}
      <div className="button-stack">
        <button className="button button-primary" type="submit" disabled={isSubmitting || !phone.trim() || (isSignup && !agreedToTerms)}>
          {isSubmitting ? "전송 중..." : "인증번호 받기"}
        </button>
        <Link className="button button-secondary" href={isSignup ? "/login" : "/signup"}>
          {isSignup ? "로그인" : "회원가입"}
        </Link>
      </div>
    </form>
  );
}

function toE164KoreanPhone(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!trimmed.startsWith("+") && digits.startsWith("0") && !/^010\d{8}$/.test(digits)) {
    return null;
  }
  const candidate = trimmed.startsWith("+")
    ? `+${digits}`
    : digits.startsWith("82")
      ? `+${digits}`
      : digits.startsWith("0")
        ? `+82${digits.slice(1)}`
        : "";
  return /^\+[1-9]\d{7,14}$/.test(candidate) ? candidate : null;
}

function formatE164Phone(phone: string): string {
  if (/^\+8210\d{8}$/.test(phone)) {
    return `010-${phone.slice(5, 9)}-${phone.slice(9)}`;
  }
  return phone;
}

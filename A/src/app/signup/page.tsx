"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { FormField, PasswordVisibilityButton } from "@/components/auth/form-field";
import { mockSignup } from "@/lib/mock/auth";
import { setMockAuthenticated } from "@/lib/mock/session";
import { getSignupError, isSignupValid, SignupField, SignupValues } from "@/lib/validation/auth";

const INITIAL_VALUES: SignupValues = { email: "", username: "", password: "", passwordConfirmation: "", agreedToTerms: false };

export default function SignupPage() {
  const router = useRouter();
  const [values, setValues] = useState(INITIAL_VALUES);
  const [touched, setTouched] = useState<Partial<Record<SignupField, boolean>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false);
  const canSubmit = isSignupValid(values) && !isSubmitting;
  const errorFor = (field: SignupField) => touched[field] ? getSignupError(field, values) : undefined;
  const update = (field: SignupField, value: string | boolean) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFormError("");
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setTouched({ email: true, username: true, password: true, passwordConfirmation: true, agreedToTerms: true });
    if (!isSignupValid(values)) return;
    setIsSubmitting(true);
    try {
      const result = await mockSignup();
      if (result.ok) {
        setMockAuthenticated();
        router.push("/priorities");
      }
    } catch {
      setFormError("회원가입 처리 중 예상하지 못한 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell title="회원가입" backHref="/login" className="signup-card">
      <form className="stage-form" onSubmit={handleSubmit} noValidate>
        <FormField id="email" label="이메일" type="email" placeholder="example@domain.com" autoComplete="email" value={values.email} onChange={(e) => update("email", e.target.value)} onBlur={() => setTouched((v) => ({ ...v, email: true }))} error={errorFor("email")} />
        <FormField id="signup-username" label="아이디" type="text" placeholder="영문/숫자 4~12자" autoComplete="username" value={values.username} onChange={(e) => update("username", e.target.value)} onBlur={() => setTouched((v) => ({ ...v, username: true }))} error={errorFor("username")} />
        <FormField id="signup-password" label="비밀번호" type={showPassword ? "text" : "password"} placeholder="영문, 숫자, 특수문자 조합 8~16자" autoComplete="new-password" value={values.password} onChange={(e) => update("password", e.target.value)} onBlur={() => setTouched((v) => ({ ...v, password: true }))} error={errorFor("password")} trailingControl={<PasswordVisibilityButton visible={showPassword} onToggle={() => setShowPassword((value) => !value)} />} />
        <FormField id="password-confirmation" label="비밀번호 재확인" type={showPasswordConfirmation ? "text" : "password"} placeholder="비밀번호를 한 번 더 입력해주세요." autoComplete="new-password" value={values.passwordConfirmation} onChange={(e) => update("passwordConfirmation", e.target.value)} onBlur={() => setTouched((v) => ({ ...v, passwordConfirmation: true }))} error={errorFor("passwordConfirmation")} trailingControl={<PasswordVisibilityButton visible={showPasswordConfirmation} onToggle={() => setShowPasswordConfirmation((value) => !value)} />} />
        <div className="terms-group">
          <label className="checkbox-label">
            <input type="checkbox" checked={values.agreedToTerms} onChange={(e) => { update("agreedToTerms", e.target.checked); setTouched((v) => ({ ...v, agreedToTerms: true })); }} onBlur={() => setTouched((v) => ({ ...v, agreedToTerms: true }))} />
            <span>[필수] 서비스 이용약관에 동의합니다.</span>
          </label>
          {errorFor("agreedToTerms") ? <p className="error-text" role="alert">{errorFor("agreedToTerms")}</p> : null}
        </div>
        {formError ? <p className="form-error" role="alert">{formError}</p> : null}
        <button className="button button-primary" type="submit" disabled={!canSubmit}>{isSubmitting ? "가입 중..." : "회원가입"}</button>
      </form>
    </AuthShell>
  );
}
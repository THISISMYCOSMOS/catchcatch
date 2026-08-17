"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { FormField, PasswordVisibilityButton } from "@/components/auth/form-field";
import { PasswordRecoveryDialog } from "@/components/auth/password-recovery-dialog";
import { mockLogin } from "@/lib/mock/auth";
import { getMockAuthenticatedRoute, setMockAuthenticated } from "@/lib/mock/session";
import { getEmailError } from "@/lib/validation/auth";
import recoveryStyles from "@/components/auth/password-recovery-dialog.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberLogin, setRememberLogin] = useState(false);
  const [isPasswordRecoveryOpen, setIsPasswordRecoveryOpen] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canSubmit = Boolean(email.trim() && password) && !isSubmitting;

  useEffect(() => {
    const authenticatedRoute = getMockAuthenticatedRoute();
    if (authenticatedRoute !== "/login") router.replace(authenticatedRoute);
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    const nextErrors = {
      email: getEmailError(email),
      password: password ? undefined : "비밀번호를 입력해주세요.",
    };
    setErrors(nextErrors);
    if (nextErrors.email || nextErrors.password) return;
    setIsSubmitting(true);
    try {
      const result = await mockLogin(email, password);
      if (!result.ok) {
        setErrors({ form: "이메일 또는 비밀번호가 일치하지 않습니다." });
        return;
      }
      setMockAuthenticated(result.accountId, rememberLogin);
      router.replace(getMockAuthenticatedRoute());
    } catch {
      setErrors({ form: "로그인 처리 중 예상하지 못한 오류가 발생했습니다." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <AuthShell title="로그인" className="login-card">
        <form className="stage-form" onSubmit={handleSubmit} noValidate>
          <FormField id="email" label="이메일" type="email" homeLinkFocus placeholder="example@domain.com" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setErrors({}); }} onBlur={() => setErrors((current) => ({ ...current, email: getEmailError(email) }))} error={errors.email} />
          <div className="login-password-options">
            <FormField id="password" label="비밀번호" type={showPassword ? "text" : "password"} homeLinkFocus placeholder="비밀번호 입력" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setErrors({}); }} onBlur={() => { if (!password) setErrors((current) => ({ ...current, password: "비밀번호를 입력해주세요." })); }} error={errors.password} trailingControl={<PasswordVisibilityButton visible={showPassword} onToggle={() => { setShowPassword((value) => !value); window.requestAnimationFrame(() => document.getElementById("password")?.focus()); }} />} />
            <label className="checkbox-label login-persistence">
              <input type="checkbox" checked={rememberLogin} onChange={(event) => setRememberLogin(event.target.checked)} />
              <span>로그인 유지</span>
            </label>
          </div>
          <button className={recoveryStyles.recoveryLink} type="button" onClick={() => setIsPasswordRecoveryOpen(true)}>비밀번호 찾기</button>
          {errors.form ? <p className="form-error" role="alert">{errors.form}</p> : null}
          <div className="button-stack">
            <button className="button button-primary" type="submit" disabled={!canSubmit}>{isSubmitting ? "로그인 중..." : "로그인"}</button>
            <Link className="button button-secondary" href="/signup">회원가입</Link>
          </div>
        </form>
      </AuthShell>
      {isPasswordRecoveryOpen ? (
        <PasswordRecoveryDialog onClose={() => setIsPasswordRecoveryOpen(false)} />
      ) : null}
    </>
  );
}

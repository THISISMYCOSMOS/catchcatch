"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { FormField, PasswordVisibilityButton } from "@/components/auth/form-field";
import { mockLogin } from "@/lib/mock/auth";
import { isMockAuthenticated, setMockAuthenticated } from "@/lib/mock/session";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberLogin, setRememberLogin] = useState(false);
  const [errors, setErrors] = useState<{ username?: string; password?: string; form?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canSubmit = Boolean(username.trim() && password) && !isSubmitting;

  useEffect(() => {
    if (isMockAuthenticated()) router.replace("/home");
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    const nextErrors = {
      username: username.trim() ? undefined : "아이디를 입력해주세요.",
      password: password ? undefined : "비밀번호를 입력해주세요.",
    };
    setErrors(nextErrors);
    if (nextErrors.username || nextErrors.password) return;
    setIsSubmitting(true);
    try {
      const isValid = await mockLogin(username.trim(), password);
      if (!isValid) {
        setErrors({ form: "아이디 또는 비밀번호가 일치하지 않습니다." });
        return;
      }
      setMockAuthenticated(rememberLogin);
      router.replace("/home");
    } catch {
      setErrors({ form: "로그인 처리 중 예상하지 못한 오류가 발생했습니다." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell title="로그인" className="login-card">
      <form className="stage-form" onSubmit={handleSubmit} noValidate>
        <FormField id="username" label="아이디" type="text" placeholder="아이디 입력" autoComplete="username" value={username} onChange={(e) => { setUsername(e.target.value); setErrors({}); }} onBlur={() => { if (!username.trim()) setErrors((current) => ({ ...current, username: "아이디를 입력해주세요." })); }} error={errors.username} />
        <div className="login-password-options">
          <FormField id="password" label="비밀번호" type={showPassword ? "text" : "password"} placeholder="비밀번호 입력" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setErrors({}); }} onBlur={() => { if (!password) setErrors((current) => ({ ...current, password: "비밀번호를 입력해주세요." })); }} error={errors.password} trailingControl={<PasswordVisibilityButton visible={showPassword} onToggle={() => setShowPassword((value) => !value)} />} />
          <label className="checkbox-label login-persistence">
            <input type="checkbox" checked={rememberLogin} onChange={(event) => setRememberLogin(event.target.checked)} />
            <span>로그인 유지</span>
          </label>
        </div>
        <p className="disabled-help" aria-disabled="true">아이디 찾기 <span aria-hidden="true">·</span> 비밀번호 찾기</p>
        {errors.form ? <p className="form-error" role="alert">{errors.form}</p> : null}
        <div className="button-stack">
          <button className="button button-primary" type="submit" disabled={!canSubmit}>{isSubmitting ? "로그인 중..." : "로그인"}</button>
          <Link className="button button-secondary" href="/signup">회원가입</Link>
        </div>
      </form>
    </AuthShell>
  );
}

"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FormField, PasswordVisibilityButton } from "@/components/auth/form-field";
import { login, restoreAuthenticatedUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { authenticatedRoute } from "@/lib/api/user-preferences";

export function LoginForm() {
  const router = useRouter();
  const [accountId, setAccountId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ accountId?: string; password?: string; form?: string }>({});
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    const nextErrors = {
      accountId: accountId.trim() ? undefined : "아이디를 입력해주세요.",
      password: password ? undefined : "비밀번호를 입력해주세요.",
    };
    setErrors(nextErrors);
    if (nextErrors.accountId || nextErrors.password) return;

    setIsSubmitting(true);
    try {
      const user = await login(accountId.trim(), password);
      router.replace(await authenticatedRoute(user));
    } catch (cause) {
      setErrors({
        form: cause instanceof ApiError && cause.status === 429
          ? "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요."
          : "아이디 또는 비밀번호가 일치하지 않습니다.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="stage-form" onSubmit={handleSubmit} noValidate>
      <FormField
        id="account-id"
        label="아이디"
        type="text"
        homeLinkFocus
        placeholder="아이디 입력"
        autoComplete="username"
        value={accountId}
        onChange={(event) => { setAccountId(event.target.value); setErrors({}); }}
        error={errors.accountId}
        autoFocus
      />
      <FormField
        id="password"
        label="비밀번호"
        type={showPassword ? "text" : "password"}
        homeLinkFocus
        placeholder="비밀번호 입력"
        autoComplete="current-password"
        value={password}
        onChange={(event) => { setPassword(event.target.value); setErrors({}); }}
        error={errors.password}
        trailingControl={(
          <PasswordVisibilityButton
            visible={showPassword}
            onToggle={() => setShowPassword((value) => !value)}
          />
        )}
      />
      {errors.form ? <p className="form-error" role="alert">{errors.form}</p> : null}
      <div className="button-stack">
        <button className="button button-primary" type="submit" disabled={isSubmitting || !accountId.trim() || !password}>
          {isSubmitting ? "로그인 중..." : "로그인"}
        </button>
        <Link className="button button-secondary" href="/signup">회원가입</Link>
      </div>
    </form>
  );
}

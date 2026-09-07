"use client";

import Link from "next/link";
import type { FormEvent, KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppLogo } from "@/components/app-logo";
import { FormField, PasswordVisibilityButton } from "@/components/auth/form-field";
import { logout, restoreAuthenticatedUser, sendWithdrawalOtp, withdrawAccount } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { getEmailError, getPasswordError } from "@/lib/validation/auth";

type ProfileLoadState = "loading" | "ready" | "error";
type UserProfile = {
  id: string;
  accountId: string | null;
  username: string;
  nickname: string | null;
  email: string | null;
  phoneNumber: string | null;
  joinedAt: null;
  profileImageUrl: null;
  loginProvider: null;
};
type EditableProfileValues = {
  nickname: string;
  email: string;
};
type EditableProfileField = keyof EditableProfileValues;
type PasswordChangeValues = {
  currentPassword: string;
  newPassword: string;
  newPasswordConfirmation: string;
};
type PasswordChangeField = keyof PasswordChangeValues;
type ProfilePasswordVerifier = (password: string) => Promise<boolean>;

const INITIAL_PASSWORD_VALUES: PasswordChangeValues = {
  currentPassword: "",
  newPassword: "",
  newPasswordConfirmation: "",
};

function ChevronIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>;
}

function CloseIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg>;
}

function ProfileDialog({
  children,
  description,
  initialFocusSelector,
  onClose,
  title,
  unifiedContent = false,
}: {
  children: ReactNode;
  description: string;
  initialFocusSelector: string;
  onClose: () => void;
  title: string;
  unifiedContent?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = "profile-dialog-withdrawal-title";
  const descriptionId = `${titleId}-description`;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useLayoutEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const scrollY = window.scrollY;
    const bodyWidth = document.body.getBoundingClientRect().width;
    const overlay = overlayRef.current;
    const previousBodyStyles = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    };

    overlay?.style.setProperty("--modal-scroll-offset", `${scrollY}px`);
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = `${bodyWidth}px`;
    dialogRef.current?.querySelector<HTMLElement>(initialFocusSelector)?.focus();

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseRef.current();
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = previousBodyStyles.overflow;
      document.body.style.position = previousBodyStyles.position;
      document.body.style.top = previousBodyStyles.top;
      document.body.style.width = previousBodyStyles.width;
      overlay?.style.removeProperty("--modal-scroll-offset");
      window.scrollTo(0, scrollY);
      previousFocus?.focus();
    };
  }, [initialFocusSelector]);

  function keepFocusInside(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex='-1'])",
    );
    if (!focusableElements?.length) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
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

  return (
    <div className="previous-analysis-overlay profile-dialog-overlay" ref={overlayRef} onClick={closeFromOverlay}>
      <div
        className="previous-analysis-dialog profile-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        ref={dialogRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={keepFocusInside}
      >
        {unifiedContent ? (
          <div className="profile-dialog-header">
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
            {children}
            <button className="previous-analysis-close profile-dialog-close" type="button" aria-label={`${title} 창 닫기`} onClick={onClose}>
              <CloseIcon />
            </button>
          </div>
        ) : (
          <>
            <header className="profile-dialog-header">
              <div>
                <h2 id={titleId}>{title}</h2>
                <p id={descriptionId}>{description}</p>
              </div>
              <button className="previous-analysis-close profile-dialog-close" type="button" aria-label={`${title} 창 닫기`} onClick={onClose}>
                <CloseIcon />
              </button>
            </header>
            <div className="profile-dialog-content">{children}</div>
          </>
        )}
      </div>
    </div>
  );
}

function WithdrawalDialog({
  onClose,
  onWithdraw,
}: {
  onClose: () => void;
  onWithdraw: (token: string) => Promise<void>;
}) {
  const [step, setStep] = useState<"confirm" | "verify">("confirm");
  const [token, setToken] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (step !== "verify") return;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>("#withdrawal-otp")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [step]);

  async function requestWithdrawalOtp() {
    if (isSending || isSubmitting) return;
    setIsSending(true);
    setError("");
    try {
      await sendWithdrawalOtp();
      setStep("verify");
    } catch (requestError) {
      setError(toWithdrawalErrorMessage(requestError, "send"));
    } finally {
      setIsSending(false);
    }
  }

  async function confirmWithdrawal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || isSending) return;
    if (!/^\d{6}$/.test(token)) {
      setError("문자로 받은 6자리 인증번호를 입력해 주세요.");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      await onWithdraw(token);
    } catch (withdrawError) {
      setError(toWithdrawalErrorMessage(withdrawError, "verify"));
      setIsSubmitting(false);
    }
  }

  return (
    <ProfileDialog
      title="회원탈퇴"
      description={step === "confirm"
        ? "회원탈퇴 후에는 계정과 저장된 정보를 복구할 수 없어요."
        : "등록된 휴대폰으로 전송된 인증번호를 입력해 주세요."}
      initialFocusSelector=".profile-withdrawal-confirm"
      onClose={onClose}
      unifiedContent
    >
      {step === "confirm" ? (
        <>
          <div className="profile-withdrawal-details">
            <p>관심상품과 개인별 분석 기록 등 저장된 서비스 이용 정보가 삭제돼요.</p>
            <p>등록한 혜택·멤버십과 설정한 구매 기준 등 개인 설정도 함께 삭제돼요.</p>
            <p>서비스 운영 및 동의 사실 확인에 필요한 일부 기록은 관련 정책에 따라 일정 기간 별도로 보관될 수 있어요.</p>
          </div>
          <button
            className="button profile-withdrawal-confirm"
            type="button"
            disabled={isSending}
            onClick={() => void requestWithdrawalOtp()}
          >
            {isSending ? "인증번호 전송 중..." : "휴대폰 인증 후 탈퇴"}
          </button>
        </>
      ) : (
        <form className="profile-withdrawal-form" onSubmit={confirmWithdrawal} noValidate>
          <FormField
            id="withdrawal-otp"
            label="인증번호"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={token}
            onChange={(event) => {
              setToken(event.target.value.replace(/\D/g, "").slice(0, 6));
              setError("");
            }}
            placeholder="6자리 숫자"
          />
          <button
            className="button profile-withdrawal-confirm"
            type="submit"
            disabled={isSubmitting || isSending || token.length !== 6}
          >
            {isSubmitting ? "탈퇴 처리 중..." : "인증 후 탈퇴"}
          </button>
          <button
            className="profile-withdrawal-resend"
            type="button"
            disabled={isSending || isSubmitting}
            onClick={() => void requestWithdrawalOtp()}
          >
            {isSending ? "다시 보내는 중..." : "인증번호 다시 받기"}
          </button>
        </form>
      )}
      {error ? <p className="profile-save-error" role="alert">{error}</p> : null}
    </ProfileDialog>
  );
}

function toWithdrawalErrorMessage(error: unknown, phase: "send" | "verify"): string {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return "인증번호 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.";
    }
    if (phase === "verify" && error.status === 401) {
      return "인증번호가 올바르지 않거나 만료됐어요. 다시 확인해 주세요.";
    }
  }
  return phase === "send"
    ? "인증번호를 보내지 못했어요. 잠시 후 다시 시도해 주세요."
    : "회원 탈퇴를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

function ProfileReauthenticationDialog({
  onClose,
  onVerified,
  verifyPassword,
}: {
  onClose: () => void;
  onVerified: () => void;
  verifyPassword?: ProfilePasswordVerifier;
}) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState("");

  function resetSensitiveState() {
    setPassword("");
    setShowPassword(false);
    setError("");
  }

  function resetAndClose() {
    if (isVerifying) return;
    resetSensitiveState();
    onClose();
  }

  function togglePasswordVisibility() {
    setShowPassword((current) => !current);
    window.requestAnimationFrame(() => document.getElementById("profile-edit-password-verification")?.focus());
  }

  async function verifyCurrentPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || isVerifying) return;

    setError("");
    if (!verifyPassword) {
      setError("현재 정보 수정 기능을 준비 중이에요.");
      return;
    }

    setIsVerifying(true);
    try {
      const verified = await verifyPassword(password);
      if (!verified) {
        setError("비밀번호가 일치하지 않습니다.");
        return;
      }
      resetSensitiveState();
      onVerified();
    } catch (verificationError) {
      if (verificationError instanceof ApiError && verificationError.status === 429) {
        setError("시도가 너무 많습니다. 잠시 후 다시 시도해주세요.");
      } else if (verificationError instanceof ApiError && (verificationError.status === 401 || verificationError.status === 403)) {
        setError("비밀번호가 일치하지 않습니다.");
      } else {
        setError("비밀번호를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <ProfileDialog
      title="정보 수정"
      description="정보를 수정하려면 비밀번호를 확인해주세요."
      initialFocusSelector="#profile-edit-password-verification"
      onClose={resetAndClose}
    >
      <form className="profile-reauthentication-form" onSubmit={verifyCurrentPassword} noValidate>
        <FormField
          id="profile-edit-password-verification"
          label="현재 비밀번호"
          type={showPassword ? "text" : "password"}
          homeLinkFocus
          autoComplete="current-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setError("");
          }}
          error={error || undefined}
          trailingControl={<PasswordVisibilityButton visible={showPassword} onToggle={togglePasswordVisibility} />}
        />
        <button className="button button-primary" type="submit" disabled={!password || isVerifying}>
          {isVerifying ? "확인 중..." : "확인"}
        </button>
      </form>
    </ProfileDialog>
  );
}

function PasswordChangeDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const [values, setValues] = useState<PasswordChangeValues>(INITIAL_PASSWORD_VALUES);
  const [touched, setTouched] = useState<Partial<Record<PasswordChangeField, boolean>>>({});
  const [currentPasswordError, setCurrentPasswordError] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [visibleFields, setVisibleFields] = useState<Partial<Record<PasswordChangeField, boolean>>>({});

  const requiredCurrentPasswordError = values.currentPassword ? undefined : "현재 비밀번호를 입력해주세요.";
  const newPasswordFormatError = getPasswordError(values.newPassword);
  const reusedPasswordError = values.currentPassword && values.newPassword === values.currentPassword
    ? "현재 비밀번호와 다른 비밀번호를 입력해주세요."
    : undefined;
  const newPasswordError = reusedPasswordError ?? newPasswordFormatError;
  const confirmationError = !values.newPasswordConfirmation
    ? "새 비밀번호를 다시 입력해주세요."
    : values.newPasswordConfirmation !== values.newPassword
      ? "비밀번호가 일치하지 않습니다."
      : undefined;
  const canSubmit = !requiredCurrentPasswordError
    && !newPasswordError
    && !confirmationError
    && !isSubmitting;

  function resetAndClose() {
    if (isSubmitting) return;
    setValues(INITIAL_PASSWORD_VALUES);
    setTouched({});
    setCurrentPasswordError("");
    setFormError("");
    setVisibleFields({});
    onClose();
  }

  function updateValue(field: PasswordChangeField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (field === "currentPassword") setCurrentPasswordError("");
    setFormError("");
  }

  function toggleVisibility(field: PasswordChangeField, inputId: string) {
    setVisibleFields((current) => ({ ...current, [field]: !current[field] }));
    window.requestAnimationFrame(() => document.getElementById(inputId)?.focus());
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setTouched({ currentPassword: true, newPassword: true, newPasswordConfirmation: true });
    if (!canSubmit) return;

    setIsSubmitting(true);
    setCurrentPasswordError("");
    setFormError("");
    try {
      setFormError("비밀번호 변경 API가 아직 연결되지 않았습니다.");
    } catch {
      setFormError("비밀번호를 변경하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ProfileDialog
      title="비밀번호 변경"
      description="현재 비밀번호를 확인한 뒤 새 비밀번호로 변경합니다."
      initialFocusSelector="#profile-current-password"
      onClose={resetAndClose}
    >
      <form className="profile-password-form" onSubmit={changePassword} noValidate>
        <FormField
          id="profile-current-password"
          label="현재 비밀번호"
          type={visibleFields.currentPassword ? "text" : "password"}
          homeLinkFocus
          autoComplete="current-password"
          value={values.currentPassword}
          onChange={(event) => updateValue("currentPassword", event.target.value)}
          onBlur={() => setTouched((current) => ({ ...current, currentPassword: true }))}
          error={touched.currentPassword ? requiredCurrentPasswordError ?? currentPasswordError : currentPasswordError || undefined}
          trailingControl={<PasswordVisibilityButton visible={Boolean(visibleFields.currentPassword)} onToggle={() => toggleVisibility("currentPassword", "profile-current-password")} />}
        />
        <FormField
          id="profile-new-password"
          label="새 비밀번호"
          type={visibleFields.newPassword ? "text" : "password"}
          homeLinkFocus
          placeholder="영문, 숫자, 특수문자 조합 8~16자"
          autoComplete="new-password"
          value={values.newPassword}
          onChange={(event) => updateValue("newPassword", event.target.value)}
          onBlur={() => setTouched((current) => ({ ...current, newPassword: true }))}
          error={touched.newPassword ? newPasswordError : undefined}
          trailingControl={<PasswordVisibilityButton visible={Boolean(visibleFields.newPassword)} onToggle={() => toggleVisibility("newPassword", "profile-new-password")} />}
        />
        <FormField
          id="profile-new-password-confirmation"
          label="새 비밀번호 확인"
          type={visibleFields.newPasswordConfirmation ? "text" : "password"}
          homeLinkFocus
          autoComplete="new-password"
          value={values.newPasswordConfirmation}
          onChange={(event) => updateValue("newPasswordConfirmation", event.target.value)}
          onBlur={() => setTouched((current) => ({ ...current, newPasswordConfirmation: true }))}
          error={touched.newPasswordConfirmation ? confirmationError : undefined}
          trailingControl={<PasswordVisibilityButton visible={Boolean(visibleFields.newPasswordConfirmation)} onToggle={() => toggleVisibility("newPasswordConfirmation", "profile-new-password-confirmation")} />}
        />
        {formError ? <p className="profile-save-error" role="alert">{formError}</p> : null}
        <div className="profile-dialog-actions">
          <button className="button button-secondary profile-dialog-cancel" type="button" disabled={isSubmitting} onClick={resetAndClose}>취소</button>
          <button className="button button-primary" type="submit" disabled={!canSubmit}>{isSubmitting ? "변경 중..." : "변경하기"}</button>
        </div>
      </form>
    </ProfileDialog>
  );
}

function ProfileSkeleton() {
  return (
    <div className="profile-skeleton" aria-label="계정 정보를 불러오는 중" aria-busy="true">
      <div className="profile-summary-card"><span className="profile-skeleton-avatar" /><span className="profile-skeleton-copy" /></div>
      <div className="profile-skeleton-section"><span /><div /></div>
      <div className="profile-skeleton-section"><span /><div /></div>
    </div>
  );
}

function toEditableValues(profile: UserProfile): EditableProfileValues {
  return {
    nickname: profile.nickname ?? "",
    email: profile.email ?? "",
  };
}

function getNicknameError(nickname: string) {
  const normalizedNickname = nickname.trim();
  if (!normalizedNickname) return undefined;
  if (normalizedNickname.length < 2) return "닉네임은 2자 이상 입력해 주세요.";
  if (normalizedNickname.length > 20) return "닉네임은 20자 이하로 입력해 주세요.";
  return undefined;
}

export function ProfileScreen() {
  const router = useRouter();
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const isMountedRef = useRef(true);
  const [loadState, setLoadState] = useState<ProfileLoadState>("loading");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editableValues, setEditableValues] = useState<EditableProfileValues>({ nickname: "", email: "" });
  const [touched, setTouched] = useState<Partial<Record<EditableProfileField, boolean>>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const [isProfileReauthenticationOpen, setIsProfileReauthenticationOpen] = useState(false);
  const [isProfileEditAuthorized, setIsProfileEditAuthorized] = useState(false);
  const [isPasswordChangeOpen, setIsPasswordChangeOpen] = useState(false);
  const [isWithdrawalOpen, setIsWithdrawalOpen] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoadState("loading");
    const user = await restoreAuthenticatedUser();
    if (!user) {
      router.replace("/login");
      return;
    }

    try {
      setProfile({
        id: user.id,
        accountId: typeof user.accountId === "string" && user.accountId.trim() ? user.accountId.trim() : null,
        username: user.id,
        nickname: null,
        email: user.email,
        phoneNumber: user.phone,
        joinedAt: null,
        profileImageUrl: null,
        loginProvider: null,
      });
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, [router]);

  useEffect(() => {
    const loadingTask = window.setTimeout(() => void loadProfile(), 0);
    return () => window.clearTimeout(loadingTask);
  }, [loadProfile]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isEditing) return;
    const focusTask = window.requestAnimationFrame(() => {
      document.getElementById("profile-nickname")?.focus();
    });
    return () => window.cancelAnimationFrame(focusTask);
  }, [isEditing]);

  const normalizedNickname = editableValues.nickname.trim();
  const normalizedEmail = editableValues.email.trim().toLowerCase();
  const nicknameError = getNicknameError(normalizedNickname);
  const emailError = normalizedEmail ? getEmailError(normalizedEmail) : undefined;
  const hasNicknameChange = Boolean(profile)
    && Boolean(normalizedNickname)
    && normalizedNickname !== (profile?.nickname ?? "");
  const hasEmailChange = Boolean(profile)
    && Boolean(normalizedEmail)
    && normalizedEmail !== (profile?.email ?? "");
  const hasChanges = hasNicknameChange || hasEmailChange;
  const canSave = hasChanges && !nicknameError && !emailError && !isSaving;

  function focusEditButton() {
    window.requestAnimationFrame(() => editButtonRef.current?.focus());
  }

  function requestEditing() {
    if (!profile) return;
    setIsProfileEditAuthorized(false);
    setIsProfileReauthenticationOpen(true);
  }

  function startAuthenticatedEditing() {
    if (!profile) return;
    setEditableValues(toEditableValues(profile));
    setTouched({});
    setSaveError("");
    setSaveNotice("");
    setIsProfileReauthenticationOpen(false);
    setIsProfileEditAuthorized(true);
    setIsEditing(true);
  }

  function cancelEditing() {
    if (!profile || isSaving) return;
    setEditableValues(toEditableValues(profile));
    setTouched({});
    setSaveError("");
    setIsEditing(false);
    setIsProfileEditAuthorized(false);
    focusEditButton();
  }

  function updateEditableValue(field: EditableProfileField, value: string) {
    setEditableValues((current) => ({ ...current, [field]: value }));
    setSaveError("");
    setSaveNotice("");
  }

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  async function handleWithdrawal(token: string) {
    await withdrawAccount(token);
    router.replace("/login");
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || isSaving) return;
    setTouched({ nickname: true, email: true });
    if (!canSave) return;

    setIsSaving(true);
    setSaveError("");
    try {
      setSaveError("프로필 수정 API가 아직 연결되지 않았습니다.");
    } catch {
      if (isMountedRef.current) {
        setSaveError("기본 정보를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      if (isMountedRef.current) setIsSaving(false);
    }
  }

  const displayEmail = profile?.email ?? "등록되지 않음";
  const displayPhone = profile?.phoneNumber ?? "등록되지 않음";
  const displayAccountId = profile?.accountId ?? "확인할 수 없음";
  const displayName = profile?.nickname ?? profile?.phoneNumber ?? profile?.email ?? "";
  const profileInitial = Array.from(displayName)[0]?.toUpperCase() ?? "";
  const isAuthenticatedEditing = isEditing && isProfileEditAuthorized;

  return (
    <>
      <AppLogo
        className="home-logo"
        leftAction={<Link className="recent-back" href="/home" aria-label="홈으로 돌아가기">‹</Link>}
      />
      <main className="home-page feature-page profile-page">
        <div className="home-mobile-shell feature-shell profile-shell">
          <header className="home-header feature-header">
            <span aria-hidden="true" />
            <p className="home-logo logo-layout-placeholder" aria-hidden="true">캐치캐치</p>
            <span aria-hidden="true" />
          </header>

          <section className="feature-heading profile-heading" aria-labelledby="profile-title">
            <h1 className="section-page-title" id="profile-title">마이페이지</h1>
          </section>

          {loadState === "loading" ? <ProfileSkeleton /> : null}

          {loadState === "error" ? (
            <section className="profile-error-state" role="alert">
              <h2>계정 정보를 불러오지 못했어요.</h2>
              <p>잠시 후 다시 시도하거나 마이페이지로 돌아가주세요.</p>
              <div>
                <button className="button button-primary" type="button" onClick={() => void loadProfile()}>다시 시도</button>
                <Link className="button button-secondary" href="/mypage">마이페이지로 이동</Link>
              </div>
            </section>
          ) : null}

          {loadState === "ready" && profile ? (
            <div className="profile-content">
              <section className="profile-summary-card" aria-label="로그인 사용자 요약">
                <div className="profile-initial" aria-hidden="true">{profileInitial}</div>
                <div className="profile-summary-copy">
                  <strong>{displayName}</strong>
                  {profile.nickname ? <span>{profile.phoneNumber ?? "휴대폰 등록 정보 없음"}</span> : null}
                </div>
              </section>

              {saveNotice ? <p className="profile-save-notice" role="status">{saveNotice}</p> : null}

              <section className="profile-section" aria-labelledby="profile-basic-title">
                <div className="profile-section-heading">
                  <h2 id="profile-basic-title">기본 정보</h2>
                  {!isEditing ? (
                    <button className="profile-edit-button" type="button" onClick={requestEditing} ref={editButtonRef}>정보 수정</button>
                  ) : null}
                </div>
                {isAuthenticatedEditing ? (
                  <form className="profile-edit-form" onSubmit={saveProfile} noValidate>
                    <div className="profile-info-card profile-edit-card">
                      <div className="profile-edit-readonly">
                        <span>아이디</span>
                        <strong className={profile.accountId ? undefined : "is-empty"}>{displayAccountId}</strong>
                      </div>
                      <div className="profile-edit-row">
                        <FormField
                          id="profile-nickname"
                          label="닉네임"
                          type="text"
                          homeLinkFocus
                          autoComplete="nickname"
                          value={editableValues.nickname}
                          onChange={(event) => updateEditableValue("nickname", event.target.value)}
                          onBlur={() => setTouched((current) => ({ ...current, nickname: true }))}
                          error={touched.nickname ? nicknameError : undefined}
                        />
                      </div>
                      <div className="profile-edit-readonly">
                        <span>휴대폰 번호</span>
                        <strong className={profile.phoneNumber ? undefined : "is-empty"}>{displayPhone}</strong>
                      </div>
                      <div className="profile-edit-row">
                        <FormField
                          id="profile-email"
                          label="이메일"
                          type="email"
                          homeLinkFocus
                          autoComplete="email"
                          value={editableValues.email}
                          onChange={(event) => updateEditableValue("email", event.target.value)}
                          onBlur={() => setTouched((current) => ({ ...current, email: true }))}
                          error={touched.email ? emailError : undefined}
                        />
                      </div>
                      <div className="profile-edit-readonly profile-password-row">
                        <span>비밀번호</span>
                        <div className="profile-password-value">
                          <button className="profile-password-action" type="button" aria-label="비밀번호 변경 창 열기" onClick={() => setIsPasswordChangeOpen(true)}>
                            <span>변경</span>
                            <ChevronIcon />
                          </button>
                        </div>
                      </div>
                    </div>
                    {saveError ? <p className="profile-save-error" role="alert">{saveError}</p> : null}
                    <div className="profile-edit-actions">
                      <button className="button button-secondary" type="button" disabled={isSaving} onClick={cancelEditing}>취소</button>
                      <button className="button button-primary" type="submit" disabled={!canSave}>{isSaving ? "저장 중..." : "저장"}</button>
                    </div>
                  </form>
                ) : (
                  <dl className="profile-info-card">
                    <div><dt>아이디</dt><dd className={profile.accountId ? undefined : "is-empty"}>{displayAccountId}</dd></div>
                    <div><dt>닉네임</dt><dd className={profile.nickname ? undefined : "is-empty"}>{profile.nickname ?? "등록되지 않음"}</dd></div>
                    <div><dt>휴대폰 번호</dt><dd className={profile.phoneNumber ? undefined : "is-empty"}>{displayPhone}</dd></div>
                    <div><dt>이메일</dt><dd className={profile.email ? undefined : "is-empty"}>{displayEmail}</dd></div>
                    <div className="profile-password-row">
                      <dt>비밀번호</dt>
                      <dd className="profile-password-value">
                        <button className="profile-password-action" type="button" aria-label="비밀번호 변경 창 열기" onClick={() => setIsPasswordChangeOpen(true)}>
                          <span>변경</span>
                          <ChevronIcon />
                        </button>
                      </dd>
                    </div>
                  </dl>
                )}
              </section>

              <section className="profile-section profile-account-section" aria-labelledby="profile-account-title">
                <h2 id="profile-account-title">계정 관리</h2>
                <div className="profile-action-card">
                  <button type="button" disabled aria-label="휴대폰 인증 사용 중">
                    <span><strong>휴대폰 인증 사용 중</strong></span>
                    <ChevronIcon />
                  </button>
                  <button className="profile-danger-action" type="button" onClick={() => setIsWithdrawalOpen(true)} aria-label="회원 탈퇴 안내 열기">
                    <span><strong>회원 탈퇴</strong><small>탈퇴 전 유의사항을 확인합니다.</small></span>
                    <ChevronIcon />
                  </button>
                </div>
                <div className="profile-logout-area">
                  <button className="mypage-logout" type="button" onClick={handleLogout}>로그아웃</button>
                </div>
              </section>
            </div>
          ) : null}
        </div>

        {isProfileReauthenticationOpen && profile ? (
          <ProfileReauthenticationDialog
            onClose={() => setIsProfileReauthenticationOpen(false)}
            onVerified={startAuthenticatedEditing}
          />
        ) : null}
        {isPasswordChangeOpen && profile ? (
          <PasswordChangeDialog
            onClose={() => setIsPasswordChangeOpen(false)}
          />
        ) : null}
        {isWithdrawalOpen ? (
          <WithdrawalDialog
            onClose={() => setIsWithdrawalOpen(false)}
            onWithdraw={handleWithdrawal}
          />
        ) : null}
      </main>
    </>
  );
}

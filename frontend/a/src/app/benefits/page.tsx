"use client";

import Link from "next/link";
import {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { AppLogo } from "@/components/app-logo";
import {
  BenefitProfile,
  getBenefitProfile,
  hasAnyBenefits,
  MusinsaGrade,
  MUSINSA_GRADE_OPTIONS,
  OliveYoungGrade,
  OLIVE_YOUNG_GRADE_OPTIONS,
  saveBenefitProfile,
  ZigzagGrade,
  ZIGZAG_GRADE_OPTIONS,
} from "@/lib/benefits";
import { getMockAuthenticatedRoute, getMockAuthenticatedUsername } from "@/lib/mock/session";

type GradeOption<T extends string> = { readonly id: T; readonly label: string };

function MembershipGradeDropdown<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly GradeOption<T>[];
  onChange: (value: T) => void;
}) {
  const dropdownId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.id === value));
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const selectedOption = options[selectedIndex];

  useEffect(() => {
    if (!isOpen) return;
    const focusFrame = window.requestAnimationFrame(() => optionRefs.current[activeIndex]?.focus());
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [activeIndex, isOpen]);

  function focusOption(index: number) {
    const nextIndex = (index + options.length) % options.length;
    setActiveIndex(nextIndex);
    optionRefs.current[nextIndex]?.focus();
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") setActiveIndex(0);
    else if (event.key === "End") setActiveIndex(options.length - 1);
    else if (event.key === "ArrowUp") setActiveIndex((selectedIndex - 1 + options.length) % options.length);
    else setActiveIndex(selectedIndex);
    setIsOpen(true);
  }

  function handleOptionKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectOption(options[index]);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusOption(options.length - 1);
    }
  }

  function selectOption(option: GradeOption<T>) {
    onChange(option.id);
    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <div
      className="benefit-membership-setting"
      ref={rootRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsOpen(false);
      }}
    >
      <span className="benefit-setting-label">{label}</span>
      <div className={`benefit-grade-dropdown ${isOpen ? "is-open" : ""}`}>
        <button
          className="benefit-grade-trigger"
          ref={triggerRef}
          type="button"
          aria-label={`${label}: ${selectedOption.label}`}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={`${dropdownId}-listbox`}
          onClick={() => setIsOpen((current) => {
            if (!current) setActiveIndex(selectedIndex);
            return !current;
          })}
          onKeyDown={handleTriggerKeyDown}
        >
          <span>{selectedOption.label}</span>
          <span className="benefit-dropdown-chevron" aria-hidden="true" />
        </button>
        {isOpen ? (
          <div className="benefit-grade-options" id={`${dropdownId}-listbox`} role="listbox" aria-label={`${label} 등급`}>
            {options.map((option, index) => (
              <button
                className={`benefit-grade-option ${option.id === value ? "is-selected" : ""} ${index === activeIndex ? "is-active" : ""}`}
                key={option.id}
                ref={(element) => { optionRefs.current[index] = element; }}
                type="button"
                role="option"
                aria-selected={option.id === value}
                onClick={() => selectOption(option)}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function BenefitsPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [profile, setProfile] = useState<BenefitProfile | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const authorizationCheck = window.setTimeout(() => {
      const authenticatedRoute = getMockAuthenticatedRoute();
      if (authenticatedRoute !== "/home") {
        router.replace(authenticatedRoute);
        return;
      }

      const authenticatedUsername = getMockAuthenticatedUsername();
      if (!authenticatedUsername) {
        router.replace("/login");
        return;
      }

      setUsername(authenticatedUsername);
      setProfile(getBenefitProfile(authenticatedUsername));
      setIsAuthorized(true);
    }, 0);

    return () => window.clearTimeout(authorizationCheck);
  }, [router]);

  if (!isAuthorized || !profile) return null;

  const canSave = hasAnyBenefits(profile) && !isSaving;

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave || !username || !profile) return;
    setIsSaving(true);
    saveBenefitProfile(username, profile);
    router.replace("/home");
  }

  return (
    <>
      <AppLogo
        className="home-logo"
        leftAction={<Link className="recent-back" href="/home" aria-label="홈으로 돌아가기">‹</Link>}
      />
      <main className="benefits-page">
        <div className="benefits-shell">
          <header className="benefits-header">
            <span aria-hidden="true" />
            <p className="home-logo logo-layout-placeholder" aria-hidden="true">캐치캐치</p>
            <span aria-hidden="true" />
          </header>

          <section className="feature-heading benefits-intro" aria-labelledby="benefits-title">
            <h1 className="section-page-title" id="benefits-title">내 혜택 등록</h1>
          </section>

          <form className="benefits-form" onSubmit={handleSave} noValidate>
            <section className="benefits-section" aria-labelledby="membership-title">
              <div className="benefits-section-heading">
                <h2 id="membership-title">이용 중인 쇼핑 멤버십</h2>
                <p>여러 개 선택할 수 있어요.</p>
              </div>
              <div className="benefit-membership-settings">
                <div className="benefit-membership-setting">
                  <span className="benefit-setting-label">쿠팡 와우</span>
                  <button
                    className={`benefit-switch-control ${profile.coupangWow ? "is-enabled" : ""}`}
                    type="button"
                    role="switch"
                    aria-checked={profile.coupangWow}
                    onClick={() => setProfile((current) => current ? ({
                      ...current,
                      coupangWow: !current.coupangWow,
                    }) : current)}
                  >
                    <span>{profile.coupangWow ? "이용 중" : "이용 안 함"}</span>
                    <span className="benefit-switch-track" aria-hidden="true"><span /></span>
                  </button>
                </div>

                <MembershipGradeDropdown<OliveYoungGrade>
                  label="올리브영 멤버십"
                  value={profile.oliveYoungGrade}
                  options={OLIVE_YOUNG_GRADE_OPTIONS}
                  onChange={(oliveYoungGrade) => setProfile((current) => current ? ({
                    ...current,
                    oliveYoungGrade,
                  }) : current)}
                />

                <MembershipGradeDropdown<MusinsaGrade>
                  label="무신사 멤버십"
                  value={profile.musinsaGrade}
                  options={MUSINSA_GRADE_OPTIONS}
                  onChange={(musinsaGrade) => setProfile((current) => current ? ({
                    ...current,
                    musinsaGrade,
                  }) : current)}
                />

                <MembershipGradeDropdown<ZigzagGrade>
                  label="지그재그 멤버십"
                  value={profile.zigzagGrade}
                  options={ZIGZAG_GRADE_OPTIONS}
                  onChange={(zigzagGrade) => setProfile((current) => current ? ({
                    ...current,
                    zigzagGrade,
                  }) : current)}
                />

                <div className="benefit-membership-setting">
                  <span className="benefit-setting-label">기타 멤버십</span>
                  <button
                    className={`benefit-switch-control ${profile.otherMembership.enabled ? "is-enabled" : ""}`}
                    type="button"
                    role="switch"
                    aria-checked={profile.otherMembership.enabled}
                    onClick={() => setProfile((current) => current ? ({
                      ...current,
                      otherMembership: {
                        ...current.otherMembership,
                        enabled: !current.otherMembership.enabled,
                      },
                    }) : current)}
                  >
                    <span>{profile.otherMembership.enabled ? "이용 중" : "이용 안 함"}</span>
                    <span className="benefit-switch-track" aria-hidden="true"><span /></span>
                  </button>
                  {profile.otherMembership.enabled ? (
                    <label className="benefit-text-field benefit-other-input">
                      <span className="sr-only">기타 멤버십 이름</span>
                      <input
                        type="text"
                        value={profile.otherMembership.name}
                        placeholder="이용 중인 멤버십을 입력해주세요"
                        onChange={(event) => setProfile((current) => current ? ({
                          ...current,
                          otherMembership: {
                            ...current.otherMembership,
                            name: event.target.value,
                          },
                        }) : current)}
                      />
                    </label>
                  ) : null}
                </div>
              </div>
            </section>

            <div className="benefits-actions">
              <button className="button button-primary" type="submit" disabled={!canSave}>
                {isSaving ? "저장 중..." : "혜택 저장하기"}
              </button>
            </div>

            <p className="benefits-note">사용 중인 혜택만 간단히 등록해주세요.<br />상품 분석 시 예상 최종 결제금액에 반영해드려요.</p>
          </form>
        </div>
      </main>
    </>
  );
}

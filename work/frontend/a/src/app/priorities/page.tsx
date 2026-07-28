"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { mockSavePriorities } from "@/lib/mock/auth";
import { completeMockOnboarding, getMockAuthenticatedRoute, getMockAuthenticatedUsername } from "@/lib/mock/session";
import { getStoredPriorities, PRIORITIES, PriorityId, savePriorities } from "@/lib/priorities";

export default function PrioritiesPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<PriorityId[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [limitMessage, setLimitMessage] = useState(false);
  const [rejectedPriority, setRejectedPriority] = useState<PriorityId | null>(null);
  const [showCompletionCue, setShowCompletionCue] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const limitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canSubmit = selected.length >= 1 && !isSubmitting;

  useEffect(() => {
    const authorizationCheck = window.setTimeout(() => {
      const authenticatedRoute = getMockAuthenticatedRoute();
      if (authenticatedRoute !== "/priorities") {
        router.replace(authenticatedRoute);
        return;
      }
      const username = getMockAuthenticatedUsername();
      if (username) setSelected(getStoredPriorities(username));
      setIsAuthorized(true);
    }, 0);

    return () => {
      window.clearTimeout(authorizationCheck);
      if (limitTimerRef.current) clearTimeout(limitTimerRef.current);
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, [router]);

  function clearLimitFeedback() {
    if (limitTimerRef.current) clearTimeout(limitTimerRef.current);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    limitTimerRef.current = null;
    feedbackTimerRef.current = null;
    setLimitMessage(false);
    setRejectedPriority(null);
  }

  function togglePriority(id: PriorityId) {
    if (isSubmitting) return;

    if (selected.includes(id)) {
      clearLimitFeedback();
      setShowCompletionCue(false);
      setSelected(selected.filter((item) => item !== id));
      return;
    }

    if (selected.length === 3) {
      clearLimitFeedback();
      setLimitMessage(true);
      setRejectedPriority(id);
      feedbackTimerRef.current = setTimeout(() => {
        setRejectedPriority(null);
        feedbackTimerRef.current = null;
      }, 240);
      limitTimerRef.current = setTimeout(() => {
        setLimitMessage(false);
        limitTimerRef.current = null;
      }, 1800);
      return;
    }

    clearLimitFeedback();
    const nextSelected = [...selected, id];
    setSelected(nextSelected);
    if (nextSelected.length === 3) {
      setShowCompletionCue(true);
      feedbackTimerRef.current = setTimeout(() => {
        setShowCompletionCue(false);
        feedbackTimerRef.current = null;
      }, 200);
    }
  }

  async function handleComplete() {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError("");
    try {
      const result = await mockSavePriorities();
      if (result.ok) {
        const username = getMockAuthenticatedUsername();
        if (!username) {
          router.replace("/login");
          return;
        }
        savePriorities(username, selected);
        completeMockOnboarding();
        router.replace("/home");
      }
    } catch {
      setError("우선순위를 저장하는 중 예상하지 못한 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSkip() {
    completeMockOnboarding();
    router.replace("/home");
  }

  if (!isAuthorized) return null;

  return (
    <AuthShell
      title="구매할 때 중요하게 보는 기준을 선택해주세요"
      eyebrow="캐치캐치에 오신 것을 환영해요!"
      description={"선택한 기준은 AI 구매 판단에 반영돼요.\n최대 3개까지 선택할 수 있어요."}
      backHref="/signup"
      className="priorities-card"
    >
      <div className="priority-content">
        <p className="selection-count">
          <strong>{selected.length} / 3</strong>
        </p>
        <div className="pill-list" aria-label="구매 우선순위">
          {Array.from({ length: 4 }, (_, rowIndex) => (
            <div className="pill-row" key={rowIndex}>
              {PRIORITIES.slice(rowIndex * 2, rowIndex * 2 + 2).map((priority) => {
                const isSelected = selected.includes(priority.id);
                const selectionLimitReached = selected.length === 3 && !isSelected;
                const wasRejected = rejectedPriority === priority.id;

                return (
                  <button
                    key={priority.id}
                    className={`pill ${isSelected ? "pill-selected" : ""} ${wasRejected ? "pill-rejected" : ""}`}
                    type="button"
                    aria-pressed={isSelected}
                    aria-disabled={selectionLimitReached}
                    onClick={() => togglePriority(priority.id)}
                  >
                    <span>{priority.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <p className="selection-status" aria-live="polite">
          {limitMessage ? "최대 3개까지 선택할 수 있어요." : ""}
        </p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button
          className={`button button-primary priority-cta ${showCompletionCue ? "priority-cta-ready" : ""}`}
          type="button"
          disabled={!canSubmit}
          onClick={handleComplete}
        >
          {isSubmitting ? "저장 중..." : "선택 완료"}
        </button>
        <button className="priority-skip" type="button" onClick={handleSkip}>
          건너뛰기
        </button>
      </div>
    </AuthShell>
  );
}

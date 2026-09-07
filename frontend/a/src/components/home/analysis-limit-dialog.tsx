"use client";

import { KeyboardEvent, MouseEvent, useEffect, useLayoutEffect, useRef } from "react";

type AnalysisLimitDialogProps = {
  onClose: () => void;
  remainingCount: number;
};

const ANALYSIS_LIMIT_NOTICE = {
  title: "분석 이용 안내",
  lead: "14일 동안 최대 10회의 상품 분석을 이용할",
  leadEnding: "수 있어요.",
  renewal: "기간이 끝난 뒤 다음 분석을 시작하면 새로운 14일 이용기간과 10회의 분석",
  renewalEnding: "횟수가 적용돼요.",
} as const;

function CloseIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg>;
}

export function AnalysisLimitDialog({ onClose, remainingCount }: AnalysisLimitDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

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
    closeButtonRef.current?.focus();

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseRef.current();
    };

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
  }, []);

  function keepFocusInside(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    event.preventDefault();
    closeButtonRef.current?.focus();
  }

  function closeFromControl(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    onClose();
  }

  function closeFromOverlay(event: MouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    event.stopPropagation();
    onClose();
  }

  return (
    <div className="previous-analysis-overlay" ref={overlayRef} onClick={closeFromOverlay}>
      <div
        className="previous-analysis-dialog analysis-limit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="analysis-limit-title"
        aria-describedby="analysis-limit-description"
        ref={dialogRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={keepFocusInside}
      >
        <header className="previous-analysis-header">
          <h2 id="analysis-limit-title">{ANALYSIS_LIMIT_NOTICE.title}</h2>
          <button
            className="previous-analysis-close"
            type="button"
            aria-label="14일 분석 이용 안내 닫기"
            onClick={closeFromControl}
            ref={closeButtonRef}
          >
            <CloseIcon />
          </button>
        </header>
        <div className="previous-analysis-content analysis-limit-content" id="analysis-limit-description">
          <p className="analysis-limit-lead">
            {ANALYSIS_LIMIT_NOTICE.lead} <span className="analysis-limit-no-break">{ANALYSIS_LIMIT_NOTICE.leadEnding}</span>
          </p>
          <dl className="analysis-limit-rules">
            <div>
              <dt>이용 기간</dt>
              <dd>첫 분석일부터 14일</dd>
            </div>
            <div>
              <dt>분석 횟수</dt>
              <dd>최대 10회</dd>
            </div>
          </dl>
          <p className="analysis-limit-renewal">
            {ANALYSIS_LIMIT_NOTICE.renewal} <span className="analysis-limit-no-break">{ANALYSIS_LIMIT_NOTICE.renewalEnding}</span>
          </p>
          {Number.isInteger(remainingCount) && remainingCount >= 0 ? (
            <dl className="analysis-limit-remaining">
              <div>
                <dt>현재 남은 분석</dt>
                <dd>{remainingCount}회</dd>
              </div>
            </dl>
          ) : null}
        </div>
      </div>
    </div>
  );
}

"use client";

import { KeyboardEvent, MouseEvent, useEffect, useLayoutEffect, useRef } from "react";

type AnalysisLimitDialogProps = {
  onClose: () => void;
};

// 분석 제한 안내 문구 입력 위치
const ANALYSIS_LIMIT_NOTICE = {
  title: "",
  content: "",
} as const;

function CloseIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg>;
}

export function AnalysisLimitDialog({ onClose }: AnalysisLimitDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const title = ANALYSIS_LIMIT_NOTICE.title.trim();
  const content = ANALYSIS_LIMIT_NOTICE.content.trim();

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
        aria-label={title ? undefined : "14일 분석 이용 안내"}
        aria-labelledby={title ? "analysis-limit-title" : undefined}
        aria-describedby={content ? "analysis-limit-description" : undefined}
        ref={dialogRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={keepFocusInside}
      >
        <header className="previous-analysis-header">
          {title ? <h2 id="analysis-limit-title">{title}</h2> : null}
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
        <div className="previous-analysis-content analysis-limit-content">
          {content ? <p id="analysis-limit-description">{content}</p> : null}
        </div>
      </div>
    </div>
  );
}

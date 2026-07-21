"use client";

import { KeyboardEvent, MouseEvent, useEffect, useLayoutEffect, useRef } from "react";
import { RecentAnalysisItem } from "@/lib/mock/home";

type PreviousAnalysisDialogProps = {
  analysis: RecentAnalysisItem;
  onClose: () => void;
};

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function formatPrice(price: number) {
  return `${price.toLocaleString("ko-KR")}원`;
}

export function PreviousAnalysisDialog({ analysis, onClose }: PreviousAnalysisDialogProps) {
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
    const shouldLockBody = document.body.style.position !== "fixed";
    const bodyWidth = document.body.getBoundingClientRect().width;
    const overlay = overlayRef.current;
    const previousBodyStyles = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    };

    if (shouldLockBody) {
      overlay?.style.setProperty("--modal-scroll-offset", `${scrollY}px`);
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = `${bodyWidth}px`;
    }
    closeButtonRef.current?.focus();

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseRef.current();
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
      if (shouldLockBody) {
        document.body.style.overflow = previousBodyStyles.overflow;
        document.body.style.position = previousBodyStyles.position;
        document.body.style.top = previousBodyStyles.top;
        document.body.style.width = previousBodyStyles.width;
        overlay?.style.removeProperty("--modal-scroll-offset");
        window.scrollTo(0, scrollY);
      }
      previousFocus?.focus();
    };
  }, []);

  function keepFocusInside(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;

    const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
      "a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])",
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
        className="previous-analysis-dialog previous-analysis-result-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="previous-analysis-title"
        aria-describedby="previous-analysis-description"
        data-analysis-id={analysis.id}
        ref={dialogRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={keepFocusInside}
      >
        <header className="previous-analysis-header">
          <div className="previous-analysis-heading">
            <p className="previous-analysis-eyebrow">PRECIOUS ANALYSIS RESULTS</p>
            <h2 id="previous-analysis-title">이전 분석 결과</h2>
            <p className="previous-analysis-description" id="previous-analysis-description">저장된 분석 내용을 다시 확인할 수 있어요</p>
          </div>
          <button
            className="previous-analysis-close"
            type="button"
            aria-label="이전 분석 결과 닫기"
            onClick={closeFromControl}
            ref={closeButtonRef}
          >
            <CloseIcon />
          </button>
        </header>

        <div className="previous-analysis-content">
          <section className="previous-analysis-product" aria-label="분석 상품 정보">
            {analysis.imageUrl ? (
              // The stored seller image may come from any external marketplace.
              // eslint-disable-next-line @next/next/no-img-element
              <img className="previous-analysis-image" src={analysis.imageUrl} alt="" />
            ) : <div className="previous-analysis-image product-image-placeholder" aria-label="상품 이미지 없음" />}
            <div className="previous-analysis-product-copy">
              <h3>{analysis.productName}</h3>
              <p>{analysis.sellerName}</p>
              <strong>{formatPrice(analysis.price)}</strong>
            </div>
          </section>

          <section className="previous-analysis-section" aria-label="저장된 분석 정보">
            <dl className="previous-analysis-details">
              <div>
                <dt>분석일</dt>
                <dd>{analysis.analyzedAt}</dd>
              </div>
              <div>
                <dt>판매처</dt>
                <dd>{analysis.sellerName}</dd>
              </div>
              <div>
                <dt>분석 당시 가격</dt>
                <dd>{formatPrice(analysis.price)}</dd>
              </div>
            </dl>
          </section>

          <button className="button button-primary previous-analysis-confirm" type="button" onClick={closeFromControl}>
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

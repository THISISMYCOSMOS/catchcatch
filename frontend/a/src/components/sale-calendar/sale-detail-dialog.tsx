"use client";

import Image from "next/image";
import { KeyboardEvent, MouseEvent, useEffect, useLayoutEffect, useRef } from "react";
import type { SaleCalendarItem } from "@/lib/mock/sale-calendar";

type SaleDetailDialogProps = {
  sale: SaleCalendarItem;
  onClose: () => void;
};

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return `${year}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}`;
}

export function SaleDetailDialog({ sale, onClose }: SaleDetailDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = `sale-detail-title-${sale.id}`;
  const guideId = `sale-detail-guide-${sale.id}`;
  const descriptionId = `sale-detail-description-${sale.id}`;

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
      "button:not(:disabled), [tabindex]:not([tabindex='-1'])",
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
        className="previous-analysis-dialog previous-analysis-result-dialog sale-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${guideId} ${descriptionId}`}
        data-sale-id={sale.id}
        ref={dialogRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={keepFocusInside}
      >
        <header className="previous-analysis-header sale-detail-header">
          <div className="previous-analysis-heading">
            <p className="previous-analysis-eyebrow">UPCOMING SALE DETAILS</p>
            <h2 id={titleId}>예정된 세일 정보</h2>
            <p className="previous-analysis-description sale-detail-guide" id={guideId}>
              주요 뷰티 상품을 특별한 가격으로 만나볼 수 있어요.
            </p>
          </div>
          <button
            className="previous-analysis-close"
            type="button"
            aria-label="세일 상세 닫기"
            onClick={closeFromControl}
            ref={closeButtonRef}
          >
            <CloseIcon />
          </button>
        </header>

        <div className="previous-analysis-content sale-detail-content">
          <div className="sale-detail-poster">
            {sale.imageUrl ? (
              <Image src={sale.imageUrl} alt={`${sale.title} 포스터`} fill sizes="(max-width: 480px) calc(100vw - 68px), 378px" />
            ) : (
              <span role="img" aria-label={`${sale.title} 포스터 이미지 준비 중`} />
            )}
          </div>
          <h3 className="sale-detail-name" id={descriptionId}>{sale.title}</h3>

          <section className="previous-analysis-section sale-detail-info" aria-label="주요 세일 정보">
            <dl className="previous-analysis-details">
              <div>
                <dt>진행 상태</dt>
                <dd><span className={`sale-status sale-status-${sale.status}`}><span aria-hidden="true" />{sale.statusLabel}</span></dd>
              </div>
              <div><dt>판매처</dt><dd>{sale.sellerName}</dd></div>
              <div><dt>세일 기간</dt><dd><time dateTime={sale.startDate}>{formatDate(sale.startDate)}</time><span aria-hidden="true"> – </span><time dateTime={sale.endDate}>{formatDate(sale.endDate)}</time></dd></div>
              <div><dt>최대 할인</dt><dd>{sale.maxDiscountLabel}</dd></div>
              <div><dt>D-day</dt><dd>{sale.dDayLabel}</dd></div>
              {sale.targetCategory ? <div><dt>적용 대상</dt><dd>{sale.targetCategory}</dd></div> : null}
              {sale.conditions ? <div><dt>이용 조건</dt><dd>{sale.conditions}</dd></div> : null}
            </dl>
          </section>

          <section className="sale-detail-description" aria-labelledby={`sale-detail-copy-${sale.id}`}>
            <h3 id={`sale-detail-copy-${sale.id}`}>상세 안내</h3>
            <p>{sale.description}</p>
          </section>

          <button className="button button-primary previous-analysis-confirm" type="button" onClick={closeFromControl}>확인</button>
        </div>
      </div>
    </div>
  );
}

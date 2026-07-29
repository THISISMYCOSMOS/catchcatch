"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  DEMO_PRODUCT,
  DEMO_PRODUCT_URL,
  ProductPreview,
  RECENT_ANALYSES,
  getRecentAnalysisById,
} from "@/lib/mock/home";
import { PreviousAnalysisDialog } from "@/components/home/previous-analysis-dialog";
import { RecentAnalysisCard } from "@/components/home/recent-analysis-card";
import { AuthenticatedAppFrame } from "@/components/home/authenticated-app-frame";
import { getMockAuthenticatedUsername } from "@/lib/mock/session";
import { ANALYSIS_RESULT_PATH, validateCoupangProductUrl } from "@/lib/analysis-url";
import { dismissBenefitPrompt, getBenefitProfile, isBenefitPromptDismissed } from "@/lib/benefits";

const ANALYSIS_LINK_STORAGE_KEY = "catchcatch:last-analysis-link";

function CloseIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg>;
}

function LinkIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2" /><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2" /></svg>;
}

function ArrowIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>;
}

function formatPrice(price: number) {
  return `${price.toLocaleString("ko-KR")}원`;
}

function ImagePlaceholder({ compact = false }: { compact?: boolean }) {
  return <div className={compact ? "product-image-placeholder compact" : "product-image-placeholder"} aria-label="상품 이미지 없음" />;
}

function ProductPreviewCard({ product, isSelecting, onSelect }: {
  product: ProductPreview;
  isSelecting: boolean;
  onSelect: () => void;
}) {
  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect();
  }

  return (
    <article
      className={`product-preview product-preview-popover${isSelecting ? " is-selecting" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`${product.productName} 상품 선택`}
      aria-live="polite"
      onClick={onSelect}
      onKeyDown={handleKeyDown}
    >
      <ImagePlaceholder />
      <div className="product-preview-main">
        <h2>{product.productName}</h2>
        <p>{product.sellerName}</p>
        <strong>{formatPrice(product.price)}</strong>
      </div>
      <div className="product-description">
        <span>상품 설명</span>
        <p>{product.description}</p>
      </div>
    </article>
  );
}

export function HomeScreen() {
  const router = useRouter();
  const [linkValue, setLinkValue] = useState("");
  const [linkError, setLinkError] = useState("");
  const [isNavigatingToResult, setIsNavigatingToResult] = useState(false);
  const isNavigatingToResultRef = useRef(false);
  const [product, setProduct] = useState<ProductPreview | null>(null);
  const [isProductPopoverOpen, setIsProductPopoverOpen] = useState(false);
  const [isProductSelecting, setIsProductSelecting] = useState(false);
  const productSelectionTimerRef = useRef<number | null>(null);
  const productRegionRef = useRef<HTMLDivElement>(null);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [isBenefitPromptVisible, setIsBenefitPromptVisible] = useState(false);
  const selectedAnalysis = selectedAnalysisId ? getRecentAnalysisById(selectedAnalysisId) : null;

  useEffect(() => {
    const promptCheck = window.setTimeout(() => {
      const username = getMockAuthenticatedUsername();
      if (!username) return;
      const profile = getBenefitProfile(username);
      setIsBenefitPromptVisible(!profile.completed && !isBenefitPromptDismissed(username));
    }, 0);
    return () => window.clearTimeout(promptCheck);
  }, []);

  useEffect(() => {
    const savedLink = window.sessionStorage.getItem(ANALYSIS_LINK_STORAGE_KEY);
    if (!savedLink) return;

    const validation = validateCoupangProductUrl(savedLink);
    if (!validation.ok) return;

    const restoreLink = window.setTimeout(() => {
      setLinkValue(validation.productUrl);
      setProduct({ ...DEMO_PRODUCT, sourceUrl: validation.productUrl });
    }, 0);
    return () => window.clearTimeout(restoreLink);
  }, []);

  const closeProductPopover = useCallback(() => {
    if (productSelectionTimerRef.current !== null) {
      window.clearTimeout(productSelectionTimerRef.current);
      productSelectionTimerRef.current = null;
    }
    setIsProductSelecting(false);
    setIsProductPopoverOpen(false);
  }, []);

  useEffect(() => () => {
    if (productSelectionTimerRef.current !== null) {
      window.clearTimeout(productSelectionTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!isProductPopoverOpen) return;
    const handleOutsidePointer = (event: PointerEvent) => {
      if (!productRegionRef.current?.contains(event.target as Node)) closeProductPopover();
    };
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [closeProductPopover, isProductPopoverOpen]);

  function dismissBenefitsCard(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const username = getMockAuthenticatedUsername();
    if (username) dismissBenefitPrompt(username);
    setIsBenefitPromptVisible(false);
  }

  function handleLinkChange(value: string) {
    closeProductPopover();
    setLinkValue(value);
    setLinkError("");
    const validation = validateCoupangProductUrl(value);
    const matchedProduct = validation.ok
      ? { ...DEMO_PRODUCT, sourceUrl: validation.productUrl }
      : null;
    setProduct(matchedProduct);
    setIsProductPopoverOpen(Boolean(matchedProduct));
  }

  function handleSelectProduct() {
    if (productSelectionTimerRef.current !== null) return;

    setIsProductSelecting(true);
    productSelectionTimerRef.current = window.setTimeout(() => {
      productSelectionTimerRef.current = null;
      setIsProductSelecting(false);
      setIsProductPopoverOpen(false);
    }, 160);
  }

  function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isNavigatingToResultRef.current) return;

    const validation = validateCoupangProductUrl(linkValue);
    if (!validation.ok) {
      setProduct(null);
      setIsProductPopoverOpen(false);
      setLinkError(validation.message);
      return;
    }

    const query = new URLSearchParams({
      url: validation.productUrl,
      platform: validation.platform,
    });

    isNavigatingToResultRef.current = true;
    setIsNavigatingToResult(true);
    setLinkError("");
    window.sessionStorage.setItem(ANALYSIS_LINK_STORAGE_KEY, validation.productUrl);
    router.push(`${ANALYSIS_RESULT_PATH}?${query.toString()}`);
  }

  return (
    <AuthenticatedAppFrame
      overlayContent={selectedAnalysis ? (
        <PreviousAnalysisDialog analysis={selectedAnalysis} onClose={() => setSelectedAnalysisId(null)} />
      ) : null}
    >
        <section className="home-intro" aria-labelledby="home-title">
          <h1 id="home-title">현명한 소비의 시작,<br />지금 분석해보세요!</h1>
          <p>상품 링크를 붙여넣으면 가격차트, 최저가 쇼핑몰까지<br className="wide-only-break" /> 한 번에 분석해드려요.</p>
        </section>

        {isBenefitPromptVisible ? (
          <section className="benefit-prompt" aria-labelledby="benefit-prompt-title">
            <button
              className="benefit-prompt-close"
              type="button"
              aria-label="혜택 등록 안내 닫기"
              onClick={dismissBenefitsCard}
            >
              <CloseIcon />
            </button>
            <h2 id="benefit-prompt-title">내 혜택까지 반영할까요?</h2>
            <p className="benefit-prompt-description">
              이용 중인 멤버십과 보유 혜택을 등록하면<br />
              실제 결제금액에 더 가까운 결과를 알려드려요.
            </p>
            <Link className="benefit-prompt-link" href="/benefits">내 혜택 등록하러 가기</Link>
          </section>
        ) : null}

        <form className="analysis-form" onSubmit={handleAnalyze} noValidate>
          <div className="analysis-input-region" ref={productRegionRef}>
            <label className="analysis-input-wrap">
              <span className="sr-only">상품 링크</span>
              <span className="analysis-link-icon"><LinkIcon /></span>
              <input
                className="home-link-input-focus"
                type="url"
                value={linkValue}
                onChange={(event) => handleLinkChange(event.target.value)}
                onFocus={() => {
                  if (product) setIsProductPopoverOpen(true);
                }}
                onClick={() => {
                  if (product) setIsProductPopoverOpen(true);
                }}
                placeholder="링크 붙여넣기"
                autoComplete="url"
                aria-invalid={Boolean(linkError)}
                aria-describedby={linkError ? "analysis-link-error" : undefined}
              />
            </label>
            {product && isProductPopoverOpen ? (
              <ProductPreviewCard
                product={product}
                isSelecting={isProductSelecting}
                onSelect={handleSelectProduct}
              />
            ) : null}
          </div>
          {linkError ? <p className="analysis-link-error" id="analysis-link-error" role="alert">{linkError}</p> : null}
          <button className="analysis-submit" type="submit" disabled={isNavigatingToResult}>분석하기</button>
          <p className="demo-link-hint">데모 링크: {DEMO_PRODUCT_URL}</p>
        </form>

        <section className="recent-section" aria-labelledby="recent-title">
          <div className="recent-heading">
            <h2 id="recent-title">최근 분석</h2>
            <Link className="recent-more" href="/recent-analyses">더보기 <ArrowIcon /></Link>
          </div>
          <div className="recent-list">
            {RECENT_ANALYSES.slice(0, 3).map((item) => (
              <RecentAnalysisCard
                key={item.id}
                item={item}
                onSelect={setSelectedAnalysisId}
                variant="history"
              />
            ))}
          </div>
        </section>
    </AuthenticatedAppFrame>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, useCallback, useEffect, useRef, useState } from "react";
import { DEMO_PRODUCT, DEMO_PRODUCT_URL, ProductPreview } from "@/lib/mock/home";
import { AnalysisLimitDialog } from "@/components/home/analysis-limit-dialog";
import { PreviousAnalysisDialog } from "@/components/home/previous-analysis-dialog";
import { RecentAnalysisCard } from "@/components/home/recent-analysis-card";
import { AuthenticatedAppFrame } from "@/components/home/authenticated-app-frame";
import { ANALYSIS_RESULT_PATH, validateCoupangProductUrl } from "@/lib/analysis-url";
import { dismissBenefitPrompt, getBenefitProfile, isBenefitPromptDismissed } from "@/lib/benefits";
import { createAnalysis, toAnalysisFailureStatus, type AnalysisFailureStatus } from "@/lib/api/analyses";
import type { RecentAnalysisItem } from "@/lib/api/analyses";
import { getWeeklyAnalysisUsage, type WeeklyAnalysisUsageViewModel } from "@/lib/api/search-quota";
import styles from "./analysis-status.module.css";

const ANALYSIS_LINK_STORAGE_KEY = "catchcatch:last-analysis-link";
type AnalysisState = "idle" | "loading" | "error";
type AnalysisRequest = { productUrl: string; platform: "쿠팡" };
type HomeScreenProps = {
  username: string;
  initialWeeklyAnalysisUsage: WeeklyAnalysisUsageViewModel;
  recentAnalyses: RecentAnalysisItem[];
};

const ANALYSIS_ERROR_MESSAGES: Record<AnalysisFailureStatus, { title: string; description: string }> = {
  INVALID_LINK: {
    title: "상품 링크를 확인해주세요",
    description: "분석할 수 있는 상품 링크인지 확인한 후 다시 시도해주세요.",
  },
  NEEDS_MORE_DATA: {
    title: "상품 정보를 충분히 확인하지 못했어요",
    description: "분석에 필요한 상품 정보가 부족해 결과를 만들지 못했습니다.",
  },
  PRODUCT_MISMATCH: {
    title: "상품 정보를 정확히 비교하기 어려워요",
    description: "동일한 상품인지 확인하기 어려워 분석을 완료하지 못했습니다.",
  },
  AI_JUDGMENT_FAILED: {
    title: "구매 판단을 완료하지 못했어요",
    description: "상품 정보는 확인했지만 최종 구매 판단 중 문제가 발생했습니다.",
  },
  INTERNAL_ERROR: {
    title: "일시적인 오류가 발생했어요",
    description: "잠시 후 다시 시도해주세요.",
  },
};

function formatElapsedTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function CloseIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg>;
}

function LinkIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2" /><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2" /></svg>;
}

function ArrowIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>;
}

function AnalysisFailureIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.8v5.4" />
      <path d="M12 16.4h.01" />
    </svg>
  );
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
      <div className="product-description"><span>상품 설명</span><p>{product.description}</p></div>
    </article>
  );
}

export function HomeScreen({ username, initialWeeklyAnalysisUsage, recentAnalyses }: HomeScreenProps) {
  const router = useRouter();
  const [linkValue, setLinkValue] = useState("");
  const [linkError, setLinkError] = useState("");
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [analysisErrorStatus, setAnalysisErrorStatus] = useState<AnalysisFailureStatus>("INTERNAL_ERROR");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [weeklyAnalysisUsage, setWeeklyAnalysisUsage] = useState(initialWeeklyAnalysisUsage);
  const [lastAnalysisRequest, setLastAnalysisRequest] = useState<AnalysisRequest | null>(null);
  const isAnalyzingRef = useRef(false);
  const analysisTimerRef = useRef<number | null>(null);
  const [product, setProduct] = useState<ProductPreview | null>(null);
  const [isProductPopoverOpen, setIsProductPopoverOpen] = useState(false);
  const [isProductSelecting, setIsProductSelecting] = useState(false);
  const productSelectionTimerRef = useRef<number | null>(null);
  const productRegionRef = useRef<HTMLDivElement>(null);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [isAnalysisLimitDialogOpen, setIsAnalysisLimitDialogOpen] = useState(false);
  const [isBenefitPromptVisible, setIsBenefitPromptVisible] = useState(false);
  const selectedAnalysis = selectedAnalysisId ? recentAnalyses.find((item) => item.id === selectedAnalysisId) ?? null : null;
  const isWeeklyLimitReached = weeklyAnalysisUsage.remainingCount === 0 || weeklyAnalysisUsage.limitReached;
  const analysisErrorMessage = ANALYSIS_ERROR_MESSAGES[analysisErrorStatus];

  useEffect(() => {
    const promptCheck = window.setTimeout(() => {
      const profile = getBenefitProfile(username);
      setIsBenefitPromptVisible(!profile.completed && !isBenefitPromptDismissed(username));
    }, 0);
    return () => window.clearTimeout(promptCheck);
  }, [username]);

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
    if (analysisTimerRef.current !== null) {
      window.clearInterval(analysisTimerRef.current);
    }
  }, []);

  function stopAnalysisTimer() {
    if (analysisTimerRef.current === null) return;
    window.clearInterval(analysisTimerRef.current);
    analysisTimerRef.current = null;
  }

  function startAnalysisTimer() {
    stopAnalysisTimer();
    const startedAt = Date.now();
    setElapsedSeconds(0);
    analysisTimerRef.current = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
  }

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
    dismissBenefitPrompt(username);
    setIsBenefitPromptVisible(false);
  }

  function handleLinkChange(value: string) {
    closeProductPopover();
    setLinkValue(value);
    setLinkError("");
    const validation = validateCoupangProductUrl(value);
    const matchedProduct = validation.ok ? { ...DEMO_PRODUCT, sourceUrl: validation.productUrl } : null;
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

  async function runAnalysis(request: AnalysisRequest) {
    if (isAnalyzingRef.current) return;
    if (isWeeklyLimitReached) {
      setIsAnalysisLimitDialogOpen(true);
      return;
    }
    const query = new URLSearchParams({
      url: request.productUrl,
      platform: request.platform,
    });

    isAnalyzingRef.current = true;
    setLastAnalysisRequest(request);
    setAnalysisState("loading");
    setLinkError("");
    closeProductPopover();
    startAnalysisTimer();

    try {
      const result = await createAnalysis(request.productUrl);
      stopAnalysisTimer();
      query.set("analysisId", result.analysisId);
      setWeeklyAnalysisUsage(await getWeeklyAnalysisUsage());
      window.sessionStorage.setItem(ANALYSIS_LINK_STORAGE_KEY, request.productUrl);
      router.push(`${ANALYSIS_RESULT_PATH}?${query.toString()}`);
    } catch (error) {
      stopAnalysisTimer();
      setAnalysisErrorStatus(toAnalysisFailureStatus(error));
      setAnalysisState("error");
      isAnalyzingRef.current = false;
    }
  }

  function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isAnalyzingRef.current) return;
    if (isWeeklyLimitReached) {
      setIsAnalysisLimitDialogOpen(true);
      return;
    }

    const validation = validateCoupangProductUrl(linkValue);
    if (!validation.ok) {
      setProduct(null);
      setIsProductPopoverOpen(false);
      setLinkError(validation.message);
      return;
    }

    void runAnalysis({ productUrl: validation.productUrl, platform: validation.platform });
  }

  return (
    <AuthenticatedAppFrame
      overlayContent={selectedAnalysis ? (
        <PreviousAnalysisDialog analysis={selectedAnalysis} onClose={() => setSelectedAnalysisId(null)} />
      ) : isAnalysisLimitDialogOpen ? (
        <AnalysisLimitDialog onClose={() => setIsAnalysisLimitDialogOpen(false)} />
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

        {analysisState === "loading" ? (
          <section className={styles.status} aria-live="polite" aria-busy="true">
            <div className={styles.loadingVisual} aria-hidden="true">
              <span className={styles.loader} />
            </div>
            <h2 className={styles.title}>상품을 분석하고 있어요</h2>
            <p className={styles.description}>가격과 구성 정보를 확인하고 있어요.<br />잠시만 기다려주세요.</p>
            <time className={styles.elapsedTime} dateTime={`PT${elapsedSeconds}S`}>{formatElapsedTime(elapsedSeconds)}</time>
          </section>
        ) : analysisState === "error" ? (
          <section className={styles.status} role="alert">
            <div className={styles.failureVisual}>
              <AnalysisFailureIcon />
            </div>
            <h2 className={styles.title}>{analysisErrorMessage.title}</h2>
            <p className={styles.description}>{analysisErrorMessage.description}</p>
            <div className={styles.actions}>
              <button
                className="button button-primary"
                type="button"
                disabled={!lastAnalysisRequest}
                onClick={() => {
                  if (lastAnalysisRequest) void runAnalysis(lastAnalysisRequest);
                }}
              >
                다시 시도
              </button>
            </div>
          </section>
        ) : (
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
            <button
              className="analysis-submit"
              type="submit"
              disabled={isWeeklyLimitReached}
            >
              분석하기
            </button>
            <div className={`analysis-usage${isWeeklyLimitReached ? " is-limit-reached" : ""}`}>
              <span className="analysis-usage-text">
                이번 주 분석<strong>{weeklyAnalysisUsage.remainingCount}회 남음</strong>
              </span>
              <button
                className="analysis-usage-help"
                type="button"
                aria-label="주간 분석 이용 안내"
                aria-haspopup="dialog"
                onClick={() => setIsAnalysisLimitDialogOpen(true)}
              >
                <span aria-hidden="true">?</span>
              </button>
            </div>
            <p className="demo-link-hint">데모 링크: {DEMO_PRODUCT_URL}</p>
          </form>
        )}

        <section className="recent-section" aria-labelledby="recent-title">
          <div className="recent-heading">
            <h2 id="recent-title">최근 분석</h2>
            <Link className="recent-more" href="/recent-analyses">더보기 <ArrowIcon /></Link>
          </div>
          <div className="recent-list">
            {recentAnalyses.map((item) => (
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

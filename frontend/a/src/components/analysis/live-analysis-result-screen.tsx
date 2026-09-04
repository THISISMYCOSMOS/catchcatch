"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnalysisOffer, AnalysisRecord, getAnalysis } from "@/lib/api/analyses";
import styles from "./analysis-result.module.css";

type LiveAnalysisResultScreenProps = {
  analysisId: string;
  fallbackSourceUrl: string | null;
};

const CONCLUSION_LABELS: Record<string, string> = {
  LOW_POINT_BUY: "가격 저점으로 판단돼요",
  NEAR_REGULAR_PRICE: "평소 가격에 가까워요",
  REASONABLE_BUY: "조건을 고려하면 살 만해요",
};

const CONFIDENCE_LABELS: Record<string, string> = {
  HIGH: "높음",
  MEDIUM: "보통",
  LOW: "낮음",
};

const CRITERION_LABELS: Record<string, string> = {
  FINAL_PAYMENT_AMOUNT: "배송비 포함 최종가",
  PURCHASE_TIMING: "지금 사기 좋은 시점",
  UNIT_PRICE: "용량 대비 가성비",
  SET_AND_GIFTS: "기획세트·증정품",
  RIGHT_SIZED_PURCHASE: "필요한 만큼만 구매",
  SIMPLE_DISCOUNT: "할인 여부",
  FAST_DELIVERY: "빠른 배송",
  REWARDS_AND_MEMBERSHIP: "적립·멤버십 혜택",
};

export function LiveAnalysisResultScreen({ analysisId, fallbackSourceUrl }: LiveAnalysisResultScreenProps) {
  const [analysis, setAnalysis] = useState<AnalysisRecord | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getAnalysis(analysisId)
      .then((record) => {
        if (!cancelled) setAnalysis(record);
      })
      .catch(() => {
        if (!cancelled) setError("분석 결과를 불러오지 못했습니다. 다시 로그인하거나 잠시 후 다시 시도해 주세요.");
      });
    return () => { cancelled = true; };
  }, [analysisId]);

  const view = useMemo(() => analysis ? toViewModel(analysis, fallbackSourceUrl) : null, [analysis, fallbackSourceUrl]);

  if (error) {
    return <ResultState title="결과를 확인할 수 없어요" description={error} />;
  }
  if (!view) {
    return <ResultState title="분석 결과를 불러오고 있어요" description="저장된 결과를 확인하는 중입니다." />;
  }

  return (
    <main className={styles.resultPage}>
      <div className={styles.appShell}>
        <header className={styles.topbar}>
          <Link className={styles.iconButton} href="/home" aria-label="홈으로 돌아가기">←</Link>
          <Link className={styles.wordmark} href="/home" aria-label="캐치캐치 홈으로 이동">캐치캐치</Link>
          <span className={styles.iconButton} aria-hidden="true" />
        </header>

        <section className={styles.productCard} aria-labelledby="analysis-product-name">
          {view.sourceUrl ? <div className={styles.sourceChip}><span>{view.sourceUrl}</span></div> : null}
          <div className={styles.productMain}>
            <div className={styles.productPlaceholder} role="img" aria-label="상품 이미지 없음"><span>NO<br />IMAGE</span></div>
            <div className={styles.productCopy}>
              <p>{view.brand ?? "상품 분석"}</p>
              <h1 id="analysis-product-name">{view.productName}</h1>
              <strong>{formatMoney(view.bestPrice)}</strong>
              <div className={styles.productDescription}>
                <span>분석 상태</span>
                <p>{view.status === "COMPLETED" ? "분석과 저장이 완료되었습니다." : view.status}</p>
              </div>
            </div>
          </div>
          {view.sourceUrl ? <a className={styles.externalButton} href={view.sourceUrl} target="_blank" rel="noopener noreferrer">입력한 판매처로 이동 <span aria-hidden="true">↗</span></a> : null}
        </section>

        <section className={styles.analysisPanel} aria-label="구매 판단 결과">
          <div className={`${styles.verdictCard} ${styles.verdictCardContentOnly}`}>
            <div>
              <p className={styles.eyebrow}>구매 판단</p>
              <h2>{view.verdictTitle}</h2>
              <p className={styles.verdictSummary}>{view.verdictReason}</p>
              <div className={styles.confidenceRow}>
                <span>판단 신뢰도</span>
                <span className={styles.confidenceBadge}>{view.confidenceLabel}</span>
                <small>{view.confidenceReason}</small>
              </div>
            </div>
          </div>

          <div className={styles.discountGrid}>
            <article><span>최근 평균가 대비</span><strong>{formatRate(view.discountRate)}</strong><small>저장된 가격 이력 기준</small></article>
            <article className={styles.highlight}><span>현재 최저 실구매가</span><strong>{formatMoney(view.bestPrice)}</strong><small>확인된 판매처 기준</small></article>
          </div>

          <section className={`${styles.contentCard} ${styles.dataTable}`} aria-labelledby="price-data-title">
            <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>DETAILS</p><h2 id="price-data-title">가격 데이터</h2></div></div>
            <dl>
              <div><dt>최근 평균가</dt><dd>{formatMoney(view.recentAveragePrice)}</dd></div>
              <div><dt>직전 세일가</dt><dd>{formatMoney(view.previousSalePrice)}</dd></div>
              <div><dt>비교 판매처</dt><dd>{view.offerCount}곳</dd></div>
              <div><dt>주의사항</dt><dd>{view.warningCodes.length > 0 ? view.warningCodes.join(", ") : "없음"}</dd></div>
            </dl>
          </section>

          <section className={`${styles.contentCard} ${styles.criteria}`} aria-labelledby="criteria-title">
            <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>CHECK POINT</p><h2 id="criteria-title">기준별 결과</h2></div></div>
            <div className={styles.criteriaList}>
              {view.criteria.map((criterion, index) => (
                <article key={`${criterion.criterion}-${index}`}>
                  <span className={styles.criterionNumber}>{String(index + 1).padStart(2, "0")}</span>
                  <div><div className={styles.criterionTitle}><h3>{criterion.label}</h3><span>{criterion.status}</span></div><p>{criterion.reason}</p></div>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.storesPanel} aria-labelledby="seller-comparison-title">
            <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>SELLERS</p><h2 id="seller-comparison-title">판매처 비교</h2></div></div>
            <div className={styles.storeList}>
              {view.offers.map((offer, index) => {
                const configuration = offerConfigurationLabel(offer);
                const unitPrice = offerUnitPriceLabel(offer);
                return (
                  <article className={styles.storeCard} key={offer.id}>
                    <div className={styles.storeCopy}>
                      <p>{view.offerRankLabel} {index + 1}순위</p>
                      <div className={styles.storeHeading}><h2>{offer.sellerName}</h2><strong>{formatMoney(effectivePrice(offer))}</strong></div>
                      {configuration ? <span>{configuration}</span> : null}
                      {unitPrice ? <span>{unitPrice}</span> : null}
                      <span>{offer.shippingFee === null ? "배송비 확인 필요" : `배송비 ${formatMoney(offer.shippingFee)}`}</span>
                      {hasAdvertisedAppBenefit(offer) ? <span>앱에서 추가 혜택 가능 · 공개 웹 가격 기준</span> : null}
                    </div>
                    {offerSourceUrl(offer) ? <a href={offerSourceUrl(offer) ?? undefined} target="_blank" rel="noopener noreferrer">사이트 바로가기 <span aria-hidden="true">↗</span></a> : null}
                  </article>
                );
              })}
              {!view.hasBigroomOffer ? (
                <article className={styles.storeCard}>
                  <div className={styles.storeCopy}>
                    <div className={styles.storeHeading}><h2>비그룸</h2><strong>검색 결과 없음</strong></div>
                  </div>
                </article>
              ) : null}
            </div>
            {view.offers.some(isCoupangAffiliateOffer) ? (
              <p className={styles.affiliateDisclosure}>이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.</p>
            ) : null}
          </section>

          <Link className={styles.confirmButton} href="/home">확인</Link>
        </section>
      </div>
    </main>
  );
}

function ResultState({ title, description }: { title: string; description: string }) {
  return (
    <main className={styles.resultPage}>
      <div className={styles.appShell}>
        <section className={styles.analysisPanel} role="status">
          <div className={`${styles.verdictCard} ${styles.verdictCardContentOnly}`}><div><h1>{title}</h1><p>{description}</p></div></div>
          <Link className={styles.confirmButton} href="/home">홈으로 돌아가기</Link>
        </section>
      </div>
    </main>
  );
}

function toViewModel(analysis: AnalysisRecord, fallbackSourceUrl: string | null) {
  const result = asRecord(analysis.result);
  const judgment = asRecord(result.aiJudgment);
  const confidence = asRecord(judgment.confidence);
  const allOffers = analysis.analysisOffers ?? [];
  const priceSortedOffers = [...allOffers].sort((left, right) => (
    (effectivePrice(left) ?? Number.MAX_SAFE_INTEGER) - (effectivePrice(right) ?? Number.MAX_SAFE_INTEGER)
  ));
  const recommendedOfferIds = readRecommendedOfferIds(result.recommendedOfferIds);
  const offers = recommendedOfferIds
    ? offersForRecommendedIds(allOffers, recommendedOfferIds).slice(0, 3)
    : priceSortedOffers.slice(0, 3);
  const criteria = Array.isArray(judgment.criteria_results)
    ? judgment.criteria_results.map(asRecord).map((criterion) => ({
        criterion: stringValue(criterion.criterion) ?? "UNKNOWN",
        label: CRITERION_LABELS[stringValue(criterion.criterion) ?? ""] ?? "선택 기준",
        status: criterionStatusLabel(stringValue(criterion.status)),
        reason: stringValue(criterion.reason) ?? "확인 가능한 설명이 없습니다.",
      }))
    : analysis.selectedCriteria.map((criterion) => ({
        criterion,
        label: CRITERION_LABELS[criterion] ?? criterion,
        status: "확인 필요",
        reason: "기준별 결과를 확인하지 못했습니다.",
      }));

  const conclusion = stringValue(judgment.conclusion) ?? analysis.verdict ?? "";
  return {
    status: analysis.status,
    warningCodes: analysis.warningCodes,
    sourceUrl: analysis.sourceUrl ?? fallbackSourceUrl,
    productName: analysis.product?.canonicalName ?? "상품명 확인 필요",
    brand: analysis.product?.brand ?? null,
    bestPrice: priceSortedOffers.map(effectivePrice).find((price): price is number => price !== null) ?? null,
    verdictTitle: CONCLUSION_LABELS[conclusion] ?? (stringValue(judgment.decision_status) === "INSUFFICIENT_EVIDENCE" ? "판단 근거가 더 필요해요" : "분석이 완료됐어요"),
    verdictReason: stringValue(judgment.conclusion_reason) ?? "저장된 계산 결과를 확인해 주세요.",
    confidenceLabel: CONFIDENCE_LABELS[stringValue(confidence.level) ?? ""] ?? "확인 필요",
    confidenceReason: stringValue(confidence.reason) ?? "신뢰도 설명을 확인하지 못했습니다.",
    discountRate: numberValue(result.discountRateFromRecentAverage),
    recentAveragePrice: numberValue(result.recentAveragePrice),
    previousSalePrice: numberValue(result.previousSalePrice),
    offerCount: allOffers.length,
    offerRankLabel: recommendedOfferIds ? "추천" : "가격",
    hasBigroomOffer: allOffers.some(isBigroomOffer),
    offers,
    criteria,
  };
}

function readRecommendedOfferIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length === 0) return [];
  const identifiers = value
    .map((identifier) => normalizeSellerIdentifier(stringValue(identifier)))
    .filter((identifier): identifier is string => identifier !== null)
    .filter((identifier, index, values) => values.indexOf(identifier) === index);
  return identifiers.length > 0 ? identifiers : null;
}

function offersForRecommendedIds(offers: AnalysisOffer[], recommendedOfferIds: string[]): AnalysisOffer[] {
  return recommendedOfferIds
    .map((identifier) => offers.find((offer) => normalizeSellerIdentifier(offer.sellerIdentifier) === identifier))
    .filter((offer): offer is AnalysisOffer => offer !== undefined);
}

function normalizeSellerIdentifier(value: string | null): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized ? normalized : null;
}

function effectivePrice(offer: AnalysisOffer): number | null {
  return offer.userEffectivePrice ?? offer.marketEffectivePrice ?? offer.salePrice ?? offer.originalListPrice;
}

function offerConfigurationLabel(offer: AnalysisOffer): string | null {
  const snapshot = asRecord(offer.offerSnapshot);
  const quantity = positiveIntegerValue(offer.quantity) ?? positiveIntegerValue(snapshot.quantity);
  const totalAmount = positiveNumberValue(offer.totalAmount)
    ?? positiveNumberValue(snapshot.totalAmount)
    ?? positiveNumberValue(snapshot.total_amount);
  const unit = offerCapacityUnit(offer, snapshot);
  const parts: string[] = [];

  if (quantity === 1) {
    parts.push("단품");
  } else if (quantity === 2) {
    parts.push(isExplicitOnePlusOne(snapshot) ? "1+1" : "2개 구성");
  } else if (quantity !== null) {
    parts.push(`${quantity}개 구성`);
  }

  if (totalAmount !== null && unit) {
    const totalLabel = `${formatAmount(totalAmount)}${formatCapacityUnit(unit)}`;
    parts.push(quantity === 1 ? totalLabel : `총 ${totalLabel}`);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

function offerUnitPriceLabel(offer: AnalysisOffer): string | null {
  const unitPrice = numberValue(offer.calculatedUnitPrice);
  if (unitPrice === null) return null;
  const unit = offerCapacityUnit(offer, asRecord(offer.offerSnapshot));
  return unit
    ? `1${formatCapacityUnit(unit)}당 ${formatMoney(unitPrice)}`
    : `단가 ${formatMoney(unitPrice)}`;
}

function offerCapacityUnit(offer: AnalysisOffer, snapshot: Record<string, unknown>): string | null {
  return nonEmptyString(offer.unit)
    ?? nonEmptyString(snapshot.unit)
    ?? nonEmptyString(snapshot.capacityUnit)
    ?? nonEmptyString(snapshot.capacity_unit);
}

function isExplicitOnePlusOne(snapshot: Record<string, unknown>): boolean {
  const explicitFlag = booleanValue(snapshot.isOnePlusOne)
    ?? booleanValue(snapshot.is_one_plus_one)
    ?? booleanValue(snapshot.onePlusOne)
    ?? booleanValue(snapshot.one_plus_one);
  if (explicitFlag !== null) return explicitFlag;
  const explicitType = nonEmptyString(snapshot.offerKind)
    ?? nonEmptyString(snapshot.offer_kind)
    ?? nonEmptyString(snapshot.promotionType)
    ?? nonEmptyString(snapshot.promotion_type);
  const normalizedType = explicitType?.toUpperCase().replaceAll("-", "_").replaceAll(" ", "_");
  return normalizedType === "ONE_PLUS_ONE" || normalizedType === "BUY_ONE_GET_ONE" || normalizedType === "1+1";
}

function hasAdvertisedAppBenefit(offer: AnalysisOffer): boolean {
  const snapshot = asRecord(offer.offerSnapshot);
  return (booleanValue(snapshot.appBenefitAdvertised) ?? booleanValue(snapshot.app_benefit_advertised)) === true;
}

function formatCapacityUnit(unit: string): string {
  const normalized = unit.trim().toUpperCase();
  return normalized === "ML" ? "ml" : normalized === "G" ? "g" : unit.trim();
}

function formatAmount(value: number): string {
  return value.toLocaleString("ko-KR", { maximumFractionDigits: 3 });
}

function isBigroomOffer(offer: AnalysisOffer): boolean {
  const sellerName = offer.sellerName.trim().toUpperCase();
  return sellerName === "BIGROOM" || sellerName === "비그룸";
}

function offerSourceUrl(offer: AnalysisOffer): string | null {
  const snapshot = asRecord(offer.offerSnapshot);
  const candidate = stringValue(snapshot.purchaseUrl)
    ?? stringValue(snapshot.purchase_url)
    ?? stringValue(snapshot.sourceUrl)
    ?? stringValue(snapshot.source_url);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function isCoupangAffiliateOffer(offer: AnalysisOffer): boolean {
  const snapshot = asRecord(offer.offerSnapshot);
  return snapshot.isCoupangAffiliate === true;
}

function formatMoney(value: number | null): string {
  return value === null ? "확인 필요" : `${value.toLocaleString("ko-KR")}원`;
}

function formatRate(value: number | null): string {
  if (value === null) return "확인 필요";
  return `${value > 0 ? "-" : value < 0 ? "+" : ""}${Math.abs(value).toFixed(1)}%`;
}

function criterionStatusLabel(value: string | null): string {
  return value === "POSITIVE" ? "좋음" : value === "NEGATIVE" ? "불리함" : value === "NEUTRAL" ? "보통" : "확인 필요";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nonEmptyString(value: unknown): string | null {
  const string = stringValue(value)?.trim();
  return string ? string : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positiveNumberValue(value: unknown): number | null {
  const number = numberValue(value);
  return number !== null && number > 0 ? number : null;
}

function positiveIntegerValue(value: unknown): number | null {
  const number = positiveNumberValue(value);
  return number !== null && Number.isInteger(number) ? number : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

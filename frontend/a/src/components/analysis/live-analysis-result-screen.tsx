"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnalysisOffer, AnalysisRecord, getAnalysis } from "@/lib/api/analyses";
import styles from "./analysis-result.module.css";

type LiveAnalysisResultScreenProps = { analysisId: string; fallbackSourceUrl: string | null; preview: boolean };
type ResultTab = "prices" | "criteria" | "configurations";
type SellerDefinition = { id: string; label: string };
type SellerSlot = SellerDefinition & { offer: AnalysisOffer | null; comparisonLabel: string; rankLabel: string | null };
type CriterionView = { criterion: string; label: string; status: string; reason: string };
type AlternativeConfigurationView = {
  id: string;
  sellerLabel: string;
  name: string;
  configuration: string | null;
  comparisonLabel: string;
  price: number | null;
  priceLabel: string;
  sourceUrl: string | null;
};

const SELLERS: readonly SellerDefinition[] = [
  { id: "OLIVE_YOUNG", label: "올리브영" },
  { id: "MUSINSA_BEAUTY", label: "무신사 뷰티" },
  { id: "COUPANG", label: "쿠팡" },
  { id: "ZIGZAG", label: "지그재그" },
  { id: "BRAND_OFFICIAL", label: "공식몰" },
  { id: "BIGROOM", label: "비그룸" },
];

const CONCLUSION_LABELS: Record<string, string> = {
  LOW_POINT_BUY: "가격 저점으로 판단돼요",
  NEAR_REGULAR_PRICE: "평소 가격에 가까워요",
  REASONABLE_BUY: "조건을 고려하면 살 만해요",
};

const CONFIDENCE_LABELS: Record<string, string> = { HIGH: "높음", MEDIUM: "보통", LOW: "낮음" };

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

const COMPARISON_LABELS: Record<string, string> = {
  DIRECTLY_COMPARABLE: "동일 상품·동일 구성 비교",
  UNIT_COMPARABLE: "동일 상품·용량/구성 차이 단가 비교",
  NOT_COMPARABLE: "비교 제외",
  UNKNOWN: "구성 확인 필요",
};

export function LiveAnalysisResultScreen({ analysisId, fallbackSourceUrl, preview }: LiveAnalysisResultScreenProps) {
  const [analysis, setAnalysis] = useState<AnalysisRecord | null>(null);
  const [activeTab, setActiveTab] = useState<ResultTab>("prices");
  const [error, setError] = useState("");

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    void getAnalysis(analysisId)
      .then((record) => { if (!cancelled) setAnalysis(record); })
      .catch(() => { if (!cancelled) setError("분석 결과를 불러오지 못했습니다. 다시 로그인하거나 잠시 후 다시 시도해 주세요."); });
    return () => { cancelled = true; };
  }, [analysisId, preview]);

  const record = preview ? LOCAL_PREVIEW_ANALYSIS : analysis;
  const view = useMemo(() => record ? toViewModel(record, fallbackSourceUrl) : null, [record, fallbackSourceUrl]);
  if (!preview && error) return <ResultState title="결과를 확인할 수 없어요" description={error} />;
  if (!view) return <ResultState title="분석 결과를 불러오고 있어요" description="저장된 결과를 확인하는 중입니다." />;

  return (
    <main className={styles.resultPage}>
      <div className={styles.appShell}>
        <header className={styles.topbar}>
          <Link className={styles.iconButton} href="/home" aria-label="홈으로 돌아가기">←</Link>
          <Link className={styles.wordmark} href="/home" aria-label="캐치캐치 홈으로 이동">캐치캐치</Link>
          <span className={styles.iconButton} aria-hidden="true" />
        </header>
        {preview ? <p className={styles.mockNotice}>로컬 프리뷰 · 실제 분석 API 데이터가 아닙니다</p> : null}

        <section className={styles.productCard} aria-labelledby="analysis-product-name">
          {view.sourceUrl ? <div className={styles.sourceChip}><span>{view.sourceUrl}</span></div> : null}
          <div className={styles.productMain}>
            <div className={styles.productPlaceholder} role="img" aria-label="상품 이미지 없음"><span>NO<br />IMAGE</span></div>
            <div className={styles.productCopy}>
              <p>{view.brand ?? "상품 분석"}</p>
              <h1 id="analysis-product-name">{view.productName}</h1>
              <strong>{formatMoney(view.bestPrice)}</strong>
              <div className={styles.productDescription}><span>분석 상태</span><p>{view.status === "COMPLETED" ? "분석과 저장이 완료되었습니다." : view.status}</p></div>
            </div>
          </div>
          {view.sourceUrl ? <a className={styles.externalButton} href={view.sourceUrl} target="_blank" rel="noopener noreferrer">입력한 판매처로 이동 <span aria-hidden="true">↗</span></a> : null}
        </section>

        <nav className={styles.mainTabs} aria-label="분석 결과 메뉴">
          <button type="button" className={activeTab === "prices" ? styles.active : ""} aria-current={activeTab === "prices" ? "page" : undefined} onClick={() => setActiveTab("prices")}>가격 비교</button>
          <button type="button" className={activeTab === "criteria" ? styles.active : ""} aria-current={activeTab === "criteria" ? "page" : undefined} onClick={() => setActiveTab("criteria")}>기준별 추천</button>
          <button type="button" className={activeTab === "configurations" ? styles.active : ""} aria-current={activeTab === "configurations" ? "page" : undefined} onClick={() => setActiveTab("configurations")}>다른 구성</button>
        </nav>

        {activeTab === "prices" ? <SellerComparisonPanel view={view} /> : null}
        {activeTab === "criteria" ? <CriteriaPanel view={view} /> : null}
        {activeTab === "configurations" ? <ConfigurationsPanel view={view} /> : null}
        <Link className={styles.confirmButton} href="/home">확인</Link>
      </div>
    </main>
  );
}

function SellerComparisonPanel({ view }: { view: ReturnType<typeof toViewModel> }) {
  return <section className={styles.analysisPanel} aria-labelledby="seller-comparison-title">
    <section className={`${styles.contentCard} ${styles.dataTable}`}>
      <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>SIX SELLERS</p><h2 id="seller-comparison-title">판매처별 가격 순위</h2></div></div>
      <dl><div><dt>확인된 판매처</dt><dd>{view.availableSellerCount} / {SELLERS.length}곳</dd></div><div><dt>비교 기준</dt><dd>동일 상품 우선 · 다른 구성은 단가 기준</dd></div></dl>
    </section>
    <div className={styles.storeList}>{view.sellerSlots.map((slot) => <article className={styles.storeCard} key={slot.id}>
      <div className={styles.storeCopy}>
        <p>{slot.rankLabel ?? "판매처 확인 필요"}</p>
        <div className={styles.storeHeading}><h2>{slot.label}</h2><strong>{slot.offer ? formatMoney(effectivePrice(slot.offer)) : "확인 불가"}</strong></div>
        <span>{slot.comparisonLabel}</span>
        {slot.offer ? <>{offerConfigurationLabel(slot.offer) ? <span>{offerConfigurationLabel(slot.offer)}</span> : null}{offerUnitPriceLabel(slot.offer) ? <small className={styles.unitPrice}>{offerUnitPriceLabel(slot.offer)}</small> : null}<span>{slot.offer.shippingFee === null ? "배송비 확인 필요" : `배송비 ${formatMoney(slot.offer.shippingFee)}`}</span>{hasAdvertisedAppBenefit(slot.offer) ? <span>앱에서 추가 혜택 가능 · 공개 웹 가격 기준</span> : null}</> : <span>확인된 판매 페이지가 없어 가격 순위에 넣지 않았어요.</span>}
      </div>
      {slot.offer && offerSourceUrl(slot.offer) ? <a href={offerSourceUrl(slot.offer) ?? undefined} target="_blank" rel="noopener noreferrer">사이트 바로가기 <span aria-hidden="true">↗</span></a> : null}
    </article>)}</div>
    {view.hasAffiliateOffer ? <p className={styles.affiliateDisclosure}>이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.</p> : null}
  </section>;
}

function CriteriaPanel({ view }: { view: ReturnType<typeof toViewModel> }) {
  return <section className={styles.analysisPanel} aria-labelledby="criteria-result-title">
    <div className={`${styles.verdictCard} ${styles.verdictCardContentOnly}`}><div><p className={styles.eyebrow}>PURCHASE JUDGMENT</p><h2>{view.verdictTitle}</h2><p className={styles.verdictSummary}>{view.verdictReason}</p><div className={styles.confidenceRow}><span>판단 신뢰도</span><span className={styles.confidenceBadge}>{view.confidenceLabel}</span><small>{view.confidenceReason}</small></div></div></div>
    <div className={styles.discountGrid}><article><span>최근 평균가 대비</span><strong>{formatRate(view.discountRate)}</strong><small>저장된 가격 이력 기준</small></article><article className={styles.highlight}><span>현재 최저 실구매가</span><strong>{formatMoney(view.bestPrice)}</strong><small>확인된 판매처 기준</small></article></div>
    <section className={`${styles.contentCard} ${styles.dataTable}`} aria-labelledby="price-data-title"><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>DETAILS</p><h2 id="price-data-title">가격 데이터</h2></div></div><dl><div><dt>최근 평균가</dt><dd>{formatMoney(view.recentAveragePrice)}</dd></div><div><dt>직전 세일가</dt><dd>{formatMoney(view.previousSalePrice)}</dd></div><div><dt>비교 판매처</dt><dd>{view.availableSellerCount}곳</dd></div><div><dt>주의사항</dt><dd>{view.warningCodes.length > 0 ? view.warningCodes.join(", ") : "없음"}</dd></div></dl></section>
    <section className={`${styles.contentCard} ${styles.criteria}`}>
      <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>PRIORITY 1 · 2 · 3</p><h2 id="criteria-result-title">선택 기준별 결과</h2></div></div>
      <div className={styles.criteriaList}>{view.criteria.map((criterion, index) => <article key={criterion.criterion}><span className={styles.criterionNumber}>{String(index + 1).padStart(2, "0")}</span><div><div className={styles.criterionTitle}><h3>{criterion.label}</h3><span>{criterion.status}</span></div><p>{criterion.reason}</p></div></article>)}</div>
    </section>
    <section className={styles.storesPanel} aria-labelledby="final-recommendation-title">
      <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>FINAL PICK</p><h2 id="final-recommendation-title">최종 추천 1개</h2></div></div>
      {view.finalRecommendation ? <article className={styles.storeCard}><div className={styles.storeCopy}><p>선택 기준 1 · 2 · 3 반영</p><div className={styles.storeHeading}><h2>{view.finalRecommendation.sellerName}</h2><strong>{formatMoney(effectivePrice(view.finalRecommendation))}</strong></div>{offerConfigurationLabel(view.finalRecommendation) ? <span>{offerConfigurationLabel(view.finalRecommendation)}</span> : null}<span>{view.finalRecommendationReason}</span></div>{offerSourceUrl(view.finalRecommendation) ? <a href={offerSourceUrl(view.finalRecommendation) ?? undefined} target="_blank" rel="noopener noreferrer">사이트 바로가기 <span aria-hidden="true">↗</span></a> : null}</article> : <article className={styles.storeCard}><div className={styles.storeCopy}><div className={styles.storeHeading}><h2>최종 추천을 확정하지 못했어요</h2></div><span>검증된 판매처와 근거만으로는 하나의 판매처를 추천할 수 없습니다.</span></div></article>}
    </section>
  </section>;
}

function ConfigurationsPanel({ view }: { view: ReturnType<typeof toViewModel> }) {
  return <section className={styles.analysisPanel} aria-labelledby="alternative-configurations-title">
    <section className={`${styles.contentCard} ${styles.dataTable}`}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>OTHER CONFIGURATIONS</p><h2 id="alternative-configurations-title">같은 상품의 다른 구성</h2></div></div><dl><div><dt>포함 기준</dt><dd>다른 용량 · 수량 · 세트 구성</dd></div><div><dt>제외 기준</dt><dd>같은 라인의 다른 상품</dd></div></dl></section>
    {view.alternativeConfigurations.length > 0 ? <div className={styles.storeList}>{view.alternativeConfigurations.map((configuration) => <article className={styles.storeCard} key={configuration.id}><div className={styles.storeCopy}><p>{configuration.sellerLabel}</p><div className={styles.storeHeading}><h2>{configuration.name}</h2><strong>{formatMoney(configuration.price)}</strong></div>{configuration.configuration ? <span>{configuration.configuration}</span> : null}<span>{configuration.comparisonLabel} · {configuration.priceLabel}</span></div>{configuration.sourceUrl ? <a href={configuration.sourceUrl} target="_blank" rel="noopener noreferrer">사이트 바로가기 <span aria-hidden="true">↗</span></a> : null}</article>)}</div> : <article className={styles.storeCard}><div className={styles.storeCopy}><div className={styles.storeHeading}><h2>다른 구성 정보를 찾지 못했어요</h2></div><span>검증된 같은 상품의 다른 용량·수량·세트 구성이 저장되면 이곳에 표시됩니다.</span></div></article>}
  </section>;
}

function ResultState({ title, description }: { title: string; description: string }) {
  return <main className={styles.resultPage}><div className={styles.appShell}><section className={styles.analysisPanel} role="status"><div className={`${styles.verdictCard} ${styles.verdictCardContentOnly}`}><div><h1>{title}</h1><p>{description}</p></div></div><Link className={styles.confirmButton} href="/home">홈으로 돌아가기</Link></section></div></main>;
}

function toViewModel(analysis: AnalysisRecord, fallbackSourceUrl: string | null) {
  const result = asRecord(analysis.result);
  const judgment = asRecord(result.aiJudgment);
  const confidence = asRecord(judgment.confidence);
  const allOffers = analysis.analysisOffers ?? [];
  const sellerSlots = createSellerSlots(allOffers);
  const rankedSlots = rankSellerSlots(sellerSlots);
  const resultItems = Array.isArray(judgment.criteria_results) ? judgment.criteria_results.map(asRecord) : [];
  const criteriaById = new Map(resultItems.map((item) => [stringValue(item.criterion), item] as const).filter((entry): entry is [string, Record<string, unknown>] => entry[0] !== null));
  const criteria: CriterionView[] = analysis.selectedCriteria.map((criterion) => {
    const item = criteriaById.get(criterion);
    return { criterion, label: CRITERION_LABELS[criterion] ?? criterion, status: criterionStatusLabel(stringValue(item?.status)), reason: stringValue(item?.reason) ?? "기준별 결과를 확인하지 못했습니다." };
  });
  const finalOfferId = normalizeSellerIdentifier(
    stringValue(result.finalRecommendationOfferId) ?? stringValue(judgment.recommended_offer_id),
  );
  const finalRecommendation = finalOfferId ? allOffers.find((offer) => normalizeSellerIdentifier(offer.sellerIdentifier) === finalOfferId) ?? null : null;
  const conclusion = stringValue(judgment.conclusion) ?? analysis.verdict ?? "";
  return {
    status: analysis.status,
    warningCodes: analysis.warningCodes,
    sourceUrl: safeUrl(analysis.sourceUrl ?? fallbackSourceUrl),
    productName: analysis.product?.canonicalName ?? "상품명 확인 필요",
    brand: analysis.product?.brand ?? null,
    bestPrice: [...allOffers].sort(comparePrices).map(effectivePrice).find((price): price is number => price !== null) ?? null,
    discountRate: numberValue(result.discountRateFromRecentAverage),
    recentAveragePrice: numberValue(result.recentAveragePrice),
    previousSalePrice: numberValue(result.previousSalePrice),
    availableSellerCount: sellerSlots.filter((slot) => slot.offer !== null).length,
    sellerSlots: rankedSlots,
    hasAffiliateOffer: allOffers.some(isCoupangAffiliateOffer),
    verdictTitle: CONCLUSION_LABELS[conclusion] ?? (stringValue(judgment.decision_status) === "INSUFFICIENT_EVIDENCE" ? "판단 근거가 더 필요해요" : "분석이 완료됐어요"),
    verdictReason: stringValue(judgment.conclusion_reason) ?? "저장된 계산 결과를 확인해 주세요.",
    confidenceLabel: CONFIDENCE_LABELS[stringValue(confidence.level) ?? ""] ?? "확인 필요",
    confidenceReason: stringValue(confidence.reason) ?? "신뢰도 설명을 확인하지 못했습니다.",
    criteria,
    finalRecommendation,
    finalRecommendationReason: stringValue(judgment.recommendation_reason) ?? "검증된 판매처 조건과 선택 기준을 반영한 추천입니다.",
    alternativeConfigurations: readAlternativeConfigurations(result.alternativeConfigurations),
  };
}

function createSellerSlots(offers: readonly AnalysisOffer[]): SellerSlot[] {
  return SELLERS.map((seller) => {
    const offer = offers.find((candidate) => normalizeSellerIdentifier(candidate.sellerIdentifier) === seller.id) ?? null;
    return { ...seller, offer, comparisonLabel: offer ? comparisonLabel(offer) : "확인된 판매처 정보 없음", rankLabel: null };
  });
}

function rankSellerSlots(sellerSlots: readonly SellerSlot[]): SellerSlot[] {
  const direct = sellerSlots
    .filter((slot) => slot.offer !== null && comparisonStatus(slot.offer) === "DIRECTLY_COMPARABLE")
    .sort((left, right) => comparePrices(left.offer!, right.offer!))
    .map((slot, index) => ({ ...slot, rankLabel: `가격 ${index + 1}순위` }));
  const unit = sellerSlots
    .filter((slot) => slot.offer !== null && comparisonStatus(slot.offer) === "UNIT_COMPARABLE")
    .sort((left, right) => compareUnitPrices(left.offer!, right.offer!))
    .map((slot, index) => ({ ...slot, rankLabel: `단가 ${index + 1}순위` }));
  const unresolved = sellerSlots
    .filter((slot) => slot.offer !== null && comparisonStatus(slot.offer) !== "DIRECTLY_COMPARABLE" && comparisonStatus(slot.offer) !== "UNIT_COMPARABLE")
    .map((slot) => ({ ...slot, rankLabel: "구성 비교 필요" }));
  const missing = sellerSlots.filter((slot) => slot.offer === null);
  return [...direct, ...unit, ...unresolved, ...missing];
}

function readAlternativeConfigurations(value: unknown): AlternativeConfigurationView[] {
  const source = asRecord(value);
  const candidates = Array.isArray(source.candidates) ? source.candidates.map(asRecord) : [];
  return candidates.map((candidate, index) => {
    const candidateOffer = asRecord(candidate.candidate_offer);
    const seller = normalizeSellerIdentifier(stringValue(candidate.seller));
    const unit = stringValue(candidate.capacity_unit);
    const amount = numberValue(candidate.candidate_main_total_amount);
    const price = numberValue(candidate.equivalent_price) ?? numberValue(candidate.basis_price);
    return {
      id: `${seller ?? "unknown"}-${index}`,
      sellerLabel: sellerLabel(seller),
      name: stringValue(candidate.configuration_name) ?? stringValue(candidateOffer.product_name) ?? "다른 구성 상품",
      configuration: amount !== null && unit ? `${formatAmount(amount)}${formatCapacityUnit(unit)}` : stringValue(candidateOffer.option),
      comparisonLabel: COMPARISON_LABELS[stringValue(candidate.comparison_status) ?? ""] ?? "구성 비교",
      price,
      priceLabel: stringValue(candidate.price_basis) === "LISTED_SALE_PRICE" ? "판매 페이지 기준 가격" : "표시 가격 기준",
      sourceUrl: safeUrl(stringValue(candidate.source_url)),
    };
  });
}

function comparePrices(left: AnalysisOffer, right: AnalysisOffer): number {
  return (effectivePrice(left) ?? Number.MAX_SAFE_INTEGER) - (effectivePrice(right) ?? Number.MAX_SAFE_INTEGER);
}

function compareUnitPrices(left: AnalysisOffer, right: AnalysisOffer): number {
  return (left.calculatedUnitPrice ?? Number.MAX_SAFE_INTEGER) - (right.calculatedUnitPrice ?? Number.MAX_SAFE_INTEGER);
}

function effectivePrice(offer: AnalysisOffer): number | null {
  return offer.userEffectivePrice ?? offer.marketEffectivePrice ?? offer.salePrice ?? offer.originalListPrice;
}

function comparisonLabel(offer: AnalysisOffer): string {
  const status = comparisonStatus(offer);
  return COMPARISON_LABELS[status ?? ""] ?? "구성 확인 필요";
}

function comparisonStatus(offer: AnalysisOffer): string | null {
  return stringValue(asRecord(offer.offerSnapshot).comparisonStatus);
}

function offerConfigurationLabel(offer: AnalysisOffer): string | null {
  const snapshot = asRecord(offer.offerSnapshot);
  const quantity = positiveIntegerValue(offer.quantity) ?? positiveIntegerValue(snapshot.quantity);
  const totalAmount = positiveNumberValue(offer.totalAmount) ?? positiveNumberValue(snapshot.totalAmount) ?? positiveNumberValue(snapshot.total_amount);
  const unit = offerCapacityUnit(offer, snapshot);
  const parts: string[] = [];
  if (quantity === 1) parts.push("단품");
  else if (quantity === 2) parts.push(isExplicitOnePlusOne(snapshot) ? "1+1" : "2개 구성");
  else if (quantity !== null) parts.push(`${quantity}개 구성`);
  if (totalAmount !== null && unit) parts.push(quantity === 1 ? `${formatAmount(totalAmount)}${formatCapacityUnit(unit)}` : `총 ${formatAmount(totalAmount)}${formatCapacityUnit(unit)}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function offerUnitPriceLabel(offer: AnalysisOffer): string | null {
  const unitPrice = numberValue(offer.calculatedUnitPrice);
  const unit = offerCapacityUnit(offer, asRecord(offer.offerSnapshot));
  return unitPrice === null ? null : unit ? `1${formatCapacityUnit(unit)}당 ${formatMoney(unitPrice)}` : `단가 ${formatMoney(unitPrice)}`;
}

function offerCapacityUnit(offer: AnalysisOffer, snapshot: Record<string, unknown>): string | null {
  return nonEmptyString(offer.unit) ?? nonEmptyString(snapshot.unit) ?? nonEmptyString(snapshot.capacityUnit) ?? nonEmptyString(snapshot.capacity_unit);
}

function isExplicitOnePlusOne(snapshot: Record<string, unknown>): boolean {
  const flag = booleanValue(snapshot.isOnePlusOne) ?? booleanValue(snapshot.is_one_plus_one) ?? booleanValue(snapshot.onePlusOne) ?? booleanValue(snapshot.one_plus_one);
  if (flag !== null) return flag;
  const kind = nonEmptyString(snapshot.offerKind) ?? nonEmptyString(snapshot.offer_kind) ?? nonEmptyString(snapshot.promotionType) ?? nonEmptyString(snapshot.promotion_type);
  const normalized = kind?.toUpperCase().replaceAll("-", "_").replaceAll(" ", "_");
  return normalized === "ONE_PLUS_ONE" || normalized === "BUY_ONE_GET_ONE" || normalized === "1+1";
}

function isCoupangAffiliateOffer(offer: AnalysisOffer): boolean {
  const snapshot = asRecord(offer.offerSnapshot);
  return normalizeSellerIdentifier(offer.sellerIdentifier) === "COUPANG" && (booleanValue(snapshot.coupangAffiliate) ?? booleanValue(snapshot.isCoupangAffiliate)) === true;
}

function offerSourceUrl(offer: AnalysisOffer): string | null {
  const snapshot = asRecord(offer.offerSnapshot);
  return safeUrl(stringValue(snapshot.purchaseUrl) ?? stringValue(snapshot.purchase_url) ?? stringValue(snapshot.sourceUrl) ?? stringValue(snapshot.source_url));
}

function hasAdvertisedAppBenefit(offer: AnalysisOffer): boolean {
  const snapshot = asRecord(offer.offerSnapshot);
  return (booleanValue(snapshot.appBenefitAdvertised) ?? booleanValue(snapshot.app_benefit_advertised)) === true;
}

function sellerLabel(identifier: string | null): string {
  return SELLERS.find((seller) => seller.id === identifier)?.label ?? "판매처 확인 필요";
}

function criterionStatusLabel(value: string | null): string {
  if (value === "POSITIVE") return "좋음";
  if (value === "NEGATIVE") return "불리";
  if (value === "NEUTRAL") return "중립";
  return "확인 필요";
}

function formatMoney(value: number | null): string {
  return value === null ? "확인 필요" : `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function formatRate(value: number | null): string {
  if (value === null) return "확인 필요";
  return `${value > 0 ? "-" : value < 0 ? "+" : ""}${Math.abs(value).toFixed(1)}%`;
}

function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

function formatCapacityUnit(unit: string): string {
  return unit.toLowerCase() === "ml" ? "mL" : unit.toLowerCase() === "g" ? "g" : unit;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nonEmptyString(value: unknown): string | null { return stringValue(value); }
function numberValue(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function positiveNumberValue(value: unknown): number | null { const number = numberValue(value); return number !== null && number > 0 ? number : null; }
function positiveIntegerValue(value: unknown): number | null { const number = positiveNumberValue(value); return number !== null && Number.isInteger(number) ? number : null; }
function booleanValue(value: unknown): boolean | null { return typeof value === "boolean" ? value : null; }
function normalizeSellerIdentifier(value: string | null): string | null { const normalized = value?.trim().toUpperCase(); return normalized ? normalized : null; }

function safeUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const LOCAL_PREVIEW_ANALYSIS: AnalysisRecord = {
  id: "local-preview",
  sourceUrl: "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=LOCAL_PREVIEW",
  status: "COMPLETED",
  verdict: "LOW_POINT_BUY",
  productId: "local-preview-product",
  selectedCriteria: ["FINAL_PAYMENT_AMOUNT", "UNIT_PRICE", "FAST_DELIVERY"],
  warningCodes: [],
  result: {
    discountRateFromRecentAverage: 8.2,
    recentAveragePrice: 16200,
    previousSalePrice: 15500,
    aiJudgment: {
      decision_status: "DECIDED",
      conclusion: "LOW_POINT_BUY",
      conclusion_reason: "확인된 판매처 중 배송비를 포함한 최종가와 단가 조건이 가장 유리해요.",
      confidence: { level: "HIGH", reason: "6개 판매처의 확인된 판매 페이지와 가격 조건을 비교했어요." },
      criteria_results: [
        { criterion: "FINAL_PAYMENT_AMOUNT", status: "POSITIVE", reason: "배송비 포함 최종가가 가장 낮아요." },
        { criterion: "UNIT_PRICE", status: "POSITIVE", reason: "동일 50mL 기준 단가가 가장 낮아요." },
        { criterion: "FAST_DELIVERY", status: "NEUTRAL", reason: "배송 조건은 판매 페이지에서 다시 확인해 주세요." },
      ],
      recommended_offer_id: "COUPANG",
      recommendation_reason: "선택 기준 1·2·3을 함께 반영한 최종 추천이에요.",
    },
    alternativeConfigurations: {
      candidates: [
        {
          seller: "COUPANG",
          configuration_name: "라운드랩 자작나무 수분 선크림 50mL × 2",
          comparison_status: "UNIT_COMPARABLE",
          capacity_unit: "ML",
          candidate_main_total_amount: 100,
          equivalent_price: 29800,
          equivalent_price_scope: "REFERENCE_ONLY",
          price_basis: "LISTED_SALE_PRICE",
          basis_price: 29800,
          source_url: "https://www.coupang.com/",
        },
        {
          seller: "OLIVE_YOUNG",
          configuration_name: "라운드랩 자작나무 수분 선크림 50mL + 10mL",
          comparison_status: "UNIT_COMPARABLE",
          capacity_unit: "ML",
          candidate_main_total_amount: 60,
          equivalent_price: 17900,
          equivalent_price_scope: "REFERENCE_ONLY",
          price_basis: "LISTED_SALE_PRICE",
          basis_price: 17900,
          source_url: "https://www.oliveyoung.co.kr/",
        },
      ],
    },
  },
  product: {
    id: "local-preview-product",
    canonicalName: "라운드랩 자작나무 수분 선크림",
    brand: "라운드랩",
    productKey: "local-preview-roundlab-sunscreen",
    packageType: "single",
    imageUrl: null,
  },
  analysisOffers: [
    previewOffer("preview-oliveyoung", "OLIVE_YOUNG", "올리브영", 15900, 15900),
    previewOffer("preview-musinsa", "MUSINSA_BEAUTY", "무신사 뷰티", 15400, 15400),
    previewOffer("preview-coupang", "COUPANG", "쿠팡", 14900, 14900, true),
    previewOffer("preview-zigzag", "ZIGZAG", "지그재그", 15600, 15600),
    previewOffer("preview-official", "BRAND_OFFICIAL", "공식몰", 16000, 16000),
    previewOffer("preview-bigroom", "BIGROOM", "비그룸", 15300, 15300),
  ],
};

function previewOffer(
  id: string,
  sellerIdentifier: string,
  sellerName: string,
  price: number,
  userEffectivePrice: number,
  coupangAffiliate = false,
): AnalysisOffer {
  return {
    id,
    sellerOfferId: id,
    sellerIdentifier,
    sellerName,
    originalListPrice: 18000,
    salePrice: price,
    marketEffectivePrice: price,
    userEffectivePrice,
    shippingFee: 0,
    quantity: 1,
    totalAmount: 50,
    unit: "ML",
    calculatedUnitPrice: Math.round(userEffectivePrice / 50),
    offerSnapshot: {
      comparisonStatus: "DIRECTLY_COMPARABLE",
      sourceUrl: sellerIdentifier === "COUPANG" ? "https://www.coupang.com/" : "https://example.com/local-preview",
      isCoupangAffiliate: coupangAffiliate,
    },
    createdAt: "2026-09-05T00:00:00.000Z",
  };
}

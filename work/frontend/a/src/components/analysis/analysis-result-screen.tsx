"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { analysisMock, similarProductsMock } from "@/lib/mock/analysis";
import styles from "./analysis-result.module.css";

type MainTab = "analysis" | "stores";
type ChartTab = "history" | "storeHistory";
type StoreTab = "recommended" | "lowest";
type StoreSeriesKey = "coupang" | "oliveyoung" | "musinsa" | "official";

type AnalysisResultScreenProps = {
  productUrl: string;
  platform: "쿠팡";
};

const STORE_SERIES: ReadonlyArray<{ key: StoreSeriesKey; label: string }> = [
  { key: "coupang", label: "쿠팡" },
  { key: "oliveyoung", label: "올리브영" },
  { key: "musinsa", label: "무신사" },
  { key: "official", label: "공식몰" },
];

const CONFIDENCE_GUIDE = [
  { label: "높음", description: "가격과 구매 조건 등 주요 정보가 충분히 확인됐어요." },
  { label: "보통", description: "핵심 정보는 확인됐지만 일부 조건은 추가 확인이 필요해요." },
  { label: "낮음", description: "정보가 부족하거나 상품 매칭이 불확실해 참고가 필요해요." },
] as const;

function BackIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 6-6 6 6 6" /></svg>;
}

function LinkIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2" /><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2" /></svg>;
}

function SparkIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Z" /><path d="m18.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" /></svg>;
}

function HeartIcon({ filled }: { filled: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path fill={filled ? "currentColor" : "none"} d="M20.8 5.7a5.2 5.2 0 0 0-7.4 0L12 7.1l-1.4-1.4a5.2 5.2 0 1 0-7.4 7.4L12 21l8.8-7.9a5.2 5.2 0 0 0 0-7.4Z" /></svg>;
}

function CloseIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg>;
}

export function AnalysisResultScreen({ productUrl, platform }: AnalysisResultScreenProps) {
  const [mainTab, setMainTab] = useState<MainTab>("analysis");
  const [chartTab, setChartTab] = useState<ChartTab>("history");
  const [storeTab, setStoreTab] = useState<StoreTab>("recommended");
  const [isSimilarOpen, setIsSimilarOpen] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const tabsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isSimilarOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsSimilarOpen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isSimilarOpen]);

  function changeMainTab(tab: MainTab) {
    setMainTab(tab);
    if (tab === "analysis") setChartTab("history");
    window.requestAnimationFrame(() => tabsRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }

  const sourceStores = storeTab === "recommended" ? analysisMock.recommendedStores : analysisMock.lowestStores;
  const stores = sourceStores.map((store, index) => ({
    ...store,
    purchaseUrl: index === 0 ? productUrl : store.purchaseUrl,
  }));

  return (
    <main className={styles.resultPage}>
      <div className={styles.appShell}>
        <header className={styles.topbar}>
          <Link className={styles.iconButton} href="/home" aria-label="홈으로 돌아가기"><BackIcon /></Link>
          <Link className={styles.wordmark} href="/home" aria-label="캐치캐치 홈으로 이동">캐치캐치</Link>
          <button
            className={`${styles.iconButton} ${styles.favoriteButton} ${isFavorite ? styles.favoriteActive : ""}`}
            type="button"
            aria-label={isFavorite ? "관심상품에서 제거" : "관심상품에 추가"}
            aria-pressed={isFavorite}
            onClick={() => setIsFavorite((current) => !current)}
          >
            <HeartIcon filled={isFavorite} />
          </button>
        </header>

        <p className={styles.mockNotice}>데모 분석 결과 · 실제 분석 API 데이터가 아닙니다</p>

        <section className={styles.productCard} aria-labelledby="analysis-product-name">
          <div className={styles.sourceChip}><LinkIcon /><span>{productUrl}</span></div>
          <div className={styles.productMain}>
            <div className={styles.productPlaceholder} role="img" aria-label="데모 상품 이미지 자리"><span>ROUND<br />LAB</span></div>
            <div className={styles.productCopy}>
              <p>{platform}</p>
              <h1 id="analysis-product-name">{analysisMock.product.name}</h1>
              <strong>{analysisMock.product.price}</strong>
            </div>
          </div>
          <div className={styles.productDescription}><strong>상품 설명</strong><p>{analysisMock.product.description}</p></div>
          <a className={styles.externalButton} href={productUrl} target="_blank" rel="noopener noreferrer">외부 판매처로 이동 <span aria-hidden="true">↗</span></a>
        </section>

        <nav className={styles.mainTabs} aria-label="분석 정보" ref={tabsRef}>
          <button type="button" className={mainTab === "analysis" ? styles.active : ""} aria-current={mainTab === "analysis" ? "page" : undefined} onClick={() => changeMainTab("analysis")}>분석 결과</button>
          <button type="button" className={mainTab === "stores" ? styles.active : ""} aria-current={mainTab === "stores" ? "page" : undefined} onClick={() => changeMainTab("stores")}>상세 비교</button>
        </nav>

        {mainTab === "analysis" ? (
          <section className={styles.analysisPanel} aria-label="AI 구매 판단 결과">
            <div className={styles.verdictCard}>
              <span className={styles.verdictIcon}><SparkIcon /></span>
              <div>
                <p className={styles.eyebrow}>AI 구매 판단</p>
                <h2>{analysisMock.verdict.title}</h2>
                <p className={styles.verdictSummary}>{analysisMock.verdict.summary}</p>
                <div className={styles.confidenceRow}>
                  <span>판단 신뢰도</span>
                  <div className={styles.confidenceControl}>
                    <button
                      className={styles.confidenceBadge}
                      type="button"
                      aria-describedby="confidence-guide"
                      aria-label={`판단 신뢰도 ${analysisMock.confidence.label}. 신뢰도 기준 보기`}
                    >
                      {analysisMock.confidence.label}
                    </button>
                    <div className={styles.confidenceTooltip} id="confidence-guide" role="tooltip">
                      <p>판단 신뢰도 기준</p>
                      <ul>
                        {CONFIDENCE_GUIDE.map((level) => (
                          <li className={level.label === analysisMock.confidence.label ? styles.currentConfidence : undefined} key={level.label}>
                            <b>{level.label}</b>
                            <span>{level.description}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <small>{analysisMock.confidence.summary}</small>
                </div>
              </div>
            </div>

            <button className={styles.similarButton} type="button" onClick={() => setIsSimilarOpen(true)}><span>비슷한 조건의 상품도 비교해보세요</span><strong>유사상품 보기 →</strong></button>

            <div className={styles.discountGrid}>
              <article><span>표시 할인율</span><strong>{analysisMock.discount.displayed ?? "—"}</strong><small>판매 페이지 기준</small></article>
              <article className={styles.highlight}><span>실제 할인율</span><strong>{analysisMock.discount.actual ?? "—"}</strong><small>가격 이력 기준</small></article>
            </div>

            <section className={styles.contentCard} aria-label="가격 변화">
              <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>PRICE TREND</p><h2>가격 변화</h2></div><span>최근 7개월</span></div>
              <div className={styles.subtabs}>
                <button type="button" className={chartTab === "history" ? styles.active : ""} onClick={() => setChartTab("history")}>가격 변화 차트</button>
                <button type="button" className={chartTab === "storeHistory" ? styles.active : ""} onClick={() => setChartTab("storeHistory")}>판매처별 비교</button>
              </div>
              {chartTab === "history" ? <PriceChart /> : <StoreHistoryChart />}
            </section>

            <section className={`${styles.contentCard} ${styles.dataTable}`} aria-labelledby="price-data-title">
              <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>DETAILS</p><h2 id="price-data-title">기본 데이터</h2></div></div>
              <dl>
                <div><dt>최근 평균가</dt><dd>{analysisMock.baseData.averagePrice}</dd></div>
                <div><dt>직전 세일가</dt><dd>{analysisMock.baseData.previousSalePrice}</dd></div>
                <div><dt>배송비 포함</dt><dd>{analysisMock.baseData.shippingIncluded}</dd></div>
                <div><dt>용량당 가격</dt><dd>{analysisMock.baseData.unitPrice}</dd></div>
              </dl>
            </section>

            <section className={`${styles.contentCard} ${styles.criteria}`} aria-labelledby="criteria-title">
              <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>CHECK POINT</p><h2 id="criteria-title">기준별 결과</h2></div></div>
              <div className={styles.criteriaList}>{analysisMock.criteria.map((criterion, index) => {
                const [title, status] = criterion.title.split(" · ");
                return <article key={criterion.title}><span className={styles.criterionNumber}>0{index + 1}</span><div><div className={styles.criterionTitle}><h3>{title}</h3><span>{status}</span></div><p>{criterion.result}</p></div></article>;
              })}</div>
            </section>

            <Link className={styles.confirmButton} href="/home">확인</Link>
          </section>
        ) : (
          <section className={styles.storesPanel} aria-label="판매처 상세 비교">
            <div className={`${styles.subtabs} ${styles.storeTabs}`}>
              <button type="button" className={storeTab === "recommended" ? styles.active : ""} onClick={() => setStoreTab("recommended")}>추천순</button>
              <button type="button" className={storeTab === "lowest" ? styles.active : ""} onClick={() => setStoreTab("lowest")}>최저가순</button>
            </div>
            <div className={styles.storeList}>{stores.map((store, index) => (
              <article className={styles.storeCard} key={store.name}>
                <div className={styles.storeCopy}><p>{storeTab === "recommended" ? "추천" : "최저가"} {index + 1}순위</p><h2>{store.name}</h2><strong>{store.price}</strong><span>{store.description}</span></div>
                <a href={store.purchaseUrl} target="_blank" rel="noopener noreferrer">사이트 바로가기 <span aria-hidden="true">↗</span></a>
              </article>
            ))}</div>
          </section>
        )}
      </div>

      {isSimilarOpen ? (
        <div className={styles.modalBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setIsSimilarOpen(false); }}>
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="similar-products-title">
            <div className={styles.modalHeader}><div><p className={styles.eyebrow}>SIMILAR PICKS</p><h2 id="similar-products-title">유사상품 추천</h2></div><button type="button" onClick={() => setIsSimilarOpen(false)} aria-label="유사상품 팝업 닫기"><CloseIcon /></button></div>
            <p className={styles.modalIntro}>같은 선케어 유형에서 함께 살펴볼 데모 상품을 모았어요.</p>
            <div className={styles.similarList}>{similarProductsMock.map((product, index) => <article key={product.name}><div className={styles.smallPlaceholder}>0{index + 1}</div><div><p>{product.platform}</p><h3>{product.name}</h3><strong>{product.price}</strong><span>{product.reason}</span></div></article>)}</div>
            <button className={styles.modalConfirm} type="button" onClick={() => setIsSimilarOpen(false)}>확인</button>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function PriceChart() {
  const pointsData = analysisMock.priceHistory.map((item) => ({
    month: item.month,
    store: item.lowest,
    value: Math.min(item.coupang, item.musinsa, item.oliveyoung, item.official),
  }));
  const min = 14500;
  const max = 20500;
  const points = pointsData.map((item, index) => `${20 + index * (280 / (pointsData.length - 1))},${18 + ((max - item.value) / (max - min)) * 116}`).join(" ");
  const storeNames = { coupang: "쿠팡", musinsa: "무신사", oliveyoung: "올리브영", official: "공식몰" } as const;

  return <div className={styles.chartArea}><div className={styles.chartLegend}>{STORE_SERIES.map((store) => <span className={styles[store.key]} key={store.key}>{store.label}</span>)}</div><div className={styles.chartFrame}><span className={`${styles.chartY} ${styles.top}`}>20,000</span><span className={`${styles.chartY} ${styles.middle}`}>17,500</span><span className={`${styles.chartY} ${styles.bottom}`}>15,000</span><svg viewBox="0 0 320 150" role="img" aria-label="2026년 1월부터 7월까지 월별 최저가 변화"><defs><linearGradient id="analysis-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b8b2a5" stopOpacity=".24" /><stop offset="1" stopColor="#b8b2a5" stopOpacity="0" /></linearGradient></defs><path className={styles.areaFill} d={`M ${points} L 300 142 L 20 142 Z`} /><polyline className={styles.priceLine} points={points} /><g>{pointsData.map((item, index) => <circle key={item.month} className={`${styles.storeDot} ${styles[item.store]}`} cx={20 + index * (280 / (pointsData.length - 1))} cy={18 + ((max - item.value) / (max - min)) * 116} r="5"><title>{`${item.month} · ${storeNames[item.store]} · ${item.value.toLocaleString()}원`}</title></circle>)}</g></svg></div><div className={styles.axis}>{analysisMock.priceHistory.map((item) => <span key={item.month}>{item.month}</span>)}</div><p className={styles.chartNote}>점 색상은 해당 월의 최저가 판매처를 뜻해요.</p></div>;
}

function StoreHistoryChart() {
  const [selectedStoreKeys, setSelectedStoreKeys] = useState<StoreSeriesKey[]>(() => STORE_SERIES.map((series) => series.key));
  const min = 14500;
  const max = 20500;
  const lastHistory = analysisMock.priceHistory[analysisMock.priceHistory.length - 1];
  const y = (value: number) => 18 + ((max - value) / (max - min)) * 116;
  const pointsFor = (key: StoreSeriesKey) => analysisMock.priceHistory.map((item, index) => `${20 + index * (280 / (analysisMock.priceHistory.length - 1))},${y(item[key])}`).join(" ");
  const selectedSeries = STORE_SERIES.filter((series) => selectedStoreKeys.includes(series.key));

  function toggleStore(key: StoreSeriesKey) {
    setSelectedStoreKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  return <div className={styles.chartArea}><div className={styles.chartFrame}><span className={`${styles.chartY} ${styles.top}`}>20,000</span><span className={`${styles.chartY} ${styles.middle}`}>17,500</span><span className={`${styles.chartY} ${styles.bottom}`}>15,000</span><svg viewBox="0 0 320 150" role="img" aria-label="2026년 1월부터 7월까지 판매처별 가격 변화"><g>{selectedSeries.map((series) => <polyline key={series.key} className={`${styles.storeLine} ${styles[series.key]}`} points={pointsFor(series.key)}><title>{series.label} 가격 변화</title></polyline>)}</g><g>{selectedSeries.map((series) => <circle key={series.key} className={`${styles.storeEndDot} ${styles[series.key]}`} cx="300" cy={y(lastHistory[series.key])} r="4"><title>{`${series.label} · ${lastHistory[series.key].toLocaleString()}원`}</title></circle>)}</g></svg></div><div className={styles.axis}>{analysisMock.priceHistory.map((item) => <span key={item.month}>{item.month}</span>)}</div><div className={styles.storeFilter} role="group" aria-label="차트에 표시할 판매처"><p>표시할 판매처</p><div>{STORE_SERIES.map((series) => <label key={series.key}><input type="checkbox" checked={selectedStoreKeys.includes(series.key)} onChange={() => toggleStore(series.key)} /><span className={`${styles.filterDot} ${styles[series.key]}`} aria-hidden="true" />{series.label}</label>)}</div>{selectedSeries.length === 0 ? <small>표시할 판매처를 선택해 주세요.</small> : null}</div></div>;
}


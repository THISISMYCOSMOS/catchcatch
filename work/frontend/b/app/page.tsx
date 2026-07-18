"use client";

import { useEffect, useState } from "react";
import { analysisMock, similarProductsMock } from "./data/analysis.mock";

type MainTab = "analysis" | "stores";
type ChartTab = "history" | "storeHistory";
type StoreTab = "recommended" | "lowest";

export default function Home() {
  const [mainTab, setMainTab] = useState<MainTab>("analysis");
  const [chartTab, setChartTab] = useState<ChartTab>("history");
  const [storeTab, setStoreTab] = useState<StoreTab>("recommended");
  const [isSimilarOpen, setIsSimilarOpen] = useState(false);

  const changeMainTab = (tab: MainTab) => {
    setMainTab(tab);
    requestAnimationFrame(() => document.querySelector(".main-tabs")?.scrollIntoView({ block: "start" }));
  };

  useEffect(() => {
    if (!isSimilarOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsSimilarOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
    };
  }, [isSimilarOpen]);

  const stores = storeTab === "recommended" ? analysisMock.recommendedStores : analysisMock.lowestStores;

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="icon-button" aria-label="메뉴 열기"><span /><span /><span /></button>
        <div className="wordmark" aria-label="캐치캐치 홈">캐치캐치</div>
        <button className="profile-button" aria-label="마이페이지"><span className="head" /><span className="body" /></button>
      </header>

      <section className="product-card" aria-labelledby="product-name">
        <p className="source-link">↗ {analysisMock.product.sourceUrl}</p>
        <div className="product-main">
          <div className="product-placeholder" role="img" aria-label="상품 이미지 미제공" />
          <div>
            <h1 id="product-name">{analysisMock.product.name}</h1>
            <p className="muted">{analysisMock.product.platform}</p>
            <strong className="product-price">{analysisMock.product.price}</strong>
          </div>
        </div>
        <h2>상품 설명</h2>
        <p>{analysisMock.product.description}</p>
      </section>

      <nav className="main-tabs" aria-label="분석 정보">
        <button className={mainTab === "analysis" ? "active" : ""} onClick={() => changeMainTab("analysis")}>분석 결과</button>
        <button className={mainTab === "stores" ? "active" : ""} onClick={() => changeMainTab("stores")}>판매처 비교</button>
      </nav>

      {mainTab === "analysis" ? (
        <section className="analysis-panel">
          <div className="verdict">
            <p className="eyebrow">최종 결론</p>
            <h2>{analysisMock.verdict.title}</h2>
            <p>{analysisMock.verdict.summary}</p>
          </div>

          <button className="similar-button" onClick={() => setIsSimilarOpen(true)}>유사상품 보기</button>

          <div className="discount-grid">
            <article><span>표시 할인율</span><strong>{analysisMock.discount.displayed ?? "–"}</strong></article>
            <article className="highlight"><span>실제 할인율</span><strong>{analysisMock.discount.actual ?? "–"}</strong></article>
          </div>

          <section className="chart-card" aria-label="가격 변화">
            <div className="subtabs">
              <button className={chartTab === "history" ? "active" : ""} onClick={() => setChartTab("history")}>가격 변화 차트</button>
              <button className={chartTab === "storeHistory" ? "active" : ""} onClick={() => setChartTab("storeHistory")}>판매처별 가격 변화 비교</button>
            </div>
            {chartTab === "history" ? <PriceChart /> : <StoreChart />}
          </section>

          <section className="data-table" aria-labelledby="price-data-title">
            <h3 id="price-data-title">기본 데이터</h3>
            <dl>
              <div><dt>최근 평균가</dt><dd>{analysisMock.baseData.averagePrice}</dd></div>
              <div><dt>직전 세일가</dt><dd>{analysisMock.baseData.previousSalePrice}</dd></div>
              <div><dt>배송비 포함</dt><dd>{analysisMock.baseData.shippingIncluded}</dd></div>
              <div><dt>용량당 가격</dt><dd>{analysisMock.baseData.unitPrice}</dd></div>
            </dl>
          </section>

          <section className="criteria" aria-labelledby="criteria-title">
            <h2 id="criteria-title">기준별 결과</h2>
            {analysisMock.criteria.map((criterion) => (
              <article key={criterion.title}>
                <h3>{criterion.title}</h3>
                <p>{criterion.result}</p>
              </article>
            ))}
          </section>
          <button className="confirm-button">확인</button>
        </section>
      ) : (
        <section className="stores-panel">
          <div className="subtabs store-tabs">
            <button className={storeTab === "recommended" ? "active" : ""} onClick={() => setStoreTab("recommended")}>추천</button>
            <button className={storeTab === "lowest" ? "active" : ""} onClick={() => setStoreTab("lowest")}>최저가</button>
          </div>
          <p className="store-note">{storeTab === "recommended" ? "선택한 구매 기준을 함께 고려한 추천 순서예요." : "실구매가가 낮은 순서로 확인해 보세요."}</p>
          <div className="store-list">
            {stores.map((store, index) => (
              <article className="store-card" key={store.name}>
                <div className="store-rank">{index + 1}</div>
                <div className="store-copy"><h2>{store.name} · {store.price}</h2><p>{store.description}</p></div>
                <a href={store.url} target="_blank" rel="noreferrer">사이트 바로가기</a>
              </article>
            ))}
          </div>
        </section>
      )}

      {isSimilarOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsSimilarOpen(false); }}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="similar-title">
            <div className="modal-header"><div><p className="eyebrow">비슷한 조건으로 비교했어요</p><h2 id="similar-title">유사상품</h2></div><button onClick={() => setIsSimilarOpen(false)} aria-label="유사상품 팝업 닫기">×</button></div>
            <p className="modal-intro">용량과 상품 유형이 비슷한 샘플 상품이에요. 가격과 구성 조건을 함께 확인해 보세요.</p>
            <div className="similar-list">
              {similarProductsMock.map((product) => <article key={product.name}><div className="small-placeholder" /><div><h3>{product.name}</h3><p>{product.platform}</p><strong>{product.price}</strong><span>{product.reason}</span></div></article>)}
            </div>
            <button className="modal-confirm" onClick={() => setIsSimilarOpen(false)}>확인</button>
          </section>
        </div>
      )}
    </main>
  );
}

function PriceChart() {
  const points = analysisMock.priceHistory.map((item, index) => {
    const value = Math.min(item.coupang, item.musinsa, item.oliveyoung, item.official);
    return { ...item, value, x: (index / (analysisMock.priceHistory.length - 1)) * 100, y: ((20000 - value) / 5000) * 100 };
  });
  return <div className="chart-area"><div className="chart-legend"><span className="coupang">쿠팡</span><span className="musinsa">무신사</span><span className="oliveyoung">올리브영</span><span className="official">공식몰*</span></div><div className="chart-labels"><span>20,000</span><span>17,500</span><span>15,000</span></div><div className="line-chart" aria-label="2026년 1월부터 7월까지 월별 최저가 변화"><div className="price-path" />{points.map((point) => <b key={point.month} className={`data-dot ${point.lowest}`} style={{ left: `${point.x}%`, bottom: `${point.y}%` }} title={`${point.month} ${point.value.toLocaleString()}원`}><em>{point.value.toLocaleString()}</em></b>)}</div><div className="axis">{points.map((point) => <span key={point.month}>{point.month}</span>)}</div><p className="mock-note">* 공식몰 가격은 임시 목업 데이터</p></div>;
}

function StoreChart() {
  return <div className="bar-chart" aria-label="2026년 7월 판매처별 가격 비교"><div><span>쿠팡</span><i style={{ width: "75%" }} /><b>15,000원</b></div><div><span>무신사</span><i style={{ width: "89.5%" }} /><b>17,900원</b></div><div><span>올리브영</span><i style={{ width: "87.5%" }} /><b>17,500원</b></div><div><span>공식몰*</span><i style={{ width: "92.5%" }} /><b>18,500원</b></div><p className="mock-note">* 공식몰 가격은 임시 목업 데이터</p></div>;
}

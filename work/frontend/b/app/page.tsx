"use client";

import { useEffect, useState } from "react";
import { analysisMock, similarProductsMock, type StoreOffer } from "./data/analysis.mock";

type MainTab = "analysis" | "stores";
type ChartTab = "history" | "storeHistory";
type StoreTab = "recommended" | "lowest";
type OpenPanel = "menu" | "notifications" | null;

const FRONTEND_A_SEARCH_URL = "http://localhost:3000/home";
const MENU_ITEMS = ["마이페이지", "세일 캘린더", "관심 상품", "고객센터", "설정"];

function MenuIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h14" /></svg>; }
function BellIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6.5 9.5a5.5 5.5 0 0 1 11 0c0 6 2 6 2 7.5h-15c0-1.5 2-1.5 2-7.5Z" /><path d="M10 20h4" /></svg>; }
function CloseIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg>; }
function LinkIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2" /><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2" /></svg>; }
function SparkIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Z" /><path d="m18.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" /></svg>; }

export default function Home() {
  const [mainTab, setMainTab] = useState<MainTab>("analysis");
  const [chartTab, setChartTab] = useState<ChartTab>("history");
  const [storeTab, setStoreTab] = useState<StoreTab>("recommended");
  const [isSimilarOpen, setIsSimilarOpen] = useState(false);
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);

  const changeMainTab = (tab: MainTab) => {
    setMainTab(tab);
    if (tab === "analysis") setChartTab("history");
    requestAnimationFrame(() => document.querySelector(".main-tabs")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };

  useEffect(() => {
    if (!isSimilarOpen && !openPanel) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setIsSimilarOpen(false); setOpenPanel(null); }
    };
    const previousOverflow = document.body.style.overflow;
    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", closeOnEscape); document.body.style.overflow = previousOverflow; };
  }, [isSimilarOpen, openPanel]);

  const stores: readonly StoreOffer[] = storeTab === "recommended" ? analysisMock.recommendedStores : analysisMock.lowestStores;
  const storeBadge = (index: number) => `${storeTab === "recommended" ? "추천" : "최저가"} ${index + 1}순위`;

  return (
    <main className="result-page">
      <div className="app-shell">
        <header className="topbar">
          <button className="icon-button" type="button" aria-label="메뉴 열기" onClick={() => setOpenPanel("menu")}><MenuIcon /></button>
          <a className="wordmark" href={FRONTEND_A_SEARCH_URL} aria-label="캐치캐치 검색 화면으로 이동">캐치캐치</a>
          <button className="icon-button notification-button" type="button" aria-label="알림 열기" onClick={() => setOpenPanel("notifications")}><BellIcon /><span className="notification-dot" aria-hidden="true" /></button>
        </header>

        <section className="product-card" aria-labelledby="product-name">
          <div className="source-chip"><LinkIcon /><span>{analysisMock.product.sourceUrl}</span></div>
          <div className="product-main">
            <div className="product-placeholder" role="img" aria-label="상품 이미지 준비 중"><span>ROUND<br />LAB</span></div>
            <div className="product-copy"><p className="platform">{analysisMock.product.platform}</p><h2 id="product-name">{analysisMock.product.name}</h2><strong className="product-price">{analysisMock.product.price}</strong></div>
          </div>
          <div className="product-description"><strong>상품 설명</strong><p>{analysisMock.product.description}</p></div>
        </section>

        <nav className="main-tabs" aria-label="분석 정보">
          <button className={mainTab === "analysis" ? "active" : ""} aria-current={mainTab === "analysis" ? "page" : undefined} onClick={() => changeMainTab("analysis")}>분석 결과</button>
          <button className={mainTab === "stores" ? "active" : ""} aria-current={mainTab === "stores" ? "page" : undefined} onClick={() => changeMainTab("stores")}>판매처 비교</button>
        </nav>

        {mainTab === "analysis" ? (
          <section className="analysis-panel">
            <div className="verdict-card"><span className="verdict-icon"><SparkIcon /></span><div><p className="eyebrow">최종 결론</p><h2>{analysisMock.verdict.title}</h2><p className="verdict-summary">{analysisMock.verdict.summary}</p><div className="confidence-row"><span>판단 신뢰도</span><strong>{analysisMock.confidence.label}</strong><small>{analysisMock.confidence.summary}</small></div></div></div>
            <button className="similar-button" onClick={() => setIsSimilarOpen(true)}><span>비슷한 조건의 상품도 비교해보세요</span><strong>유사상품 보기 →</strong></button>
            <div className="discount-grid">
              <article><span>표시 할인율</span><strong>{analysisMock.discount.displayed ?? "—"}</strong><small>판매 페이지 기준</small></article>
              <article className="highlight"><span>실제 할인율</span><strong>{analysisMock.discount.actual ?? "—"}</strong><small>가격 이력 기준</small></article>
            </div>

            <section className="content-card chart-card" aria-label="가격 변화">
              <div className="section-heading"><div><p className="eyebrow">PRICE TREND</p><h3>가격 변화</h3></div><span>최근 7개월</span></div>
              <div className="subtabs"><button className={chartTab === "history" ? "active" : ""} onClick={() => setChartTab("history")}>가격 변화 차트</button><button className={chartTab === "storeHistory" ? "active" : ""} onClick={() => setChartTab("storeHistory")}>판매처별 비교</button></div>
              {chartTab === "history" ? <PriceChart /> : <StoreHistoryChart />}
            </section>

            <section className="content-card data-table" aria-labelledby="price-data-title">
              <div className="section-heading"><div><p className="eyebrow">DETAILS</p><h3 id="price-data-title">기본 데이터</h3></div></div>
              <dl><div><dt>최근 평균가</dt><dd>{analysisMock.baseData.averagePrice}</dd></div><div><dt>직전 세일가</dt><dd>{analysisMock.baseData.previousSalePrice}</dd></div><div><dt>배송비 포함</dt><dd>{analysisMock.baseData.shippingIncluded}</dd></div><div><dt>용량당 가격</dt><dd>{analysisMock.baseData.unitPrice}</dd></div></dl>
            </section>

            <section className="content-card criteria" aria-labelledby="criteria-title">
              <div className="section-heading"><div><p className="eyebrow">CHECK POINT</p><h2 id="criteria-title">기준별 결과</h2></div></div>
              <div className="criteria-list">{analysisMock.criteria.map((criterion, index) => { const [title, status] = criterion.title.split(" · "); return <article key={criterion.title}><span className="criterion-number">0{index + 1}</span><div><div className="criterion-title"><h3>{title}</h3><span>{status}</span></div><p>{criterion.result}</p></div></article>; })}</div>
            </section>
            <a className="confirm-button" href={FRONTEND_A_SEARCH_URL}>확인</a>
          </section>
        ) : (
          <section className="stores-panel">
            <div className="subtabs store-tabs"><button className={storeTab === "recommended" ? "active" : ""} onClick={() => setStoreTab("recommended")}>추천순</button><button className={storeTab === "lowest" ? "active" : ""} onClick={() => setStoreTab("lowest")}>최저가순</button></div>
            <div className="store-list">{stores.map((store, index) => <article className="store-card" key={store.name}><div className="store-copy"><p>{storeBadge(index)}</p><h3>{store.name}</h3><strong>{store.price}</strong><span>{store.description}</span></div><a href={store.purchaseUrl} target="_blank" rel="noreferrer">사이트 바로가기 <span aria-hidden="true">↗</span></a></article>)}</div>
          </section>
        )}
      </div>

      {openPanel && <button className="drawer-overlay" type="button" aria-label="패널 닫기" onClick={() => setOpenPanel(null)} />}
      {openPanel === "menu" && <MenuDrawer onClose={() => setOpenPanel(null)} />}
      {openPanel === "notifications" && <NotificationDrawer onClose={() => setOpenPanel(null)} />}
      {isSimilarOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsSimilarOpen(false); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="similar-title"><div className="modal-header"><div><p className="eyebrow">SIMILAR PICKS</p><h2 id="similar-title">유사상품</h2></div><button onClick={() => setIsSimilarOpen(false)} aria-label="유사상품 팝업 닫기"><CloseIcon /></button></div><p className="modal-intro">같은 선케어 유형에서 함께 살펴볼 상품을 모았어요.</p><div className="similar-list">{similarProductsMock.map((product, index) => <article key={product.name}><div className="small-placeholder">0{index + 1}</div><div><p>{product.platform}</p><h3>{product.name}</h3><strong>{product.price}</strong><span>{product.reason}</span></div></article>)}</div><button className="modal-confirm" onClick={() => setIsSimilarOpen(false)}>확인</button></section></div>}
    </main>
  );
}

function MenuDrawer({ onClose }: { onClose: () => void }) { return <aside className="side-drawer menu-drawer" role="dialog" aria-modal="true" aria-label="메뉴"><button className="menu-close" type="button" onClick={onClose} aria-label="메뉴 닫기"><CloseIcon /></button><nav aria-label="주요 메뉴"><ul>{MENU_ITEMS.map((item) => <li key={item}><button type="button" onClick={onClose}>{item}</button></li>)}<li><button className="menu-logout" type="button" onClick={onClose}>로그아웃</button></li></ul></nav></aside>; }
function NotificationDrawer({ onClose }: { onClose: () => void }) { return <aside className="side-drawer notification-drawer" role="dialog" aria-modal="true" aria-labelledby="notification-title"><div className="drawer-header"><h2 id="notification-title">알림</h2><button type="button" onClick={onClose} aria-label="알림 닫기"><CloseIcon /></button></div><div className="notification-list"><article className="unread"><span /><div><strong>분석이 완료됐어요</strong><p>라운드랩 독도 선크림의 가격 분석 결과를 확인해보세요.</p><time>방금 전</time></div></article><article><span /><div><strong>7월 가격 데이터 반영</strong><p>비교 판매처의 7월 가격 데이터가 업데이트됐어요.</p><time>오늘</time></div></article></div></aside>; }
function PriceChart() {
  const pointsData = analysisMock.priceHistory.map((item) => ({
    month: item.month,
    store: item.lowest,
    value: Math.min(item.coupang, item.musinsa, item.oliveyoung, item.official),
  }));
  const min = 14500; const max = 20500;
  const points = pointsData.map((item, index) => `${20 + index * (280 / (pointsData.length - 1))},${18 + ((max - item.value) / (max - min)) * 116}`).join(" ");
  const storeNames = { coupang:"쿠팡", musinsa:"무신사", oliveyoung:"올리브영", official:"공식몰" } as const;
  return <div className="chart-area"><div className="chart-legend"><span className="coupang">쿠팡</span><span className="musinsa">무신사</span><span className="oliveyoung">올리브영</span><span className="official">공식몰</span></div><div className="chart-frame"><span className="chart-y top">20,000</span><span className="chart-y middle">17,500</span><span className="chart-y bottom">15,000</span><svg viewBox="0 0 320 150" role="img" aria-label="2026년 1월부터 7월까지 월별 최저가와 최저가 판매처 변화"><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b8b2a5" stopOpacity=".24" /><stop offset="1" stopColor="#b8b2a5" stopOpacity="0" /></linearGradient></defs><path className="area-fill" d={`M ${points} L 300 142 L 20 142 Z`} /><polyline points={points} /><g>{pointsData.map((item, index) => <circle key={item.month} className={`store-dot ${item.store}`} cx={20 + index * (280 / (pointsData.length - 1))} cy={18 + ((max - item.value) / (max - min)) * 116} r="5"><title>{`${item.month} · ${storeNames[item.store]} · ${item.value.toLocaleString()}원`}</title></circle>)}</g></svg></div><div className="axis">{analysisMock.priceHistory.map((item) => <span key={item.month}>{item.month}</span>)}</div><p className="mock-note">점 색상은 해당 월의 최저가 판매처를 뜻해요.</p></div>;
}
const STORE_SERIES = [
  { key: "coupang", label: "쿠팡" },
  { key: "oliveyoung", label: "올리브영" },
  { key: "musinsa", label: "무신사" },
  { key: "official", label: "공식몰" },
] as const;
type StoreSeriesKey = (typeof STORE_SERIES)[number]["key"];

function StoreHistoryChart() {
  const [selectedStoreKeys, setSelectedStoreKeys] = useState<StoreSeriesKey[]>(() => STORE_SERIES.map((series) => series.key));
  const min = 14500; const max = 20500;
  const lastHistory = analysisMock.priceHistory[analysisMock.priceHistory.length - 1];
  const y = (value: number) => 18 + ((max - value) / (max - min)) * 116;
  const pointsFor = (key: (typeof STORE_SERIES)[number]["key"]) => analysisMock.priceHistory.map((item, index) => `${20 + index * (280 / (analysisMock.priceHistory.length - 1))},${y(item[key])}`).join(" ");
  const selectedSeries = STORE_SERIES.filter((series) => selectedStoreKeys.includes(series.key));
  const toggleStore = (key: StoreSeriesKey) => setSelectedStoreKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  return <div className="chart-area store-history-chart"><div className="chart-frame"><span className="chart-y top">20,000</span><span className="chart-y middle">17,500</span><span className="chart-y bottom">15,000</span><svg viewBox="0 0 320 150" role="img" aria-label="2026년 1월부터 7월까지 판매처별 가격 변화"><g>{selectedSeries.map((series) => <polyline key={series.key} className={`store-line ${series.key}`} points={pointsFor(series.key)}><title>{`${series.label} 가격 변화`}</title></polyline>)}</g><g>{selectedSeries.map((series) => <circle key={series.key} className={`store-end-dot ${series.key}`} cx="300" cy={y(lastHistory[series.key])} r="4"><title>{`${series.label} · ${lastHistory[series.key].toLocaleString()}원`}</title></circle>)}</g></svg></div><div className="axis">{analysisMock.priceHistory.map((item) => <span key={item.month}>{item.month}</span>)}</div><div className="store-filter" role="group" aria-label="차트에 표시할 판매처"><p>표시할 판매처</p><div className="store-filter-options">{STORE_SERIES.map((series) => <label className={`store-filter-option ${series.key}`} key={series.key}><input type="checkbox" checked={selectedStoreKeys.includes(series.key)} onChange={() => toggleStore(series.key)} /><span className="store-filter-dot" aria-hidden="true" />{series.label}</label>)}</div>{selectedSeries.length === 0 && <small>표시할 판매처를 선택해 주세요.</small>}</div></div>;
}

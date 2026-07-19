"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  DEMO_PRODUCT,
  DEMO_PRODUCT_URL,
  HOME_NOTIFICATIONS,
  HomeNotificationItem,
  ProductPreview,
  RECENT_ANALYSES,
  getRecentAnalysisById,
} from "@/lib/mock/home";
import { PreviousAnalysisDialog } from "@/components/home/previous-analysis-dialog";
import { NotificationDetailDialog } from "@/components/home/notification-detail-dialog";
import { RecentAnalysisCard } from "@/components/home/recent-analysis-card";
import { clearMockAuthentication } from "@/lib/mock/session";

type OpenPanel = "menu" | "notifications" | null;
type OpenHomeModal =
  | { kind: "analysis"; analysisId: string }
  | { kind: "notification"; notificationId: string }
  | null;

const MENU_ITEMS = ["마이페이지", "세일 캘린더", "관심 상품", "고객센터", "설정"];

function MenuIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h14" /></svg>;
}

function BellIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6.5 9.5a5.5 5.5 0 0 1 11 0c0 6 2 6 2 7.5h-15c0-1.5 2-1.5 2-7.5Z" /><path d="M10 20h4" /></svg>;
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

function NotificationTypeIcon({ type }: { type: HomeNotificationItem["type"] }) {
  if (type === "analysis") {
    return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 19V9m7 10V5m7 14v-7M3 19h18" /></svg>;
  }
  if (type === "price") {
    return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 8 4-4h7l4 4v7l-4 4H9l-4-4Z" /><path d="M9 8h6m-3-2v4m-3 4h6" /></svg>;
  }
  if (type === "promotion") {
    return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m4 12 8-8h7v7l-8 8Z" /><path d="M15.5 7.5h.01M8 14l2 2m0-4-2 4" /></svg>;
  }
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M12 10v6m0-9h.01" /></svg>;
}

function formatPrice(price: number) {
  return `${price.toLocaleString("ko-KR")}원`;
}

function ImagePlaceholder({ compact = false }: { compact?: boolean }) {
  return <div className={compact ? "product-image-placeholder compact" : "product-image-placeholder"} aria-label="상품 이미지 없음" />;
}

function ProductPreviewCard({ product }: { product: ProductPreview }) {
  return (
    <article className="product-preview product-preview-popover" aria-live="polite">
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

function NotificationItem({ item, onActivate }: { item: HomeNotificationItem; onActivate: (item: HomeNotificationItem) => void }) {
  const hasDetailAction = item.actionType !== "none";
  return (
    <button
      className={item.isRead ? "notification-item is-read" : "notification-item unread"}
      type="button"
      data-notification-id={item.id}
      data-action-type={item.actionType}
      onClick={() => onActivate(item)}
      aria-label={`${item.title}, ${item.isRead ? "읽은 알림" : "안 읽은 알림"}${hasDetailAction ? ", 상세 확인" : ""}`}
    >
      <span className="notification-type-icon"><NotificationTypeIcon type={item.type} /></span>
      <span className="notification-copy">
        <strong>{item.title}</strong>
        <span>{item.message}</span>
        <time>{item.createdAtLabel}</time>
      </span>
      {hasDetailAction ? <span className="notification-action-icon"><ArrowIcon /></span> : null}
      {!item.isRead ? (
        <>
          <span className="notification-unread-dot" aria-hidden="true" />
          <span className="sr-only">안 읽은 알림</span>
        </>
      ) : <span className="sr-only">읽은 알림</span>}
    </button>
  );
}

function NotificationDrawer({ notifications, unreadCount, onActivate, onMarkAllRead, onClose, actionError, isClosing }: {
  notifications: HomeNotificationItem[];
  unreadCount: number;
  onActivate: (item: HomeNotificationItem) => void;
  onMarkAllRead: () => void;
  onClose: () => void;
  actionError: string;
  isClosing: boolean;
}) {
  return (
    <aside className={"home-drawer notification-drawer " + (isClosing ? "is-closing" : "is-open")} role="dialog" aria-modal="true" aria-labelledby="notification-title">
      <div className="drawer-heading">
        <h2 id="notification-title">알림</h2>
        <div className="notification-heading-actions">
          <button className="mark-all-read" type="button" disabled={unreadCount === 0} onClick={onMarkAllRead}>모두 읽음</button>
          <button className="drawer-close" type="button" aria-label="알림 닫기" onClick={onClose}><CloseIcon /></button>
        </div>
      </div>
      <div className="notification-list">
        {notifications.map((item) => <NotificationItem key={item.id} item={item} onActivate={onActivate} />)}
      </div>
      {actionError ? <p className="notification-action-error" role="alert">{actionError}</p> : null}
    </aside>
  );
}

function MenuDrawer({ onClose, onLogout, isClosing }: { onClose: () => void; onLogout: () => void; isClosing: boolean }) {
  return (
    <aside className={"home-drawer menu-drawer " + (isClosing ? "is-closing" : "is-open")} role="dialog" aria-modal="true" aria-label="메뉴">
      <button className="drawer-close menu-close" type="button" aria-label="메뉴 닫기" onClick={onClose}><CloseIcon /></button>
      <nav aria-label="주요 메뉴">
        <ul>
          {MENU_ITEMS.map((item) => <li key={item}><span aria-disabled="true">{item}</span></li>)}
          <li><button className="menu-logout" type="button" onClick={onLogout}>로그아웃</button></li>
        </ul>
      </nav>
    </aside>
  );
}

export function HomeScreen() {
  const router = useRouter();
  const [linkValue, setLinkValue] = useState("");
  const [product, setProduct] = useState<ProductPreview | null>(null);
  const [isProductPopoverOpen, setIsProductPopoverOpen] = useState(false);
  const productRegionRef = useRef<HTMLDivElement>(null);
  const homePageRef = useRef<HTMLElement>(null);
  const [notifications, setNotifications] = useState<HomeNotificationItem[]>(HOME_NOTIFICATIONS);
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [isDrawerClosing, setIsDrawerClosing] = useState(false);
  const [openModal, setOpenModal] = useState<OpenHomeModal>(null);
  const [notificationActionError, setNotificationActionError] = useState("");
  const unreadCount = notifications.filter((item) => !item.isRead).length;
  const selectedAnalysis = openModal?.kind === "analysis"
    ? getRecentAnalysisById(openModal.analysisId)
    : null;
  const selectedNotification = openModal?.kind === "notification"
    ? notifications.find((item) => item.id === openModal.notificationId) ?? null
    : null;
  const hasOpenNotificationModal = Boolean(openPanel && openModal);
  const hasOpenNotificationModalRef = useRef(hasOpenNotificationModal);

  const closeDrawer = useCallback(() => {
    if (!openPanel || isDrawerClosing) return;
    setOpenModal(null);
    setNotificationActionError("");
    setIsDrawerClosing(true);
    window.setTimeout(() => {
      setOpenPanel(null);
      setIsDrawerClosing(false);
    }, 300);
  }, [isDrawerClosing, openPanel]);
  const closeDrawerRef = useRef(closeDrawer);

  useEffect(() => {
    closeDrawerRef.current = closeDrawer;
  }, [closeDrawer]);

  useEffect(() => {
    hasOpenNotificationModalRef.current = hasOpenNotificationModal;
  }, [hasOpenNotificationModal]);

  useLayoutEffect(() => {
    return () => setOpenModal(null);
  }, []);

  useEffect(() => {
    if (!isProductPopoverOpen) return;
    const handleOutsidePointer = (event: PointerEvent) => {
      if (!productRegionRef.current?.contains(event.target as Node)) setIsProductPopoverOpen(false);
    };
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [isProductPopoverOpen]);

  useLayoutEffect(() => {
    if (!openPanel) return;
    const scrollY = window.scrollY;
    const frame = homePageRef.current;
    const bodyWidth = document.body.getBoundingClientRect().width;
    const previousBodyStyles = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    };

    frame?.style.setProperty("--home-panel-top", `${scrollY}px`);
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = `${bodyWidth}px`;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !hasOpenNotificationModalRef.current) closeDrawerRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousBodyStyles.overflow;
      document.body.style.position = previousBodyStyles.position;
      document.body.style.top = previousBodyStyles.top;
      document.body.style.width = previousBodyStyles.width;
      frame?.style.removeProperty("--home-panel-top");
      window.scrollTo(0, scrollY);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [openPanel]);

  function openDrawer(panel: Exclude<OpenPanel, null>) {
    setOpenModal(null);
    setNotificationActionError("");
    setIsDrawerClosing(false);
    setOpenPanel(panel);
  }

  function handleLogout() {
    setOpenModal(null);
    clearMockAuthentication();
    setIsDrawerClosing(true);
    window.setTimeout(() => {
      setOpenPanel(null);
      setIsDrawerClosing(false);
      router.replace("/login");
    }, 300);
  }

  function markNotificationAsRead(id: string) {
    setNotifications((current) => current.map((item) => (
      item.id === id && !item.isRead ? { ...item, isRead: true } : item
    )));
  }

  function activateNotification(item: HomeNotificationItem) {
    markNotificationAsRead(item.id);
    setNotificationActionError("");
    setOpenModal(null);

    if (item.actionType === "none") return;
    if (item.actionType === "navigate") {
      setIsDrawerClosing(true);
      window.setTimeout(() => {
        setOpenPanel(null);
        setIsDrawerClosing(false);
        router.push(item.targetPath);
      }, 300);
      return;
    }
    if (item.analysisId) {
      if (!getRecentAnalysisById(item.analysisId)) {
        setNotificationActionError("연결된 이전 분석 결과를 불러오지 못했어요.");
        return;
      }
      setOpenModal({ kind: "analysis", analysisId: item.analysisId });
      return;
    }
    setOpenModal({ kind: "notification", notificationId: item.id });
  }

  function markAllNotificationsAsRead() {
    setNotifications((current) => current.map((item) => (
      item.isRead ? item : { ...item, isRead: true }
    )));
  }

  function handleLinkChange(value: string) {
    setLinkValue(value);
    const matchedProduct = value.trim() === DEMO_PRODUCT_URL ? DEMO_PRODUCT : null;
    setProduct(matchedProduct);
    setIsProductPopoverOpen(Boolean(matchedProduct));
  }

  function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!product) return;
  }

  return (
    <main className="home-page" ref={homePageRef}>
      <div className="home-mobile-shell">
        <header className="home-header">
          <button className="home-icon-button" type="button" aria-label="메뉴 열기" onClick={() => openDrawer("menu")}><MenuIcon /></button>
          <p className="home-logo" aria-label="캐치캐치">캐치캐치</p>
          <button className="home-icon-button notification-button" type="button" aria-label="알림 열기" onClick={() => openDrawer("notifications")}>
            <BellIcon />
            {unreadCount > 0 ? <span className="notification-dot" aria-label={`읽지 않은 알림 ${unreadCount}개`} /> : null}
          </button>
        </header>

        <section className="home-intro" aria-labelledby="home-title">
          <h1 id="home-title">현명한 소비의 시작,<br />지금 분석해보세요!</h1>
          <p>상품 링크를 붙여넣으면 가격차트, 최저가 쇼핑몰까지<br className="wide-only-break" /> 한 번에 분석해드려요.</p>
        </section>

        <form className="analysis-form" onSubmit={handleAnalyze}>
          <div className="analysis-input-region" ref={productRegionRef}>
            <label className="analysis-input-wrap">
              <span className="sr-only">상품 링크</span>
              <span className="analysis-link-icon"><LinkIcon /></span>
              <input
                type="url"
                value={linkValue}
                onChange={(event) => handleLinkChange(event.target.value)}
                onFocus={() => {
                  if (linkValue.trim() === DEMO_PRODUCT_URL && product) setIsProductPopoverOpen(true);
                }}
                onClick={() => {
                  if (linkValue.trim() === DEMO_PRODUCT_URL && product) setIsProductPopoverOpen(true);
                }}
                placeholder="링크 붙여넣기"
                autoComplete="url"
              />
            </label>
            {product && isProductPopoverOpen ? <ProductPreviewCard product={product} /> : null}
          </div>
          <button className="analysis-submit" type="submit" disabled={!product}>분석하기</button>
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
                onSelect={(id) => setOpenModal({ kind: "analysis", analysisId: id })}
              />
            ))}
          </div>
        </section>
      </div>

      {openPanel ? (
        <div className={`home-panel-layer ${openModal ? "has-modal" : ""}`}>
          <button
            className={"drawer-overlay " + (isDrawerClosing ? "is-closing" : "is-open")}
            type="button"
            aria-label="열린 패널 닫기"
            onClick={closeDrawer}
          />
          {openPanel === "notifications" ? (
            <NotificationDrawer
              notifications={notifications}
              unreadCount={unreadCount}
              onActivate={activateNotification}
              onMarkAllRead={markAllNotificationsAsRead}
              onClose={closeDrawer}
              actionError={notificationActionError}
              isClosing={isDrawerClosing}
            />
          ) : null}
          {openPanel === "menu" ? (
            <MenuDrawer onClose={closeDrawer} onLogout={handleLogout} isClosing={isDrawerClosing} />
          ) : null}
          {selectedAnalysis ? (
            <PreviousAnalysisDialog analysis={selectedAnalysis} onClose={() => setOpenModal(null)} />
          ) : null}
          {selectedNotification ? (
            <NotificationDetailDialog notification={selectedNotification} onClose={() => setOpenModal(null)} />
          ) : null}
        </div>
      ) : null}
      {selectedAnalysis && !openPanel ? (
        <PreviousAnalysisDialog analysis={selectedAnalysis} onClose={() => setOpenModal(null)} />
      ) : null}
    </main>
  );
}

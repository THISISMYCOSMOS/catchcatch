"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  DEMO_PRODUCT,
  DEMO_PRODUCT_URL,
  HOME_NOTIFICATIONS,
  HomeNotificationItem,
  ProductPreview,
  RECENT_ANALYSES,
} from "@/lib/mock/home";
import { RecentAnalysisCard } from "@/components/home/recent-analysis-card";
import { clearMockAuthentication } from "@/lib/mock/session";

type OpenPanel = "menu" | "notifications" | null;

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

function NotificationItem({ item, onRead }: { item: HomeNotificationItem; onRead: (id: string) => void }) {
  return (
    <button
      className={item.isRead ? "notification-item is-read" : "notification-item unread"}
      type="button"
      onClick={() => onRead(item.id)}
      aria-label={item.title + ", " + (item.isRead ? "읽은 알림" : "안 읽은 알림")}
    >
      <span className="notification-copy">
        <strong>{item.title}</strong>
        <span>{item.message}</span>
        <time>{item.createdAtLabel}</time>
      </span>
      {!item.isRead ? (
        <>
          <span className="notification-unread-dot" aria-hidden="true" />
          <span className="sr-only">안 읽은 알림</span>
        </>
      ) : <span className="sr-only">읽은 알림</span>}
    </button>
  );
}

function NotificationDrawer({ notifications, unreadCount, onRead, onMarkAllRead, onClose, isClosing }: {
  notifications: HomeNotificationItem[];
  unreadCount: number;
  onRead: (id: string) => void;
  onMarkAllRead: () => void;
  onClose: () => void;
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
        {notifications.map((item) => <NotificationItem key={item.id} item={item} onRead={onRead} />)}
      </div>
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
  const [notifications, setNotifications] = useState<HomeNotificationItem[]>(HOME_NOTIFICATIONS);
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [isDrawerClosing, setIsDrawerClosing] = useState(false);
  const unreadCount = notifications.filter((item) => !item.isRead).length;

  const closeDrawer = useCallback(() => {
    if (!openPanel || isDrawerClosing) return;
    setIsDrawerClosing(true);
    window.setTimeout(() => {
      setOpenPanel(null);
      setIsDrawerClosing(false);
    }, 300);
  }, [isDrawerClosing, openPanel]);

  useEffect(() => {
    if (!isProductPopoverOpen) return;
    const handleOutsidePointer = (event: PointerEvent) => {
      if (!productRegionRef.current?.contains(event.target as Node)) setIsProductPopoverOpen(false);
    };
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [isProductPopoverOpen]);

  useEffect(() => {
    if (!openPanel) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeDrawer, openPanel]);

  function openDrawer(panel: Exclude<OpenPanel, null>) {
    setIsDrawerClosing(false);
    setOpenPanel(panel);
  }

  function handleLogout() {
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
    <main className="home-page">
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
            {RECENT_ANALYSES.slice(0, 3).map((item) => <RecentAnalysisCard key={item.id} item={item} />)}
          </div>
        </section>
      </div>

      {openPanel ? (
        <button
          className={"drawer-overlay " + (isDrawerClosing ? "is-closing" : "is-open")}
          type="button"
          aria-label="열린 패널 닫기"
          onClick={closeDrawer}
        />
      ) : null}
      {openPanel === "notifications" ? (
        <NotificationDrawer
          notifications={notifications}
          unreadCount={unreadCount}
          onRead={markNotificationAsRead}
          onMarkAllRead={markAllNotificationsAsRead}
          onClose={closeDrawer}
          isClosing={isDrawerClosing}
        />
      ) : null}
      {openPanel === "menu" ? <MenuDrawer onClose={closeDrawer} onLogout={handleLogout} isClosing={isDrawerClosing} /> : null}
    </main>
  );
}

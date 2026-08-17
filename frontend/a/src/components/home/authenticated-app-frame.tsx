"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppLogo } from "@/components/app-logo";
import { NotificationDetailDialog } from "@/components/home/notification-detail-dialog";
import { PreviousAnalysisDialog } from "@/components/home/previous-analysis-dialog";
import {
  getRecentAnalysisById,
  HOME_NOTIFICATIONS,
  type HomeNotificationItem,
} from "@/lib/mock/home";

type OpenPanel = "menu" | "notifications" | null;
type OpenHeaderModal =
  | { kind: "analysis"; analysisId: string }
  | { kind: "notification"; notificationId: string }
  | null;

type AuthenticatedAppFrameProps = {
  children: ReactNode;
  pageClassName?: string;
  shellClassName?: string;
  headerClassName?: string;
  overlayContent?: ReactNode;
  backHref?: string;
  backLabel?: string;
};

const MENU_ITEMS = [
  { label: "마이페이지", href: "/mypage/profile" },
  { label: "혜택 등록", href: "/benefits" },
  { label: "세일캘린더", href: "/sale-calendar" },
  { label: "관심상품", href: "/saved-products" },
  { label: "1:1문의", href: "/inquiry" },
  { label: "설정", href: "/settings" },
] as const;

function MenuIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h14" /></svg>;
}

function BellIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6.5 9.5a5.5 5.5 0 0 1 11 0c0 6 2 6 2 7.5h-15c0-1.5 2-1.5 2-7.5Z" /><path d="M10 20h4" /></svg>;
}

function CloseIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg>;
}

function ArrowIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>;
}

function NotificationTypeIcon({ type }: { type: HomeNotificationItem["type"] }) {
  if (type === "analysis") {
    return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 3.5h7l3 3V20H7Z" /><path d="M14 3.5V7h3m-7.5 6 1.7 1.7 3.4-3.5" /></svg>;
  }
  if (type === "price") {
    return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m4 7 6 6 4-4 6 6" /><path d="M15 15h5v-5" /></svg>;
  }
  if (type === "promotion") {
    return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m4 12 8-8h7v7l-8 8Z" /><path d="M15.5 7.5h.01M8.5 13.5h.01m3 3h.01m-3.5.5 4-4" /></svg>;
  }
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M12 11v5m0-8h.01" /></svg>;
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
    <aside className={`home-drawer notification-drawer ${isClosing ? "is-closing" : "is-open"}`} role="dialog" aria-modal="true" aria-labelledby="notification-title">
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

function MenuDrawer({ onClose, onNavigate, isClosing }: {
  onClose: () => void;
  onNavigate: (href: string) => void;
  isClosing: boolean;
}) {
  return (
    <aside className={`home-drawer menu-drawer ${isClosing ? "is-closing" : "is-open"}`} role="dialog" aria-modal="true" aria-label="메뉴">
      <button className="drawer-close menu-close" type="button" aria-label="메뉴 닫기" onClick={onClose}><CloseIcon /></button>
      <nav aria-label="주요 메뉴">
        <ul>
          {MENU_ITEMS.map((item) => (
            <li key={item.label}>
              <button className="menu-navigation" type="button" onClick={() => onNavigate(item.href)}>{item.label}</button>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

export function AuthenticatedAppFrame({
  children,
  pageClassName = "home-page",
  shellClassName = "home-mobile-shell",
  headerClassName = "home-header",
  overlayContent,
  backHref,
  backLabel = "이전 화면으로 돌아가기",
}: AuthenticatedAppFrameProps) {
  const router = useRouter();
  const pageRef = useRef<HTMLElement>(null);
  const [notifications, setNotifications] = useState<HomeNotificationItem[]>(HOME_NOTIFICATIONS);
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [isDrawerClosing, setIsDrawerClosing] = useState(false);
  const [openModal, setOpenModal] = useState<OpenHeaderModal>(null);
  const [notificationActionError, setNotificationActionError] = useState("");
  const unreadCount = notifications.filter((item) => !item.isRead).length;
  const selectedAnalysis = openModal?.kind === "analysis" ? getRecentAnalysisById(openModal.analysisId) : null;
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
    if (!openPanel) return;
    const scrollY = window.scrollY;
    const frame = pageRef.current;
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

  function closeAndNavigate(href: string) {
    if (isDrawerClosing) return;
    setOpenModal(null);
    setNotificationActionError("");
    setIsDrawerClosing(true);
    window.setTimeout(() => {
      setOpenPanel(null);
      setIsDrawerClosing(false);
      router.push(href);
    }, 300);
  }

  function markNotificationAsRead(id: string) {
    setNotifications((current) => current.map((item) => item.id === id && !item.isRead ? { ...item, isRead: true } : item));
  }

  function activateNotification(item: HomeNotificationItem) {
    markNotificationAsRead(item.id);
    setNotificationActionError("");
    setOpenModal(null);

    if (item.actionType === "none") return;
    if (item.actionType === "navigate") {
      closeAndNavigate(item.targetPath);
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

  return (
    <>
      <AppLogo
        className="home-logo"
        leftAction={backHref ? (
          <Link className="recent-back" href={backHref} aria-label={backLabel}>‹</Link>
        ) : (
          <button className="home-icon-button" type="button" aria-label="메뉴 열기" onClick={() => openDrawer("menu")}><MenuIcon /></button>
        )}
        rightAction={backHref ? undefined : (
          <button className="home-icon-button notification-button" type="button" aria-label="알림 열기" onClick={() => openDrawer("notifications")}>
            <BellIcon />
            {unreadCount > 0 ? <span className="notification-dot" aria-label={`읽지 않은 알림 ${unreadCount}개`} /> : null}
          </button>
      )}
      />
      <main className={pageClassName} ref={pageRef}>
        <div className={shellClassName}>
          <header className={headerClassName}>
            <span aria-hidden="true" />
            <p className="home-logo logo-layout-placeholder" aria-hidden="true">캐치캐치</p>
            <span aria-hidden="true" />
          </header>
          {children}
        </div>

        {openPanel ? (
          <div className={`home-panel-layer ${openModal ? "has-modal" : ""}`}>
            <button className={`drawer-overlay ${isDrawerClosing ? "is-closing" : "is-open"}`} type="button" aria-label="열린 패널 닫기" onClick={closeDrawer} />
            {openPanel === "notifications" ? (
              <NotificationDrawer
                notifications={notifications}
                unreadCount={unreadCount}
                onActivate={activateNotification}
                onMarkAllRead={() => setNotifications((current) => current.map((item) => item.isRead ? item : { ...item, isRead: true }))}
                onClose={closeDrawer}
                actionError={notificationActionError}
                isClosing={isDrawerClosing}
              />
            ) : null}
            {openPanel === "menu" ? <MenuDrawer onClose={closeDrawer} onNavigate={closeAndNavigate} isClosing={isDrawerClosing} /> : null}
            {selectedAnalysis ? <PreviousAnalysisDialog analysis={selectedAnalysis} onClose={() => setOpenModal(null)} /> : null}
            {selectedNotification ? <NotificationDetailDialog notification={selectedNotification} onClose={() => setOpenModal(null)} /> : null}
          </div>
        ) : null}
        {overlayContent}
      </main>
    </>
  );
}

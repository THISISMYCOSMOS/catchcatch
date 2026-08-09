"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useState } from "react";
import { AuthenticatedAppFrame } from "@/components/home/authenticated-app-frame";
import { daysInMonth, firstWeekdayOfMonth, toIsoDate } from "@/components/home/date-utils";
import { SaleDetailDialog } from "@/components/sale-calendar/sale-detail-dialog";
import {
  SALE_CALENDAR_ITEMS,
  SALE_CALENDAR_MONTH,
  type SaleCalendarItem,
  type SaleStatus,
} from "@/lib/mock/sale-calendar";
import { getMockAuthenticatedRoute } from "@/lib/mock/session";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function parseMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  return { year, month: month - 1 };
}

function formatIsoDate(value: string) {
  const [, month, day] = value.split("-").map(Number);
  return `${month}.${String(day).padStart(2, "0")}`;
}

function getLocalIsoDate(date: Date) {
  return toIsoDate(date.getFullYear(), date.getMonth(), date.getDate());
}

function MonthChevronIcon({ direction }: { direction: "previous" | "next" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d={direction === "previous" ? "m15 6-6 6 6 6" : "m9 6 6 6-6 6"} />
    </svg>
  );
}

function SaleCard({ sale, onSelect }: { sale: SaleCalendarItem; onSelect: (id: string) => void }) {
  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect(sale.id);
  }

  return (
    <article
      className="sale-card"
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      aria-label={`${sale.title} 상세 보기`}
      onClick={() => onSelect(sale.id)}
      onKeyDown={handleKeyDown}
    >
      <div className="sale-card-image">
        {sale.imageUrl ? (
          <Image src={sale.imageUrl} alt={`${sale.sellerName} 세일`} fill sizes="76px" />
        ) : (
          <span role="img" aria-label={`${sale.sellerName} 이미지 준비 중`} />
        )}
      </div>
      <div className="sale-card-content">
        <div className="sale-card-meta">
          <p className="sale-seller">{sale.sellerName}</p>
          <div className={`sale-status sale-status-${sale.status}`}><span aria-hidden="true" />{sale.statusLabel}</div>
        </div>
        <h3>{sale.title}</h3>
        <div className="sale-card-supporting">
          <p className="sale-period"><time dateTime={sale.startDate}>{formatIsoDate(sale.startDate)}</time><span aria-hidden="true"> – </span><time dateTime={sale.endDate}>{formatIsoDate(sale.endDate)}</time></p>
          <strong className="sale-discount">{sale.maxDiscountLabel}</strong>
        </div>
      </div>
      <span className="sale-dday">{sale.dDayLabel}</span>
    </article>
  );
}

export function SaleCalendarScreen() {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [{ year, month }, setVisibleMonth] = useState(() => parseMonth(SALE_CALENDAR_MONTH));
  const [todayIsoDate] = useState(() => getLocalIsoDate(new Date()));
  const visibleMonthLabel = `${year}년 ${month + 1}월`;
  const visibleMonthValue = `${year}-${String(month + 1).padStart(2, "0")}`;
  const visibleSales = useMemo(() => {
    const monthStart = toIsoDate(year, month, 1);
    const monthEnd = toIsoDate(year, month, daysInMonth(year, month));
    return SALE_CALENDAR_ITEMS.filter((sale) => sale.startDate <= monthEnd && sale.endDate >= monthStart);
  }, [month, year]);
  const selectedSale = selectedSaleId
    ? SALE_CALENDAR_ITEMS.find((sale) => sale.id === selectedSaleId) ?? null
    : null;
  const calendarDays = useMemo(() => {
    const firstWeekday = firstWeekdayOfMonth(year, month);
    const monthDayCount = daysInMonth(year, month);
    const statusByDate = new Map<string, Set<SaleStatus>>();

    visibleSales.forEach((sale) => {
      sale.markedDates.forEach((date) => {
        const statuses = statusByDate.get(date) ?? new Set<SaleStatus>();
        statuses.add(sale.status);
        statusByDate.set(date, statuses);
      });
    });

    return Array.from({ length: 42 }, (_, index) => {
      const day = index - firstWeekday + 1;
      if (day < 1 || day > monthDayCount) return null;
      const isoDate = toIsoDate(year, month, day);
      return { day, isoDate, statuses: Array.from(statusByDate.get(isoDate) ?? []) };
    });
  }, [month, visibleSales, year]);

  useEffect(() => {
    const authorizationCheck = window.setTimeout(() => {
      const authenticatedRoute = getMockAuthenticatedRoute();
      if (authenticatedRoute !== "/home") {
        router.replace(authenticatedRoute);
        return;
      }
      setIsAuthorized(true);
    }, 0);
    return () => window.clearTimeout(authorizationCheck);
  }, [router]);

  if (!isAuthorized) return null;

  function moveMonth(offset: -1 | 1) {
    setVisibleMonth((current) => {
      const target = new Date(Date.UTC(current.year, current.month + offset, 1));
      return { year: target.getUTCFullYear(), month: target.getUTCMonth() };
    });
  }

  return (
    <AuthenticatedAppFrame
      pageClassName="home-page feature-page"
      shellClassName="home-mobile-shell feature-shell"
      headerClassName="home-header feature-header"
      overlayContent={selectedSale ? <SaleDetailDialog sale={selectedSale} onClose={() => setSelectedSaleId(null)} /> : null}
    >
      <section className="feature-heading calendar-heading" aria-labelledby="sale-calendar-title">
        <h1 className="section-page-title" id="sale-calendar-title">세일 캘린더</h1>
      </section>

      <section className="sale-calendar-card" aria-label={`${visibleMonthLabel} 세일 일정`}>
        <div className="sale-calendar-month-nav">
          <button type="button" aria-label="이전 달 보기" onClick={() => moveMonth(-1)}><MonthChevronIcon direction="previous" /></button>
          <p aria-live="polite"><time dateTime={visibleMonthValue}>{visibleMonthLabel}</time></p>
          <button type="button" aria-label="다음 달 보기" onClick={() => moveMonth(1)}><MonthChevronIcon direction="next" /></button>
        </div>
        <div className="sale-calendar-weekdays" aria-hidden="true">
          {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
        </div>
        <div className="sale-calendar-days">
          {calendarDays.map((date, index) => date ? (
            <div
              className={`sale-calendar-day ${date.isoDate === todayIsoDate ? "is-today" : ""}`}
              key={date.isoDate}
              aria-label={`${month + 1}월 ${date.day}일${date.isoDate === todayIsoDate ? ", 오늘" : ""}`}
            >
              <time dateTime={date.isoDate} aria-current={date.isoDate === todayIsoDate ? "date" : undefined}>{date.day}</time>
              <span className="sale-day-markers" aria-hidden="true">
                {date.statuses.map((status) => <span className={`sale-day-marker ${status}`} key={status} />)}
              </span>
            </div>
          ) : <span className="sale-calendar-day empty" key={`empty-${index}`} aria-hidden="true" />)}
        </div>
        <div className="sale-calendar-legend" aria-label="세일 일정 범례">
          <span><i className="sale-day-marker ongoing" aria-hidden="true" />세일 진행 중</span>
          <span><i className="sale-day-marker upcoming" aria-hidden="true" />예정된 세일</span>
        </div>
      </section>

      <section className="upcoming-sales" aria-labelledby="upcoming-sales-title">
        <h2 id="upcoming-sales-title">예정된 세일</h2>
        {visibleSales.length > 0 ? (
          <div className="sale-list">
            {visibleSales.map((sale) => <SaleCard sale={sale} onSelect={setSelectedSaleId} key={sale.id} />)}
          </div>
        ) : (
          <p className="sale-empty-state">예정된 세일이 없어요.</p>
        )}
      </section>
    </AuthenticatedAppFrame>
  );
}

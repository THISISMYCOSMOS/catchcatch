"use client";

import { apiRequest } from "@/lib/api/client";
import type { SaleCalendarItem, SaleStatus } from "@/lib/mock/sale-calendar";

type SaleCalendarResponse = {
  id: string;
  sellerName: string;
  title: string;
  description: string | null;
  saleType: string;
  startsAt: string;
  endsAt: string;
  bannerImageUrl: string | null;
  landingUrl: string | null;
  status: "ACTIVE" | "UPCOMING" | "ENDED";
};

export async function getSaleCalendar(): Promise<SaleCalendarItem[]> {
  const rows = await apiRequest<SaleCalendarResponse[]>("/api/v1/sale-calendar?limit=50", {
    authenticated: false,
  });
  return rows.map(toSaleCalendarItem);
}

function toSaleCalendarItem(row: SaleCalendarResponse): SaleCalendarItem {
  const startDate = row.startsAt.slice(0, 10);
  const endDate = row.endsAt.slice(0, 10);
  const status: SaleStatus = row.status === "ACTIVE" ? "ongoing" : "upcoming";
  return {
    id: row.id,
    title: row.title,
    sellerName: row.sellerName,
    shortDescription: row.description ?? "세부 이용 조건은 판매처에서 확인해 주세요.",
    description: row.description ?? "등록된 상세 설명이 없습니다.",
    status,
    statusLabel: status === "ongoing" ? "진행 중" : "진행 예정",
    startDate,
    endDate,
    maxDiscountLabel: row.saleType,
    dDayLabel: dDayLabel(startDate, status),
    imageUrl: row.bannerImageUrl,
    targetCategory: null,
    conditions: row.landingUrl ? "판매처 상세 페이지에서 조건 확인" : null,
    markedDates: datesBetween(startDate, endDate),
    landingUrl: row.landingUrl,
  };
}

function datesBetween(startDate: string, endDate: string): string[] {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const dates: string[] = [];
  for (let current = start; current <= end && dates.length < 93; current = new Date(current.getTime() + 86_400_000)) {
    dates.push(current.toISOString().slice(0, 10));
  }
  return dates;
}

function dDayLabel(startDate: string, status: SaleStatus): string {
  if (status === "ongoing") return "진행 중";
  const today = new Date();
  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const start = new Date(`${startDate}T00:00:00`).getTime();
  return `D-${Math.max(Math.ceil((start - localToday) / 86_400_000), 0)}`;
}

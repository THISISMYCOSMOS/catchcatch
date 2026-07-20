"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DatePicker } from "@/components/home/date-picker";
import { PreviousAnalysisDialog } from "@/components/home/previous-analysis-dialog";
import { RecentAnalysisCard } from "@/components/home/recent-analysis-card";
import { getRecentAnalysisById, RECENT_ANALYSES } from "@/lib/mock/home";
import { isMockAuthenticated } from "@/lib/mock/session";

type AppliedRange = {
  startDate: string;
  endDate: string;
};

type OpenCalendar = "start" | "end" | null;

function toDateInputValue(analyzedAt: string) {
  return analyzedAt.replaceAll(".", "-");
}

export default function RecentAnalysesPage() {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startDateValid, setStartDateValid] = useState(true);
  const [endDateValid, setEndDateValid] = useState(true);
  const [openCalendar, setOpenCalendar] = useState<OpenCalendar>(null);
  const [appliedRange, setAppliedRange] = useState<AppliedRange>({ startDate: "", endDate: "" });
  const [rangeError, setRangeError] = useState("");
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState("");

  useEffect(() => {
    const authorizationCheck = window.setTimeout(() => {
      if (!isMockAuthenticated()) {
        router.replace("/login");
        return;
      }
      setIsAuthorized(true);
    }, 0);
    return () => window.clearTimeout(authorizationCheck);
  }, [router]);

  const filteredAnalyses = useMemo(() => RECENT_ANALYSES.filter((item) => {
    const analyzedAt = toDateInputValue(item.analyzedAt);
    if (appliedRange.startDate && analyzedAt < appliedRange.startDate) return false;
    if (appliedRange.endDate && analyzedAt > appliedRange.endDate) return false;
    return true;
  }), [appliedRange]);

  const setStartCalendarOpen = useCallback((open: boolean) => {
    setOpenCalendar(open ? "start" : null);
  }, []);

  const setEndCalendarOpen = useCallback((open: boolean) => {
    setOpenCalendar(open ? "end" : null);
  }, []);

  function applyDateRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!startDateValid || !endDateValid) {
      setRangeError("유효한 날짜를 입력해주세요.");
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      setRangeError("시작일은 종료일보다 늦을 수 없어요.");
      return;
    }
    setRangeError("");
    setAppliedRange({ startDate, endDate });
  }

  function openPreviousAnalysis(id: string) {
    if (!getRecentAnalysisById(id)) {
      setAnalysisError("이전 분석 결과를 불러오지 못했어요.");
      setSelectedAnalysisId(null);
      return;
    }
    setAnalysisError("");
    setOpenCalendar(null);
    setSelectedAnalysisId(id);
  }

  function closePreviousAnalysis() {
    setSelectedAnalysisId(null);
  }

  const selectedAnalysis = selectedAnalysisId
    ? getRecentAnalysisById(selectedAnalysisId)
    : null;

  if (!isAuthorized) return null;

  return (
    <main className="recent-page">
      <div className="recent-page-shell">
        <header className="recent-page-header">
          <Link className="recent-back" href="/home" aria-label="홈으로 돌아가기">‹</Link>
          <p className="home-logo" aria-label="캐치캐치">캐치캐치</p>
          <span aria-hidden="true" />
        </header>

        <h1>최근 분석</h1>

        <form className="date-filter" onSubmit={applyDateRange} noValidate>
          <div className="date-fields">
            <DatePicker
              id="analysis-start-date"
              label="시작일"
              value={startDate}
              isOpen={openCalendar === "start"}
              onOpenChange={setStartCalendarOpen}
              onValueChange={(value) => { setStartDate(value); setRangeError(""); }}
              onValidityChange={(valid) => { setStartDateValid(valid); setRangeError(""); }}
            />
            <DatePicker
              id="analysis-end-date"
              label="종료일"
              value={endDate}
              isOpen={openCalendar === "end"}
              onOpenChange={setEndCalendarOpen}
              onValueChange={(value) => { setEndDate(value); setRangeError(""); }}
              onValidityChange={(valid) => { setEndDateValid(valid); setRangeError(""); }}
            />
          </div>
          {rangeError ? <p className="date-filter-error" role="alert">{rangeError}</p> : null}
          <button className="date-filter-submit" type="submit">조회</button>
        </form>

        {filteredAnalyses.length > 0 ? (
          <div className="recent-list">
            {filteredAnalyses.map((item) => (
              <RecentAnalysisCard key={item.id} item={item} onSelect={openPreviousAnalysis} variant="history" />
            ))}
          </div>
        ) : <p className="recent-empty">해당 기간의 분석 기록이 없어요.</p>}
        {analysisError ? <p className="date-filter-error" role="alert">{analysisError}</p> : null}
      </div>
      {selectedAnalysis ? (
        <PreviousAnalysisDialog analysis={selectedAnalysis} onClose={closePreviousAnalysis} />
      ) : null}
    </main>
  );
}

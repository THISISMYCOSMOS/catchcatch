"use client";

import { KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  CURRENT_YEAR,
  MIN_YEAR,
  daysInMonth,
  firstWeekdayOfMonth,
  formatDateDigits,
  formatDateForDisplay,
  parseDisplayDate,
  toIsoDate,
} from "@/components/home/date-utils";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

type CalendarView = "day" | "month" | "year";

type DatePickerProps = {
  id: string;
  label: string;
  value: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onValueChange: (value: string) => void;
  onValidityChange: (valid: boolean) => void;
};

type CalendarMonth = {
  year: number;
  month: number;
};

function parseIsoMonth(value: string): CalendarMonth {
  if (value) {
    const [year, month] = value.split("-").map(Number);
    return { year, month: month - 1 };
  }
  const today = new Date();
  return { year: today.getFullYear(), month: today.getMonth() };
}

function padMonth(month: number) {
  return String(month).padStart(2, "0");
}


function cursorForDigitCount(formatted: string, digitCount: number) {
  if (digitCount <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < formatted.length; index += 1) {
    if (/\d/.test(formatted[index])) seen += 1;
    if (seen === digitCount) {
      let cursor = index + 1;
      if ((digitCount === 4 || digitCount === 6) && formatted[cursor] === "-") cursor += 1;
      return cursor;
    }
  }
  return formatted.length;
}

function CalendarIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

export function DatePicker({
  id,
  label,
  value,
  isOpen,
  onOpenChange,
  onValueChange,
  onValidityChange,
}: DatePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [displayValue, setDisplayValue] = useState(formatDateForDisplay(value));
  const [visibleMonth, setVisibleMonth] = useState<CalendarMonth>(() => parseIsoMonth(value));
  const [calendarView, setCalendarView] = useState<CalendarView>("day");

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("pointerdown", handleOutsidePointer);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointer);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onOpenChange]);

  function openCalendar() {
    const initialMonth = parseIsoMonth(value);
    setVisibleMonth(initialMonth);
    setCalendarView("day");
    onOpenChange(true);
  }

  function updateFromRawInput(rawValue: string, rawCursor: number | null) {
    const digitCountBeforeCursor = rawValue.slice(0, rawCursor ?? rawValue.length).replace(/\D/g, "").length;
    const formatted = formatDateDigits(rawValue);
    setDisplayValue(formatted);

    if (!formatted) {
      onValueChange("");
      onValidityChange(true);
    } else {
      const parsed = parseDisplayDate(formatted);
      onValueChange(parsed ?? "");
      onValidityChange(Boolean(parsed));
    }

    const nextCursor = cursorForDigitCount(formatted, digitCountBeforeCursor);
    window.requestAnimationFrame(() => inputRef.current?.setSelectionRange(nextCursor, nextCursor));
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    if (start !== end) return;

    if (event.key === "Backspace" && start > 0 && displayValue[start - 1] === "-") {
      event.preventDefault();
      const removeFrom = Math.max(0, start - 2);
      updateFromRawInput(displayValue.slice(0, removeFrom) + displayValue.slice(start), removeFrom);
    }

    if (event.key === "Delete" && displayValue[start] === "-") {
      event.preventDefault();
      updateFromRawInput(displayValue.slice(0, start) + displayValue.slice(start + 2), start);
    }
  }

  function changeMonth(offset: number) {
    setVisibleMonth((current) => {
      const nextIndex = current.year * 12 + current.month + offset;
      return { year: Math.floor(nextIndex / 12), month: nextIndex % 12 };
    });
  }

  function openYearView() {
    setCalendarView("year");
  }

  const firstWeekday = firstWeekdayOfMonth(visibleMonth.year, visibleMonth.month);
  const monthDays = daysInMonth(visibleMonth.year, visibleMonth.month);
  const calendarWeekCount = Math.max(5, Math.ceil((firstWeekday + monthDays) / 7));
  const calendarCellCount = calendarWeekCount * 7;
  const today = new Date();
  const todayIso = toIsoDate(today.getFullYear(), today.getMonth(), today.getDate());
  const canMovePrevious = visibleMonth.year > MIN_YEAR || visibleMonth.month > 0;
  const canMoveNext = visibleMonth.year < CURRENT_YEAR || visibleMonth.month < 11;

return (
    <div className="date-picker" ref={rootRef}>
      <label className="sr-only" htmlFor={id}>{label}</label>
      <div className="date-input-control">
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={label}
          value={displayValue}
          maxLength={10}
          onChange={(event) => updateFromRawInput(event.target.value, event.target.selectionStart)}
          onKeyDown={handleInputKeyDown}
          onFocus={openCalendar}
          aria-describedby={id + "-format"}
        />
        <button type="button" aria-label={label + " 달력 열기"} onClick={() => { if (isOpen) onOpenChange(false); else openCalendar(); }}>
          <CalendarIcon />
        </button>
      </div>
      <span className="sr-only" id={id + "-format"}>날짜 형식 yyyy-mm-dd, 선택 가능한 연도 2015년부터 {CURRENT_YEAR}년</span>

      {isOpen ? (
        <div className="calendar-popover" role="dialog" aria-label={label + " 달력"}>
          {calendarView === "day" ? (
            <div className="calendar-view calendar-day-view">
              <div className="calendar-month-navigation">
                <button type="button" aria-label="이전 달" disabled={!canMovePrevious} onClick={() => changeMonth(-1)}>‹</button>
                <button className="calendar-header-text" type="button" onClick={() => setCalendarView("month")}>
                  {String(visibleMonth.year).padStart(4, "0")}년 {padMonth(visibleMonth.month + 1)}월
                </button>
                <button type="button" aria-label="다음 달" disabled={!canMoveNext} onClick={() => changeMonth(1)}>›</button>
              </div>
              <div className="calendar-weekdays" aria-hidden="true">
                {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
              </div>
              <div className={"calendar-days has-" + calendarWeekCount + "-weeks"}>
                {Array.from({ length: calendarCellCount }, (_, index) => {
                  const day = index - firstWeekday + 1;
                  if (day < 1 || day > monthDays) return <span className="calendar-day-empty" key={index} aria-hidden="true" />;
                  const iso = toIsoDate(visibleMonth.year, visibleMonth.month, day);
                  const isSelected = iso === value;
                  const isToday = iso === todayIso;
                  return (
                    <button
                      type="button"
                      key={iso}
                      className={(isSelected ? "is-selected " : "") + (isToday ? "is-today" : "")}
                      aria-pressed={isSelected}
                      onClick={() => {
                        setDisplayValue(formatDateForDisplay(iso));
                        onValueChange(iso);
                        onValidityChange(true);
                        onOpenChange(false);
                      }}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {calendarView === "month" ? (
            <div className="calendar-view calendar-month-view">
              <button className="calendar-header-text calendar-year-only" type="button" onClick={openYearView}>
                {String(visibleMonth.year).padStart(4, "0")}년
              </button>
              <div className="calendar-month-grid" aria-label={visibleMonth.year + "년 월 선택"}>
                {Array.from({ length: 12 }, (_, month) => (
                  <button
                    type="button"
                    key={month}
                    className={visibleMonth.month === month ? "is-selected" : ""}
                    aria-pressed={visibleMonth.month === month}
                    onClick={() => {
                      setVisibleMonth((current) => ({ ...current, month }));
                      setCalendarView("day");
                    }}
                  >
                    {month + 1}월
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {calendarView === "year" ? (
            <div className="calendar-view calendar-year-view">
              <div className="calendar-year-grid" aria-label="연도 선택">
                {Array.from({ length: CURRENT_YEAR - MIN_YEAR + 1 }, (_, index) => {
                  const year = MIN_YEAR + index;
                  return (
                    <button
                      type="button"
                      key={year}
                      className={visibleMonth.year === year ? "is-selected" : ""}
                      aria-pressed={visibleMonth.year === year}
                      onClick={() => {
                        setVisibleMonth((current) => ({ ...current, year }));
                        setCalendarView("month");
                      }}
                    >
                      {year}년
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

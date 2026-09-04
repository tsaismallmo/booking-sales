"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { WEEKDAYS, getMealPeriod, dateLabel } from "@/lib/quote";

type Tab = "calendar" | "inline" | "eztable";

const TABS: { key: Tab; label: string }[] = [
  { key: "calendar", label: "月曆" },
  { key: "inline", label: "Inline" },
  { key: "eztable", label: "EZTABLE" },
];

type DayCounts = { total: number; need: number };

type DayBooking = {
  id: string;
  branch: string | null;
  category: string;
  bookingDate: string;
  timeSlot: string | null;
  partySize: number | null;
  bookingCode: string | null;
  customerName: string | null;
  customerPhone: string | null;
  depositAmount: string | null;
  note: string | null;
  status: "unsold" | "reserved" | "sold" | "refunded";
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function CalendarTab() {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1); // 1-12
  const [monthCounts, setMonthCounts] = useState<Record<string, DayCounts>>({});
  const [loadingMonth, setLoadingMonth] = useState(true);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayBookings, setDayBookings] = useState<DayBooking[]>([]);
  const [loadingDay, setLoadingDay] = useState(false);

  const [branchFilter, setBranchFilter] = useState("");
  const [mealFilter, setMealFilter] = useState("");
  const [weekdayFilter, setWeekdayFilter] = useState("");

  useEffect(() => {
    fetch(`/api/booking-board/calendar?year=${viewYear}&month=${viewMonth}`)
      .then((res) => res.json())
      .then((data) => {
        setMonthCounts(data && typeof data === "object" ? data : {});
        setLoadingMonth(false);
      });
  }, [viewYear, viewMonth]);

  useEffect(() => {
    if (!selectedDate) return;
    fetch(`/api/booking-board/day?date=${selectedDate}`)
      .then((res) => res.json())
      .then((data) => {
        setDayBookings(Array.isArray(data) ? data : []);
        setLoadingDay(false);
      });
  }, [selectedDate]);

  const goPrevMonth = () => {
    if (viewMonth === 1) { setViewYear((y) => y - 1); setViewMonth(12); } else { setViewMonth((m) => m - 1); }
    setSelectedDate(null);
  };
  const goNextMonth = () => {
    if (viewMonth === 12) { setViewYear((y) => y + 1); setViewMonth(1); } else { setViewMonth((m) => m + 1); }
    setSelectedDate(null);
  };
  const goToday = () => {
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth() + 1);
    setSelectedDate(todayStr());
  };

  const cells = useMemo(() => {
    const firstWeekday = new Date(viewYear, viewMonth - 1, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    const result: (number | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) result.push(null);
    for (let d = 1; d <= daysInMonth; d++) result.push(d);
    return result;
  }, [viewYear, viewMonth]);

  const dayBranches = useMemo(
    () => Array.from(new Set(dayBookings.map((b) => b.branch).filter((b): b is string => !!b))).sort(),
    [dayBookings]
  );

  const filteredDayBookings = useMemo(() => {
    let rows = dayBookings;
    if (branchFilter) rows = rows.filter((b) => b.branch === branchFilter);
    if (mealFilter) rows = rows.filter((b) => getMealPeriod(b.timeSlot) === mealFilter);
    return [...rows].sort((a, b) => (a.timeSlot ?? "").localeCompare(b.timeSlot ?? ""));
  }, [dayBookings, branchFilter, mealFilter]);

  const today = todayStr();

  return (
    <>
      <div className="erp-card" style={{ marginBottom: 16 }}>
        <div className="erp-card-body" style={{ padding: "12px 16px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select className="erp-select" style={{ maxWidth: 150 }} value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="">全部分店</option>
            {dayBranches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className="erp-select" style={{ maxWidth: 120 }} value={mealFilter} onChange={(e) => setMealFilter(e.target.value)}>
            <option value="">全部餐期</option>
            <option value="午餐">午餐</option>
            <option value="下午茶">下午茶</option>
            <option value="晚餐">晚餐</option>
          </select>
          <select className="erp-select" style={{ maxWidth: 120 }} value={weekdayFilter} onChange={(e) => setWeekdayFilter(e.target.value)}>
            <option value="">全部星期</option>
            <option value="0">星期日</option>
            <option value="1">星期一</option>
            <option value="2">星期二</option>
            <option value="3">星期三</option>
            <option value="4">星期四</option>
            <option value="5">星期五</option>
            <option value="6">星期六</option>
          </select>
        </div>
      </div>

      <div className="erp-card" style={{ marginBottom: 16 }}>
        <div className="erp-card-body" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <button className="btn btn-secondary" style={{ padding: "4px 10px" }} onClick={goPrevMonth}>‹</button>
            <span style={{ fontSize: 15, fontWeight: 600, color: "var(--gray-700)", minWidth: 90, textAlign: "center" }}>
              {viewYear} 年 {viewMonth} 月
            </span>
            <button className="btn btn-secondary" style={{ padding: "4px 10px" }} onClick={goNextMonth}>›</button>
            <button className="btn btn-ghost" style={{ padding: "4px 10px" }} onClick={goToday}>回到今天</button>
            {loadingMonth && <span style={{ fontSize: 12, color: "var(--gray-400)" }}>載入中...</span>}
          </div>

          <div className="erp-calendar-grid" style={{ marginBottom: 4 }}>
            {WEEKDAYS.map((w) => (
              <div key={w} className="erp-calendar-weekday">週{w}</div>
            ))}
          </div>
          <div className="erp-calendar-grid">
            {cells.map((day, idx) => {
              if (day === null) return <div key={`empty-${idx}`} className="erp-calendar-cell empty" />;
              const dateStr = `${viewYear}-${pad2(viewMonth)}-${pad2(day)}`;
              const counts = monthCounts[dateStr];
              const isToday = dateStr === today;
              const isSelected = dateStr === selectedDate;
              const cellWeekday = new Date(viewYear, viewMonth - 1, day).getDay();
              const isDimmed = weekdayFilter !== "" && Number(weekdayFilter) !== cellWeekday;
              return (
                <button
                  key={dateStr}
                  className={`erp-calendar-cell${isToday ? " today" : ""}${isSelected ? " selected" : ""}${isDimmed ? " dimmed" : ""}`}
                  onClick={() => setSelectedDate(dateStr)}
                >
                  <span className="erp-calendar-date">{day}</span>
                  {counts && counts.total > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      <span className="erp-calendar-count">{counts.total}筆</span>
                      {counts.need > 0 && <span className="badge badge-warning">需{counts.need}</span>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="erp-card">
        <div className="erp-card-header">
          <span className="erp-card-title">
            {selectedDate ? `${dateLabel(selectedDate)}　我的訂位` : "點選日期查看當天我的訂位"}
          </span>
        </div>
        {selectedDate && (
          <div className="erp-table-wrap">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>時段</th>
                  <th>人數</th>
                  <th>訂位代號</th>
                  <th>姓名</th>
                  <th>電話</th>
                  <th>訂金</th>
                  <th>分店</th>
                  <th>類別</th>
                  <th>狀態</th>
                  <th>備註</th>
                </tr>
              </thead>
              <tbody>
                {loadingDay && (
                  <tr><td colSpan={10} style={{ textAlign: "center", color: "var(--gray-400)" }}>載入中...</td></tr>
                )}
                {!loadingDay && filteredDayBookings.map((b) => (
                  <tr key={b.id}>
                    <td>{b.timeSlot ?? "—"}</td>
                    <td>{b.partySize ?? "—"}</td>
                    <td className="font-mono">{b.bookingCode ?? "—"}</td>
                    <td>{b.customerName ?? "—"}</td>
                    <td>{b.customerPhone ?? "—"}</td>
                    <td>{formatCurrency(b.depositAmount)}</td>
                    <td>{b.branch ?? "—"}</td>
                    <td>{b.category}</td>
                    <td>{b.status}</td>
                    <td>{b.note ?? "—"}</td>
                  </tr>
                ))}
                {!loadingDay && filteredDayBookings.length === 0 && (
                  <tr><td colSpan={10} style={{ textAlign: "center", color: "var(--gray-400)" }}>這天沒有我的訂位</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export default function BookingBoardPage() {
  const [tab, setTab] = useState<Tab>("calendar");

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">訂位看板</h1>
          <p className="erp-page-subtitle">月曆／Inline／EZTABLE 訂位額度管理</p>
        </div>
      </div>

      <div className="erp-card" style={{ marginBottom: 16 }}>
        <div className="erp-card-body" style={{ padding: "12px 16px" }}>
          <div className="erp-tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={`erp-tab${tab === t.key ? " active" : ""}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === "calendar" && <CalendarTab />}

      {tab !== "calendar" && (
        <div className="erp-card">
          <div className="erp-card-body" style={{ padding: 40, textAlign: "center", color: "var(--gray-400)" }}>
            {tab === "inline" ? "Inline 功能開發中" : "EZTABLE 功能開發中"}
          </div>
        </div>
      )}
    </div>
  );
}

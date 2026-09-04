"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { WEEKDAYS, parseDateOnly, dateLabel } from "@/lib/quote";

type Tab = "calendar" | "inline" | "eztable";

const TABS: { key: Tab; label: string }[] = [
  { key: "calendar", label: "月曆" },
  { key: "inline", label: "Inline" },
  { key: "eztable", label: "EZTABLE" },
];

type DayCounts = { total: number; need: number };

type RosterEntry = {
  id: string;
  name: string;
  phone: string | null;
  note: string | null;
};

type MyBooking = {
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
  hasPendingRequest: boolean;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// b 的日期減 target 的日期，正數代表 b 在 target 之後
function daysBetween(bDate: string, targetDate: string) {
  const b = parseDateOnly(bDate).getTime();
  const t = parseDateOnly(targetDate).getTime();
  return Math.round((b - t) / 86400000);
}

type Conflict = { date: string; diffDays: number };
type AvailablePerson = RosterEntry & { totalCount: number; monthCount: number };
type ExcludedPerson = RosterEntry & { conflicts: Conflict[] };

function computeAvailability(
  targetDate: string,
  exclDays: number,
  branchFilter: string,
  roster: RosterEntry[],
  myBookings: MyBooking[]
) {
  const today = todayStr();
  const conflicts = new Map<string, Conflict[]>();

  for (const b of myBookings) {
    if (!b.customerPhone) continue;
    if (b.bookingDate < today) continue;
    if (branchFilter && b.branch !== branchFilter) continue;
    const diffDays = daysBetween(b.bookingDate, targetDate);
    if (Math.abs(diffDays) <= exclDays) {
      const list = conflicts.get(b.customerPhone) ?? [];
      list.push({ date: b.bookingDate, diffDays });
      conflicts.set(b.customerPhone, list);
    }
  }

  const available: AvailablePerson[] = [];
  const excluded: ExcludedPerson[] = [];

  for (const c of roster) {
    const phone = c.phone ?? "";
    if (phone && conflicts.has(phone)) {
      excluded.push({ ...c, conflicts: conflicts.get(phone)! });
    } else {
      const allBks = myBookings.filter((b) => b.customerPhone === phone && b.bookingDate >= today);
      const monthCount = allBks.filter((b) => b.bookingDate.slice(0, 7) === targetDate.slice(0, 7)).length;
      available.push({ ...c, totalCount: allBks.length, monthCount });
    }
  }

  return { available, excluded };
}

function CollapseSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="erp-collapse-toggle" onClick={() => setOpen((o) => !o)}>
        <span className={`erp-collapse-arrow${open ? " open" : ""}`}>▶</span>
        {title}
      </div>
      {open && <div style={{ paddingLeft: 16 }}>{children}</div>}
    </div>
  );
}

function CalendarTab() {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1); // 1-12
  const [monthCounts, setMonthCounts] = useState<Record<string, DayCounts>>({});
  const [loadingMonth, setLoadingMonth] = useState(true);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [myBookings, setMyBookings] = useState<MyBooking[]>([]);
  const [excludedRosterIds, setExcludedRosterIds] = useState<Set<string>>(new Set());

  const [branchFilter, setBranchFilter] = useState("");
  const [exclDays, setExclDays] = useState(7);

  useEffect(() => {
    fetch(`/api/booking-board/calendar?year=${viewYear}&month=${viewMonth}`)
      .then((res) => res.json())
      .then((data) => {
        setMonthCounts(data && typeof data === "object" ? data : {});
        setLoadingMonth(false);
      });
  }, [viewYear, viewMonth]);

  useEffect(() => {
    fetch("/api/roster")
      .then((res) => res.json())
      .then((data) => setRoster(Array.isArray(data) ? data : []));
    fetch("/api/booking-board/mine")
      .then((res) => res.json())
      .then((data) => setMyBookings(Array.isArray(data) ? data : []));
  }, []);

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

  const branches = useMemo(
    () => Array.from(new Set(myBookings.map((b) => b.branch).filter((b): b is string => !!b))).sort(),
    [myBookings]
  );

  const includedRoster = useMemo(
    () => roster.filter((r) => !excludedRosterIds.has(r.id)),
    [roster, excludedRosterIds]
  );

  const toggleRosterIncluded = (id: string) =>
    setExcludedRosterIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const dayBookings = useMemo(
    () => (selectedDate ? myBookings.filter((b) => b.bookingDate === selectedDate) : []),
    [myBookings, selectedDate]
  );
  const dayDemands = useMemo(() => dayBookings.filter((b) => b.hasPendingRequest), [dayBookings]);

  const { available, excluded } = useMemo(
    () => (selectedDate ? computeAvailability(selectedDate, exclDays, branchFilter, includedRoster, myBookings) : { available: [], excluded: [] }),
    [selectedDate, exclDays, branchFilter, includedRoster, myBookings]
  );

  const today = todayStr();

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
      {/* 左：月曆本體（縮小版） */}
      <div className="erp-card" style={{ width: 340, flexShrink: 0 }}>
        <div className="erp-card-body" style={{ padding: 14 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            <select className="erp-select" style={{ maxWidth: 130, fontSize: 12 }} value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
              <option value="">全部分店</option>
              {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--gray-500)" }}>
              排除前後
              <input type="number" min={0} max={60} className="erp-input" style={{ width: 50, padding: "4px 6px" }} value={exclDays} onChange={(e) => setExclDays(Math.max(0, Number(e.target.value) || 0))} />
              天
            </div>
            <div style={{ display: "flex", gap: 3 }}>
              {[3, 7].map((n) => (
                <button key={n} className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 12, ...(exclDays === n ? { background: "var(--brand-700)", color: "#fff" } : {}) }} onClick={() => setExclDays(n)}>
                  ±{n}天
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <button className="btn btn-secondary" style={{ padding: "3px 9px" }} onClick={goPrevMonth}>‹</button>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-700)", minWidth: 80, textAlign: "center" }}>
              {viewYear} 年 {viewMonth} 月
            </span>
            <button className="btn btn-secondary" style={{ padding: "3px 9px" }} onClick={goNextMonth}>›</button>
            <button className="btn btn-ghost" style={{ padding: "3px 9px", fontSize: 12 }} onClick={goToday}>今天</button>
            {loadingMonth && <span style={{ fontSize: 11, color: "var(--gray-400)" }}>載入中...</span>}
          </div>

          <div className="erp-calendar-grid" style={{ marginBottom: 4 }}>
            {WEEKDAYS.map((w) => (
              <div key={w} className="erp-calendar-weekday">{w}</div>
            ))}
          </div>
          <div className="erp-calendar-grid">
            {cells.map((day, idx) => {
              if (day === null) return <div key={`empty-${idx}`} className="erp-calendar-cell empty" />;
              const dateStr = `${viewYear}-${pad2(viewMonth)}-${pad2(day)}`;
              const counts = monthCounts[dateStr];
              const isToday = dateStr === today;
              const isSelected = dateStr === selectedDate;
              return (
                <button
                  key={dateStr}
                  className={`erp-calendar-cell${isToday ? " today" : ""}${isSelected ? " selected" : ""}`}
                  onClick={() => setSelectedDate(dateStr)}
                >
                  <span className="erp-calendar-date">{day}</span>
                  {counts && counts.total > 0 && (
                    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                      <span className="erp-calendar-count">{counts.total}筆</span>
                      {counts.need > 0 && <span className="badge badge-warning" style={{ fontSize: 9, padding: "1px 5px" }}>需{counts.need}</span>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 右：名單設定 + 當天資訊 + 可訂位結果 */}
      <div style={{ flex: 1, minWidth: 320, display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="erp-card">
          <div className="erp-card-body" style={{ padding: "10px 16px" }}>
            <CollapseSection title={`月曆顯示名單（${includedRoster.length}/${roster.length} 位）`}>
              {roster.length === 0 && <div style={{ fontSize: 12, color: "var(--gray-400)" }}>廠商名單目前是空的</div>}
              {roster.map((r) => (
                <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "3px 0" }}>
                  <input type="checkbox" checked={!excludedRosterIds.has(r.id)} onChange={() => toggleRosterIncluded(r.id)} />
                  {r.name}　{r.phone ?? "—"}
                </label>
              ))}
            </CollapseSection>

            <CollapseSection title={`當天需求（${selectedDate ? dayDemands.length : 0} 筆）`}>
              {!selectedDate && <div style={{ fontSize: 12, color: "var(--gray-400)" }}>請先選日期</div>}
              {selectedDate && dayDemands.length === 0 && <div style={{ fontSize: 12, color: "var(--gray-400)" }}>這天沒有待處理的需求</div>}
              {dayDemands.map((b) => (
                <div key={b.id} style={{ fontSize: 12, padding: "3px 0" }}>
                  {b.timeSlot ?? "—"}　{b.customerName ?? "（無姓名）"}　{b.partySize ?? "—"}人　{b.branch ?? "—"}
                </div>
              ))}
            </CollapseSection>

            <CollapseSection title={`當天訂位明細（不限名單）（${selectedDate ? dayBookings.length : 0} 筆）`}>
              {!selectedDate && <div style={{ fontSize: 12, color: "var(--gray-400)" }}>請先選日期</div>}
              {selectedDate && dayBookings.length === 0 && <div style={{ fontSize: 12, color: "var(--gray-400)" }}>這天沒有我的訂位</div>}
              {dayBookings.length > 0 && (
                <div className="erp-table-wrap">
                  <table className="erp-table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th>時段</th><th>人數</th><th>訂位代號</th><th>姓名</th><th>電話</th><th>訂金</th><th>分店</th><th>備註</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dayBookings.map((b) => (
                        <tr key={b.id}>
                          <td>{b.timeSlot ?? "—"}</td>
                          <td>{b.partySize ?? "—"}</td>
                          <td className="font-mono">{b.bookingCode ?? "—"}</td>
                          <td>{b.customerName ?? "—"}</td>
                          <td>{b.customerPhone ?? "—"}</td>
                          <td>{formatCurrency(b.depositAmount)}</td>
                          <td>{b.branch ?? "—"}</td>
                          <td>{b.note ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CollapseSection>
          </div>
        </div>

        <div className="erp-card">
          <div className="erp-card-body" style={{ padding: 16 }}>
            {!selectedDate && (
              <div style={{ textAlign: "center", color: "var(--gray-400)", padding: 30 }}>請點選日期，查看名單的可訂位狀態</div>
            )}
            {selectedDate && (
              <>
                <div style={{ borderBottom: "1px solid var(--gray-100)", paddingBottom: 10, marginBottom: 14 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "var(--gray-800)", marginBottom: 4 }}>
                    {dateLabel(selectedDate)} 可訂位名單
                  </div>
                  <div style={{ fontSize: 12, color: "var(--gray-500)" }}>
                    排除規則：前後 {exclDays} 天{branchFilter ? `　分店：${branchFilter}` : ""}
                    　可訂位 <strong style={{ color: "var(--accent-500)" }}>{available.length}</strong> 位
                    ／受限 <strong style={{ color: "var(--color-danger)" }}>{excluded.length}</strong> 位
                    ／共 {includedRoster.length} 位
                  </div>
                </div>

                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--gray-500)", marginBottom: 8 }}>
                  可訂位（{available.length} 位）
                </div>
                {available.length === 0 ? (
                  <div style={{ fontSize: 13, color: "var(--gray-400)", marginBottom: 16 }}>名單中所有客人在此期間均受限</div>
                ) : (
                  <div className="erp-person-grid" style={{ marginBottom: 16 }}>
                    {available.map((p) => (
                      <div key={p.id} className="erp-person-card avail">
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-800)" }}>{p.name || "（無姓名）"}</div>
                        <div style={{ fontSize: 12, color: "var(--gray-500)" }}>{p.phone ?? "—"}</div>
                        {p.totalCount > 0 && (
                          <div style={{ fontSize: 11, color: "var(--accent-500)", marginTop: 3 }}>
                            共 {p.totalCount} 筆　當月 {p.monthCount} 筆
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <CollapseSection title={`受限名單（${excluded.length} 位）`}>
                  {excluded.length === 0 && <div style={{ fontSize: 12, color: "var(--gray-400)" }}>沒有受限的名單成員</div>}
                  {excluded.map((p) => (
                    <div key={p.id} className="erp-excl-item">
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--gray-700)" }}>{p.name || "（無姓名）"}</div>
                        <div style={{ color: "var(--gray-400)" }}>{p.phone ?? "—"}</div>
                      </div>
                      <div style={{ color: "var(--color-danger)", textAlign: "right" }}>
                        {p.conflicts.map((c) => {
                          const d = parseDateOnly(c.date);
                          const sign = c.diffDays >= 0 ? "+" : "";
                          return `${d.getMonth() + 1}/${d.getDate()}（${sign}${c.diffDays}天）`;
                        }).join("、")}
                      </div>
                    </div>
                  ))}
                </CollapseSection>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
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

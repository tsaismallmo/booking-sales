"use client";

import { useMemo, useState } from "react";
import { getMealPeriod } from "@/lib/quote";
import { todayStr, ymd } from "@/lib/dates";

// 預定單月曆：跟需求看板的月曆一樣，每一天列出 餐廳分店 → 餐期 → 幾組、各幾人。
// 一張預定單的每個候選（第 1 順位＝單據本身，加上 altDates）都會算在各自的日期上。

export type CalendarBooking = {
  id: string;
  branch: string | null;
  bookingDate: string;
  timeSlot: string | null;
  partySize: number | null;
  altDates?: { date: string; timeSlot: string | null; branch?: string | null; partySize?: number | null }[] | null;
};

export type CalendarOption = { date: string; branch: string | null; timeSlot: string | null; partySize: number | null };

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const MEAL_ORDER = ["午餐", "下午茶", "晚餐", "時段不限"];

export function optionsOf(b: CalendarBooking): CalendarOption[] {
  const main = { date: b.bookingDate, branch: b.branch, timeSlot: b.timeSlot, partySize: b.partySize };
  const alts = (b.altDates ?? []).filter((a) => a?.date).map((a) => ({
    date: a.date,
    branch: a.branch ?? null,
    timeSlot: a.timeSlot ?? null,
    partySize: a.partySize ?? null,
  }));
  return [main, ...alts];
}

// branchFilter：""＝全部、"r:餐廳"＝整間餐廳、"b:餐廳｜分店"＝單一分店
export function matchBranch(filter: string, branch: string | null) {
  if (!filter) return true;
  if (filter.startsWith("r:")) return (branch ?? "").split("｜")[0] === filter.slice(2);
  return branch === filter.slice(2);
}

export function ReservedCalendar({
  bookings,
  selectedDate,
  onSelectDate,
  branchFilter,
  onBranchFilter,
}: {
  bookings: CalendarBooking[];
  selectedDate: string | null;
  onSelectDate: (d: string | null) => void;
  branchFilter: string;
  onBranchFilter: (f: string) => void;
}) {
  const [month, setMonth] = useState(() => { const t = new Date(); return { y: t.getFullYear(), m: t.getMonth() }; });

  const filterGroups = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const b of bookings) for (const o of optionsOf(b)) {
      if (!o.branch) continue;
      const restaurant = o.branch.split("｜")[0];
      m.set(restaurant, (m.get(restaurant) ?? new Set()).add(o.branch));
    }
    return [...m.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "zh-Hant"))
      .map(([restaurant, set]) => ({ restaurant, branches: [...set].sort((a, b) => a.localeCompare(b, "zh-Hant")) }));
  }, [bookings]);

  // 日期 → 分店 → 餐期 → 每組人數
  const byDate = useMemo(() => {
    const map = new Map<string, Map<string, Map<string, (number | null)[]>>>();
    for (const b of bookings) for (const o of optionsOf(b)) {
      if (!matchBranch(branchFilter, o.branch)) continue;
      const branches = map.get(o.date) ?? new Map();
      const label = o.branch ?? "—";
      const meals = branches.get(label) ?? new Map();
      const meal = getMealPeriod(o.timeSlot) ?? "時段不限";
      meals.set(meal, [...(meals.get(meal) ?? []), o.partySize]);
      branches.set(label, meals);
      map.set(o.date, branches);
    }
    return map;
  }, [bookings, branchFilter]);

  const groupsOfDate = (date: string) =>
    [...(byDate.get(date)?.values() ?? [])].reduce((n, meals) => n + [...meals.values()].reduce((k, s) => k + s.length, 0), 0);

  const monthsWithData = useMemo(() => {
    const m = new Map<string, number>();
    for (const [date, branches] of byDate) {
      const n = [...branches.values()].reduce((s, meals) => s + [...meals.values()].reduce((k, x) => k + x.length, 0), 0);
      m.set(date.slice(0, 7), (m.get(date.slice(0, 7)) ?? 0) + n);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [byDate]);

  const t = new Date();
  const today = todayStr();
  const firstWeekday = new Date(Date.UTC(month.y, month.m, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(month.y, month.m + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => ymd(month.y, month.m, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const shiftMonth = (dir: -1 | 1) => setMonth(({ y, m }) => {
    const d = new Date(Date.UTC(y, m + dir, 1));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
  });

  return (
    <div className="erp-card" style={{ marginBottom: 16, maxWidth: 860 }}>
      <div className="erp-card-header" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-ghost" style={{ padding: "2px 10px" }} onClick={() => shiftMonth(-1)}>‹</button>
        <span className="erp-card-title">{month.y} 年 {month.m + 1} 月</span>
        <button className="btn btn-ghost" style={{ padding: "2px 10px" }} onClick={() => shiftMonth(1)}>›</button>
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: "2px 10px" }} onClick={() => setMonth({ y: t.getFullYear(), m: t.getMonth() })}>本月</button>
        <select className="erp-input" style={{ width: "auto", fontSize: 13, padding: "4px 8px" }} value={branchFilter} onChange={(e) => onBranchFilter(e.target.value)}>
          <option value="">全部餐廳／分店</option>
          {filterGroups.map((g) => (
            <optgroup key={g.restaurant} label={g.restaurant}>
              <option value={`r:${g.restaurant}`}>{g.restaurant}（全部分店）</option>
              {g.branches.map((b) => <option key={b} value={`b:${b}`}>{b.split("｜")[1] ?? b}</option>)}
            </optgroup>
          ))}
        </select>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {monthsWithData.map(([key, n]) => {
            const [y, m] = key.split("-").map(Number);
            const active = y === month.y && m - 1 === month.m;
            return (
              <button key={key} className={`badge ${active ? "badge-navy" : "badge-gray"}`} style={{ border: "none", cursor: "pointer" }} onClick={() => setMonth({ y, m: m - 1 })}>
                {y}/{m}　{n} 組
              </button>
            );
          })}
        </span>
      </div>
      <div className="erp-card-body" style={{ padding: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 2 }}>
          {WEEKDAYS.map((w, i) => (
            <div key={w} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: i === 0 || i === 6 ? "var(--color-danger)" : "var(--gray-500)", padding: "2px 0" }}>{w}</div>
          ))}
          {cells.map((date, i) => {
            if (!date) return <div key={`e${i}`} />;
            const branches = byDate.get(date);
            const entries = branches ? [...branches.entries()].sort(([a], [b]) => a.localeCompare(b, "zh-Hant")) : [];
            const total = groupsOfDate(date);
            const selected = selectedDate === date;
            return (
              <button
                key={date}
                type="button"
                onClick={() => onSelectDate(selected ? null : date)}
                style={{
                  minHeight: 52,
                  textAlign: "left",
                  padding: "2px 4px",
                  borderRadius: 6,
                  cursor: "pointer",
                  border: selected ? "2px solid var(--brand-500)" : date === today ? "1px solid var(--brand-300)" : "1px solid var(--gray-200)",
                  background: total > 0 ? "var(--brand-50)" : "transparent",
                  opacity: date < today ? 0.5 : 1,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  color: "inherit",
                  font: "inherit",
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 600, display: "flex", justifyContent: "space-between", width: "100%" }}>
                  <span>{Number(date.slice(8))}</span>
                  {total > 0 && <span style={{ color: "var(--brand-700)" }}>{total}組</span>}
                </span>
                {entries.map(([label, meals]) => (
                  <span key={label} style={{ display: "flex", flexDirection: "column", width: "100%", fontSize: 10, lineHeight: 1.25 }}>
                    <span title={label} style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label.replace("｜", " ")}</span>
                    {[...meals.entries()]
                      .sort(([a], [b]) => MEAL_ORDER.indexOf(a) - MEAL_ORDER.indexOf(b))
                      .map(([meal, sizes]) => (
                        <span key={meal} style={{ paddingLeft: 2 }}>
                          {meal} <strong>{sizes.length}組</strong>：{sizes.map((s) => (s ? `${s}人` : "?人")).join("、")}
                        </span>
                      ))}
                  </span>
                ))}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: "var(--gray-400)", marginTop: 6 }}>
          每張預定單的每個候選日期都會算進去，每一組的人數分開列出；「?人」表示人數未填。點日期，下面的表格只列那天的客人。
        </div>
      </div>
    </div>
  );
}

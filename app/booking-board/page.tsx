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
  listId: string;
  name: string;
  phone: string | null;
  note: string | null;
};

type RosterList = {
  id: string;
  name: string;
  entryCount: number;
  ownerEmail: string | null;
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
  source: string | null;
  isInline: boolean;
  isEztable: boolean;
  note: string | null;
  status: "unsold" | "reserved" | "sold" | "refunded";
};

// 需求只會發生在臨時單／預定單，不歸屬特定廠商，所以是全平台當天的資料
type DemandBooking = {
  id: string;
  branch: string | null;
  category: string;
  timeSlot: string | null;
  partySize: number | null;
  customerName: string | null;
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
type AvailablePerson = RosterEntry & { totalCount: number; monthCount: number; bookings: MyBooking[] };
type ExcludedPerson = RosterEntry & { conflicts: Conflict[] };

// 日期簡短格式：10/4，跟受限名單的衝突日期顯示一致
function shortDate(dateStr: string) {
  const d = parseDateOnly(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

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
      available.push({ ...c, totalCount: allBks.length, monthCount, bookings: [...allBks].sort((a, b) => a.bookingDate.localeCompare(b.bookingDate)) });
    }
  }

  return { available, excluded };
}

// ── Inline / EZTABLE helpers ─────────────────────────────────────────────────
// 現在單據上有明確的「訂位平台」勾選欄位，不用再用來源文字／訂位代號長度猜了

function isInlineBooking(b: MyBooking) {
  return b.isInline;
}

function isEztableBooking(b: MyBooking) {
  return b.isEztable;
}

// ── InlineTab ─────────────────────────────────────────────────────────────────

type InlineAvail = RosterEntry & { futureCount: number; monthCount: number };
type InlineExcl = RosterEntry & { futureBookings: MyBooking[] };

function InlineTab() {
  const [branchFilter, setBranchFilter] = useState("");
  const [limit, setLimit] = useState(2);
  const [rosterLists, setRosterLists] = useState<RosterList[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [myBookings, setMyBookings] = useState<MyBooking[]>([]);
  const [excludedListIds, setExcludedListIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/roster/lists").then((r) => r.json()).then((d) => setRosterLists(Array.isArray(d) ? d : []));
    fetch("/api/roster").then((r) => r.json()).then((d) => setRoster(Array.isArray(d) ? d : []));
    fetch("/api/booking-board/mine").then((r) => r.json()).then((d) => setMyBookings(Array.isArray(d) ? d : []));
  }, []);

  const toggleListIncluded = (listId: string) =>
    setExcludedListIds((s) => {
      const n = new Set(s);
      if (n.has(listId)) n.delete(listId); else n.add(listId);
      return n;
    });

  const includedRoster = useMemo(() => roster.filter((r) => !excludedListIds.has(r.listId)), [roster, excludedListIds]);
  const branches = useMemo(
    () => Array.from(new Set(myBookings.map((b) => b.branch).filter((b): b is string => !!b))).sort(),
    [myBookings]
  );
  const inlineBookings = useMemo(() => myBookings.filter(isInlineBooking), [myBookings]);

  const { available, excluded } = useMemo<{ available: InlineAvail[]; excluded: InlineExcl[] }>(() => {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const perPhone = new Map<string, MyBooking[]>();
    inlineBookings.forEach((b) => {
      if (!b.customerPhone) return;
      if (parseDateOnly(b.bookingDate) < todayStart) return;
      if (branchFilter && b.branch !== branchFilter) return;
      const list = perPhone.get(b.customerPhone) ?? [];
      list.push(b);
      perPhone.set(b.customerPhone, list);
    });
    const now = new Date();
    const avail: InlineAvail[] = [];
    const excl: InlineExcl[] = [];
    includedRoster.forEach((r) => {
      const bks = r.phone ? (perPhone.get(r.phone) ?? []) : [];
      if (bks.length >= limit) {
        excl.push({ ...r, futureBookings: bks });
      } else {
        const monthCount = bks.filter((b) => {
          const d = parseDateOnly(b.bookingDate);
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        }).length;
        avail.push({ ...r, futureCount: bks.length, monthCount });
      }
    });
    return { available: avail, excluded: excl };
  }, [includedRoster, inlineBookings, limit, branchFilter]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Controls */}
      <div className="erp-card">
        <div className="erp-card-body" style={{ padding: "12px 16px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select className="erp-select" style={{ maxWidth: 130 }} value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="">全部分店</option>
            {branches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            上限
            <input type="number" min={1} className="erp-input" style={{ width: 60, padding: "4px 6px" }}
              value={limit} onChange={(e) => setLimit(Math.max(1, Number(e.target.value) || 1))} />
            筆
          </div>
        </div>
      </div>

      {/* Roster toggle */}
      <div className="erp-card">
        <div className="erp-card-body" style={{ padding: "10px 16px" }}>
          <CollapseSection title={`名單（${rosterLists.filter((l) => !excludedListIds.has(l.id)).length}/${rosterLists.length} 個名單）`}>
            {rosterLists.length === 0 && <div style={{ fontSize: 12, color: "var(--gray-400)" }}>廠商名單目前是空的</div>}
            {rosterLists.map((l) => (
              <label key={l.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "3px 0" }}>
                <input type="checkbox" checked={!excludedListIds.has(l.id)} onChange={() => toggleListIncluded(l.id)} />
                {l.name}（{l.entryCount} 位）
              </label>
            ))}
          </CollapseSection>
        </div>
      </div>

      {/* Available / excluded */}
      <div className="erp-card">
        <div className="erp-card-body" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--gray-500)", marginBottom: 8 }}>
            可訂位（{available.length} 位）
          </div>
          {available.length === 0
            ? <div style={{ fontSize: 13, color: "var(--gray-400)", marginBottom: 16 }}>名單中所有客人皆已達上限</div>
            : (
              <div className="erp-person-grid" style={{ marginBottom: 16 }}>
                {available.map((p) => (
                  <div key={p.id} className="erp-person-card avail">
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-800)" }}>{p.name || "（無姓名）"}</div>
                    <div style={{ fontSize: 12, color: "var(--gray-500)" }}>{p.phone ?? "—"}</div>
                    {p.futureCount > 0 && (
                      <div style={{ fontSize: 11, color: "var(--accent-500)", marginTop: 3 }}>
                        共 {p.futureCount} 筆　當月 {p.monthCount} 筆
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          }
          <CollapseSection title={`不可訂位（${excluded.length} 位）— 點選展開`}>
            {excluded.length === 0 && <div style={{ fontSize: 12, color: "var(--gray-400)" }}>目前沒有達到上限的名單成員</div>}
            {excluded.map((p) => {
              const dates = p.futureBookings
                .sort((a, b) => a.bookingDate.localeCompare(b.bookingDate))
                .map((b) => { const d = parseDateOnly(b.bookingDate); return `${d.getMonth()+1}/${d.getDate()}`; })
                .join("、");
              return (
                <div key={p.id} className="erp-excl-item">
                  <div>
                    <div style={{ fontWeight: 600, color: "var(--gray-700)" }}>{p.name || "（無姓名）"}</div>
                    <div style={{ color: "var(--gray-400)" }}>{p.phone ?? "—"}</div>
                  </div>
                  <div style={{ color: "var(--color-danger)", textAlign: "right" }}>
                    已達上限（{p.futureBookings.length}/{limit} 筆）：{dates}
                  </div>
                </div>
              );
            })}
          </CollapseSection>
        </div>
      </div>
    </div>
  );
}

// ── EztableTab ────────────────────────────────────────────────────────────────
// 固定看「這個月＋接下來 2 個月」，每張卡片直接列出這 3 個月分別可訂哪些分店，
// 不用再切換月份；下拉選單可以縮小成只看其中一個月。

type MonthMeta = { year: number; month: number; label: string }; // month 0-indexed
type MonthAvail = { label: string; openBranches: string[]; bookedBranches: string[] };
type EztableAvail = RosterEntry & { totalCount: number; months: MonthAvail[] };
type EztableExcl = RosterEntry & { bookedBranches: string[] };

function EztableTab() {
  const [branchFilter, setBranchFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState(""); // "" = 全部（3 個月都顯示），否則是 offset "0"/"1"/"2"
  const [rosterLists, setRosterLists] = useState<RosterList[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [myBookings, setMyBookings] = useState<MyBooking[]>([]);
  const [excludedListIds, setExcludedListIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/roster/lists").then((r) => r.json()).then((d) => setRosterLists(Array.isArray(d) ? d : []));
    fetch("/api/roster").then((r) => r.json()).then((d) => setRoster(Array.isArray(d) ? d : []));
    fetch("/api/booking-board/mine").then((r) => r.json()).then((d) => setMyBookings(Array.isArray(d) ? d : []));
  }, []);

  const toggleListIncluded = (listId: string) =>
    setExcludedListIds((s) => {
      const n = new Set(s);
      if (n.has(listId)) n.delete(listId); else n.add(listId);
      return n;
    });

  const includedRoster = useMemo(() => roster.filter((r) => !excludedListIds.has(r.listId)), [roster, excludedListIds]);
  const eztableBookings = useMemo(() => myBookings.filter(isEztableBooking), [myBookings]);

  // 這個月＋接下來 2 個月，固定 3 個月的視窗
  const monthMetas = useMemo<MonthMeta[]>(() => {
    const now = new Date();
    return [0, 1, 2].map((offset) => {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      return { year: d.getFullYear(), month: d.getMonth(), label: `${d.getMonth() + 1}月` };
    });
  }, []);

  // 從 EZTABLE 訂位資料推算所有已知分店
  const allBranches = useMemo(
    () => Array.from(new Set(eztableBookings.map((b) => b.branch).filter((b): b is string => !!b))).sort(),
    [eztableBookings]
  );
  const branches = allBranches;
  const knownBranches = useMemo(() => (branchFilter ? [branchFilter] : allBranches), [branchFilter, allBranches]);

  // 每個月分別算「誰在哪些分店已經訂過」
  const perPhoneBranchByMonth = useMemo(() => {
    const result = new Map<string, Map<string, Set<string>>>(); // "year-month" → phone → Set(branch)
    for (const meta of monthMetas) {
      const perPhone = new Map<string, Set<string>>();
      eztableBookings.forEach((b) => {
        if (!b.customerPhone) return;
        const d = parseDateOnly(b.bookingDate);
        if (d.getFullYear() !== meta.year || d.getMonth() !== meta.month) return;
        if (branchFilter && b.branch !== branchFilter) return;
        const set = perPhone.get(b.customerPhone) ?? new Set<string>();
        set.add(b.branch ?? "");
        perPhone.set(b.customerPhone, set);
      });
      result.set(`${meta.year}-${meta.month}`, perPhone);
    }
    return result;
  }, [eztableBookings, monthMetas, branchFilter]);

  const { available, excluded } = useMemo<{ available: EztableAvail[]; excluded: EztableExcl[] }>(() => {
    const today = todayStr();
    const displayedOffsets = monthFilter === "" ? [0, 1, 2] : [Number(monthFilter)];
    const avail: EztableAvail[] = [];
    const excl: EztableExcl[] = [];

    includedRoster.forEach((r) => {
      const phone = r.phone ?? "";
      const currentKey = `${monthMetas[0].year}-${monthMetas[0].month}`;
      const currentBookedSet = phone ? (perPhoneBranchByMonth.get(currentKey)?.get(phone) ?? new Set<string>()) : new Set<string>();
      const currentOpenBranches = knownBranches.filter((br) => !currentBookedSet.has(br));

      // 不可訂位的判斷固定看「這個月」是否已經訂滿所有已知分店，跟舊版邏輯一致
      if (currentOpenBranches.length === 0 && knownBranches.length > 0) {
        excl.push({ ...r, bookedBranches: [...currentBookedSet].filter(Boolean).sort() });
        return;
      }

      const totalCount = phone
        ? eztableBookings.filter((b) => b.customerPhone === phone && b.bookingDate >= today).length
        : 0;

      const months: MonthAvail[] = displayedOffsets.map((offset) => {
        const meta = monthMetas[offset];
        const bookedSet = phone ? (perPhoneBranchByMonth.get(`${meta.year}-${meta.month}`)?.get(phone) ?? new Set<string>()) : new Set<string>();
        return {
          label: meta.label,
          openBranches: knownBranches.filter((br) => !bookedSet.has(br)),
          bookedBranches: [...bookedSet].filter(Boolean).sort(),
        };
      });

      avail.push({ ...r, totalCount, months });
    });

    return { available: avail, excluded: excl };
  }, [includedRoster, eztableBookings, perPhoneBranchByMonth, knownBranches, monthMetas, monthFilter]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="erp-card">
        <div className="erp-card-body" style={{ padding: "12px 16px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select className="erp-select" style={{ maxWidth: 130 }} value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="">全部分店</option>
            {branches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className="erp-select" style={{ maxWidth: 130 }} value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
            <option value="">全部</option>
            {monthMetas.map((m, i) => <option key={i} value={String(i)}>{m.label}</option>)}
          </select>
        </div>
      </div>

      <div className="erp-card">
        <div className="erp-card-body" style={{ padding: "10px 16px" }}>
          <CollapseSection title={`名單（${rosterLists.filter((l) => !excludedListIds.has(l.id)).length}/${rosterLists.length} 個名單）`}>
            {rosterLists.length === 0 && <div style={{ fontSize: 12, color: "var(--gray-400)" }}>廠商名單目前是空的</div>}
            {rosterLists.map((l) => (
              <label key={l.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "3px 0" }}>
                <input type="checkbox" checked={!excludedListIds.has(l.id)} onChange={() => toggleListIncluded(l.id)} />
                {l.name}（{l.entryCount} 位）
              </label>
            ))}
          </CollapseSection>
        </div>
      </div>

      <div className="erp-card">
        <div className="erp-card-body" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--gray-500)", marginBottom: 8 }}>
            可訂位（{available.length} 位）
          </div>
          {available.length === 0
            ? <div style={{ fontSize: 13, color: "var(--gray-400)", marginBottom: 16 }}>名單中所有客人本月都已訂過</div>
            : (
              <div className="erp-person-grid" style={{ marginBottom: 16 }}>
                {available.map((p) => (
                  <div key={p.id} className="erp-person-card avail">
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-800)" }}>{p.name || "（無姓名）"}</div>
                    <div style={{ fontSize: 12, color: "var(--gray-500)" }}>{p.phone ?? "—"}</div>
                    {p.months.map((m) => (
                      <div key={m.label} style={{ fontSize: 11, color: "var(--gray-600)", marginTop: 2 }}>
                        {m.label}可訂：{
                          knownBranches.length === 0 || m.openBranches.length === knownBranches.length
                            ? "全部"
                            : m.openBranches.length === 0
                              ? "已滿"
                              : m.openBranches.join("、")
                        }
                      </div>
                    ))}
                    <div style={{ fontSize: 11, color: "var(--accent-500)", marginTop: 3 }}>共 {p.totalCount} 筆</div>
                  </div>
                ))}
              </div>
            )
          }
          <CollapseSection title={`不可訂位（${excluded.length} 位）— 點選展開`}>
            {excluded.length === 0 && <div style={{ fontSize: 12, color: "var(--gray-400)" }}>本月沒有已訂滿的名單成員</div>}
            {excluded.map((p) => (
              <div key={p.id} className="erp-excl-item">
                <div>
                  <div style={{ fontWeight: 600, color: "var(--gray-700)" }}>{p.name || "（無姓名）"}</div>
                  <div style={{ color: "var(--gray-400)" }}>{p.phone ?? "—"}</div>
                </div>
                <div style={{ color: "var(--color-danger)", textAlign: "right" }}>
                  {monthMetas[0].label}已訂：{p.bookedBranches.join("、") || "—"}
                </div>
              </div>
            ))}
          </CollapseSection>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

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
  const [expandedPersonId, setExpandedPersonId] = useState<string | null>(null);

  const [rosterLists, setRosterLists] = useState<RosterList[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [myBookings, setMyBookings] = useState<MyBooking[]>([]);
  const [dayDemands, setDayDemands] = useState<DemandBooking[]>([]);
  const [excludedListIds, setExcludedListIds] = useState<Set<string>>(new Set());

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
    // 名單預設只勾選跟自己登入帳號同一個 email 建的那份，其他的先不勾，
    // 要靠 /api/me 的 email 跟名單的 ownerEmail 配對，所以要等兩邊都拿到才能算
    fetch("/api/me")
      .then((res) => res.json())
      .then((me) => {
        const myEmail: string | null = me.email ?? null;
        fetch("/api/roster/lists")
          .then((res) => res.json())
          .then((data) => {
            const lists: RosterList[] = Array.isArray(data) ? data : [];
            setRosterLists(lists);
            const mine = lists.filter((l) => myEmail && l.ownerEmail === myEmail);
            if (mine.length > 0) {
              const mineIds = new Set(mine.map((l) => l.id));
              setExcludedListIds(new Set(lists.filter((l) => !mineIds.has(l.id)).map((l) => l.id)));
            }
          });
      });
    fetch("/api/roster")
      .then((res) => res.json())
      .then((data) => setRoster(Array.isArray(data) ? data : []));
    fetch("/api/booking-board/mine")
      .then((res) => res.json())
      .then((data) => setMyBookings(Array.isArray(data) ? data : []));
  }, []);

  useEffect(() => {
    if (!selectedDate) return;
    fetch(`/api/booking-board/day-demands?date=${selectedDate}`)
      .then((res) => res.json())
      .then((data) => setDayDemands(Array.isArray(data) ? data : []));
  }, [selectedDate]);

  // 切換選取日期時，之前展開的名單成員明細也要收起來，不然可能對到別天的資料
  const selectDate = (date: string | null) => {
    setSelectedDate(date);
    setExpandedPersonId(null);
  };

  const goPrevMonth = () => {
    if (viewMonth === 1) { setViewYear((y) => y - 1); setViewMonth(12); } else { setViewMonth((m) => m - 1); }
    selectDate(null);
  };
  const goNextMonth = () => {
    if (viewMonth === 12) { setViewYear((y) => y + 1); setViewMonth(1); } else { setViewMonth((m) => m + 1); }
    selectDate(null);
  };
  const goToday = () => {
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth() + 1);
    selectDate(todayStr());
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
    () => roster.filter((r) => !excludedListIds.has(r.listId)),
    [roster, excludedListIds]
  );

  const toggleListIncluded = (listId: string) =>
    setExcludedListIds((s) => {
      const next = new Set(s);
      if (next.has(listId)) next.delete(listId);
      else next.add(listId);
      return next;
    });

  const dayBookings = useMemo(
    () => (selectedDate ? myBookings.filter((b) => b.bookingDate === selectedDate) : []),
    [myBookings, selectedDate]
  );

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
                  onClick={() => selectDate(dateStr)}
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
            <CollapseSection title={`月曆顯示名單（${rosterLists.filter((l) => !excludedListIds.has(l.id)).length}/${rosterLists.length} 個名單）`}>
              {rosterLists.length === 0 && <div style={{ fontSize: 12, color: "var(--gray-400)" }}>廠商名單目前是空的</div>}
              {rosterLists.map((l) => (
                <label key={l.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "3px 0" }}>
                  <input type="checkbox" checked={!excludedListIds.has(l.id)} onChange={() => toggleListIncluded(l.id)} />
                  {l.name}（{l.entryCount} 位）
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
                    {available.map((p) => {
                      const isExpanded = expandedPersonId === p.id;
                      return (
                        <div
                          key={p.id}
                          className="erp-person-card avail"
                          style={{ cursor: p.totalCount > 0 ? "pointer" : "default" }}
                          onClick={() => p.totalCount > 0 && setExpandedPersonId(isExpanded ? null : p.id)}
                        >
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-800)" }}>{p.name || "（無姓名）"}</div>
                          <div style={{ fontSize: 12, color: "var(--gray-500)" }}>{p.phone ?? "—"}</div>
                          {p.totalCount > 0 && (
                            <div style={{ fontSize: 11, color: "var(--accent-500)", marginTop: 3 }}>
                              共 {p.totalCount} 筆　當月 {p.monthCount} 筆
                            </div>
                          )}
                          {isExpanded && (
                            <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--accent-300)", display: "flex", flexDirection: "column", gap: 2 }}>
                              {p.bookings.map((b) => (
                                <div key={b.id} style={{ fontSize: 11, color: "var(--gray-600)" }}>
                                  {shortDate(b.bookingDate)}　{b.branch ?? "—"}　{b.timeSlot ?? "—"}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
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
      {tab === "inline" && <InlineTab />}
      {tab === "eztable" && <EztableTab />}
    </div>
  );
}

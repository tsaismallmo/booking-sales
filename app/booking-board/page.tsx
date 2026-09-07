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

// ── Inline / EZTABLE helpers ─────────────────────────────────────────────────

function isInlineBooking(b: MyBooking) {
  return (b.source ?? "").toLowerCase().includes("inline");
}

function isEztableBooking(b: MyBooking) {
  return (b.bookingCode ?? "").trim().length === 8;
}

function splitChineseName(name: string) {
  const n = name.trim();
  return { familyName: n.slice(0, 1), givenName: n.slice(1) };
}

function formatPhoneIntl(phone: string) {
  return phone.startsWith("0") ? "+886" + phone.slice(1) : phone;
}

const INLINE_TIMES = ["11:30", "11:45", "14:30", "17:30", "17:45", "18:00", "18:15"];

// ── InlineTab ─────────────────────────────────────────────────────────────────

type InlineAvail = RosterEntry & { futureCount: number; monthCount: number };
type InlineExcl = RosterEntry & { futureBookings: MyBooking[] };

function InlineTab() {
  const [branchFilter, setBranchFilter] = useState("");
  const [limit, setLimit] = useState(2);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [myBookings, setMyBookings] = useState<MyBooking[]>([]);
  const [excludedRosterIds, setExcludedRosterIds] = useState<Set<string>>(new Set());
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [date, setDate] = useState(todayStr());
  const [timeSlot, setTimeSlot] = useState("");
  const [partySize, setPartySize] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/roster").then((r) => r.json()).then((d) => setRoster(Array.isArray(d) ? d : []));
    fetch("/api/booking-board/mine").then((r) => r.json()).then((d) => setMyBookings(Array.isArray(d) ? d : []));
  }, []);

  const toggleExcluded = (id: string) =>
    setExcludedRosterIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const includedRoster = useMemo(() => roster.filter((r) => !excludedRosterIds.has(r.id)), [roster, excludedRosterIds]);
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

  const selectedPerson = available.find((p) => p.id === selectedPersonId) ?? null;
  const canGenerate = !!selectedPerson && !!date && !!timeSlot && !!partySize;

  const buildJSON = () => {
    if (!selectedPerson) return "";
    const { familyName, givenName } = splitChineseName(selectedPerson.name || "");
    return JSON.stringify({
      enabled: false,
      family_name: familyName,
      given_name: givenName,
      phone: formatPhoneIntl(selectedPerson.phone ?? ""),
      email: "",
      gender: 1,
      date,
      time: timeSlot,
      party_size: parseInt(partySize) || 0,
      kids: 0,
      "table-field": "一般",
      notes: "",
    }, null, 2);
  };

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(buildJSON()); }
    catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
              value={limit} onChange={(e) => { setLimit(Math.max(1, Number(e.target.value) || 1)); setSelectedPersonId(null); }} />
            筆
          </div>
        </div>
      </div>

      {/* Roster toggle */}
      <div className="erp-card">
        <div className="erp-card-body" style={{ padding: "10px 16px" }}>
          <CollapseSection title={`名單（${includedRoster.length}/${roster.length} 位）`}>
            {roster.length === 0 && <div style={{ fontSize: 12, color: "var(--gray-400)" }}>廠商名單目前是空的</div>}
            {roster.map((r) => (
              <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "3px 0" }}>
                <input type="checkbox" checked={!excludedRosterIds.has(r.id)} onChange={() => toggleExcluded(r.id)} />
                {r.name}　{r.phone ?? "—"}
              </label>
            ))}
          </CollapseSection>
        </div>
      </div>

      {/* Date / time / partySize / generate */}
      <div className="erp-card">
        <div className="erp-card-body" style={{ padding: "12px 16px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "var(--gray-500)" }}>日期</span>
          <input type="date" className="erp-input" style={{ maxWidth: 160 }} value={date}
            onChange={(e) => { setDate(e.target.value); setSelectedPersonId(null); }} />
          <span style={{ fontSize: 13, color: "var(--gray-500)" }}>時間</span>
          <select className="erp-select" style={{ maxWidth: 110 }} value={timeSlot} onChange={(e) => setTimeSlot(e.target.value)}>
            <option value="">請選擇</option>
            {INLINE_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span style={{ fontSize: 13, color: "var(--gray-500)" }}>人數</span>
          <input type="number" min={1} className="erp-input" style={{ maxWidth: 80 }} placeholder="人數"
            value={partySize} onChange={(e) => setPartySize(e.target.value)} />
          <button className="btn btn-primary" disabled={!canGenerate} onClick={() => setShowModal(true)}>
            產生訂位資料
          </button>
        </div>
        {selectedPerson && (
          <div style={{ padding: "0 16px 10px", fontSize: 12, color: "var(--gray-500)" }}>
            已選擇：{selectedPerson.name || "（無姓名）"}
            已訂位日期：{inlineBookings
              .filter((b) => b.customerPhone === selectedPerson.phone && parseDateOnly(b.bookingDate) >= (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })())
              .sort((a, b) => a.bookingDate.localeCompare(b.bookingDate))
              .map((b) => { const d = parseDateOnly(b.bookingDate); return `${d.getMonth()+1}/${d.getDate()}`; })
              .join("、") || "無"}
          </div>
        )}
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
                  <div key={p.id} className="erp-person-card avail"
                    style={{ cursor: "pointer", outline: selectedPersonId === p.id ? "2px solid var(--brand-700)" : undefined }}
                    onClick={() => setSelectedPersonId(selectedPersonId === p.id ? null : p.id)}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-800)" }}>{p.name || "（無姓名）"}</div>
                      <input type="radio" name="inline-person" checked={selectedPersonId === p.id} readOnly style={{ cursor: "pointer" }} />
                    </div>
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

      {/* JSON modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div style={{ background: "var(--surface)", borderRadius: 12, padding: "18px 20px", maxWidth: 420, width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, fontSize: 15, fontWeight: 700 }}>
              <span>產生訂位資料</span>
              <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--gray-400)" }} onClick={() => setShowModal(false)}>✕</button>
            </div>
            <textarea readOnly style={{ width: "100%", minHeight: 260, fontSize: 13, lineHeight: 1.6, border: "1px solid var(--gray-200)", borderRadius: 8, padding: 10, resize: "vertical", background: "var(--gray-50)", fontFamily: "monospace", boxSizing: "border-box" }}
              value={buildJSON()} />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
              <button className="btn btn-primary" onClick={handleCopy}>複製</button>
              {copied && <span style={{ fontSize: 13, color: "var(--color-success)", fontWeight: 600 }}>已複製！</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── EztableTab ────────────────────────────────────────────────────────────────

type EztableAvail = RosterEntry & { bookedBranches: string[]; openBranches: string[] };
type EztableExcl = RosterEntry & { bookedBranches: string[] };

function EztableTab() {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${pad2(now.getMonth() + 1)}`);
  const [branchFilter, setBranchFilter] = useState("");
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [myBookings, setMyBookings] = useState<MyBooking[]>([]);
  const [excludedRosterIds, setExcludedRosterIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/roster").then((r) => r.json()).then((d) => setRoster(Array.isArray(d) ? d : []));
    fetch("/api/booking-board/mine").then((r) => r.json()).then((d) => setMyBookings(Array.isArray(d) ? d : []));
  }, []);

  const toggleExcluded = (id: string) =>
    setExcludedRosterIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const includedRoster = useMemo(() => roster.filter((r) => !excludedRosterIds.has(r.id)), [roster, excludedRosterIds]);
  const eztableBookings = useMemo(() => myBookings.filter(isEztableBooking), [myBookings]);

  const [viewYear, viewMonth] = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return [y, m - 1]; // month 0-indexed
  }, [month]);

  // 從 EZTABLE 訂位資料推算所有已知分店
  const allBranches = useMemo(
    () => Array.from(new Set(eztableBookings.map((b) => b.branch).filter((b): b is string => !!b))).sort(),
    [eztableBookings]
  );
  const branches = allBranches;

  const { available, excluded } = useMemo<{ available: EztableAvail[]; excluded: EztableExcl[] }>(() => {
    // 計算每個人當月的 EZTABLE 訂位，按分店分組
    const perPhoneBranch = new Map<string, Set<string>>(); // phone → Set(branch)
    eztableBookings.forEach((b) => {
      if (!b.customerPhone) return;
      const d = parseDateOnly(b.bookingDate);
      if (d.getFullYear() !== viewYear || d.getMonth() !== viewMonth) return;
      if (branchFilter && b.branch !== branchFilter) return;
      const set = perPhoneBranch.get(b.customerPhone) ?? new Set<string>();
      set.add(b.branch ?? "");
      perPhoneBranch.set(b.customerPhone, set);
    });

    const knownBranches = branchFilter ? [branchFilter] : allBranches;
    const avail: EztableAvail[] = [];
    const excl: EztableExcl[] = [];

    includedRoster.forEach((r) => {
      if (!r.phone) {
        avail.push({ ...r, bookedBranches: [], openBranches: knownBranches });
        return;
      }
      const bookedSet = perPhoneBranch.get(r.phone) ?? new Set<string>();
      const bookedBranches = [...bookedSet].filter(Boolean).sort();
      if (branchFilter) {
        if (bookedSet.has(branchFilter)) excl.push({ ...r, bookedBranches });
        else avail.push({ ...r, bookedBranches: [], openBranches: [branchFilter] });
      } else {
        const openBranches = knownBranches.filter((br) => !bookedSet.has(br));
        if (openBranches.length === 0 && knownBranches.length > 0) {
          excl.push({ ...r, bookedBranches });
        } else {
          avail.push({ ...r, bookedBranches, openBranches });
        }
      }
    });

    return { available: avail, excluded: excl };
  }, [includedRoster, eztableBookings, viewYear, viewMonth, branchFilter, allBranches]);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return `${y} 年 ${m} 月`;
  }, [month]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="erp-card">
        <div className="erp-card-body" style={{ padding: "12px 16px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input type="month" className="erp-input" style={{ maxWidth: 160 }} value={month} onChange={(e) => setMonth(e.target.value)} />
          <select className="erp-select" style={{ maxWidth: 130 }} value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="">全部分店</option>
            {branches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>

      <div className="erp-card">
        <div className="erp-card-body" style={{ padding: "10px 16px" }}>
          <CollapseSection title={`名單（${includedRoster.length}/${roster.length} 位）`}>
            {roster.length === 0 && <div style={{ fontSize: 12, color: "var(--gray-400)" }}>廠商名單目前是空的</div>}
            {roster.map((r) => (
              <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "3px 0" }}>
                <input type="checkbox" checked={!excludedRosterIds.has(r.id)} onChange={() => toggleExcluded(r.id)} />
                {r.name}　{r.phone ?? "—"}
              </label>
            ))}
          </CollapseSection>
        </div>
      </div>

      <div className="erp-card">
        <div className="erp-card-body" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--gray-500)", marginBottom: 8 }}>
            {monthLabel}　可訂位（{available.length} 位）
          </div>
          {available.length === 0
            ? <div style={{ fontSize: 13, color: "var(--gray-400)", marginBottom: 16 }}>名單中所有客人本月都已訂過</div>
            : (
              <div className="erp-person-grid" style={{ marginBottom: 16 }}>
                {available.map((p) => (
                  <div key={p.id} className="erp-person-card avail">
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-800)" }}>{p.name || "（無姓名）"}</div>
                    <div style={{ fontSize: 12, color: "var(--gray-500)" }}>{p.phone ?? "—"}</div>
                    {p.openBranches.length > 0 && p.openBranches.length < allBranches.length && (
                      <div style={{ fontSize: 11, color: "var(--color-success)", marginTop: 3 }}>
                        可訂：{p.openBranches.join("、")}
                      </div>
                    )}
                    {p.bookedBranches.length > 0 && (
                      <div style={{ fontSize: 11, color: "var(--gray-400)", marginTop: 2 }}>
                        已訂：{p.bookedBranches.join("、")}
                      </div>
                    )}
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
                  本月已訂：{p.bookedBranches.join("、") || "—"}
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
    fetch("/api/roster/lists")
      .then((res) => res.json())
      .then((data) => setRosterLists(Array.isArray(data) ? data : []));
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
      {tab === "inline" && <InlineTab />}
      {tab === "eztable" && <EztableTab />}
    </div>
  );
}

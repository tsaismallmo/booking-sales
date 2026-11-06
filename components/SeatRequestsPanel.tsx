"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BranchSelect } from "@/components/BranchSelect";
import { getMealPeriod } from "@/lib/quote";

type StockMatch = { id: string; branch: string | null; bookingDate: string; timeSlot: string | null; partySize: number | null; bookingCode: string | null };

type OptionStatus = "pending" | "booked" | "failed" | "skipped";
type SeatOption = {
  id: string;
  priority: number;
  branchId: string | null;
  branch: string | null;
  bookingDate: string;
  timeSlot: string | null;
  partySize: number | null;
  status: OptionStatus;
  bookingCode: string | null;
  resultNote: string | null;
  handledByName: string | null;
  handledAt: string | null;
  stockMatches: StockMatch[];
};

type SeatRequest = {
  id: string;
  customerName: string | null;
  customerPhone: string | null;
  note: string | null;
  status: "pending" | "booked" | "failed" | "cancelled";
  resultNote: string | null;
  handledByName: string | null;
  handledAt: string | null;
  createdByName: string | null;
  createdAt: string;
  options: SeatOption[];
};

const STATUS_TABS: { key: SeatRequest["status"]; label: string }[] = [
  { key: "pending", label: "待訂位" },
  { key: "booked", label: "已訂到" },
  { key: "cancelled", label: "已取消" },
];

const OPTION_BADGE: Record<OptionStatus, { cls: string; label: string }> = {
  pending: { cls: "badge-gray", label: "待訂" },
  booked: { cls: "badge-green", label: "已訂到" },
  failed: { cls: "badge-red", label: "訂不到" },
  skipped: { cls: "badge-gray", label: "不訂了" },
};
// 日期過了被系統自動結束的候選（API 的 EXPIRED_NOTE）
const EXPIRED_NOTE = "日期已過";
const optionBadge = (status: OptionStatus, resultNote: string | null | undefined) =>
  status === "skipped" && resultNote === EXPIRED_NOTE ? { cls: "badge-gray", label: "已過期" } : OPTION_BADGE[status];

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const MEAL_ORDER = ["午餐", "下午茶", "晚餐", "時段不限"];

// id：修改時原本就有的候選；locked：已處理過（訂到／訂不到／不訂了）的候選，只能調順位
type OptionRow = { key: number; id?: string; locked?: OptionStatus; lockedNote?: string | null; bookingCode?: string | null; branchId: string; branch: string; bookingDate: string; timeSlot: string; partySize: string };
let rowKey = 0;
// 新增候選時沿用上一個候選的分店、時段和人數，客人通常是同一間換日期
const newRow = (from?: OptionRow): OptionRow => ({ key: ++rowKey, branchId: from?.branchId ?? "", branch: from?.branch ?? "", bookingDate: "", timeSlot: from?.timeSlot ?? "", partySize: from?.partySize ?? "" });
const emptyCustomer = { customerName: "", customerPhone: "", note: "" };

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
function todayStr() {
  const t = new Date();
  return ymd(t.getFullYear(), t.getMonth(), t.getDate());
}
function weekdayOf(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}（${weekdayOf(date)}）`;

function stockLine(s: StockMatch) {
  return `${s.bookingDate} ${s.timeSlot ?? "—"} ${s.partySize ?? "—"}人${s.bookingCode ? ` 代號${s.bookingCode}` : ""}`;
}

// 需求看板的「需要訂位」分頁：客人要的日期／時段現貨單沒有，客服登記，後勤去跟餐廳訂。
// 一個客人一筆，底下可以有多個依順位排的候選日期（可以跨餐廳／分店）。
// 「月曆」看每一天有幾組客人在等；「依客人」看每位客人的候選。
// 登記前和看板上都會比對現貨單，現貨單有符合、還沒售出的位子就提醒直接用現貨。
export function SeatRequestsPanel({ canCreate, canHandle, canCancel }: { canCreate: boolean; canHandle: boolean; canCancel: boolean }) {
  const [rows, setRows] = useState<SeatRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "calendar">("calendar");
  const [statusTab, setStatusTab] = useState<SeatRequest["status"]>("pending");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // 有值 = 表單在修改這筆需求
  const [customer, setCustomer] = useState(emptyCustomer);
  const [optionRows, setOptionRows] = useState<OptionRow[]>(() => [newRow()]);
  const [formStock, setFormStock] = useState<StockMatch[][]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // 處理中的那一個候選：要按「已訂到」或「訂不到」，展開輸入框
  const [acting, setActing] = useState<{ optionId: string; action: "booked" | "failed" } | null>(null);
  const [actForm, setActForm] = useState({ bookingCode: "", resultNote: "", handledByName: "" });
  // 月曆
  const [month, setMonth] = useState(() => { const t = new Date(); return { y: t.getFullYear(), m: t.getMonth() }; });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [branchFilter, setBranchFilter] = useState("");

  const load = () =>
    fetch("/api/seat-requests")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setRows(Array.isArray(data) ? data : []);
        setLoading(false);
      });

  useEffect(() => {
    void load();
  }, []);

  // 表單每個候選選好分店＋日期就查現貨單（時段、人數有填也一起比）
  const stockKey = JSON.stringify({ options: optionRows.map((r) => ({ branchId: r.branchId, bookingDate: r.bookingDate, timeSlot: r.timeSlot, partySize: r.partySize })) });
  useEffect(() => {
    if (!showForm) return;
    let stale = false;
    fetch("/api/seat-requests/stock", { method: "POST", headers: { "Content-Type": "application/json" }, body: stockKey })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => { if (!stale) setFormStock(Array.isArray(data) ? data : []); });
    return () => { stale = true; };
  }, [stockKey, showForm]);
  const formStockCount = optionRows.reduce((n, r, i) => n + (!r.locked && r.branchId && r.bookingDate ? formStock[i]?.length ?? 0 : 0), 0);

  const closeForm = () => {
    setCustomer(emptyCustomer);
    setOptionRows([newRow()]);
    setEditingId(null);
    setShowForm(false);
    setError("");
  };

  // 修改：把這筆需求的客人資料和候選帶進表單
  const startEdit = (r: SeatRequest) => {
    setEditingId(r.id);
    setCustomer({ customerName: r.customerName ?? "", customerPhone: r.customerPhone ?? "", note: r.note ?? "" });
    setOptionRows(r.options.map((o) => ({
      key: ++rowKey,
      id: o.id,
      locked: o.status === "pending" ? undefined : o.status,
      lockedNote: o.resultNote,
      bookingCode: o.bookingCode,
      branchId: o.branchId ?? "",
      branch: o.branch ?? "",
      bookingDate: o.bookingDate,
      timeSlot: o.timeSlot ?? "",
      partySize: o.partySize ? String(o.partySize) : "",
    })));
    setShowForm(true);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const setCust = (field: keyof typeof emptyCustomer) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCustomer((f) => ({ ...f, [field]: e.target.value }));
  const updateRow = (key: number, patch: Partial<OptionRow>) => setOptionRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const moveRow = (i: number, dir: -1 | 1) => setOptionRows((rs) => {
    const j = i + dir;
    if (j < 0 || j >= rs.length) return rs;
    const next = [...rs];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const handleCreate = async () => {
    for (const [i, r] of optionRows.entries()) {
      if (r.locked) continue;
      if (!r.branchId) return setError(`第 ${i + 1} 順位請選擇餐廳和分店`);
      if (!r.bookingDate) return setError(`第 ${i + 1} 順位請填日期`);
    }
    if (formStockCount > 0 && !confirm(`現貨單已經有 ${formStockCount} 筆符合候選日期、還沒售出的位子，確定還要${editingId ? "儲存" : "登記訂位需求"}？`)) return;
    setSaving(true);
    setError("");
    const options = optionRows.map(({ id, branchId, branch, bookingDate, timeSlot, partySize }) => ({ id, branchId, branch, bookingDate, timeSlot, partySize }));
    const res = editingId
      ? await fetch(`/api/seat-requests/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "edit", ...customer, options }),
        })
      : await fetch("/api/seat-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...customer, options }),
        });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return setError(data.error || (editingId ? "修改失敗" : "登記失敗"));
    }
    if (!editingId) setStatusTab("pending");
    closeForm();
    load();
  };

  const send = async (url: string, body: object) => {
    setError("");
    const res = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "更新失敗");
      return false;
    }
    load();
    return true;
  };
  const patchRequest = (id: string, body: object) => send(`/api/seat-requests/${id}`, body);
  const deleteRequest = async (id: string) => {
    if (!confirm("確定刪除這筆已取消的需求？刪除後就找不回來了")) return;
    setError("");
    const res = await fetch(`/api/seat-requests/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return setError(data.error || "刪除失敗");
    }
    load();
  };
  const patchOption = (id: string, body: object) => send(`/api/seat-requests/options/${id}`, body);

  // 訂到其中一個候選時，問要不要把其他候選一起結束（客人有時只要一天、有時要訂多天，由處理的人判斷）
  const submitAct = async (r: SeatRequest) => {
    if (!acting) return;
    let closeOthers = false;
    if (acting.action === "booked") {
      const others = r.options.filter((o) => o.status === "pending" && o.id !== acting.optionId);
      if (others.length > 0) {
        closeOthers = confirm(
          `這位客人還有 ${others.length} 個候選日期還沒訂：\n${others.map((o) => `第${o.priority}順位 ${o.branch ?? "—"} ${o.bookingDate} ${o.timeSlot ?? ""}`).join("\n")}\n\n按「確定」：其他候選不訂了，這筆需求完成\n按「取消」：保留其他候選，繼續訂`
        );
      }
    }
    if (await patchOption(acting.optionId, { action: acting.action, ...actForm, closeOthers })) {
      setActing(null);
      setActForm({ bookingCode: "", resultNote: "", handledByName: "" });
    }
  };

  // ── 月曆資料：還在等的需求底下、還沒訂的候選，依日期 → 餐廳分店 → 餐期，
  //    每一組的人數個別列出（不加總），方便看要訂幾桌、各幾位 ──
  const pendingRequests = useMemo(() => rows.filter((r) => r.status === "pending"), [rows]);
  // 月曆篩選選項：從還在等的候選裡出現過的餐廳／分店產生，依餐廳分組
  const filterGroups = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const r of pendingRequests) for (const o of r.options) {
      if (o.status !== "pending" || !o.branch) continue;
      const restaurant = o.branch.split("｜")[0];
      m.set(restaurant, (m.get(restaurant) ?? new Set()).add(o.branch));
    }
    return [...m.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "zh-Hant"))
      .map(([restaurant, set]) => ({ restaurant, branches: [...set].sort((a, b) => a.localeCompare(b, "zh-Hant")) }));
  }, [pendingRequests]);
  // branchFilter：""＝全部、"r:餐廳"＝整間餐廳、"b:餐廳｜分店"＝單一分店
  const matchFilter = (branch: string | null) => {
    if (!branchFilter) return true;
    if (branchFilter.startsWith("r:")) return (branch ?? "").split("｜")[0] === branchFilter.slice(2);
    return branch === branchFilter.slice(2);
  };
  const byDate = useMemo(() => {
    const map = new Map<string, Map<string, Map<string, { sizes: (number | null)[]; stock: boolean }>>>();
    for (const r of pendingRequests) {
      for (const o of r.options) {
        if (o.status !== "pending" || !matchFilter(o.branch)) continue;
        const branches = map.get(o.bookingDate) ?? new Map();
        const label = o.branch ?? "—";
        const meals = branches.get(label) ?? new Map();
        const meal = getMealPeriod(o.timeSlot) ?? "時段不限";
        const cur = meals.get(meal) ?? { sizes: [], stock: false };
        cur.sizes.push(o.partySize);
        if (o.stockMatches.length > 0) cur.stock = true;
        meals.set(meal, cur);
        branches.set(label, meals);
        map.set(o.bookingDate, branches);
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- matchFilter 只依賴 branchFilter
  }, [pendingRequests, branchFilter]);
  const groupsOfDate = (date: string) =>
    [...(byDate.get(date)?.values() ?? [])].reduce((n, meals) => n + [...meals.values()].reduce((k, m) => k + m.sizes.length, 0), 0);
  // 哪幾個月有需求（月曆上方的快速切換）
  const monthsWithDemand = useMemo(() => {
    const m = new Map<string, number>();
    for (const [date, branches] of byDate) {
      const key = date.slice(0, 7);
      const n = [...branches.values()].reduce((s, meals) => s + [...meals.values()].reduce((k, x) => k + x.sizes.length, 0), 0);
      m.set(key, (m.get(key) ?? 0) + n);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [byDate]);

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

  const counts = Object.fromEntries(STATUS_TABS.map((t) => [t.key, rows.filter((r) => r.status === t.key).length]));
  const firstPendingDate = (r: SeatRequest) => r.options.filter((o) => o.status === "pending").map((o) => o.bookingDate).sort()[0] ?? "9999";
  const listShown = rows
    .filter((r) => r.status === statusTab)
    .sort((a, b) => (statusTab === "pending" ? firstPendingDate(a).localeCompare(firstPendingDate(b)) : 0));
  const dayShown = selectedDate
    ? pendingRequests.filter((r) => r.options.some((o) => o.status === "pending" && o.bookingDate === selectedDate && matchFilter(o.branch)))
    : [];

  const renderCard = (r: SeatRequest, highlightDate?: string) => (
    <div key={r.id} className="erp-card">
      <div className="erp-card-body erp-sysinfo">
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 14 }}>
          <strong>{r.customerName || "（未填姓名）"}</strong>
          {r.customerPhone && <span style={{ color: "var(--gray-600)" }}>{r.customerPhone}</span>}
          {r.status !== "pending" && <span className={`badge ${r.status === "booked" ? "badge-green" : r.status === "failed" ? "badge-red" : "badge-gray"}`}>{STATUS_TABS.find((t) => t.key === r.status)?.label}</span>}
        </div>
        {r.note && <div style={{ fontSize: 13, marginTop: 6 }}>備註：{r.note}</div>}

        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {r.options.map((o) => {
            const hl = highlightDate && o.bookingDate === highlightDate;
            const done = o.status !== "pending";
            return (
              <div key={o.id} style={{ padding: "6px 10px", borderRadius: 6, background: hl ? "var(--brand-50)" : "var(--gray-50)", border: hl ? "1px solid var(--brand-300)" : "1px solid transparent" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13, opacity: done && o.status !== "booked" ? 0.6 : 1 }}>
                  <span className="badge badge-navy" style={{ fontSize: 11 }}>第{o.priority}順位</span>
                  <span>{o.branch ?? "—"}</span>
                  <strong>{shortDate(o.bookingDate)}</strong>
                  <span>{getMealPeriod(o.timeSlot) ?? ""} {o.timeSlot || "時段不限"}</span>
                  <span>{o.partySize ? `${o.partySize}人` : "人數未填"}</span>
                  <span className={`badge ${optionBadge(o.status, o.resultNote).cls}`} style={{ fontSize: 11 }}>{optionBadge(o.status, o.resultNote).label}</span>
                  {o.stockMatches.length > 0 && <span className="badge badge-warning" style={{ fontSize: 11 }}>現貨單有 {o.stockMatches.length} 筆符合</span>}
                  {o.status === "booked" && <span>代號 <strong>{o.bookingCode}</strong></span>}
                  {o.resultNote && o.resultNote !== EXPIRED_NOTE && <span style={{ color: "var(--gray-600)" }}>{o.status === "failed" ? "原因：" : ""}{o.resultNote}</span>}
                  {o.handledAt && done && <span style={{ fontSize: 11, color: "var(--gray-400)" }}>{o.handledByName ?? "—"} {new Date(o.handledAt).toLocaleDateString("zh-TW")}</span>}
                  <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                    {r.status === "pending" && o.status === "pending" && canHandle && (
                      <>
                        <button className="btn btn-primary" style={{ fontSize: 12, padding: "2px 10px" }} onClick={() => setActing({ optionId: o.id, action: "booked" })}>已訂到</button>
                      </>
                    )}
                    {r.status !== "cancelled" && (o.status === "booked" || o.status === "failed") && (canHandle || canCancel) && (
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => { if (confirm("這個候選改回待訂？")) patchOption(o.id, { action: "reopen" }); }}>改回待訂</button>
                    )}
                  </span>
                </div>
                {o.stockMatches.length > 0 && (
                  <div style={{ fontSize: 12, marginTop: 4, color: "var(--gray-500)" }}>
                    符合的現貨單：{o.stockMatches.map((s) => <Link key={s.id} href={`/bookings/${s.id}`} style={{ color: "var(--brand-600)", marginRight: 8 }}>{stockLine(s)}</Link>)}
                  </div>
                )}
                {acting?.optionId === o.id && (
                  <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {acting.action === "booked" && (
                      <input className="erp-input" style={{ maxWidth: 140 }} placeholder="訂位代號 *" value={actForm.bookingCode} onChange={(e) => setActForm((f) => ({ ...f, bookingCode: e.target.value }))} />
                    )}
                    <input
                      className="erp-input"
                      style={{ maxWidth: 260 }}
                      placeholder={acting.action === "booked" ? "備註（例如實際訂到的時段）" : "訂不到的原因 *"}
                      value={actForm.resultNote}
                      onChange={(e) => setActForm((f) => ({ ...f, resultNote: e.target.value }))}
                    />
                    <input className="erp-input" style={{ maxWidth: 120 }} placeholder="處理人員" value={actForm.handledByName} onChange={(e) => setActForm((f) => ({ ...f, handledByName: e.target.value }))} />
                    <button className="btn btn-primary" disabled={acting.action === "booked" ? !actForm.bookingCode.trim() : !actForm.resultNote.trim()} onClick={() => submitAct(r)}>
                      確認{acting.action === "booked" ? "已訂到" : "訂不到"}
                    </button>
                    <button className="btn btn-ghost" onClick={() => setActing(null)}>取消</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ fontSize: 12, marginTop: 8, color: "var(--gray-400)" }}>
          {r.createdByName ?? "—"} 登記於 {new Date(r.createdAt).toLocaleString("zh-TW")}
          {r.handledAt && r.status !== "pending" && <>　｜　{r.handledByName ?? "—"} {r.status === "cancelled" ? "取消" : "結束"}於 {new Date(r.handledAt).toLocaleString("zh-TW")}</>}
          {r.resultNote && r.status !== "pending" && <>　｜　原因：{r.resultNote}</>}
        </div>

        <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {r.status !== "cancelled" && canCreate && (
            <button className="btn btn-secondary" onClick={() => startEdit(r)}>修改</button>
          )}
          {r.status === "pending" && (canHandle || canCancel) && r.options.some((o) => o.status !== "pending") && (
            <button className="btn btn-secondary" onClick={() => { if (confirm("剩下還沒訂的候選都不訂了，結束這筆需求？")) patchRequest(r.id, { action: "finish" }); }}>結束需求</button>
          )}
          {r.status === "pending" && canCancel && (
            <button className="btn btn-ghost" style={{ color: "var(--color-danger)" }} onClick={() => { if (confirm("客人不要了，取消這筆訂位需求？")) patchRequest(r.id, { action: "cancelled" }); }}>取消需求</button>
          )}
          {r.status !== "pending" && (canHandle || canCancel) && (
            <button className="btn btn-ghost" onClick={() => { if (confirm("改回待訂位？（不訂了的候選會恢復待訂）")) patchRequest(r.id, { action: "reopen" }); }}>改回待訂位</button>
          )}
          {r.status === "cancelled" && canCancel && (
            <button className="btn btn-ghost" style={{ color: "var(--color-danger)" }} onClick={() => deleteRequest(r.id)}>刪除</button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <div className="erp-tabs" style={{ marginBottom: 0 }}>
          <button className={`erp-tab${view === "calendar" ? " active" : ""}`} onClick={() => setView("calendar")}>月曆</button>
          <button className={`erp-tab${view === "list" ? " active" : ""}`} onClick={() => setView("list")}>依客人</button>
        </div>
        {canCreate && (
          <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => (showForm ? closeForm() : setShowForm(true))}>
            {showForm ? "收起" : "＋ 登記需要訂位"}
          </button>
        )}
      </div>

      {error && <div style={{ color: "var(--color-danger)", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {showForm && (
        <div className="erp-card" style={{ marginBottom: 16 }}>
          <div className="erp-card-header"><span className="erp-card-title">{editingId ? "修改需要訂位" : "登記需要訂位"}</span></div>
          <div className="erp-card-body">
            <div className="erp-form-grid">
              <div className="erp-form-group">
                <label className="erp-label">客人姓名</label>
                <input className="erp-input" value={customer.customerName} onChange={setCust("customerName")} />
              </div>
              <div className="erp-form-group">
                <label className="erp-label">客人電話</label>
                <input className="erp-input" value={customer.customerPhone} onChange={setCust("customerPhone")} />
              </div>
              <div className="erp-form-group full">
                <label className="erp-label">備註</label>
                <input className="erp-input" placeholder="例如：兩大一小、需要兒童椅" value={customer.note} onChange={setCust("note")} />
              </div>
            </div>

            <div style={{ marginTop: 16, fontWeight: 600, fontSize: 14 }}>候選日期（依客人想要的順序，第 1 順位最想要）</div>
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
              {optionRows.map((row, i) => {
                const stock = !row.locked && row.branchId && row.bookingDate ? formStock[i] ?? [] : [];
                return (
                  <div key={row.key} style={{ padding: 10, border: "1px solid var(--gray-200)", borderRadius: 6, background: row.locked ? "var(--gray-50)" : undefined }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                      <span className="badge badge-navy" style={{ alignSelf: "center" }}>第{i + 1}順位</span>
                      {row.locked ? (
                        <span style={{ flex: "4 1 400px", alignSelf: "center", fontSize: 13, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          {row.branch || "—"}　<strong>{shortDate(row.bookingDate)}</strong>　{getMealPeriod(row.timeSlot) ?? ""} {row.timeSlot || "時段不限"}　{row.partySize ? `${row.partySize}人` : "人數未填"}
                          <span className={`badge ${optionBadge(row.locked, row.lockedNote).cls}`} style={{ fontSize: 11 }}>{optionBadge(row.locked, row.lockedNote).label}</span>
                          {row.bookingCode && <span>代號 {row.bookingCode}</span>}
                          <span style={{ color: "var(--gray-400)", fontSize: 12 }}>已處理，只能調順位</span>
                        </span>
                      ) : (
                      <>
                      <div style={{ flex: "2 1 260px" }}>
                        <label className="erp-label">餐廳／分店 <span className="required">*</span></label>
                        <BranchSelect branchId={row.branchId} branch={row.branch} onChange={(v) => updateRow(row.key, v)} />
                      </div>
                      <div style={{ flex: "1 1 140px" }}>
                        <label className="erp-label">日期 <span className="required">*</span></label>
                        <input type="date" className="erp-input" value={row.bookingDate} onChange={(e) => updateRow(row.key, { bookingDate: e.target.value })} />
                      </div>
                      <div style={{ flex: "1 1 100px" }}>
                        <label className="erp-label">時段</label>
                        <input className="erp-input" placeholder="例如 11:30" value={row.timeSlot} onChange={(e) => updateRow(row.key, { timeSlot: e.target.value })} />
                      </div>
                      <div style={{ flex: "0 1 80px" }}>
                        <label className="erp-label">人數</label>
                        <input type="number" min={1} className="erp-input" value={row.partySize} onChange={(e) => updateRow(row.key, { partySize: e.target.value })} />
                      </div>
                      </>
                      )}
                      <div style={{ display: "flex", gap: 4 }}>
                        <button type="button" className="btn btn-ghost" style={{ padding: "4px 8px" }} disabled={i === 0} onClick={() => moveRow(i, -1)} title="順位往前">↑</button>
                        <button type="button" className="btn btn-ghost" style={{ padding: "4px 8px" }} disabled={i === optionRows.length - 1} onClick={() => moveRow(i, 1)} title="順位往後">↓</button>
                        <button type="button" className="btn btn-ghost" style={{ padding: "4px 8px", color: "var(--color-danger)" }} disabled={optionRows.length === 1 || !!row.locked} onClick={() => setOptionRows((rs) => rs.filter((r) => r.key !== row.key))}>刪除</button>
                      </div>
                    </div>
                    {stock.length > 0 && (
                      <div style={{ marginTop: 8, fontSize: 13, color: "var(--color-warning)" }}>
                        現貨單已經有 {stock.length} 筆符合、還沒售出：
                        {stock.map((s) => <Link key={s.id} href={`/bookings/${s.id}`} style={{ color: "var(--brand-600)", marginLeft: 8 }}>{stockLine(s)}</Link>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button type="button" className="btn btn-secondary" style={{ marginTop: 10 }} onClick={() => setOptionRows((rs) => [...rs, newRow(rs.filter((r) => !r.locked).at(-1))])}>
              ＋ 再加一個候選日期
            </button>
            {formStockCount > 0 && (
              <div style={{ marginTop: 8, color: "var(--gray-500)", fontSize: 13 }}>有候選日期現貨單已經有位子，可以直接到現貨單看板賣，不用登記訂位需求</div>
            )}
            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <button className="btn btn-primary" disabled={saving} onClick={handleCreate}>
                {saving ? (editingId ? "儲存中..." : "登記中...") : editingId ? "儲存修改" : "登記"}
              </button>
              {editingId && <button className="btn btn-ghost" onClick={closeForm}>取消修改</button>}
            </div>
          </div>
        </div>
      )}

      {loading && <p style={{ color: "var(--gray-400)" }}>載入中...</p>}

      {!loading && view === "calendar" && (
        <>
          <div className="erp-card" style={{ marginBottom: 16, maxWidth: 860 }}>
            <div className="erp-card-header" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-ghost" style={{ padding: "2px 10px" }} onClick={() => shiftMonth(-1)}>‹</button>
              <span className="erp-card-title">{month.y} 年 {month.m + 1} 月</span>
              <button className="btn btn-ghost" style={{ padding: "2px 10px" }} onClick={() => shiftMonth(1)}>›</button>
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: "2px 10px" }} onClick={() => { const t = new Date(); setMonth({ y: t.getFullYear(), m: t.getMonth() }); }}>本月</button>
              <select className="erp-input" style={{ width: "auto", fontSize: 13, padding: "4px 8px" }} value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
                <option value="">全部餐廳／分店</option>
                {filterGroups.map((g) => (
                  <optgroup key={g.restaurant} label={g.restaurant}>
                    <option value={`r:${g.restaurant}`}>{g.restaurant}（全部分店）</option>
                    {g.branches.map((b) => <option key={b} value={`b:${b}`}>{b.split("｜")[1] ?? b}</option>)}
                  </optgroup>
                ))}
              </select>
              <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                {monthsWithDemand.map(([key, n]) => {
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
                  const totalGroups = groupsOfDate(date);
                  const selected = selectedDate === date;
                  const past = date < today;
                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => setSelectedDate(selected ? null : date)}
                      style={{
                        minHeight: 52,
                        textAlign: "left",
                        padding: "2px 4px",
                        borderRadius: 6,
                        cursor: "pointer",
                        border: selected ? "2px solid var(--brand-500)" : date === today ? "1px solid var(--brand-300)" : "1px solid var(--gray-200)",
                        background: totalGroups > 0 ? "var(--brand-50)" : "transparent",
                        opacity: past ? 0.5 : 1,
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
                        {totalGroups > 0 && <span style={{ color: "var(--brand-700)" }}>{totalGroups}組</span>}
                      </span>
                      {entries.map(([label, meals]) => (
                        <span key={label} style={{ display: "flex", flexDirection: "column", width: "100%", fontSize: 10, lineHeight: 1.25 }}>
                          <span title={label} style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label.replace("｜", " ")}</span>
                          {[...meals.entries()]
                            .sort(([a], [b]) => MEAL_ORDER.indexOf(a) - MEAL_ORDER.indexOf(b))
                            .map(([meal, m]) => (
                              <span key={meal} style={{ paddingLeft: 2 }}>
                                {m.stock && <span style={{ color: "var(--color-warning)" }} title="現貨單已經有符合的位子">⚠</span>}
                                {meal} <strong>{m.sizes.length}組</strong>：{m.sizes.map((s) => (s ? `${s}人` : "?人")).join("、")}
                              </span>
                            ))}
                        </span>
                      ))}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: "var(--gray-400)", marginTop: 6 }}>
                只算還在等的候選日期，每一組的人數分開列出；「?人」表示人數未填；<span style={{ color: "var(--color-warning)" }}>⚠</span> 表示現貨單已經有符合的位子。點日期看是哪些客人。
              </div>
            </div>
          </div>

          {selectedDate && (
            <>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>{selectedDate.slice(0, 4)}/{shortDate(selectedDate)} 在等的客人（{dayShown.length} 組）</div>
              {dayShown.length === 0 && (
                <div className="erp-card"><div className="erp-card-body" style={{ textAlign: "center", color: "var(--gray-400)" }}>這天沒有客人在等</div></div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {dayShown.map((r) => renderCard(r, selectedDate))}
              </div>
            </>
          )}
        </>
      )}

      {!loading && view === "list" && (
        <>
          <div className="erp-tabs" style={{ marginBottom: 12 }}>
            {STATUS_TABS.map((t) => (
              <button key={t.key} className={`erp-tab${statusTab === t.key ? " active" : ""}`} onClick={() => setStatusTab(t.key)}>
                {t.label}（{counts[t.key] ?? 0}）
              </button>
            ))}
          </div>
          {listShown.length === 0 && (
            <div className="erp-card"><div className="erp-card-body" style={{ textAlign: "center", color: "var(--gray-400)" }}>沒有{STATUS_TABS.find((t) => t.key === statusTab)?.label}的訂位需求</div></div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {listShown.map((r) => renderCard(r))}
          </div>
        </>
      )}
    </div>
  );
}

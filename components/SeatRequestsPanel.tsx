"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BranchSelect } from "@/components/BranchSelect";

type StockMatch = { id: string; branch: string | null; bookingDate: string; timeSlot: string | null; partySize: number | null; bookingCode: string | null };

type SeatRequest = {
  id: string;
  branch: string | null;
  bookingDate: string;
  timeSlot: string | null;
  partySize: number | null;
  customerName: string | null;
  customerPhone: string | null;
  note: string | null;
  status: "pending" | "booked" | "failed" | "cancelled";
  bookingCode: string | null;
  resultNote: string | null;
  handledByName: string | null;
  handledAt: string | null;
  createdByName: string | null;
  createdAt: string;
  stockMatches: StockMatch[];
};

const STATUS_TABS: { key: SeatRequest["status"]; label: string }[] = [
  { key: "pending", label: "待訂位" },
  { key: "booked", label: "已訂到" },
  { key: "failed", label: "訂不到" },
  { key: "cancelled", label: "已取消" },
];

const emptyForm = { branchId: "", branch: "", bookingDate: "", timeSlot: "", partySize: "", customerName: "", customerPhone: "", note: "" };

function stockLine(s: StockMatch) {
  return `${s.bookingDate} ${s.timeSlot ?? "—"} ${s.partySize ?? "—"}人${s.bookingCode ? ` 代號${s.bookingCode}` : ""}`;
}

// 需求看板的「需要訂位」分頁：客人要的日期／時段現貨單沒有，客服登記，後勤去跟餐廳訂。
// 登記前和看板上都會比對現貨單，現貨單有符合、還沒售出的位子就提醒直接用現貨。
export function SeatRequestsPanel({ canCreate, canHandle, canCancel }: { canCreate: boolean; canHandle: boolean; canCancel: boolean }) {
  const [rows, setRows] = useState<SeatRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState<SeatRequest["status"]>("pending");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formStock, setFormStock] = useState<StockMatch[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // 處理中的那一筆：要按「已訂到」或「訂不到」，展開輸入框
  const [acting, setActing] = useState<{ id: string; action: "booked" | "failed" } | null>(null);
  const [actForm, setActForm] = useState({ bookingCode: "", resultNote: "", handledByName: "" });

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

  // 表單選好分店＋日期（時段、人數有填也一起比）就查現貨單
  useEffect(() => {
    if (!form.branchId || !form.bookingDate) return;
    const qs = new URLSearchParams({ branchId: form.branchId, bookingDate: form.bookingDate });
    if (form.timeSlot) qs.set("timeSlot", form.timeSlot);
    if (form.partySize) qs.set("partySize", form.partySize);
    let stale = false;
    fetch(`/api/seat-requests/stock?${qs}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => { if (!stale) setFormStock(Array.isArray(data) ? data : []); });
    return () => { stale = true; };
  }, [form.branchId, form.bookingDate, form.timeSlot, form.partySize]);
  const shownFormStock = form.branchId && form.bookingDate ? formStock : [];

  const set = (field: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleCreate = async () => {
    if (!form.branchId) return setError("請選擇餐廳和分店");
    if (!form.bookingDate) return setError("請填日期");
    if (shownFormStock.length > 0 && !confirm(`現貨單已經有 ${shownFormStock.length} 筆符合、還沒售出的位子，確定還要登記訂位需求？`)) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/seat-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return setError(data.error || "登記失敗");
    }
    setForm(emptyForm);
    setShowForm(false);
    setStatusTab("pending");
    load();
  };

  const patch = async (id: string, body: object) => {
    setError("");
    const res = await fetch(`/api/seat-requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "更新失敗");
      return false;
    }
    load();
    return true;
  };

  const submitAct = async () => {
    if (!acting) return;
    if (await patch(acting.id, { action: acting.action, ...actForm })) {
      setActing(null);
      setActForm({ bookingCode: "", resultNote: "", handledByName: "" });
    }
  };

  const counts = Object.fromEntries(STATUS_TABS.map((t) => [t.key, rows.filter((r) => r.status === t.key).length]));
  const shown = rows
    .filter((r) => r.status === statusTab)
    .sort((a, b) => (statusTab === "pending" ? a.bookingDate.localeCompare(b.bookingDate) : 0));

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <div className="erp-tabs" style={{ marginBottom: 0 }}>
          {STATUS_TABS.map((t) => (
            <button key={t.key} className={`erp-tab${statusTab === t.key ? " active" : ""}`} onClick={() => setStatusTab(t.key)}>
              {t.label}（{counts[t.key] ?? 0}）
            </button>
          ))}
        </div>
        {canCreate && (
          <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => setShowForm((s) => !s)}>
            {showForm ? "收起" : "＋ 登記需要訂位"}
          </button>
        )}
      </div>

      {error && <div style={{ color: "var(--color-danger)", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {showForm && (
        <div className="erp-card" style={{ marginBottom: 16 }}>
          <div className="erp-card-header"><span className="erp-card-title">登記需要訂位</span></div>
          <div className="erp-card-body">
            <div className="erp-form-grid">
              <div className="erp-form-group" style={{ gridColumn: "span 2" }}>
                <label className="erp-label">餐廳／分店 <span className="required">*</span></label>
                <BranchSelect branchId={form.branchId} branch={form.branch} onChange={(v) => setForm((f) => ({ ...f, ...v }))} />
              </div>
              <div className="erp-form-group">
                <label className="erp-label">日期 <span className="required">*</span></label>
                <input type="date" className="erp-input" value={form.bookingDate} onChange={set("bookingDate")} />
              </div>
              <div className="erp-form-group">
                <label className="erp-label">時段</label>
                <input className="erp-input" placeholder="例如 11:30" value={form.timeSlot} onChange={set("timeSlot")} />
              </div>
              <div className="erp-form-group">
                <label className="erp-label">人數</label>
                <input type="number" className="erp-input" value={form.partySize} onChange={set("partySize")} />
              </div>
              <div className="erp-form-group">
                <label className="erp-label">客人姓名</label>
                <input className="erp-input" value={form.customerName} onChange={set("customerName")} />
              </div>
              <div className="erp-form-group">
                <label className="erp-label">客人電話</label>
                <input className="erp-input" value={form.customerPhone} onChange={set("customerPhone")} />
              </div>
              <div className="erp-form-group full">
                <label className="erp-label">備註</label>
                <input className="erp-input" placeholder="例如：11:30 或 12:00 都可以" value={form.note} onChange={set("note")} />
              </div>
            </div>
            {shownFormStock.length > 0 && (
              <div style={{ marginTop: 12, padding: "10px 14px", border: "1px solid var(--color-warning)", borderRadius: 6, fontSize: 13 }}>
                <strong style={{ color: "var(--color-warning)" }}>現貨單已經有 {shownFormStock.length} 筆符合、還沒售出：</strong>
                {shownFormStock.map((s) => (
                  <div key={s.id} style={{ marginTop: 4 }}>
                    {stockLine(s)}　<Link href={`/bookings/${s.id}`} style={{ color: "var(--brand-600)" }}>查看</Link>
                  </div>
                ))}
                <div style={{ marginTop: 4, color: "var(--gray-500)" }}>可以直接到現貨單看板賣這幾筆，不用登記訂位需求</div>
              </div>
            )}
            <div style={{ marginTop: 16 }}>
              <button className="btn btn-primary" disabled={saving} onClick={handleCreate}>{saving ? "登記中..." : "登記"}</button>
            </div>
          </div>
        </div>
      )}

      {loading && <p style={{ color: "var(--gray-400)" }}>載入中...</p>}
      {!loading && shown.length === 0 && (
        <div className="erp-card"><div className="erp-card-body" style={{ textAlign: "center", color: "var(--gray-400)" }}>沒有{STATUS_TABS.find((t) => t.key === statusTab)?.label}的訂位需求</div></div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {shown.map((r) => (
          <div key={r.id} className="erp-card">
            <div className="erp-card-body erp-sysinfo">
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 14 }}>
                <strong>{r.branch ?? "—"}</strong>
                <span>{r.bookingDate}　{r.timeSlot || "時段不限"}　{r.partySize ? `${r.partySize}人` : "人數未填"}</span>
                {(r.customerName || r.customerPhone) && <span style={{ color: "var(--gray-600)" }}>｜　{r.customerName ?? "—"}　{r.customerPhone ?? "—"}</span>}
                {r.stockMatches.length > 0 && <span className="badge badge-warning">現貨單有 {r.stockMatches.length} 筆符合</span>}
              </div>
              {r.note && <div style={{ fontSize: 13, marginTop: 6 }}>備註：{r.note}</div>}
              {r.stockMatches.length > 0 && (
                <div style={{ fontSize: 12, marginTop: 4, color: "var(--gray-500)" }}>
                  符合的現貨單：{r.stockMatches.map((s) => <Link key={s.id} href={`/bookings/${s.id}`} style={{ color: "var(--brand-600)", marginRight: 8 }}>{stockLine(s)}</Link>)}
                </div>
              )}
              <div style={{ fontSize: 12, marginTop: 6, color: "var(--gray-400)" }}>
                {r.createdByName ?? "—"} 登記於 {new Date(r.createdAt).toLocaleString("zh-TW")}
                {r.handledAt && <>　｜　{r.handledByName ?? "—"} 處理於 {new Date(r.handledAt).toLocaleString("zh-TW")}</>}
              </div>
              {r.status === "booked" && <div style={{ fontSize: 13, marginTop: 6 }}>訂位代號：<strong>{r.bookingCode}</strong>{r.resultNote && `　${r.resultNote}`}</div>}
              {(r.status === "failed" || r.status === "cancelled") && r.resultNote && <div style={{ fontSize: 13, marginTop: 6 }}>原因：{r.resultNote}</div>}

              <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {r.status === "pending" && canHandle && (
                  <>
                    <button className="btn btn-primary" onClick={() => setActing({ id: r.id, action: "booked" })}>已訂到</button>
                    <button className="btn btn-secondary" onClick={() => setActing({ id: r.id, action: "failed" })}>訂不到</button>
                  </>
                )}
                {r.status === "pending" && canCancel && (
                  <button className="btn btn-ghost" style={{ color: "var(--color-danger)" }} onClick={() => { if (confirm("確定取消這筆訂位需求？")) patch(r.id, { action: "cancelled" }); }}>取消需求</button>
                )}
                {r.status !== "pending" && (canHandle || canCancel) && (
                  <button className="btn btn-ghost" onClick={() => { if (confirm("改回待訂位？")) patch(r.id, { action: "reopen" }); }}>改回待訂位</button>
                )}
              </div>

              {acting?.id === r.id && (
                <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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
                  <button
                    className="btn btn-primary"
                    disabled={acting.action === "booked" ? !actForm.bookingCode.trim() : !actForm.resultNote.trim()}
                    onClick={submitAct}
                  >
                    確認{acting.action === "booked" ? "已訂到" : "訂不到"}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setActing(null)}>取消</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

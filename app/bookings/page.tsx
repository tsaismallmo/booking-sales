"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { compareBookings } from "@/lib/booking-sort";

type Booking = {
  id: string;
  vendorId: string;
  branch: string | null;
  category: string;
  bookingDate: string;
  timeSlot: string | null;
  partySize: number | null;
  bookingCode: string | null;
  status: "unsold" | "reserved" | "sold" | "refunded";
  customerName: string | null;
  customerPhone: string | null;
  collectedAmount: string | null;
  depositAmount: string | null;
  paymentDeadline: string | null;
};

// 沒有訂金＝還沒繳費
const isUnpaid = (b: Booking) => !b.depositAmount || Number(b.depositAmount) === 0;

// 篩「未繳費」時訂金直接在表格裡填：輸入金額按 Enter 或「存」就寫進單據，存好那筆就有訂金、自動從清單消失
function DepositInput({ booking, onSaved }: { booking: Booking; onSaved: (amount: string) => void }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    const amount = value.replace(/[,\s]/g, "");
    if (!amount) return;
    if (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0) return setError("請填金額");
    setSaving(true);
    setError("");
    const res = await fetch(`/api/bookings/${booking.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ depositAmount: amount }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return setError(data.error || "存檔失敗");
    }
    onSaved(amount);
  };
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <input
        className="erp-input"
        inputMode="numeric"
        placeholder="訂金"
        style={{ width: 90, padding: "4px 8px", fontSize: 13 }}
        value={value}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
      />
      <button className="btn btn-ghost" style={{ padding: "4px 8px", fontSize: 13 }} disabled={saving || !value.trim()} onClick={() => void save()}>
        {saving ? "…" : "存"}
      </button>
      {error && <span style={{ fontSize: 12, color: "var(--color-danger)" }}>{error}</span>}
    </div>
  );
}

const statusLabel: Record<Booking["status"], string> = {
  unsold: "未售出",
  reserved: "訂",
  sold: "售",
  refunded: "退",
};

const statusBadge: Record<Booking["status"], string> = {
  unsold: "badge badge-gray",
  reserved: "badge badge-warning",
  sold: "badge badge-green",
  refunded: "badge badge-red",
};

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  // 繳費期限篩選：選一個日期，列出繳費期限在這天以前（含已過期）、還沒繳費（沒有訂金）的單據
  const [deadlineBy, setDeadlineBy] = useState("");

  useEffect(() => {
    fetch("/api/bookings")
      .then((res) => res.json())
      .then((data) => {
        // 單據管理只處理現貨單，臨時單/預定單在各自的看板管理
        const rows = (Array.isArray(data) ? data : []).filter((b: Booking) => b.category === "現貨單");
        setBookings(rows);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    const list = bookings.filter((b) => {
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (deadlineBy) {
        // 已退的單不用再繳
        if (b.status === "refunded" || !isUnpaid(b) || !b.paymentDeadline || b.paymentDeadline > deadlineBy) return false;
      }
      if (q) {
        const lq = q.toLowerCase();
        const hay = `${b.customerName ?? ""}${b.customerPhone ?? ""}${b.bookingCode ?? ""}`.toLowerCase();
        if (!hay.includes(lq)) return false;
      }
      return true;
    });
    // 篩繳費期限時，期限最早（最急）的排前面
    return deadlineBy
      ? list.sort((a, b) => (a.paymentDeadline ?? "").localeCompare(b.paymentDeadline ?? "") || compareBookings(a, b))
      : list.sort(compareBookings);
  }, [bookings, statusFilter, q, deadlineBy]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">單據管理</h1>
          <p className="erp-page-subtitle">現貨單，顯示 {filtered.length} / {bookings.length} 筆</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/bookings/import-sms" className="btn btn-secondary">📩 解析簡訊</Link>
          <Link href="/bookings/import-sms-bulk" className="btn btn-secondary">📩 大量解析簡訊</Link>
          <Link href="/bookings/import" className="btn btn-secondary">⬆ 大量匯入</Link>
          <Link href="/bookings/new?category=現貨單" className="btn btn-primary">＋ 新增單據</Link>
        </div>
      </div>

      <div className="erp-card" style={{ marginBottom: 16 }}>
        <div className="erp-card-body" style={{ padding: "12px 16px", display: "flex", gap: 12, flexWrap: "wrap" }}>
          <input
            className="erp-input"
            placeholder="搜尋姓名、電話、訂位代號..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ maxWidth: 280 }}
          />
          <select className="erp-select" style={{ maxWidth: 160 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">全部狀態</option>
            <option value="unsold">未售出</option>
            <option value="reserved">訂</option>
            <option value="sold">售</option>
            <option value="refunded">退</option>
          </select>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14, color: "var(--gray-500)", whiteSpace: "nowrap" }}>未繳費，繳費期限到</span>
            <input type="date" className="erp-input" style={{ width: 160 }} value={deadlineBy} onChange={(e) => setDeadlineBy(e.target.value)} />
            <span style={{ fontSize: 14, color: "var(--gray-500)", whiteSpace: "nowrap" }}>為止</span>
            {deadlineBy && <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 13 }} onClick={() => setDeadlineBy("")}>清除</button>}
          </div>
        </div>
      </div>

      <div className="erp-card">
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>狀態</th>
                <th>分店</th>
                <th>日期</th>
                <th>時段</th>
                <th>人數</th>
                <th>訂位代號</th>
                <th>姓名</th>
                <th>電話</th>
                <th>訂金</th>
                <th>繳費期限</th>
                <th>收款金額</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={12} style={{ textAlign: "center", color: "var(--gray-400)" }}>載入中...</td></tr>
              )}
              {!loading && filtered.map((b) => (
                <tr key={b.id}>
                  <td><span className={statusBadge[b.status]}>{statusLabel[b.status]}</span></td>
                  <td>{b.branch ?? "—"}</td>
                  <td>{b.bookingDate}</td>
                  <td>{b.timeSlot ?? "—"}</td>
                  <td>{b.partySize ?? "—"}</td>
                  <td className="font-mono">{b.bookingCode ?? "—"}</td>
                  <td>{b.customerName ?? "—"}</td>
                  <td>{b.customerPhone ?? "—"}</td>
                  <td>
                    {deadlineBy && isUnpaid(b)
                      ? <DepositInput booking={b} onSaved={(amount) => setBookings((rows) => rows.map((x) => (x.id === b.id ? { ...x, depositAmount: amount } : x)))} />
                      : formatCurrency(b.depositAmount)}
                  </td>
                  <td style={isUnpaid(b) && b.status !== "refunded" && b.paymentDeadline && b.paymentDeadline <= today ? { color: "var(--color-danger)", fontWeight: 600 } : undefined}>
                    {b.paymentDeadline ?? "—"}
                  </td>
                  <td>{formatCurrency(b.collectedAmount)}</td>
                  <td>
                    <Link href={`/bookings/${b.id}`} className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 13 }}>查看</Link>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={12} style={{ textAlign: "center", color: "var(--gray-400)" }}>尚無單據</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

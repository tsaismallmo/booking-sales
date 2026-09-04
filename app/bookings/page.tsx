"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";

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
};

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
    return bookings.filter((b) => {
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (q) {
        const lq = q.toLowerCase();
        const hay = `${b.customerName ?? ""}${b.customerPhone ?? ""}${b.bookingCode ?? ""}`.toLowerCase();
        if (!hay.includes(lq)) return false;
      }
      return true;
    });
  }, [bookings, statusFilter, q]);

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">單據管理</h1>
          <p className="erp-page-subtitle">現貨單，顯示 {filtered.length} / {bookings.length} 筆</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/bookings/import-sms" className="btn btn-secondary">📩 解析簡訊</Link>
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
                <th>收款金額</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={11} style={{ textAlign: "center", color: "var(--gray-400)" }}>載入中...</td></tr>
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
                  <td>{formatCurrency(b.depositAmount)}</td>
                  <td>{formatCurrency(b.collectedAmount)}</td>
                  <td>
                    <Link href={`/bookings/${b.id}`} className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 13 }}>查看</Link>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={11} style={{ textAlign: "center", color: "var(--gray-400)" }}>尚無單據</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

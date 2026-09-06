"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";

type Booking = {
  id: string;
  vendorId: string | null;
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

type Vendor = { id: string; name: string | null };

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

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/admin/bookings")
      .then((res) => res.json())
      .then((data) => {
        const rows = (Array.isArray(data) ? data : []).filter((b: Booking) => b.category === "現貨單");
        setBookings(rows);
        setLoading(false);
      });
    fetch("/api/accounts")
      .then((res) => res.json())
      .then((data) => {
        const vs = (Array.isArray(data) ? data : []).filter((u: { roles: string[] }) => u.roles.includes("vendor"));
        setVendors(vs);
      });
  }, []);

  const vendorMap = useMemo(() => new Map(vendors.map((v) => [v.id, v.name ?? v.id])), [vendors]);

  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (vendorFilter !== "all" && b.vendorId !== vendorFilter) return false;
      if (q) {
        const lq = q.toLowerCase();
        const hay = `${b.customerName ?? ""}${b.customerPhone ?? ""}${b.bookingCode ?? ""}`.toLowerCase();
        if (!hay.includes(lq)) return false;
      }
      return true;
    });
  }, [bookings, statusFilter, vendorFilter, q]);

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">所有單據（管理員）</h1>
          <p className="erp-page-subtitle">現貨單，顯示 {filtered.length} / {bookings.length} 筆</p>
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
          <select className="erp-select" style={{ maxWidth: 160 }} value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}>
            <option value="all">全部廠商</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name ?? v.id}</option>
            ))}
          </select>
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
                <th>廠商</th>
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
                <tr><td colSpan={12} style={{ textAlign: "center", color: "var(--gray-400)" }}>載入中...</td></tr>
              )}
              {!loading && filtered.map((b) => (
                <tr key={b.id}>
                  <td>{b.vendorId ? (vendorMap.get(b.vendorId) ?? "—") : "—"}</td>
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
                    <Link href={`/bookings/${b.id}?from=admin`} className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 13 }}>查看</Link>
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

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { WEEKDAYS, parseDateOnly } from "@/lib/quote";

type Booking = {
  id: string;
  branch: string | null;
  category: string;
  bookingDate: string;
  timeSlot: string | null;
  partySize: number | null;
  bookingCode: string | null;
  customerName: string | null;
  customerPhone: string | null;
  status: "unsold" | "reserved" | "sold" | "refunded";
  depositAmount: string | null;
  note: string | null;
};

// 給臨時單／預定單用的看板，欄位順序跟現貨單看板保持一致
export function CategoryBoard({ category, title }: { category: "臨時單" | "預定單"; title: string }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [canSeeManagement, setCanSeeManagement] = useState(false);
  const [canCreate, setCanCreate] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => res.json())
      .then((me) => {
        const roles: string[] = me.roles ?? [];
        setCanSeeManagement(roles.includes("vendor") || roles.includes("admin"));
        setCanCreate(roles.includes("customer_service") || roles.includes("admin") || roles.includes("vendor"));
      });
  }, []);

  useEffect(() => {
    fetch("/api/bookings")
      .then((res) => res.json())
      .then((data) => {
        const rows: Booking[] = (Array.isArray(data) ? data : []).filter(
          (b: Booking) => b.status === "unsold" && b.category === category
        );
        rows.sort((a, b) => {
          const dateCmp = `${a.bookingDate} ${a.timeSlot ?? ""}`.localeCompare(`${b.bookingDate} ${b.timeSlot ?? ""}`);
          if (dateCmp !== 0) return dateCmp;
          const partyCmp = (a.partySize ?? 0) - (b.partySize ?? 0);
          if (partyCmp !== 0) return partyCmp;
          return (a.bookingCode ?? "").localeCompare(b.bookingCode ?? "", undefined, { numeric: true });
        });
        setBookings(rows);
        setLoading(false);
      });
  }, [category]);

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">{title}</h1>
          <p className="erp-page-subtitle">目前可以銷售（未售出）的{category}，共 {loading ? "…" : bookings.length} 筆</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {canCreate && (
            <Link href={`/bookings/new?category=${encodeURIComponent(category)}`} className="btn btn-primary">
              ＋ 新增{category}
            </Link>
          )}
          {canSeeManagement && <Link href="/bookings" className="btn btn-secondary">前往單據管理</Link>}
        </div>
      </div>

      <div className="erp-card">
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>星期</th>
                <th>時段</th>
                <th>人數</th>
                <th>訂位代號</th>
                <th>姓名</th>
                <th>電話</th>
                <th>訂金</th>
                <th>分店</th>
                <th>備註</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={11} style={{ textAlign: "center", color: "var(--gray-400)" }}>載入中...</td></tr>
              )}
              {!loading && bookings.map((b) => (
                <tr key={b.id}>
                  <td>{b.bookingDate}</td>
                  <td>週{WEEKDAYS[parseDateOnly(b.bookingDate).getDay()]}</td>
                  <td>{b.timeSlot ?? "—"}</td>
                  <td>{b.partySize ?? "—"}</td>
                  <td className="font-mono">{b.bookingCode ?? "—"}</td>
                  <td>{b.customerName ?? "—"}</td>
                  <td>{b.customerPhone ?? "—"}</td>
                  <td>{formatCurrency(b.depositAmount)}</td>
                  <td>{b.branch ?? "—"}</td>
                  <td>{b.note ?? "—"}</td>
                  <td>
                    {b.bookingCode ? (
                      <Link href={`/bookings/${b.id}/edit`} className="btn btn-primary" style={{ padding: "4px 10px", fontSize: 13 }}>銷售</Link>
                    ) : (
                      <Link href={`/bookings/${b.id}/edit`} className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 13 }}>編輯</Link>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && bookings.length === 0 && (
                <tr><td colSpan={11} style={{ textAlign: "center", color: "var(--gray-400)" }}>目前沒有可以銷售的{category}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

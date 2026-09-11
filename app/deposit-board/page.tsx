"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { WEEKDAYS, parseDateOnly } from "@/lib/quote";

type Booking = {
  id: string;
  category: string;
  branch: string | null;
  bookingDate: string;
  bookingCode: string | null;
  customerName: string | null;
  customerPhone: string | null;
  status: "unsold" | "reserved" | "sold" | "refunded";
  depositAmount: string | number | null;
  depositPayer: string | null;
};

const statusLabel: Record<Booking["status"], string> = { unsold: "未售出", reserved: "訂", sold: "售", refunded: "退" };

export default function DepositBoardPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [isVendorStaff, setIsVendorStaff] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => res.json())
      .then((me) => setIsVendorStaff((me.roles ?? []).includes("vendor_staff") && !(me.roles ?? []).includes("vendor")));
    fetch("/api/deposit-board")
      .then((res) => res.json())
      .then((data) => {
        setBookings(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  }, []);

  const total = bookings.reduce((s, b) => s + (b.depositAmount ? Number(b.depositAmount) : 0), 0);

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">訂金付款看板</h1>
          <p className="erp-page-subtitle">
            {isVendorStaff ? "列出付款人員是自己的單據，方便盤點自己的訂金付款狀況" : "列出底下全部有填訂金的單據，方便盤點訂金付款狀況"}
          </p>
        </div>
      </div>

      <div className="erp-card">
        <div className="erp-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="erp-card-title">共 {bookings.length} 筆</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--brand-700)" }}>訂金總額　{formatCurrency(total)}</span>
        </div>
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>日期</th><th>星期</th><th>分店</th><th>類別</th><th>訂位代號</th>
                <th>姓名</th><th>電話</th><th>狀態</th><th>訂金</th><th>付款人員</th>
              </tr>
            </thead>
            <tbody>
              {!loading && bookings.map((b) => (
                <tr key={b.id}>
                  <td>{b.bookingDate}</td>
                  <td>週{WEEKDAYS[parseDateOnly(b.bookingDate).getDay()]}</td>
                  <td>{b.branch ?? "—"}</td>
                  <td>{b.category}</td>
                  <td className="font-mono">{b.bookingCode ?? "—"}</td>
                  <td>{b.customerName ?? "—"}</td>
                  <td>{b.customerPhone ?? "—"}</td>
                  <td>{statusLabel[b.status]}</td>
                  <td>{formatCurrency(b.depositAmount)}</td>
                  <td>{b.depositPayer ?? "—"}</td>
                </tr>
              ))}
              {!loading && bookings.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: "center", color: "var(--gray-400)" }}>目前沒有填訂金的單據</td></tr>
              )}
              {loading && (
                <tr><td colSpan={10} style={{ textAlign: "center", color: "var(--gray-400)" }}>載入中...</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

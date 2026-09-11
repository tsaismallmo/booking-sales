"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { WEEKDAYS, parseDateOnly } from "@/lib/quote";

type Vendor = { id: string; name: string | null; email: string; roles: string[] };

type ShareBooking = {
  id: string;
  category: string;
  bookingDate: string;
  partySize: number;
  actualFee: number;
  vendorProfit: number;
  branch: string | null;
  customerName: string | null;
  actualBooker: string | null;
  bookingCode: string | null;
};

type DetailReport = {
  mode: "detail";
  vendorId: string | null;
  bookings: ShareBooking[];
  totals: { vendorProfit: number; count: number };
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function monthRange(monthStr: string) {
  const [y, m] = monthStr.split("-").map(Number);
  const from = `${y}-${pad2(m)}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${y}-${pad2(m)}-${pad2(lastDay)}`;
  return { from, to };
}

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export default function VendorStaffSharePage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isVendor, setIsVendor] = useState(false);
  const [isVendorStaff, setIsVendorStaff] = useState(false);
  const [myId, setMyId] = useState("");

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState(""); // 管理員專用

  const [month, setMonth] = useState(currentMonthStr());
  const [report, setReport] = useState<DetailReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => res.json())
      .then((me) => {
        const roles: string[] = me.roles ?? [];
        setIsAdmin(roles.includes("admin"));
        setIsVendor(roles.includes("vendor"));
        setIsVendorStaff(roles.includes("vendor_staff"));
        setMyId(me.id);
      });
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/directory")
      .then((res) => res.json())
      .then((data) => setVendors((Array.isArray(data) ? data : []).filter((a: Vendor) => a.roles.includes("vendor"))));
  }, [isAdmin]);

  // 廠商本人跟廠商員工不用自己選，直接看自己（廠商員工看所屬廠商）的資料；管理員要自己選一個廠商
  const activeVendorId = isVendor || isVendorStaff ? myId : selectedVendorId;

  useEffect(() => {
    if (!activeVendorId) return;
    const { from, to } = monthRange(month);
    const qs = new URLSearchParams({ from, to, vendorId: activeVendorId });
    fetch(`/api/platform-share/report?${qs.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setReport(data);
        setLoading(false);
      });
  }, [activeVendorId, month]);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-");
    return `${y} 年 ${Number(m)} 月`;
  }, [month]);

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">廠商員工分潤</h1>
          <p className="erp-page-subtitle">
            列出已售出訂單的廠商利潤（實收代訂費扣掉平台費後的金額），方便廠商自己再分給旗下員工。依「售出日期」算月份（不是訂位日期）
          </p>
        </div>
      </div>

      <div className="erp-card" style={{ marginBottom: 16 }}>
        <div className="erp-card-body" style={{ padding: "12px 16px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input type="month" className="erp-input" style={{ maxWidth: 160 }} value={month} onChange={(e) => setMonth(e.target.value)} />
          {isAdmin && !isVendor && !isVendorStaff && (
            <select className="erp-select" style={{ maxWidth: 220 }} value={selectedVendorId} onChange={(e) => setSelectedVendorId(e.target.value)}>
              <option value="">請選擇廠商</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name || v.email}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {isAdmin && !isVendor && !isVendorStaff && !selectedVendorId && (
        <div className="erp-card"><div className="erp-card-body" style={{ textAlign: "center", color: "var(--gray-400)" }}>請先選擇要看哪個廠商</div></div>
      )}

      {loading && activeVendorId && <div style={{ textAlign: "center", color: "var(--gray-400)", padding: 30 }}>載入中...</div>}

      {!loading && report && (
        <div className="erp-card">
          <div className="erp-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="erp-card-title">{monthLabel}　已售 {report.bookings.length} 筆</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--brand-700)" }}>廠商利潤總額　{formatCurrency(report.totals.vendorProfit)}</span>
          </div>
          <div className="erp-table-wrap">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>日期</th><th>星期</th><th>分店</th><th>訂位代號</th><th>姓名</th><th>人數</th>
                  <th>實際訂位人員</th>
                  <th>實收代訂費</th>
                  <th>廠商利潤</th>
                </tr>
              </thead>
              <tbody>
                {report.bookings.map((b) => (
                  <tr key={b.id}>
                    <td>{b.bookingDate}</td>
                    <td>週{WEEKDAYS[parseDateOnly(b.bookingDate).getDay()]}</td>
                    <td>{b.branch ?? "—"}</td>
                    <td className="font-mono">{b.bookingCode ?? "—"}</td>
                    <td>{b.customerName ?? "—"}</td>
                    <td>{b.partySize}</td>
                    <td>{b.actualBooker ?? "—"}</td>
                    <td>{formatCurrency(b.actualFee)}</td>
                    <td>{formatCurrency(b.vendorProfit)}</td>
                  </tr>
                ))}
                {report.bookings.length === 0 && (
                  <tr><td colSpan={9} style={{ textAlign: "center", color: "var(--gray-400)" }}>這個月沒有可計算的資料（要已售出、有填代訂費）</td></tr>
                )}
              </tbody>
              {report.bookings.length > 0 && (
                <tfoot>
                  <tr style={{ fontWeight: 600 }}>
                    <td colSpan={7}>總計</td>
                    <td>{formatCurrency(report.bookings.reduce((s, b) => s + b.actualFee, 0))}</td>
                    <td>{formatCurrency(report.totals.vendorProfit)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

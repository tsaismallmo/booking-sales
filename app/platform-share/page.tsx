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
  platformFeeBase: number | null;
  platformFeeRate: number;
  platformFee: number;
  vendorProfit: number;
  branch: string | null;
  customerName: string | null;
  bookingCode: string | null;
};

type DetailReport = {
  mode: "detail";
  vendorId: string;
  platformFeeRate: number;
  bookings: ShareBooking[];
  totals: { platformFee: number; vendorProfit: number; count: number };
};

type SummaryReport = {
  mode: "summary";
  vendors: { vendorId: string; vendorName: string; bookingCount: number; platformFee: number; vendorProfit: number }[];
  totals: { platformFee: number; vendorProfit: number; count: number };
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

export default function PlatformSharePage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isVendor, setIsVendor] = useState(false);
  const [myId, setMyId] = useState("");

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState(""); // 管理員專用，空字串＝全部廠商彙總

  const [month, setMonth] = useState(currentMonthStr());
  const [report, setReport] = useState<DetailReport | SummaryReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => res.json())
      .then((me) => {
        const roles: string[] = me.roles ?? [];
        setIsAdmin(roles.includes("admin"));
        setIsVendor(roles.includes("vendor"));
        setMyId(me.id);
      });
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/accounts")
      .then((res) => res.json())
      .then((data) => setVendors((Array.isArray(data) ? data : []).filter((a: Vendor) => a.roles.includes("vendor"))));
  }, [isAdmin]);

  const activeVendorId = isVendor ? myId : selectedVendorId;

  useEffect(() => {
    // 純管理員即使還沒選廠商也要抓（會是全部廠商彙總）；有廠商身份的人要等自己的 id 載入才抓
    const ready = (isAdmin && !isVendor) || !!activeVendorId;
    if (!ready) return;
    const { from, to } = monthRange(month);
    const qs = new URLSearchParams({ from, to });
    if (activeVendorId) qs.set("vendorId", activeVendorId);
    fetch(`/api/platform-share/report?${qs.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setReport(data);
        setLoading(false);
      });
  }, [activeVendorId, month, isAdmin, isVendor, selectedVendorId]);

  const detail = report?.mode === "detail" ? report : null;
  const summary = report?.mode === "summary" ? report : null;

  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-");
    return `${y} 年 ${Number(m)} 月`;
  }, [month]);

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">平台分潤</h1>
          <p className="erp-page-subtitle">
            已售出訂單的代訂費分潤試算，依「售出日期」算月份（不是訂位日期），平台費率依廠商每個月各別設定（只有廠商本人跟管理員看得到）
          </p>
        </div>
      </div>

      <div className="erp-card" style={{ marginBottom: 16 }}>
        <div className="erp-card-body" style={{ padding: "12px 16px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input type="month" className="erp-input" style={{ maxWidth: 160 }} value={month} onChange={(e) => setMonth(e.target.value)} />
          {isAdmin && !isVendor && (
            <select className="erp-select" style={{ maxWidth: 220 }} value={selectedVendorId} onChange={(e) => setSelectedVendorId(e.target.value)}>
              <option value="">全部廠商（彙總）</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name || v.email}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {loading && <div style={{ textAlign: "center", color: "var(--gray-400)", padding: 30 }}>載入中...</div>}

      {!loading && summary && (
        <div className="erp-card">
          <div className="erp-card-header"><span className="erp-card-title">{monthLabel}　全部廠商彙總</span></div>
          <div className="erp-table-wrap">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>廠商</th><th>已售筆數</th><th>平台費</th><th>廠商利潤</th>
                </tr>
              </thead>
              <tbody>
                {summary.vendors.map((v) => (
                  <tr key={v.vendorId}>
                    <td>{v.vendorName}</td>
                    <td>{v.bookingCount}</td>
                    <td>{formatCurrency(v.platformFee)}</td>
                    <td>{formatCurrency(v.vendorProfit)}</td>
                  </tr>
                ))}
                {summary.vendors.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--gray-400)" }}>這個月沒有可計算的資料</td></tr>
                )}
              </tbody>
              {summary.vendors.length > 0 && (
                <tfoot>
                  <tr style={{ fontWeight: 600 }}>
                    <td>總計</td>
                    <td>{summary.totals.count}</td>
                    <td>{formatCurrency(summary.totals.platformFee)}</td>
                    <td>{formatCurrency(summary.totals.vendorProfit)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {!loading && detail && (
        <div className="erp-card">
          <div className="erp-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="erp-card-title">{monthLabel}　已售 {detail.bookings.length} 筆</span>
            <span style={{ fontSize: 13, color: "var(--gray-500)" }}>本月平台費率　{detail.platformFeeRate}%</span>
          </div>
          <div className="erp-table-wrap">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>日期</th><th>星期</th><th>分店</th><th>訂位代號</th><th>姓名</th><th>人數</th>
                  <th>實收代訂費</th>
                  <th>平台費</th>
                  <th>廠商利潤</th>
                </tr>
              </thead>
              <tbody>
                {detail.bookings.map((b) => (
                  <tr key={b.id}>
                    <td>{b.bookingDate}</td>
                    <td>週{WEEKDAYS[parseDateOnly(b.bookingDate).getDay()]}</td>
                    <td>{b.branch ?? "—"}</td>
                    <td className="font-mono">{b.bookingCode ?? "—"}</td>
                    <td>{b.customerName ?? "—"}</td>
                    <td>{b.partySize}</td>
                    <td>{formatCurrency(b.actualFee)}</td>
                    <td>
                      {formatCurrency(b.platformFee)}
                      {b.platformFeeBase !== null && (
                        <div style={{ fontSize: 11, color: "var(--brand-600)" }}>以 {formatCurrency(b.platformFeeBase)} 計費</div>
                      )}
                    </td>
                    <td>{formatCurrency(b.vendorProfit)}</td>
                  </tr>
                ))}
                {detail.bookings.length === 0 && (
                  <tr><td colSpan={9} style={{ textAlign: "center", color: "var(--gray-400)" }}>這個月沒有可計算的資料（要已售出、有填代訂費）</td></tr>
                )}
              </tbody>
              {detail.bookings.length > 0 && (
                <tfoot>
                  <tr style={{ fontWeight: 600 }}>
                    <td colSpan={6}>總計</td>
                    <td>{formatCurrency(detail.bookings.reduce((s, b) => s + b.actualFee, 0))}</td>
                    <td>{formatCurrency(detail.totals.platformFee)}</td>
                    <td>{formatCurrency(detail.totals.vendorProfit)}</td>
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

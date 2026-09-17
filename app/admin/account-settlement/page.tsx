"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { WEEKDAYS, parseDateOnly } from "@/lib/quote";

type SettlementBooking = {
  id: string;
  bookingDate: string;
  branch: string | null;
  bookingCode: string | null;
  account: string;
  vendorId: string | null;
  vendorName: string;
  actualFee: number;
  vendorProfit: number;
  platformFee: number;
};

type AccountGroup = {
  account: string;
  bookings: SettlementBooking[];
  vendorTotals: { vendorName: string; amount: number }[];
  platformFeeTotal: number;
};

type Report = {
  accounts: AccountGroup[];
  totals: { vendorProfitTotal: number; platformFeeTotal: number; count: number };
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

export default function AccountSettlementPage() {
  const [month, setMonth] = useState(currentMonthStr());
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { from, to } = monthRange(month);
    const qs = new URLSearchParams({ from, to });
    fetch(`/api/admin/account-settlement?${qs.toString()}`)
      .then((res) => res.json())
      .then((data: Report) => {
        setReport(data);
        setLoading(false);
      });
  }, [month]);

  const monthLabel = (() => {
    const [y, m] = month.split("-");
    return `${y} 年 ${Number(m)} 月`;
  })();

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">帳務對帳</h1>
          <p className="erp-page-subtitle">
            依「帳戶」分組列出賣出單據的錢要轉給誰：收款帳戶要把廠商利潤（代訂費扣平台費後）轉給這張單的廠商，平台費轉給雅婷。依「售出日期」算月份
          </p>
        </div>
      </div>

      <div className="erp-card" style={{ marginBottom: 16 }}>
        <div className="erp-card-body" style={{ padding: "12px 16px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input type="month" className="erp-input" style={{ maxWidth: 160 }} value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
      </div>

      {loading && <div style={{ textAlign: "center", color: "var(--gray-400)", padding: 30 }}>載入中...</div>}

      {!loading && report && (
        <>
          <div className="erp-card" style={{ marginBottom: 16 }}>
            <div className="erp-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="erp-card-title">{monthLabel}　總計 {report.totals.count} 筆</span>
              <div style={{ display: "flex", gap: 20 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--brand-700)" }}>廠商利潤總額　{formatCurrency(report.totals.vendorProfitTotal)}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--brand-700)" }}>平台費總額（歸雅婷）　{formatCurrency(report.totals.platformFeeTotal)}</span>
              </div>
            </div>
          </div>

          {report.accounts.length === 0 && (
            <div className="erp-card"><div className="erp-card-body" style={{ textAlign: "center", color: "var(--gray-400)" }}>這個月沒有可計算的資料（要已售出、有填帳戶）</div></div>
          )}

          {report.accounts.map((group) => (
            <div key={group.account} className="erp-card" style={{ marginBottom: 16 }}>
              <div className="erp-card-header">
                <span className="erp-card-title">帳戶：{group.account}　{group.bookings.length} 筆</span>
              </div>
              <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--gray-200)" }}>
                <div style={{ fontSize: 12, color: "var(--gray-400)", marginBottom: 6 }}>轉帳指示</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {group.vendorTotals.map((v) => (
                    <span key={v.vendorName} style={{ fontSize: 13 }}>
                      {group.account} → <strong>{v.vendorName}</strong>：{formatCurrency(v.amount)}
                    </span>
                  ))}
                  <span style={{ fontSize: 13 }}>
                    {group.account} → <strong>雅婷</strong>（平台費）：{formatCurrency(group.platformFeeTotal)}
                  </span>
                </div>
              </div>
              <div className="erp-table-wrap">
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th>日期</th><th>星期</th><th>分店</th><th>訂位代號</th><th>廠商</th>
                      <th>實收代訂費</th><th>廠商利潤</th><th>平台費</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.bookings.map((b) => (
                      <tr key={b.id}>
                        <td>{b.bookingDate}</td>
                        <td>週{WEEKDAYS[parseDateOnly(b.bookingDate).getDay()]}</td>
                        <td>{b.branch ?? "—"}</td>
                        <td className="font-mono">{b.bookingCode ?? "—"}</td>
                        <td>{b.vendorName}</td>
                        <td>{formatCurrency(b.actualFee)}</td>
                        <td>{formatCurrency(b.vendorProfit)}</td>
                        <td>{formatCurrency(b.platformFee)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

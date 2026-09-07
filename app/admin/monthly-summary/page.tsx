"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils";

type MonthSummary = {
  month: string;
  bookingCount: number;
  agencyFeeTotal: number;
  collectedAmountTotal: number;
  depositAmountTotal: number;
  vendorProfitTotal: number;
  platformFeeTotal: number;
  csShareTotal: number;
  platformNetTotal: number;
};

export default function MonthlySummaryPage() {
  const [months, setMonths] = useState<MonthSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/monthly-summary?months=12")
      .then((res) => res.json())
      .then((data) => {
        setMonths(Array.isArray(data.months) ? data.months : []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">每月金流總覽</h1>
          <p className="erp-page-subtitle">
            近 12 個月，依售出日期彙總（只算現貨單、已售出的）：代訂費、收款、訂金、廠商分潤、平台費、客服分潤（只有管理員看得到）
          </p>
        </div>
      </div>

      {loading && <div style={{ textAlign: "center", color: "var(--gray-400)", padding: 30 }}>載入中...</div>}

      {!loading && (
        <div className="erp-card">
          <div className="erp-table-wrap">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>月份</th>
                  <th>已售筆數</th>
                  <th>代訂費總額</th>
                  <th>收款金額總額</th>
                  <th>訂金總額</th>
                  <th>廠商分潤</th>
                  <th>平台費（含客服分潤）</th>
                  <th>客服分潤</th>
                  <th>平台淨收</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.month}>
                    <td style={{ fontWeight: 600 }}>{m.month}</td>
                    <td>{m.bookingCount}</td>
                    <td>{formatCurrency(m.agencyFeeTotal)}</td>
                    <td>{formatCurrency(m.collectedAmountTotal)}</td>
                    <td>{formatCurrency(m.depositAmountTotal)}</td>
                    <td>{formatCurrency(m.vendorProfitTotal)}</td>
                    <td>{formatCurrency(m.platformFeeTotal)}</td>
                    <td>{formatCurrency(m.csShareTotal)}</td>
                    <td>{formatCurrency(m.platformNetTotal)}</td>
                  </tr>
                ))}
                {months.length === 0 && (
                  <tr><td colSpan={9} style={{ textAlign: "center", color: "var(--gray-400)" }}>沒有資料</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--gray-500)", borderTop: "1px solid var(--gray-100)" }}>
            代訂費總額 = 廠商分潤 + 平台費（含客服分潤）；平台費（含客服分潤） = 平台淨收 + 客服分潤
          </div>
        </div>
      )}
    </div>
  );
}

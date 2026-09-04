"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { WEEKDAYS, parseDateOnly } from "@/lib/quote";

type Vendor = { id: string; name: string | null; email: string; roles: string[] };

type RateSettings = { weekdayRate: number; weekendRate: number; platformFeePerPerson: number };

type ShareBooking = {
  id: string;
  bookingDate: string;
  partySize: number;
  actualFee: number;
  normalFee: number;
  platformFee: number;
  vendorProfit: number;
  discounted: boolean;
  branch: string | null;
  customerName: string | null;
  bookingCode: string | null;
};

type DetailReport = {
  mode: "detail";
  vendorId: string;
  rates: RateSettings;
  bookings: ShareBooking[];
  totals: { platformFee: number; vendorProfit: number; count: number; discountedCount: number };
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

  const [rateForm, setRateForm] = useState<RateSettings>({ weekdayRate: 300, weekendRate: 300, platformFeePerPerson: 100 });
  const [savingRates, setSavingRates] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

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
        if (data.mode === "detail") setRateForm(data.rates);
      });
  }, [activeVendorId, month, isAdmin, isVendor, selectedVendorId]);

  const handleSaveRates = async () => {
    setSavingRates(true);
    setSaveMsg("");
    const body: RateSettings & { vendorId?: string } = { ...rateForm };
    if (isAdmin && !isVendor) body.vendorId = selectedVendorId;
    const res = await fetch("/api/platform-share/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSavingRates(false);
    if (res.ok) {
      setSaveMsg("已儲存");
      const { from, to } = monthRange(month);
      const qs = new URLSearchParams({ from, to });
      if (activeVendorId) qs.set("vendorId", activeVendorId);
      fetch(`/api/platform-share/report?${qs.toString()}`)
        .then((res) => res.json())
        .then((data) => setReport(data));
    } else {
      setSaveMsg("儲存失敗");
    }
  };

  const canEditRates = isVendor || (isAdmin && !!selectedVendorId);

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
          <p className="erp-page-subtitle">現貨單已售出訂單的代訂費分潤試算（只有廠商本人跟管理員看得到）</p>
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

      {!loading && canEditRates && (
        <div className="erp-card" style={{ marginBottom: 16 }}>
          <div className="erp-card-header"><span className="erp-card-title">代訂費率設定</span></div>
          <div className="erp-card-body" style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
              正常代訂費（平日）
              <input type="number" min={0} className="erp-input" value={rateForm.weekdayRate} onChange={(e) => setRateForm({ ...rateForm, weekdayRate: Number(e.target.value) || 0 })} />
            </label>
            <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
              正常代訂費（假日）
              <input type="number" min={0} className="erp-input" value={rateForm.weekendRate} onChange={(e) => setRateForm({ ...rateForm, weekendRate: Number(e.target.value) || 0 })} />
            </label>
            <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
              平台費（每人）
              <input type="number" min={0} className="erp-input" value={rateForm.platformFeePerPerson} onChange={(e) => setRateForm({ ...rateForm, platformFeePerPerson: Number(e.target.value) || 0 })} />
            </label>
            <button className="btn btn-primary" onClick={handleSaveRates} disabled={savingRates}>{savingRates ? "儲存中..." : "儲存設定"}</button>
            <span style={{ fontSize: 13, color: "var(--color-success)" }}>{saveMsg}</span>
          </div>
        </div>
      )}

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
          <div className="erp-card-header">
            <span className="erp-card-title">
              {monthLabel}　已售 {detail.totals.count} 筆
              {detail.totals.discountedCount > 0 && `（其中 ${detail.totals.discountedCount} 筆有優惠）`}
            </span>
          </div>
          <div className="erp-table-wrap">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>日期</th><th>星期</th><th>分店</th><th>訂位代號</th><th>姓名</th><th>人數</th>
                  <th>實收代訂費</th><th>正常代訂費</th><th>平台費</th><th>廠商利潤</th><th>備註</th>
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
                    <td>{formatCurrency(b.normalFee)}</td>
                    <td>{formatCurrency(b.platformFee)}</td>
                    <td>{formatCurrency(b.vendorProfit)}</td>
                    <td>{b.discounted && <span className="badge badge-warning">有優惠</span>}</td>
                  </tr>
                ))}
                {detail.bookings.length === 0 && (
                  <tr><td colSpan={11} style={{ textAlign: "center", color: "var(--gray-400)" }}>這個月沒有可計算的資料（要現貨單、已售出、有填代訂費）</td></tr>
                )}
              </tbody>
              {detail.bookings.length > 0 && (
                <tfoot>
                  <tr style={{ fontWeight: 600 }}>
                    <td colSpan={8}>總計</td>
                    <td>{formatCurrency(detail.totals.platformFee)}</td>
                    <td>{formatCurrency(detail.totals.vendorProfit)}</td>
                    <td></td>
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

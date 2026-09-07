"use client";

import { useEffect, useMemo, useState } from "react";

type VendorRate = {
  vendorId: string;
  name: string;
  email: string;
  platformFeeRate: number;
  bookingCount: number;
};

type CsStaffShare = { salespersonId: string; name: string; bookingCount: number };
type CsSummaryReport = { mode: "summary"; staff: CsStaffShare[]; totals: { count: number } };

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function defaultMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

function monthRange(monthStr: string) {
  const [y, m] = monthStr.split("-").map(Number);
  const from = `${y}-${pad2(m)}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${y}-${pad2(m)}-${pad2(lastDay)}`;
  return { from, to };
}

// 漲幅：上月是 0 的話顯示「新增」而不是無限大的百分比
function growthLabel(prev: number, curr: number): { text: string; color: string } {
  if (prev === 0) {
    if (curr === 0) return { text: "—", color: "var(--gray-400)" };
    return { text: "新增", color: "var(--color-success)" };
  }
  const pct = Math.round(((curr - prev) / prev) * 1000) / 10;
  const color = pct > 0 ? "var(--color-success)" : pct < 0 ? "var(--color-danger)" : "var(--gray-500)";
  return { text: `${pct > 0 ? "+" : ""}${pct}%`, color };
}

export default function AdminRatesPage() {
  const [csShareOfPlatformRate, setCsShareOfPlatformRate] = useState(20);
  const [loadingGlobal, setLoadingGlobal] = useState(true);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [globalSaveMsg, setGlobalSaveMsg] = useState("");

  const [month, setMonth] = useState(defaultMonth());
  const [referenceMonth, setReferenceMonth] = useState("");
  const [vendors, setVendors] = useState<VendorRate[]>([]);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [savingVendor, setSavingVendor] = useState<string | null>(null);
  const [loadingVendors, setLoadingVendors] = useState(true);
  const [error, setError] = useState("");

  const [csThisMonth, setCsThisMonth] = useState<CsSummaryReport | null>(null);
  const [csPrevMonth, setCsPrevMonth] = useState<CsSummaryReport | null>(null);
  const [loadingCsCompare, setLoadingCsCompare] = useState(true);

  const loadVendors = (m: string) => {
    fetch(`/api/admin/vendor-rates?month=${m}`)
      .then((res) => res.json())
      .then((data) => {
        setVendors(Array.isArray(data.vendors) ? data.vendors : []);
        setReferenceMonth(data.referenceMonth ?? "");
        setLoadingVendors(false);
      });
  };

  useEffect(() => {
    fetch("/api/admin/platform-settings")
      .then((res) => res.json())
      .then((data) => {
        setCsShareOfPlatformRate(data.csShareOfPlatformRate);
        setLoadingGlobal(false);
      });
  }, []);

  useEffect(() => {
    loadVendors(month);
  }, [month]);

  useEffect(() => {
    if (!referenceMonth) return;
    const qs = (m: string) => {
      const { from, to } = monthRange(m);
      return new URLSearchParams({ from, to }).toString();
    };
    Promise.all([
      fetch(`/api/cs-share/report?${qs(month)}`).then((res) => res.json()),
      fetch(`/api/cs-share/report?${qs(referenceMonth)}`).then((res) => res.json()),
    ]).then(([thisM, prevM]) => {
      setCsThisMonth(thisM);
      setCsPrevMonth(prevM);
      setLoadingCsCompare(false);
    });
  }, [month, referenceMonth]);

  const csComparisonRows = useMemo(() => {
    if (!csThisMonth) return [];
    const prevMap = new Map((csPrevMonth?.staff ?? []).map((s) => [s.salespersonId, s]));
    const rows = csThisMonth.staff.map((s) => ({
      salespersonId: s.salespersonId,
      name: s.name,
      prevCount: prevMap.get(s.salespersonId)?.bookingCount ?? 0,
      count: s.bookingCount,
    }));
    for (const [id, s] of prevMap) {
      if (!rows.some((r) => r.salespersonId === id)) {
        rows.push({ salespersonId: id, name: s.name, prevCount: s.bookingCount, count: 0 });
      }
    }
    return rows;
  }, [csThisMonth, csPrevMonth]);

  const handleSaveGlobal = async () => {
    setSavingGlobal(true);
    setGlobalSaveMsg("");
    const res = await fetch("/api/admin/platform-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csShareOfPlatformRate }),
    });
    setSavingGlobal(false);
    setGlobalSaveMsg(res.ok ? "已儲存" : "儲存失敗");
  };

  const editKey = (vendorId: string) => `${vendorId}|${month}`;

  const handleSaveVendor = async (vendorId: string) => {
    const key = editKey(vendorId);
    const value = editing[key];
    if (value === undefined) return;
    const platformFeeRate = Number(value);
    if (Number.isNaN(platformFeeRate) || platformFeeRate < 0 || platformFeeRate > 100) {
      setError("平台費率須在 0–100 之間");
      return;
    }
    setSavingVendor(vendorId);
    setError("");
    const res = await fetch(`/api/admin/vendor-rates/${vendorId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, platformFeeRate }),
    });
    setSavingVendor(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "儲存失敗");
      return;
    }
    setEditing((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
    loadVendors(month);
  };

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">分潤設定</h1>
          <p className="erp-page-subtitle">平台分潤依廠商、依月份各別設定（沒設定過的月份用預設 20%，調整某個月不會動到其他月份）；客服分潤是全部客服共用的一個比例（只有管理員看得到、改得到）</p>
        </div>
      </div>

      {error && <div className="erp-alert danger">{error}</div>}

      <div className="erp-card" style={{ marginBottom: 16 }}>
        <div className="erp-card-header"><span className="erp-card-title">客服分潤比例（全部客服共用）</span></div>
        <div className="erp-card-body" style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
          {loadingGlobal ? (
            <span style={{ color: "var(--gray-400)" }}>載入中...</span>
          ) : (
            <>
              <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4, maxWidth: 240 }}>
                客服分潤比例（%）— 從各廠商的平台費裡再抽給銷售的客服
                <input
                  type="number" min={0} max={100} className="erp-input"
                  value={csShareOfPlatformRate}
                  onChange={(e) => setCsShareOfPlatformRate(Number(e.target.value) || 0)}
                />
              </label>
              <button className="btn btn-primary" onClick={handleSaveGlobal} disabled={savingGlobal}>{savingGlobal ? "儲存中..." : "儲存"}</button>
              <span style={{ fontSize: 13, color: "var(--color-success)" }}>{globalSaveMsg}</span>
            </>
          )}
        </div>
      </div>

      <div className="erp-card">
        <div className="erp-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="erp-card-title">各廠商平台費率</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--gray-500)" }}>設定「{month}」的費率，參考{referenceMonth}的已售筆數（依售出日期算，不是訂位日期）</span>
            <input type="month" className="erp-input" style={{ maxWidth: 150 }} value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
        </div>
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>廠商</th><th>{referenceMonth} 已售筆數</th><th>{month} 平台費率（%）</th><th>廠商利潤（%）</th><th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loadingVendors && (
                <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--gray-400)" }}>載入中...</td></tr>
              )}
              {!loadingVendors && vendors.map((v) => {
                const key = editKey(v.vendorId);
                const current = editing[key] ?? String(v.platformFeeRate);
                const dirty = editing[key] !== undefined;
                const vendorPct = 100 - (Number(current) || 0);
                return (
                  <tr key={v.vendorId}>
                    <td>{v.name}</td>
                    <td style={{ fontWeight: 600 }}>{v.bookingCount}</td>
                    <td>
                      <input
                        type="number" min={0} max={100} className="erp-input" style={{ width: 90 }}
                        value={current}
                        onChange={(e) => setEditing((ed) => ({ ...ed, [key]: e.target.value }))}
                      />
                    </td>
                    <td>{vendorPct}</td>
                    <td>
                      <button
                        className="btn btn-primary"
                        style={{ padding: "4px 10px", fontSize: 13 }}
                        disabled={!dirty || savingVendor === v.vendorId}
                        onClick={() => handleSaveVendor(v.vendorId)}
                      >
                        {savingVendor === v.vendorId ? "儲存中..." : "儲存"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!loadingVendors && vendors.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--gray-400)" }}>目前沒有廠商帳號</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="erp-card" style={{ marginTop: 16 }}>
        <div className="erp-card-header"><span className="erp-card-title">客服銷售筆數漲幅比較（{referenceMonth}　vs　{month}）</span></div>
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>客服</th><th>{referenceMonth} 銷售筆數</th><th>{month} 銷售筆數</th><th>漲幅</th>
              </tr>
            </thead>
            <tbody>
              {loadingCsCompare && (
                <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--gray-400)" }}>載入中...</td></tr>
              )}
              {!loadingCsCompare && csComparisonRows.map((r) => {
                const g = growthLabel(r.prevCount, r.count);
                return (
                  <tr key={r.salespersonId}>
                    <td>{r.name}</td>
                    <td>{r.prevCount}</td>
                    <td>{r.count}</td>
                    <td style={{ color: g.color, fontWeight: 600 }}>{g.text}</td>
                  </tr>
                );
              })}
              {!loadingCsCompare && csComparisonRows.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--gray-400)" }}>這兩個月都沒有可計算的資料</td></tr>
              )}
            </tbody>
            {!loadingCsCompare && csComparisonRows.length > 0 && (
              <tfoot>
                {(() => {
                  const g = growthLabel(csPrevMonth?.totals.count ?? 0, csThisMonth?.totals.count ?? 0);
                  return (
                    <tr style={{ fontWeight: 600 }}>
                      <td>總計</td>
                      <td>{csPrevMonth?.totals.count ?? 0}</td>
                      <td>{csThisMonth?.totals.count ?? 0}</td>
                      <td style={{ color: g.color }}>{g.text}</td>
                    </tr>
                  );
                })()}
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

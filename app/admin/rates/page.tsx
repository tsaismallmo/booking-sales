"use client";

import { useEffect, useState } from "react";

type VendorRate = {
  vendorId: string;
  name: string;
  email: string;
  platformFeeRate: number;
  bookingCount: number;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function defaultMonth() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export default function AdminRatesPage() {
  const [csShareOfPlatformRate, setCsShareOfPlatformRate] = useState(20);
  const [loadingGlobal, setLoadingGlobal] = useState(true);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [globalSaveMsg, setGlobalSaveMsg] = useState("");

  const [month, setMonth] = useState(defaultMonth());
  const [vendors, setVendors] = useState<VendorRate[]>([]);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [savingVendor, setSavingVendor] = useState<string | null>(null);
  const [loadingVendors, setLoadingVendors] = useState(true);
  const [error, setError] = useState("");

  const loadVendors = (m: string) => {
    fetch(`/api/admin/vendor-rates?month=${m}`)
      .then((res) => res.json())
      .then((data) => {
        setVendors(Array.isArray(data.vendors) ? data.vendors : []);
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
            <span style={{ fontSize: 12, color: "var(--gray-500)" }}>已售筆數依售出日期算，不是訂位日期</span>
            <input type="month" className="erp-input" style={{ maxWidth: 150 }} value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
        </div>
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>廠商</th><th>{month} 已售筆數</th><th>平台費率（%）</th><th>廠商利潤（%）</th><th>操作</th>
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
    </div>
  );
}

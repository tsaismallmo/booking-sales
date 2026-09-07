"use client";

import { useEffect, useState } from "react";

type Rates = { platformFeeRate: number; csShareOfPlatformRate: number };

export default function AdminRatesPage() {
  const [rates, setRates] = useState<Rates>({ platformFeeRate: 20, csShareOfPlatformRate: 20 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/platform-settings")
      .then((res) => res.json())
      .then((data) => {
        setRates({ platformFeeRate: data.platformFeeRate, csShareOfPlatformRate: data.csShareOfPlatformRate });
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg("");
    setError("");
    const res = await fetch("/api/admin/platform-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rates),
    });
    setSaving(false);
    if (res.ok) {
      setSaveMsg("已儲存");
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "儲存失敗");
    }
  };

  const vendorPct = 100 - rates.platformFeeRate;
  const csEffectivePct = Math.round((rates.platformFeeRate * rates.csShareOfPlatformRate) / 100 * 10) / 10;
  const platformNetPct = rates.platformFeeRate - csEffectivePct;

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">分潤設定</h1>
          <p className="erp-page-subtitle">調整平台分潤跟客服分潤的比例，全站套用（只有管理員看得到、改得到）</p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", color: "var(--gray-400)", padding: 30 }}>載入中...</div>
      ) : (
        <div className="erp-card">
          <div className="erp-card-header"><span className="erp-card-title">平台分潤 / 客服分潤比例</span></div>
          <div className="erp-card-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {error && <div className="erp-alert danger">{error}</div>}

            <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4, maxWidth: 240 }}>
              平台費率（%）— 從現貨單代訂費裡抽成，剩下的是廠商利潤
              <input
                type="number" min={0} max={100} className="erp-input"
                value={rates.platformFeeRate}
                onChange={(e) => setRates({ ...rates, platformFeeRate: Number(e.target.value) || 0 })}
              />
            </label>

            <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4, maxWidth: 280 }}>
              客服分潤比例（%）— 從平台費裡再抽給銷售的客服，不影響廠商的部分
              <input
                type="number" min={0} max={100} className="erp-input"
                value={rates.csShareOfPlatformRate}
                onChange={(e) => setRates({ ...rates, csShareOfPlatformRate: Number(e.target.value) || 0 })}
              />
            </label>

            <div className="erp-card" style={{ background: "var(--gray-50)", border: "none" }}>
              <div className="erp-card-body" style={{ fontSize: 13, color: "var(--gray-600)", lineHeight: 1.9 }}>
                <div>換算下來（以代訂費 100% 為基準）：</div>
                <div>廠商利潤：<strong>{vendorPct}%</strong></div>
                <div>客服分潤：<strong>{csEffectivePct}%</strong></div>
                <div>平台實拿：<strong>{platformNetPct}%</strong></div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? "儲存中..." : "儲存設定"}</button>
              <span style={{ fontSize: 13, color: "var(--color-success)" }}>{saveMsg}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

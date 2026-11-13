"use client";

import { useEffect, useMemo, useState } from "react";

type SalesChannel = { id: string; name: string; baseRate: number; isDefault: boolean };

type VendorRate = {
  vendorId: string;
  name: string;
  email: string;
  coefficient: number;
  bookingCount: number;
  agencyFeeTotal: number;
  byChannel: { channelId: string; channelName: string; count: number; agencyFee: number }[];
};

const formatMoney = (n: number) => `${Math.round(n).toLocaleString()} 元`;

type CsStaffShare = { salespersonId: string; name: string; bookingCount: number };
type CsSummaryReport = { mode: "summary"; staff: CsStaffShare[]; totals: { count: number } };
type CsDetailReport = { mode: "detail" };
type CsReport = CsSummaryReport | CsDetailReport;

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
  const [channels, setChannels] = useState<SalesChannel[]>([]);
  const [channelDraft, setChannelDraft] = useState<Record<string, string>>({});
  const [newChannel, setNewChannel] = useState({ name: "", baseRate: "" });
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [savingVendor, setSavingVendor] = useState<string | null>(null);
  const [loadingVendors, setLoadingVendors] = useState(true);
  const [error, setError] = useState("");

  const [csThisMonth, setCsThisMonth] = useState<CsReport | null>(null);
  const [csPrevMonth, setCsPrevMonth] = useState<CsReport | null>(null);
  const [loadingCsCompare, setLoadingCsCompare] = useState(true);

  const loadVendors = (m: string) => {
    fetch(`/api/admin/vendor-rates?month=${m}`)
      .then((res) => res.json())
      .then((data) => {
        setVendors(Array.isArray(data.vendors) ? data.vendors : []);
        setChannels(Array.isArray(data.channels) ? data.channels : []);
        setReferenceMonth(data.referenceMonth ?? "");
        setLoadingVendors(false);
      });
  };

  useEffect(() => {
    fetch(`/api/admin/platform-settings?month=${month}`)
      .then((res) => res.json())
      .then((data) => {
        setCsShareOfPlatformRate(data.csShareOfPlatformRate);
        setLoadingGlobal(false);
      });
  }, [month]);

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
    if (!csThisMonth || csThisMonth.mode !== "summary") return [];
    const prevStaff = csPrevMonth?.mode === "summary" ? csPrevMonth.staff : [];
    const prevMap = new Map(prevStaff.map((s) => [s.salespersonId, s]));
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

  const csTotalCount = csThisMonth?.mode === "summary" ? csThisMonth.totals.count : 0;
  const csPrevTotalCount = csPrevMonth?.mode === "summary" ? csPrevMonth.totals.count : 0;

  const handleSaveGlobal = async () => {
    setSavingGlobal(true);
    setGlobalSaveMsg("");
    const res = await fetch("/api/admin/platform-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, csShareOfPlatformRate }),
    });
    setSavingGlobal(false);
    setGlobalSaveMsg(res.ok ? "已儲存" : "儲存失敗");
  };

  const editKey = (vendorId: string) => `${vendorId}|${month}`;

  const saveChannel = async (id: string) => {
    setError("");
    const res = await fetch(`/api/sales-channels/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseRate: Number(channelDraft[id]) }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return setError(data.error || "儲存失敗");
    }
    setChannelDraft((d) => { const next = { ...d }; delete next[id]; return next; });
    loadVendors(month);
  };
  const addChannel = async () => {
    setError("");
    const res = await fetch("/api/sales-channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newChannel.name, baseRate: Number(newChannel.baseRate) }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return setError(data.error || "新增失敗");
    }
    setNewChannel({ name: "", baseRate: "" });
    loadVendors(month);
  };

  const handleSaveVendor = async (vendorId: string) => {
    const key = editKey(vendorId);
    const value = editing[key];
    if (value === undefined) return;
    const coefficient = Number(value);
    if (value.trim() === "" || !Number.isFinite(coefficient) || coefficient < 0 || coefficient > 5) {
      setError("係數要在 0–5 之間");
      return;
    }
    setSavingVendor(vendorId);
    setError("");
    const res = await fetch(`/api/admin/vendor-rates/${vendorId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, coefficient }),
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
          <p className="erp-page-subtitle">抽成 ＝ 銷售平台基本 % × 廠商當月係數（沒設定過的月份係數是 1）；客服分潤是全部客服共用的比例，依月份設定。調整某個月不會動到其他月份（只有管理員看得到、改得到）</p>
        </div>
      </div>

      {error && <div className="erp-alert danger">{error}</div>}

      <div className="erp-card" style={{ marginBottom: 16 }}>
        <div className="erp-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="erp-card-title">客服分潤比例（全部客服共用，依月份設定）</span>
          <input type="month" className="erp-input" style={{ maxWidth: 150 }} value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <div className="erp-card-body" style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
          {loadingGlobal ? (
            <span style={{ color: "var(--gray-400)" }}>載入中...</span>
          ) : (
            <>
              <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4, maxWidth: 260 }}>
                「{month}」的客服分潤比例（%）— 從各廠商的平台費裡再抽給銷售的客服
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

      <div className="erp-card" style={{ marginBottom: 16 }}>
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
                  const g = growthLabel(csPrevTotalCount, csTotalCount);
                  return (
                    <tr style={{ fontWeight: 600 }}>
                      <td>總計</td>
                      <td>{csPrevTotalCount}</td>
                      <td>{csTotalCount}</td>
                      <td style={{ color: g.color }}>{g.text}</td>
                    </tr>
                  );
                })()}
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="erp-card" style={{ marginBottom: 16 }}>
        <div className="erp-card-header">
          <span className="erp-card-title">銷售平台基本 %</span>
          <span style={{ fontSize: 12, color: "var(--gray-500)" }}>每個銷售平台固定一個基本 %，實際抽成 ＝ 基本 % × 廠商當月係數</span>
        </div>
        <div className="erp-card-body" style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
          {channels.map((c) => {
            const draft = channelDraft[c.id] ?? String(c.baseRate);
            const dirty = channelDraft[c.id] !== undefined && Number(channelDraft[c.id]) !== c.baseRate;
            return (
              <label key={c.id} style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
                {c.name}{c.isDefault ? "（預設）" : ""}
                <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="number" min={0} max={100} step="0.1" className="erp-input" style={{ width: 90 }} value={draft}
                    onChange={(e) => setChannelDraft((d) => ({ ...d, [c.id]: e.target.value }))} />
                  %
                  <button className="btn btn-primary" style={{ padding: "4px 10px", fontSize: 13 }} disabled={!dirty} onClick={() => saveChannel(c.id)}>儲存</button>
                </span>
              </label>
            );
          })}
          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input className="erp-input" style={{ width: 110 }} placeholder="新平台名稱" value={newChannel.name} onChange={(e) => setNewChannel((n) => ({ ...n, name: e.target.value }))} />
            <input type="number" min={0} max={100} className="erp-input" style={{ width: 80 }} placeholder="基本 %" value={newChannel.baseRate} onChange={(e) => setNewChannel((n) => ({ ...n, baseRate: e.target.value }))} />
            <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 13 }} disabled={!newChannel.name.trim() || newChannel.baseRate === ""} onClick={addChannel}>＋ 新增平台</button>
          </span>
        </div>
      </div>

      <div className="erp-card">
        <div className="erp-card-header">
          <span className="erp-card-title">各廠商係數</span>
          <span style={{ fontSize: 12, color: "var(--gray-500)" }}>設定「{month}」的係數（大於 1 多抽、小於 1 少抽），參考 {referenceMonth} 賣出的成果（依售出日期算，現貨單＋臨時單）</span>
        </div>
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>廠商</th>
                <th>{referenceMonth} 賣出</th>
                {channels.map((c) => <th key={c.id}>{c.name}</th>)}
                <th>{month} 係數</th>
                <th>實際抽成</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loadingVendors && (
                <tr><td colSpan={5 + channels.length} style={{ textAlign: "center", color: "var(--gray-400)" }}>載入中...</td></tr>
              )}
              {!loadingVendors && vendors.map((v) => {
                const key = editKey(v.vendorId);
                const current = editing[key] ?? String(v.coefficient);
                const dirty = editing[key] !== undefined;
                const coef = Number(current);
                return (
                  <tr key={v.vendorId}>
                    <td>{v.name}</td>
                    <td style={{ fontWeight: 600 }}>
                      {v.bookingCount} 筆
                      <div style={{ fontSize: 12, fontWeight: 400, color: "var(--gray-500)" }}>代訂費 {formatMoney(v.agencyFeeTotal)}</div>
                    </td>
                    {channels.map((c) => {
                      const x = v.byChannel.find((b) => b.channelId === c.id);
                      return (
                        <td key={c.id} style={{ fontSize: 13 }}>
                          {x?.count ?? 0} 筆
                          <div style={{ fontSize: 12, color: "var(--gray-500)" }}>{formatMoney(x?.agencyFee ?? 0)}</div>
                        </td>
                      );
                    })}
                    <td>
                      <input
                        type="number" min={0} max={5} step="0.05" className="erp-input" style={{ width: 90 }}
                        value={current}
                        onChange={(e) => setEditing((ed) => ({ ...ed, [key]: e.target.value }))}
                      />
                    </td>
                    <td style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                      {current.trim() !== "" && Number.isFinite(coef)
                        ? channels.map((c) => <div key={c.id}>{c.name} {Number((c.baseRate * coef).toFixed(4))}%</div>)
                        : "—"}
                    </td>
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
                <tr><td colSpan={5 + channels.length} style={{ textAlign: "center", color: "var(--gray-400)" }}>目前沒有廠商帳號</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

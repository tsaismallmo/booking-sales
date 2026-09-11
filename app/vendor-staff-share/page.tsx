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
  customerPhone: string | null;
  actualBooker: string | null;
  bookingCode: string | null;
  staffShareAmount: number | null;
};

type DetailReport = {
  mode: "detail";
  vendorId: string | null;
  bookings: ShareBooking[];
  totals: { vendorProfit: number; count: number };
};

type RosterEntry = { name: string; phone: string | null; listId: string };
type RosterList = { id: string; name: string };

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
  const [staffShareInputs, setStaffShareInputs] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rosterEntries, setRosterEntries] = useState<RosterEntry[]>([]);
  const [rosterLists, setRosterLists] = useState<RosterList[]>([]);

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

  // 「電話歸屬」欄位：只有廠商本人／廠商員工看得到自己（或所屬廠商）的名單資料，
  // 管理員選別的廠商時看不到（名單本來就是廠商自己的資料，管理員沒有存取權限）。
  // 這只是顯示訂位電話/姓名是列在哪份名單裡（打電話當下報的身份），不代表誰真正去操作訂位——
  // 真正的操作人員是 actualBooker（實際訂位人員）欄位，兩個是不同的資訊，都要留著。
  const isVendorSide = isVendor || isVendorStaff;
  useEffect(() => {
    if (!isVendorSide) return;
    fetch("/api/roster")
      .then((res) => res.json())
      .then((data) => setRosterEntries(Array.isArray(data) ? data : []));
    fetch("/api/roster/lists")
      .then((res) => res.json())
      .then((data) => setRosterLists(Array.isArray(data) ? data : []));
  }, [isVendorSide]);

  const rosterListNameById = useMemo(() => new Map(rosterLists.map((l) => [l.id, l.name])), [rosterLists]);

  const findRosterListName = (b: ShareBooking): string | null => {
    const hit = rosterEntries.find((e) => (b.customerPhone && e.phone === b.customerPhone) || (b.customerName && e.name === b.customerName));
    if (!hit) return null;
    return rosterListNameById.get(hit.listId) ?? null;
  };

  // 廠商本人跟廠商員工不用自己選，直接看自己（廠商員工看所屬廠商）的資料；管理員要自己選一個廠商
  const activeVendorId = isVendor || isVendorStaff ? myId : selectedVendorId;

  useEffect(() => {
    if (!activeVendorId) return;
    const { from, to } = monthRange(month);
    const qs = new URLSearchParams({ from, to, vendorId: activeVendorId });
    fetch(`/api/platform-share/report?${qs.toString()}`)
      .then((res) => res.json())
      .then((data: DetailReport) => {
        setReport(data);
        setStaffShareInputs(Object.fromEntries(data.bookings.map((b) => [b.id, b.staffShareAmount === null ? "" : String(b.staffShareAmount)])));
        setLoading(false);
      });
  }, [activeVendorId, month]);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-");
    return `${y} 年 ${Number(m)} 月`;
  }, [month]);

  const canEditStaffShare = isVendor || isAdmin;

  const handleStaffShareBlur = (bookingId: string, value: string, previous: number | null) => {
    const amount = value === "" ? null : Number(value);
    if (amount === previous) return;
    // 先樂觀更新畫面，不等網路回應——PATCH 失敗才復原，避免每次都要等一趟才看到結果
    setReport((r) => r && { ...r, bookings: r.bookings.map((b) => (b.id === bookingId ? { ...b, staffShareAmount: amount } : b)) });
    setSavingId(bookingId);
    fetch(`/api/bookings/${bookingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffShareAmount: value }),
    }).then((res) => {
      setSavingId(null);
      if (res.ok) return;
      setReport((r) => r && { ...r, bookings: r.bookings.map((b) => (b.id === bookingId ? { ...b, staffShareAmount: previous } : b)) });
      setStaffShareInputs((s) => ({ ...s, [bookingId]: previous === null ? "" : String(previous) }));
    });
  };

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
                  {isVendorSide && <th>電話歸屬</th>}
                  <th>實際訂位人員</th>
                  <th>實收代訂費</th>
                  <th>廠商利潤</th>
                  <th>分給員工</th>
                  <th>廠商淨利潤</th>
                </tr>
              </thead>
              <tbody>
                {report.bookings.map((b) => {
                  const netProfit = b.vendorProfit - (b.staffShareAmount ?? 0);
                  return (
                    <tr key={b.id}>
                      <td>{b.bookingDate}</td>
                      <td>週{WEEKDAYS[parseDateOnly(b.bookingDate).getDay()]}</td>
                      <td>{b.branch ?? "—"}</td>
                      <td className="font-mono">{b.bookingCode ?? "—"}</td>
                      <td>{b.customerName ?? "—"}</td>
                      <td>{b.partySize}</td>
                      {isVendorSide && <td>{findRosterListName(b) ?? "—"}</td>}
                      <td>{b.actualBooker ?? "—"}</td>
                      <td>{formatCurrency(b.actualFee)}</td>
                      <td>{formatCurrency(b.vendorProfit)}</td>
                      <td>
                        {canEditStaffShare ? (
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <input
                              type="number"
                              step="0.01"
                              className="erp-input"
                              style={{ width: 100 }}
                              placeholder="0"
                              value={staffShareInputs[b.id] ?? ""}
                              onChange={(e) => setStaffShareInputs((s) => ({ ...s, [b.id]: e.target.value }))}
                              onBlur={(e) => handleStaffShareBlur(b.id, e.target.value, b.staffShareAmount)}
                            />
                            {savingId === b.id && <span style={{ fontSize: 11, color: "var(--gray-400)" }}>儲存中...</span>}
                          </span>
                        ) : (
                          formatCurrency(b.staffShareAmount ?? 0)
                        )}
                      </td>
                      <td>{formatCurrency(netProfit)}</td>
                    </tr>
                  );
                })}
                {report.bookings.length === 0 && (
                  <tr><td colSpan={isVendorSide ? 12 : 11} style={{ textAlign: "center", color: "var(--gray-400)" }}>這個月沒有可計算的資料（要已售出、有填代訂費）</td></tr>
                )}
              </tbody>
              {report.bookings.length > 0 && (
                <tfoot>
                  <tr style={{ fontWeight: 600 }}>
                    <td colSpan={isVendorSide ? 8 : 7}>總計</td>
                    <td>{formatCurrency(report.bookings.reduce((s, b) => s + b.actualFee, 0))}</td>
                    <td>{formatCurrency(report.totals.vendorProfit)}</td>
                    <td>{formatCurrency(report.bookings.reduce((s, b) => s + (b.staffShareAmount ?? 0), 0))}</td>
                    <td>{formatCurrency(report.bookings.reduce((s, b) => s + (b.vendorProfit - (b.staffShareAmount ?? 0)), 0))}</td>
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

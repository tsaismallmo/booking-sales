"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { WEEKDAYS, parseDateOnly } from "@/lib/quote";

type Staff = { id: string; name: string | null; email: string; roles: string[] };

type ShareBooking = {
  id: string;
  category: string;
  bookingDate: string;
  partySize: number | null;
  branch: string | null;
  customerName: string | null;
  bookingCode: string | null;
};

type DetailReport = {
  mode: "detail";
  salespersonId: string;
  bookings: ShareBooking[];
  totals: { csShare: number; count: number };
};

type SummaryReport = {
  mode: "summary";
  staff: { salespersonId: string; name: string; bookingCount: number; csShare: number }[];
  totals: { csShare: number; count: number };
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

export default function CsSharePage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCS, setIsCS] = useState(false);
  const [myId, setMyId] = useState("");

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState(""); // 管理員專用，空字串＝全部客服彙總

  const [month, setMonth] = useState(currentMonthStr());
  const [report, setReport] = useState<DetailReport | SummaryReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => res.json())
      .then((me) => {
        const roles: string[] = me.roles ?? [];
        setIsAdmin(roles.includes("admin"));
        setIsCS(roles.includes("customer_service"));
        setMyId(me.id);
      });
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/accounts")
      .then((res) => res.json())
      .then((data) => setStaffList((Array.isArray(data) ? data : []).filter((a: Staff) => a.roles.includes("customer_service"))));
  }, [isAdmin]);

  const activeStaffId = isCS ? myId : selectedStaffId;

  useEffect(() => {
    const ready = (isAdmin && !isCS) || !!activeStaffId;
    if (!ready) return;
    const { from, to } = monthRange(month);
    const qs = new URLSearchParams({ from, to });
    if (activeStaffId) qs.set("salespersonId", activeStaffId);
    fetch(`/api/cs-share/report?${qs.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setReport(data);
        setLoading(false);
      });
  }, [activeStaffId, month, isAdmin, isCS, selectedStaffId]);

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
          <h1 className="erp-page-title">客服分潤</h1>
        </div>
      </div>

      <div className="erp-card" style={{ marginBottom: 16 }}>
        <div className="erp-card-body" style={{ padding: "12px 16px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input type="month" className="erp-input" style={{ maxWidth: 160 }} value={month} onChange={(e) => setMonth(e.target.value)} />
          {isAdmin && !isCS && (
            <select className="erp-select" style={{ maxWidth: 220 }} value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)}>
              <option value="">全部客服（彙總）</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>{s.name || s.email}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {loading && <div style={{ textAlign: "center", color: "var(--gray-400)", padding: 30 }}>載入中...</div>}

      {!loading && summary && (
        <div className="erp-card">
          <div className="erp-card-header"><span className="erp-card-title">{monthLabel}　全部客服彙總</span></div>
          <div className="erp-table-wrap">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>客服</th><th>已售筆數</th><th>客服分潤</th>
                </tr>
              </thead>
              <tbody>
                {summary.staff.map((s) => (
                  <tr key={s.salespersonId}>
                    <td>{s.name}</td>
                    <td>{s.bookingCount}</td>
                    <td>{formatCurrency(s.csShare)}</td>
                  </tr>
                ))}
                {summary.staff.length === 0 && (
                  <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--gray-400)" }}>這個月沒有可計算的資料</td></tr>
                )}
              </tbody>
              {summary.staff.length > 0 && (
                <tfoot>
                  <tr style={{ fontWeight: 600 }}>
                    <td>總計</td>
                    <td>{summary.totals.count}</td>
                    <td>{formatCurrency(summary.totals.csShare)}</td>
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
            <span className="erp-card-title">{monthLabel}　已售 {detail.totals.count} 筆</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--brand-700)" }}>分潤金額　{formatCurrency(detail.totals.csShare)}</span>
          </div>
          <p style={{ padding: "0 16px", margin: "8px 0 0", fontSize: 12, color: "var(--gray-400)" }}>
            客服分潤不是一單一單分的：全部客服的獎金池 × 你賣出的單量佔全部客服賣出單量的比例，下面只列出算進「已售筆數」的單據
          </p>
          <div className="erp-table-wrap">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>日期</th><th>星期</th><th>分店</th><th>訂位代號</th><th>姓名</th><th>人數</th>
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
                    <td>{b.partySize ?? "—"}</td>
                  </tr>
                ))}
                {detail.bookings.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--gray-400)" }}>這個月沒有掛在你名下已售出的單據</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

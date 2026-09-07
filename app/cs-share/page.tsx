"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { WEEKDAYS, parseDateOnly } from "@/lib/quote";

type Staff = { id: string; name: string | null; email: string; roles: string[] };

type ShareBooking = {
  id: string;
  bookingDate: string;
  partySize: number;
  actualFee: number;
  platformFee: number;
  csShare: number;
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

type Report = DetailReport | SummaryReport;

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

function prevMonthStr(monthStr: string) {
  const [y, m] = monthStr.split("-").map(Number);
  const y2 = m === 1 ? y - 1 : y;
  const m2 = m === 1 ? 12 : m - 1;
  return `${y2}-${pad2(m2)}`;
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

export default function CsSharePage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCS, setIsCS] = useState(false);
  const [myId, setMyId] = useState("");

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState(""); // 管理員專用，空字串＝全部客服彙總

  const [month, setMonth] = useState(currentMonthStr());
  const prevMonth = useMemo(() => prevMonthStr(month), [month]);

  const [report, setReport] = useState<Report | null>(null);
  const [prevReport, setPrevReport] = useState<Report | null>(null);
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
    const qs = (m: string) => {
      const { from, to } = monthRange(m);
      const params = new URLSearchParams({ from, to });
      if (activeStaffId) params.set("salespersonId", activeStaffId);
      return params.toString();
    };
    Promise.all([
      fetch(`/api/cs-share/report?${qs(month)}`).then((res) => res.json()),
      fetch(`/api/cs-share/report?${qs(prevMonth)}`).then((res) => res.json()),
    ]).then(([curr, prev]) => {
      setReport(curr);
      setPrevReport(prev);
      setLoading(false);
    });
  }, [activeStaffId, month, prevMonth, isAdmin, isCS, selectedStaffId]);

  const detail = report?.mode === "detail" ? report : null;
  const summary = report?.mode === "summary" ? report : null;
  const prevSummary = prevReport?.mode === "summary" ? prevReport : null;
  const prevDetail = prevReport?.mode === "detail" ? prevReport : null;

  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-");
    return `${y} 年 ${Number(m)} 月`;
  }, [month]);
  const prevMonthLabel = useMemo(() => {
    const [y, m] = prevMonth.split("-");
    return `${y} 年 ${Number(m)} 月`;
  }, [prevMonth]);

  // 合併這個月跟上個月的客服清單（有些人可能只有其中一個月有資料）
  const comparisonRows = useMemo(() => {
    if (!summary) return [];
    const prevMap = new Map((prevSummary?.staff ?? []).map((s) => [s.salespersonId, s]));
    const rows = summary.staff.map((s) => ({
      salespersonId: s.salespersonId,
      name: s.name,
      prevBookingCount: prevMap.get(s.salespersonId)?.bookingCount ?? 0,
      prevCsShare: prevMap.get(s.salespersonId)?.csShare ?? 0,
      bookingCount: s.bookingCount,
      csShare: s.csShare,
    }));
    // 上個月有資料但這個月沒有的也要列出來（漲幅會是負的或掉到 0）
    for (const [id, s] of prevMap) {
      if (!rows.some((r) => r.salespersonId === id)) {
        rows.push({ salespersonId: id, name: s.name, prevBookingCount: s.bookingCount, prevCsShare: s.csShare, bookingCount: 0, csShare: 0 });
      }
    }
    return rows;
  }, [summary, prevSummary]);

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
        <div className="erp-card" style={{ marginBottom: 16 }}>
          <div className="erp-card-header"><span className="erp-card-title">{prevMonthLabel}　vs　{monthLabel}　漲幅比較</span></div>
          <div className="erp-table-wrap">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>客服</th>
                  <th>{prevMonthLabel} 分潤</th>
                  <th>{monthLabel} 分潤</th>
                  <th>漲幅</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((r) => {
                  const g = growthLabel(r.prevCsShare, r.csShare);
                  return (
                    <tr key={r.salespersonId}>
                      <td>{r.name}</td>
                      <td>{formatCurrency(r.prevCsShare)}</td>
                      <td>{formatCurrency(r.csShare)}</td>
                      <td style={{ color: g.color, fontWeight: 600 }}>{g.text}</td>
                    </tr>
                  );
                })}
                {comparisonRows.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--gray-400)" }}>這兩個月都沒有可計算的資料</td></tr>
                )}
              </tbody>
              {comparisonRows.length > 0 && (
                <tfoot>
                  {(() => {
                    const g = growthLabel(prevSummary?.totals.csShare ?? 0, summary.totals.csShare);
                    return (
                      <tr style={{ fontWeight: 600 }}>
                        <td>總計</td>
                        <td>{formatCurrency(prevSummary?.totals.csShare ?? 0)}</td>
                        <td>{formatCurrency(summary.totals.csShare)}</td>
                        <td style={{ color: g.color }}>{g.text}</td>
                      </tr>
                    );
                  })()}
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

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
        <>
          <div className="erp-card" style={{ marginBottom: 16 }}>
            <div className="erp-card-header"><span className="erp-card-title">{prevMonthLabel}　vs　{monthLabel}　漲幅比較</span></div>
            <div className="erp-card-body" style={{ display: "flex", gap: 24, alignItems: "baseline", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--gray-500)" }}>{prevMonthLabel} 分潤</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{formatCurrency(prevDetail?.totals.csShare ?? 0)}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--gray-500)" }}>{monthLabel} 分潤</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{formatCurrency(detail.totals.csShare)}</div>
              </div>
              {(() => {
                const g = growthLabel(prevDetail?.totals.csShare ?? 0, detail.totals.csShare);
                return (
                  <div>
                    <div style={{ fontSize: 12, color: "var(--gray-500)" }}>漲幅</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: g.color }}>{g.text}</div>
                  </div>
                );
              })()}
            </div>
          </div>

          <div className="erp-card">
            <div className="erp-card-header">
              <span className="erp-card-title">{monthLabel}　已售 {detail.totals.count} 筆</span>
            </div>
            <div className="erp-table-wrap">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>日期</th><th>星期</th><th>分店</th><th>訂位代號</th><th>姓名</th><th>人數</th>
                    <th>實收代訂費</th><th>客服分潤</th>
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
                      <td>{formatCurrency(b.csShare)}</td>
                    </tr>
                  ))}
                  {detail.bookings.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--gray-400)" }}>這個月沒有掛在你名下已售出的現貨單</td></tr>
                  )}
                </tbody>
                {detail.bookings.length > 0 && (
                  <tfoot>
                    <tr style={{ fontWeight: 600 }}>
                      <td colSpan={6}>總計</td>
                      <td>{formatCurrency(detail.bookings.reduce((s, b) => s + b.actualFee, 0))}</td>
                      <td>{formatCurrency(detail.totals.csShare)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

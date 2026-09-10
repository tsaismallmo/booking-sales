"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";

type Booking = {
  id: string;
  vendorId: string | null;
  branch: string | null;
  category: string;
  bookingDate: string;
  timeSlot: string | null;
  partySize: number | null;
  bookingCode: string | null;
  customerName: string | null;
  customerPhone: string | null;
  depositAmount: string | null;
  collectedAmount: string | null;
  soldDate: string | null;
  account: string | null;
  agencyFee: string | null;
};

type Vendor = { id: string; name: string | null };

type BookingRequestRow = { id: string; bookingIds: string[]; status: "pending" | "resolved" };

export default function SoldDashboardPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState("");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [canCreateRequest, setCanCreateRequest] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [requestBooking, setRequestBooking] = useState<Booking | null>(null);
  const [requestForm, setRequestForm] = useState({ note: "", proposedPartySize: "" });
  const [submittingRequest, setSubmittingRequest] = useState(false);

  const loadPendingRequests = () => {
    fetch("/api/booking-requests?status=pending")
      .then((r) => r.json())
      .then((data: BookingRequestRow[]) => {
        setPendingIds(new Set((Array.isArray(data) ? data : []).flatMap((req) => req.bookingIds)));
      });
  };

  useEffect(() => {
    fetch("/api/admin/bookings")
      .then((r) => r.json())
      .then((data) => {
        const rows = (Array.isArray(data) ? data : []).filter(
          (b: Booking) => (b as unknown as { status: string }).status === "sold"
        );
        setBookings(rows);
        setLoading(false);
      });
    fetch("/api/directory")
      .then((r) => r.json())
      .then((data) => {
        const vs = (Array.isArray(data) ? data : []).filter((u: { roles: string[] }) => u.roles.includes("vendor"));
        setVendors(vs);
      });
    fetch("/api/me")
      .then((r) => r.json())
      .then((me) => {
        const roles: string[] = me.roles ?? [];
        // 轉需求只給純客服或管理員，廠商不能發（跟單據詳情頁的規則一致）
        setCanCreateRequest((roles.includes("customer_service") || roles.includes("admin")) && !roles.includes("vendor"));
      });
    loadPendingRequests();
  }, []);

  const handleSubmitRequest = async () => {
    if (!requestBooking) return;
    setSubmittingRequest(true);
    const res = await fetch("/api/booking-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingIds: [requestBooking.id], ...requestForm }),
    });
    setSubmittingRequest(false);
    if (res.ok) {
      setRequestBooking(null);
      setRequestForm({ note: "", proposedPartySize: "" });
      loadPendingRequests();
    }
  };

  const vendorMap = useMemo(() => new Map(vendors.map((v) => [v.id, v.name ?? v.id])), [vendors]);

  const branches = useMemo(
    () => Array.from(new Set(bookings.map((b) => b.branch).filter((b): b is string => !!b))).sort(),
    [bookings]
  );

  const filtered = useMemo(() => {
    let rows = bookings;
    if (branchFilter) rows = rows.filter((b) => b.branch === branchFilter);
    if (vendorFilter !== "all") rows = rows.filter((b) => b.vendorId === vendorFilter);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (b) => (b.customerName ?? "").toLowerCase().includes(q) || (b.customerPhone ?? "").includes(q) || (b.bookingCode ?? "").includes(q)
      );
    }
    return [...rows].sort((a, b) => (b.soldDate ?? "").localeCompare(a.soldDate ?? ""));
  }, [bookings, branchFilter, vendorFilter, search]);

  const totalCollected = useMemo(
    () => filtered.reduce((sum, b) => sum + (b.collectedAmount ? Number(b.collectedAmount) : 0), 0),
    [filtered]
  );

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">已售看板</h1>
          <p className="erp-page-subtitle">已售出單據，共 {loading ? "…" : filtered.length} 筆｜收款合計 {formatCurrency(String(totalCollected))}</p>
        </div>
      </div>

      <div className="erp-card" style={{ marginBottom: 16 }}>
        <div className="erp-card-body" style={{ padding: "12px 16px", display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            className="erp-input"
            placeholder="搜尋姓名、電話、訂位代號..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 240 }}
          />
          <select className="erp-select" style={{ maxWidth: 150 }} value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="">全部分店</option>
            {branches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className="erp-select" style={{ maxWidth: 160 }} value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}>
            <option value="all">全部廠商</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name ?? v.id}</option>)}
          </select>
        </div>
      </div>

      <div className="erp-card">
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>廠商</th>
                <th>售出日期</th>
                <th>分店</th>
                <th>日期</th>
                <th>時段</th>
                <th>人數</th>
                <th>訂位代號</th>
                <th>姓名</th>
                <th>電話</th>
                <th>訂金</th>
                <th>收款金額</th>
                <th>帳戶</th>
                <th>代訂費</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={14} style={{ textAlign: "center", color: "var(--gray-400)" }}>載入中...</td></tr>
              )}
              {!loading && filtered.map((b) => (
                <tr key={b.id}>
                  <td>{b.vendorId ? (vendorMap.get(b.vendorId) ?? "—") : "—"}</td>
                  <td>{b.soldDate ?? "—"}</td>
                  <td>{b.branch ?? "—"}</td>
                  <td>{b.bookingDate}</td>
                  <td>{b.timeSlot ?? "—"}</td>
                  <td>{b.partySize ?? "—"}</td>
                  <td className="font-mono">{b.bookingCode ?? "—"}</td>
                  <td>{b.customerName ?? "—"}</td>
                  <td>{b.customerPhone ?? "—"}</td>
                  <td>{formatCurrency(b.depositAmount)}</td>
                  <td>{formatCurrency(b.collectedAmount)}</td>
                  <td>{b.account ?? "—"}</td>
                  <td>{formatCurrency(b.agencyFee)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <Link href={`/bookings/${b.id}?from=sold`} className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 13 }}>查看</Link>
                      {canCreateRequest && (
                        pendingIds.has(b.id) ? (
                          <span className="badge badge-warning" style={{ fontSize: 11 }}>需求處理中</span>
                        ) : (
                          <button
                            className="btn btn-secondary"
                            style={{ padding: "4px 10px", fontSize: 13 }}
                            onClick={() => { setRequestBooking(b); setRequestForm({ note: "", proposedPartySize: "" }); }}
                          >
                            轉需求
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={14} style={{ textAlign: "center", color: "var(--gray-400)" }}>尚無已售單據</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {requestBooking && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) setRequestBooking(null); }}>
          <div style={{ background: "var(--surface)", borderRadius: 12, padding: "18px 20px", maxWidth: 420, width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, fontSize: 15, fontWeight: 700 }}>
              <span>轉需求</span>
              <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--gray-400)" }} onClick={() => setRequestBooking(null)}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 14 }}>
              {requestBooking.bookingCode ?? "—"} · {requestBooking.branch ?? "—"} · {requestBooking.bookingDate} · {requestBooking.customerName ?? "—"}
            </div>
            <div className="erp-form-grid">
              <div className="erp-form-group">
                <label className="erp-label">改成人數</label>
                <input type="number" className="erp-input" placeholder="不改就留空" value={requestForm.proposedPartySize} onChange={(e) => setRequestForm({ ...requestForm, proposedPartySize: e.target.value })} />
              </div>
              <div className="erp-form-group full">
                <label className="erp-label">說明</label>
                <textarea className="erp-textarea" rows={2} placeholder="給後勤人員的說明" value={requestForm.note} onChange={(e) => setRequestForm({ ...requestForm, note: e.target.value })} />
              </div>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button onClick={handleSubmitRequest} disabled={submittingRequest} className="btn btn-primary">
                {submittingRequest ? "送出中..." : "送出需求"}
              </button>
              <button onClick={() => setRequestBooking(null)} className="btn btn-secondary">取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

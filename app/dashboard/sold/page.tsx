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

export default function SoldDashboardPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState("");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [search, setSearch] = useState("");

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
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data) => {
        const vs = (Array.isArray(data) ? data : []).filter((u: { roles: string[] }) => u.roles.includes("vendor"));
        setVendors(vs);
      });
  }, []);

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
                    <Link href={`/bookings/${b.id}?from=sold`} className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 13 }}>查看</Link>
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
    </div>
  );
}

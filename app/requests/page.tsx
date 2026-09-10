"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type BookingRequest = {
  id: string;
  bookingIds: string[];
  status: "pending" | "resolved";
  note: string | null;
  proposedBranch: string | null;
  proposedBookingDate: string | null;
  proposedTimeSlot: string | null;
  proposedPartySize: number | null;
  createdById: string | null;
  createdAt: string;
};

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
};

type Vendor = { id: string; name: string | null; email: string; roles: string[] };

// 合併需求可能跨廠商，看的人不一定對每一筆都有查看權限（例如廠商只能看自己的），
// 這種情況要跟「單據不存在」分開處理，不能直接把錯誤物件當成單據顯示
type BookingEntry = { kind: "ok"; booking: Booking } | { kind: "restricted"; id: string };

function Field({ label, current, proposed }: { label: string; current: React.ReactNode; proposed: React.ReactNode }) {
  if (proposed == null || proposed === "") return null;
  return (
    <div className="erp-sysinfo-row">
      <span className="erp-sysinfo-key">{label}</span>
      <span className="erp-sysinfo-val">{current} → <strong style={{ color: "var(--brand-600)" }}>{proposed}</strong></span>
    </div>
  );
}

export default function RequestsPage() {
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [bookings, setBookings] = useState<Record<string, BookingEntry>>({});
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [canResolve, setCanResolve] = useState(false);
  const [canSeeVendorNames, setCanSeeVendorNames] = useState(false);
  const [myUserId, setMyUserId] = useState("");
  const [resolvedByNames, setResolvedByNames] = useState<Record<string, string>>({});

  const vendorMap = useMemo(() => new Map(vendors.map((v) => [v.id, v.name ?? v.email])), [vendors]);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => res.json())
      .then((me) => {
        const roles: string[] = me.roles ?? [];
        setCanResolve(roles.includes("logistics") || roles.includes("admin"));
        setMyUserId(me.id ?? "");
        // 廠商自己看到的單一定都是自己的，不需要查廠商名稱，/api/directory 對廠商身份也會擋掉（403）
        const seeVendorNames = roles.includes("admin") || roles.includes("customer_service") || roles.includes("logistics");
        setCanSeeVendorNames(seeVendorNames);
        if (seeVendorNames) {
          fetch("/api/directory")
            .then((res) => res.json())
            .then((data) => {
              const vs = (Array.isArray(data) ? data : []).filter((u: Vendor) => u.roles.includes("vendor"));
              setVendors(vs);
            });
        }
      });
  }, []);

  const load = () => {
    fetch("/api/booking-requests?status=pending")
      .then((res) => res.json())
      .then((data: BookingRequest[]) => {
        const rows = Array.isArray(data) ? data : [];
        setRequests(rows);
        const allIds = Array.from(new Set(rows.flatMap((r) => r.bookingIds)));
        return Promise.all(
          allIds.map((id) =>
            fetch(`/api/bookings/${id}`).then((res): Promise<readonly [string, BookingEntry]> =>
              res.ok
                ? res.json().then((b: Booking) => [id, { kind: "ok", booking: b }] as const)
                : Promise.resolve([id, { kind: "restricted", id }] as const)
            )
          )
        );
      })
      .then((entries) => {
        setBookings(Object.fromEntries(entries));
        setLoading(false);
      });
  };

  useEffect(load, []);

  const handleResolve = async (id: string) => {
    const resolvedByName = (resolvedByNames[id] ?? "").trim();
    if (!resolvedByName) return;
    setResolvingId(id);
    await fetch(`/api/booking-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apply: true, resolvedByName }),
    });
    setResolvingId(null);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("確定要刪除這筆需求嗎？")) return;
    setDeletingId(id);
    await fetch(`/api/booking-requests/${id}`, { method: "DELETE" });
    setDeletingId(null);
    load();
  };

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">需求看板</h1>
          <p className="erp-page-subtitle">客服發起的修改需求，共 {loading ? "…" : requests.length} 筆待處理</p>
        </div>
      </div>

      {loading && <p style={{ color: "var(--gray-400)" }}>載入中...</p>}

      {!loading && requests.length === 0 && (
        <div className="erp-card"><div className="erp-card-body" style={{ textAlign: "center", color: "var(--gray-400)" }}>目前沒有待處理的需求</div></div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {requests.map((r) => {
          const linkedEntries = r.bookingIds.map((id) => bookings[id]).filter((e): e is BookingEntry => !!e);
          const okBookings = linkedEntries.flatMap((e) => (e.kind === "ok" ? [e.booking] : []));
          const b0 = okBookings[0];
          return (
            <div key={r.id} className="erp-card">
              <div className="erp-card-header">
                <span className="erp-card-title">
                  {b0 ? `${linkedEntries.length > 1 ? `合併 ${linkedEntries.length} 筆・` : ""}${b0.category}` : "載入中..."}
                </span>
              </div>
              <div className="erp-card-body erp-sysinfo">
                {linkedEntries.map((e) => e.kind === "restricted" ? (
                  <div key={e.id} style={{ fontSize: 13, color: "var(--gray-400)", marginBottom: 4 }}>
                    （同一組還有一筆其他廠商的單據，沒有查看權限）
                  </div>
                ) : (
                  <div key={e.booking.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 13 }}>
                      {canSeeVendorNames && (
                        <span className="badge badge-navy" style={{ fontSize: 11, marginRight: 4 }}>
                          {e.booking.vendorId ? (vendorMap.get(e.booking.vendorId) ?? "—") : "—"}
                        </span>
                      )}
                      {e.booking.branch ?? "—"}　{e.booking.bookingDate}　{e.booking.timeSlot ?? "—"}　{e.booking.partySize ?? "—"}人
                      {(e.booking.customerName || e.booking.customerPhone) && <>　｜　{e.booking.customerName ?? "—"}　{e.booking.customerPhone ?? "—"}</>}
                    </span>
                    <Link href={`/bookings/${e.booking.id}`} className="btn btn-ghost" style={{ fontSize: 12, padding: "2px 8px" }}>查看單據</Link>
                  </div>
                ))}

                <hr className="erp-divider" />

                {b0 && <Field label="人數" current={b0.partySize ?? "—"} proposed={r.proposedPartySize} />}
                {r.note && (
                  <div className="erp-sysinfo-row">
                    <span className="erp-sysinfo-key">說明</span>
                    <span className="erp-sysinfo-val">{r.note}</span>
                  </div>
                )}
                <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {canResolve && (
                    <input
                      className="erp-input"
                      style={{ maxWidth: 160 }}
                      placeholder="處理人員"
                      value={resolvedByNames[r.id] ?? ""}
                      onChange={(e) => setResolvedByNames((s) => ({ ...s, [r.id]: e.target.value }))}
                    />
                  )}
                  {canResolve && (
                    <button
                      onClick={() => handleResolve(r.id)}
                      disabled={resolvingId === r.id || !(resolvedByNames[r.id] ?? "").trim()}
                      className="btn btn-primary"
                    >
                      {resolvingId === r.id ? "處理中..." : "套用並完成"}
                    </button>
                  )}
                  {(canResolve || r.createdById === myUserId) && (
                    <button onClick={() => handleDelete(r.id)} disabled={deletingId === r.id} className="btn btn-ghost" style={{ color: "var(--color-danger)" }}>
                      {deletingId === r.id ? "刪除中..." : "刪除"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
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
  branch: string | null;
  category: string;
  bookingDate: string;
  timeSlot: string | null;
  partySize: number | null;
  bookingCode: string | null;
  customerName: string | null;
  customerPhone: string | null;
};

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
  const [bookings, setBookings] = useState<Record<string, Booking>>({});
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [canResolve, setCanResolve] = useState(false);
  const [myUserId, setMyUserId] = useState("");
  const [resolvedByNames, setResolvedByNames] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/me")
      .then((res) => res.json())
      .then((me) => {
        const roles: string[] = me.roles ?? [];
        setCanResolve(roles.includes("logistics") || roles.includes("admin"));
        setMyUserId(me.id ?? "");
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
            fetch(`/api/bookings/${id}`)
              .then((res) => res.json())
              .then((b) => [id, b] as const)
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
          const linkedBookings = r.bookingIds.map((id) => bookings[id]).filter((b): b is Booking => !!b);
          const b0 = linkedBookings[0];
          return (
            <div key={r.id} className="erp-card">
              <div className="erp-card-header">
                <span className="erp-card-title">
                  {b0 ? `${linkedBookings.length > 1 ? `合併 ${linkedBookings.length} 筆・` : ""}${b0.category}` : "載入中..."}
                </span>
              </div>
              <div className="erp-card-body erp-sysinfo">
                {linkedBookings.map((b) => (
                  <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 13 }}>
                      {b.branch ?? "—"}　{b.bookingDate}　{b.timeSlot ?? "—"}　{b.partySize ?? "—"}人
                      {(b.customerName || b.customerPhone) && <>　｜　{b.customerName ?? "—"}　{b.customerPhone ?? "—"}</>}
                    </span>
                    <Link href={`/bookings/${b.id}`} className="btn btn-ghost" style={{ fontSize: 12, padding: "2px 8px" }}>查看單據</Link>
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

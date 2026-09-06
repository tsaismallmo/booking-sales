"use client";

import { useEffect, useMemo, useState } from "react";

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
  depositAmount: string | null;
  cancelDeadline: string | null;
  status: "unsold" | "reserved" | "sold" | "refunded";
};

const statusLabel: Record<Booking["status"], string> = {
  unsold: "未售出",
  reserved: "訂",
  sold: "售",
  refunded: "退",
};

const statusBadge: Record<Booking["status"], string> = {
  unsold: "badge badge-gray",
  reserved: "badge badge-warning",
  sold: "badge badge-green",
  refunded: "badge badge-red",
};

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ReminderPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refunding, setRefunding] = useState<string | null>(null);

  const handleRefund = async (id: string) => {
    if (!confirm("確定要將此筆單據退訂（狀態改為「退」）？")) return;
    setRefunding(id);
    const res = await fetch(`/api/bookings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "refunded" }),
    });
    setRefunding(null);
    if (res.ok) {
      setBookings((prev) => prev.filter((b) => b.id !== id));
    }
  };

  useEffect(() => {
    fetch("/api/bookings")
      .then((r) => r.json())
      .then((data) => {
        setBookings(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  }, []);

  const todayStr = today();

  const sorted = useMemo(() => {
    return [...bookings]
      .filter((b) => b.status !== "sold" && b.status !== "refunded")
      .sort((a, b) => {
        const da = a.cancelDeadline ?? "9999";
        const db_ = b.cancelDeadline ?? "9999";
        return da.localeCompare(db_);
      });
  }, [bookings]);

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">退訂提醒</h1>
          <p className="erp-page-subtitle">我的單據，共 {loading ? "…" : sorted.length} 筆（已排除售出與退訂）</p>
        </div>
      </div>

      <div className="erp-card">
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>退訂期限</th>
                <th>狀態</th>
                <th>分店</th>
                <th>日期</th>
                <th>時段</th>
                <th>人數</th>
                <th>訂位代號</th>
                <th>姓名</th>
                <th>電話</th>
                <th>訂金</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={11} style={{ textAlign: "center", color: "var(--gray-400)" }}>載入中...</td></tr>
              )}
              {!loading && sorted.map((b) => {
                const deadline = b.cancelDeadline;
                const isPast = deadline && deadline < todayStr;
                const isToday = deadline === todayStr;
                const isSoon = deadline && deadline > todayStr && deadline <= (() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 3);
                  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                })();

                return (
                  <tr key={b.id} style={isPast ? { background: "rgba(220,38,38,.05)" } : isToday ? { background: "rgba(234,179,8,.07)" } : undefined}>
                    <td>
                      {deadline ? (
                        <span style={{
                          fontWeight: isPast || isToday ? 600 : undefined,
                          color: isPast ? "var(--color-danger)" : isToday ? "var(--color-warning, #b45309)" : isSoon ? "var(--color-warning, #b45309)" : undefined,
                        }}>
                          {deadline}
                          {isPast && " ⚠ 已過期"}
                          {isToday && " ⚠ 今天到期"}
                          {isSoon && !isToday && !isPast && " 即將到期"}
                        </span>
                      ) : "—"}
                    </td>
                    <td><span className={statusBadge[b.status]}>{statusLabel[b.status]}</span></td>
                    <td>{b.branch ?? "—"}</td>
                    <td>{b.bookingDate}</td>
                    <td>{b.timeSlot ?? "—"}</td>
                    <td>{b.partySize ?? "—"}</td>
                    <td className="font-mono">{b.bookingCode ?? "—"}</td>
                    <td>{b.customerName ?? "—"}</td>
                    <td>{b.customerPhone ?? "—"}</td>
                    <td>{b.depositAmount ?? "—"}</td>
                    <td>
                      <button
                        onClick={() => handleRefund(b.id)}
                        disabled={refunding === b.id}
                        className="btn btn-danger"
                        style={{ padding: "4px 10px", fontSize: 13 }}
                      >
                        {refunding === b.id ? "處理中..." : "退訂"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!loading && sorted.length === 0 && (
                <tr><td colSpan={11} style={{ textAlign: "center", color: "var(--gray-400)" }}>目前沒有單據</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

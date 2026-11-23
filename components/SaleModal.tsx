"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { SalesChannelSelect } from "@/components/SalesChannelSelect";
import { formatCurrency } from "@/lib/utils";
import { todayStr } from "@/lib/dates";

export type SaleBooking = {
  id: string;
  branch: string | null;
  bookingDate: string;
  timeSlot: string | null;
  partySize: number | null;
  customerName: string | null;
  customerPhone: string | null;
  bookingCode: string | null;
  depositAmount: string | null;
};

// 銷售／收款視窗（現貨單看板、臨時單看板共用）：填完按「確認售出」把單據改成售出
export function SaleModal({
  booking,
  csStaff,
  onClose,
  onSold,
}: {
  booking: SaleBooking;
  csStaff: { id: string; name: string | null }[];
  onClose: () => void;
  onSold: (id: string) => void;
}) {
  const [form, setForm] = useState({ soldDate: todayStr(), collectedAmount: "", account: "", agencyFee: "", salespersonId: "", salesChannelId: "", buyerName: "", buyerPhone: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async () => {
    setSubmitting(true);
    setError("");
    const res = await fetch(`/api/bookings/${booking.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "sold", ...form }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "儲存失敗");
      return;
    }
    onSold(booking.id);
  };

  return (
    <Modal title="銷售／收款" onClose={onClose}>
      <div className="erp-card-body">
        <div style={{ fontSize: 13, color: "var(--gray-600)", marginBottom: 14, lineHeight: 1.8 }}>
          <div>{booking.branch}　{booking.bookingDate}　{booking.timeSlot}　{booking.partySize} 人</div>
          <div>{booking.customerName}　{booking.customerPhone}</div>
          <div>訂位代號：{booking.bookingCode ?? "—"}　訂金：{formatCurrency(booking.depositAmount)}</div>
        </div>
        <div className="erp-form-grid">
          <div className="erp-form-group">
            <label className="erp-label">買家姓名</label>
            <input className="erp-input" placeholder="賣給哪位客人" value={form.buyerName} onChange={set("buyerName")} />
          </div>
          <div className="erp-form-group">
            <label className="erp-label">買家電話</label>
            <input className="erp-input" inputMode="tel" value={form.buyerPhone} onChange={set("buyerPhone")} />
          </div>
          <div className="erp-form-group">
            <label className="erp-label">售出日期</label>
            <input type="date" className="erp-input" value={form.soldDate} onChange={set("soldDate")} />
          </div>
          <div className="erp-form-group">
            <label className="erp-label">收款金額</label>
            <input type="number" step="0.01" className="erp-input" placeholder="0" value={form.collectedAmount} onChange={set("collectedAmount")} />
          </div>
          <div className="erp-form-group">
            <label className="erp-label">帳戶</label>
            <input className="erp-input" value={form.account} onChange={set("account")} />
          </div>
          <div className="erp-form-group">
            <label className="erp-label">代訂費（總共）</label>
            <input type="number" step="0.01" className="erp-input" placeholder="0" value={form.agencyFee} onChange={set("agencyFee")} />
          </div>
          <div className="erp-form-group">
            <label className="erp-label">銷售平台</label>
            <SalesChannelSelect value={form.salesChannelId} onChange={(v) => setForm((f) => ({ ...f, salesChannelId: v }))} />
          </div>
          <div className="erp-form-group">
            <label className="erp-label">銷售人員</label>
            <select className="erp-select" value={form.salespersonId} onChange={set("salespersonId")}>
              <option value="">— 未指定 —</option>
              {csStaff.map((u) => (
                <option key={u.id} value={u.id}>{u.name ?? u.id}</option>
              ))}
            </select>
          </div>
        </div>
        {error && <div className="erp-alert danger" style={{ marginTop: 10 }}>{error}</div>}
        <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
          <button onClick={submit} disabled={submitting} className="btn btn-primary">
            {submitting ? "儲存中..." : "確認售出"}
          </button>
          <button onClick={onClose} className="btn btn-secondary">取消</button>
        </div>
      </div>
    </Modal>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";

type Booking = Record<string, string | number | null>;

type SmsLog = {
  id: string;
  type: "booking_notice" | "payment_completion";
  rawText: string;
  createdAt: string;
};

type BookingRequest = {
  id: string;
  status: "pending" | "resolved";
};

const statusLabel: Record<string, string> = { unsold: "未售出", reserved: "訂", sold: "售", refunded: "退" };
const smsTypeLabel: Record<SmsLog["type"], string> = { booking_notice: "付款通知簡訊", payment_completion: "付款完成簡訊" };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="erp-sysinfo-row">
      <span className="erp-sysinfo-key">{label}</span>
      <span className="erp-sysinfo-val">{value ?? "—"}</span>
    </div>
  );
}

export default function BookingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromParam = searchParams.get("from");
  const fromSuffix = fromParam ? `?from=${fromParam}` : "";
  const editHref = `/bookings/${params.id}/edit${fromSuffix}`;
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [smsLogs, setSmsLogs] = useState<SmsLog[]>([]);
  const [pendingRequest, setPendingRequest] = useState<BookingRequest | null>(null);
  const [canCreateRequest, setCanCreateRequest] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestForm, setRequestForm] = useState({ note: "", proposedBranch: "", proposedBookingDate: "", proposedTimeSlot: "", proposedPartySize: "" });
  const [submittingRequest, setSubmittingRequest] = useState(false);

  const loadPendingRequest = () => {
    fetch(`/api/booking-requests?bookingId=${params.id}&status=pending`)
      .then((res) => res.json())
      .then((data) => setPendingRequest(Array.isArray(data) && data.length > 0 ? data[0] : null));
  };

  useEffect(() => {
    fetch(`/api/bookings/${params.id}`)
      .then((res) => res.json())
      .then((data) => {
        setBooking(data);
        setLoading(false);
      });
    fetch(`/api/sms-logs?bookingId=${params.id}`)
      .then((res) => res.json())
      .then((data) => setSmsLogs(Array.isArray(data) ? data : []));
    fetch(`/api/booking-requests?bookingId=${params.id}&status=pending`)
      .then((res) => res.json())
      .then((data) => setPendingRequest(Array.isArray(data) && data.length > 0 ? data[0] : null));
    fetch("/api/me")
      .then((res) => res.json())
      .then((me) => {
        const r: string[] = me.roles ?? [];
        setRoles(r);
        // 轉需求只給純客服或管理員，廠商不顯示
        setCanCreateRequest((r.includes("customer_service") || r.includes("admin")) && !r.includes("vendor"));
      });
  }, [params.id]);

  const pureCustomerService = roles.includes("customer_service") && !roles.includes("vendor") && !roles.includes("admin");
  const isRefunded = booking?.status === "refunded";
  const isSold = booking?.status === "sold";
  const canEdit = !isRefunded;
  const canDelete = !(pureCustomerService && booking?.category === "現貨單") && !isSold && !isRefunded;

  const handleSubmitRequest = async () => {
    setSubmittingRequest(true);
    const res = await fetch("/api/booking-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingIds: [params.id], ...requestForm }),
    });
    setSubmittingRequest(false);
    if (res.ok) {
      setShowRequestForm(false);
      setRequestForm({ note: "", proposedBranch: "", proposedBookingDate: "", proposedTimeSlot: "", proposedPartySize: "" });
      loadPendingRequest();
    }
  };

  const handleDelete = async () => {
    if (!confirm("確定要刪除這筆單據嗎？")) return;
    const res = await fetch(`/api/bookings/${params.id}`, { method: "DELETE" });
    if (res.ok) router.back();
  };

  const handleUndoRefund = async () => {
    const res = await fetch(`/api/bookings/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "unsold" }),
    });
    if (res.ok) {
      const data = await res.json();
      setBooking(data);
    }
  };

  const handleUndoSold = async () => {
    if (!confirm("確定要退回售出，將狀態改為未售出？")) return;
    const res = await fetch(`/api/bookings/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "unsold" }),
    });
    if (res.ok) {
      const data = await res.json();
      setBooking(data);
    }
  };

  if (loading) return <div className="erp-page">載入中...</div>;
  if (!booking) return <div className="erp-page">找不到這筆單據</div>;

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">單據詳細資料</h1>
          <p className="erp-page-subtitle">
            {statusLabel[String(booking.status)]} · {booking.bookingDate}
            {pendingRequest && <span className="badge badge-warning" style={{ marginLeft: 8 }}>需求處理中</span>}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {canCreateRequest && !pendingRequest && (
            <button onClick={() => setShowRequestForm((s) => !s)} className="btn btn-secondary">轉需求</button>
          )}
          {isRefunded && (
            <button onClick={handleUndoRefund} className="btn btn-secondary">撤銷退訂</button>
          )}
          {isSold && (
            <button onClick={handleUndoSold} className="btn btn-secondary">退回售出</button>
          )}
          {canEdit && <Link href={editHref} className="btn btn-primary">編輯</Link>}
          {canDelete && <button onClick={handleDelete} className="btn btn-danger">刪除</button>}
          <button onClick={() => router.back()} className="btn btn-secondary">返回</button>
        </div>
      </div>

      {showRequestForm && (
        <div className="erp-card" style={{ marginBottom: 20 }}>
          <div className="erp-card-header"><span className="erp-card-title">轉需求：填寫要修改的內容</span></div>
          <div className="erp-card-body">
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
              <button onClick={() => setShowRequestForm(false)} className="btn btn-secondary">取消</button>
            </div>
          </div>
        </div>
      )}

      <div className="erp-card" style={{ marginBottom: 20 }}>
        <div className="erp-card-header"><span className="erp-card-title">基本資訊</span></div>
        <div className="erp-card-body erp-sysinfo">
          <Row label="分店" value={booking.branch} />
          <Row label="類別" value={booking.category} />
          <Row label="日期" value={booking.bookingDate} />
          <Row label="時段" value={booking.timeSlot} />
          <Row label="人數" value={booking.partySize} />
          <Row label="訂位代號" value={booking.bookingCode} />
          <Row label="退訂期限" value={booking.cancelDeadline} />
          <Row label="付款期限" value={booking.paymentDeadline} />
          <Row label="實際訂位人員" value={booking.actualBooker} />
        </div>
      </div>

      <div className="erp-card" style={{ marginBottom: 20 }}>
        <div className="erp-card-header"><span className="erp-card-title">餐廳端金流</span></div>
        <div className="erp-card-body erp-sysinfo">
          <Row label="訂金" value={formatCurrency(booking.depositAmount)} />
          <Row label="付款人員" value={booking.depositPayer} />
        </div>
      </div>

      <div className="erp-card" style={{ marginBottom: 20 }}>
        <div className="erp-card-header"><span className="erp-card-title">訂位資訊</span></div>
        <div className="erp-card-body erp-sysinfo">
          <Row label="姓名" value={booking.customerName} />
          <Row label="電話" value={booking.customerPhone} />
          <Row label="來源" value={booking.source} />
        </div>
      </div>

      <div className="erp-card" style={{ marginBottom: 20 }}>
        <div className="erp-card-header"><span className="erp-card-title">銷售/收款</span></div>
        <div className="erp-card-body erp-sysinfo">
          <Row label="售出日期" value={booking.soldDate} />
          <Row label="收款金額" value={formatCurrency(booking.collectedAmount)} />
          <Row label="帳戶" value={booking.account} />
          <Row label="代訂費" value={formatCurrency(booking.agencyFee)} />
        </div>
      </div>

      <div className="erp-card" style={{ marginBottom: 20 }}>
        <div className="erp-card-header"><span className="erp-card-title">其他</span></div>
        <div className="erp-card-body erp-sysinfo">
          <Row label="資訊" value={booking.info} />
          <Row label="備註" value={booking.note} />
        </div>
      </div>

      {smsLogs.length > 0 && (
        <div className="erp-card">
          <div className="erp-card-header"><span className="erp-card-title">簡訊留存紀錄</span></div>
          <div className="erp-card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {smsLogs.map((log) => (
              <div key={log.id} style={{ border: "1px solid var(--gray-200)", borderRadius: "var(--radius-md)", padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span className="badge badge-navy">{smsTypeLabel[log.type]}</span>
                  <span style={{ fontSize: 12, color: "var(--gray-400)" }}>{new Date(log.createdAt).toLocaleString("zh-TW")}</span>
                </div>
                <div style={{ fontSize: 13, color: "var(--gray-700)", whiteSpace: "pre-wrap" }}>{log.rawText}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";

type Booking = Record<string, string | number | null>;

type SmsLog = {
  id: string;
  type: "booking_notice" | "payment_completion";
  rawText: string;
  createdAt: string;
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
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [smsLogs, setSmsLogs] = useState<SmsLog[]>([]);

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
  }, [params.id]);

  const handleDelete = async () => {
    if (!confirm("確定要刪除這筆單據嗎？")) return;
    const res = await fetch(`/api/bookings/${params.id}`, { method: "DELETE" });
    if (res.ok) router.push("/bookings");
  };

  if (loading) return <div className="erp-page">載入中...</div>;
  if (!booking) return <div className="erp-page">找不到這筆單據</div>;

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">單據詳細資料</h1>
          <p className="erp-page-subtitle">{statusLabel[String(booking.status)]} · {booking.bookingDate}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href={`/bookings/${params.id}/edit`} className="btn btn-primary">編輯</Link>
          <button onClick={handleDelete} className="btn btn-danger">刪除</button>
          <button onClick={() => router.push("/bookings")} className="btn btn-secondary">返回</button>
        </div>
      </div>

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
        <div className="erp-card-header"><span className="erp-card-title">客戶資訊</span></div>
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

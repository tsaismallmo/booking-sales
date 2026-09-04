"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseSms, type ParsedSms } from "@/lib/sms-parser";
import { formatCurrency } from "@/lib/utils";

type ExistingBooking = {
  id: string;
  branch: string | null;
  bookingDate: string;
  timeSlot: string | null;
  partySize: number | null;
  bookingCode: string | null;
  depositAmount: string | null;
};

export default function ImportSmsPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedSms | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // 付款通知 → 建單據 用的可編輯欄位
  const [form, setForm] = useState({
    branch: "",
    category: "預購單",
    bookingDate: "",
    timeSlot: "",
    partySize: "",
    bookingCode: "",
    paymentDeadline: "",
    depositAmount: "",
    depositPayer: "",
  });

  // 付款完成 → 比對到的既有單據
  const [matched, setMatched] = useState<ExistingBooking | null | undefined>(undefined);
  const [checkingMatch, setCheckingMatch] = useState(false);

  const handleParse = async () => {
    setError("");
    setMatched(undefined);
    const result = parseSms(text);
    setParsed(result);

    if (result.type === "booking_notice") {
      setForm((f) => ({
        ...f,
        branch: result.branch ?? "",
        bookingDate: result.bookingDate ?? "",
        timeSlot: result.timeSlot ?? "",
        partySize: result.partySize?.toString() ?? "",
        bookingCode: result.bookingCode ?? "",
        paymentDeadline: result.paymentDeadline ?? "",
      }));
    }

    if (result.type === "payment_completion" && result.bookingCode) {
      setCheckingMatch(true);
      const res = await fetch(`/api/bookings/lookup?code=${encodeURIComponent(result.bookingCode)}`);
      const data = await res.json();
      setMatched(data);
      setCheckingMatch(false);
    }
  };

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleCreateBooking = async () => {
    if (!form.bookingDate || !form.category) {
      setError("請確認日期與類別");
      return;
    }
    setSaving(true);
    setError("");

    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "建立單據失敗");
      setSaving(false);
      return;
    }
    const booking = await res.json();

    await fetch("/api/sms-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "booking_notice", rawText: text, bookingId: booking.id, parsedData: parsed }),
    });

    router.push(`/bookings/${booking.id}`);
  };

  const handleAttachPaymentLog = async () => {
    setSaving(true);
    setError("");
    const res = await fetch("/api/sms-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "payment_completion",
        rawText: text,
        bookingId: matched ? matched.id : null,
        parsedData: parsed,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "留存失敗");
      return;
    }
    if (matched) {
      router.push(`/bookings/${matched.id}`);
    } else {
      setText("");
      setParsed(null);
    }
  };

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">解析簡訊</h1>
          <p className="erp-page-subtitle">貼上付款通知或付款完成簡訊，自動解析並建立/留存紀錄</p>
        </div>
        <button onClick={() => router.push("/bookings")} className="btn btn-secondary">返回單據看板</button>
      </div>

      {error && <div className="erp-alert danger">{error}</div>}

      <div className="erp-card" style={{ marginBottom: 20 }}>
        <div className="erp-card-header"><span className="erp-card-title">簡訊內容</span></div>
        <div className="erp-card-body">
          <textarea
            className="erp-textarea"
            rows={5}
            placeholder="把收到的簡訊全文貼在這裡..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div style={{ marginTop: 12 }}>
            <button onClick={handleParse} disabled={!text.trim()} className="btn btn-primary">解析簡訊</button>
          </div>
        </div>
      </div>

      {parsed?.type === "unknown" && (
        <div className="erp-alert danger">無法辨識這則簡訊的格式，請確認貼上的內容是否完整。</div>
      )}

      {parsed?.type === "booking_notice" && (
        <div className="erp-card">
          <div className="erp-card-header"><span className="erp-card-title">解析結果 · 建立單據</span></div>
          <div className="erp-card-body">
            <div className="erp-form-grid">
              <div className="erp-form-group">
                <label className="erp-label">分店</label>
                <input className="erp-input" value={form.branch} onChange={set("branch")} />
              </div>
              <div className="erp-form-group">
                <label className="erp-label">類別</label>
                <select className="erp-select" value={form.category} onChange={set("category")}>
                  <option value="預購單">預購單</option>
                  <option value="臨時單">臨時單</option>
                  <option value="現貨單">現貨單</option>
                </select>
              </div>
              <div className="erp-form-group">
                <label className="erp-label">日期</label>
                <input type="date" className="erp-input" value={form.bookingDate} onChange={set("bookingDate")} />
              </div>
              <div className="erp-form-group">
                <label className="erp-label">時段</label>
                <input className="erp-input" value={form.timeSlot} onChange={set("timeSlot")} />
              </div>
              <div className="erp-form-group">
                <label className="erp-label">人數</label>
                <input type="number" className="erp-input" value={form.partySize} onChange={set("partySize")} />
              </div>
              <div className="erp-form-group">
                <label className="erp-label">訂位代號</label>
                <input className="erp-input" value={form.bookingCode} onChange={set("bookingCode")} />
              </div>
              <div className="erp-form-group">
                <label className="erp-label">付款期限</label>
                <input type="date" className="erp-input" value={form.paymentDeadline} onChange={set("paymentDeadline")} />
              </div>
              <div className="erp-form-group">
                <label className="erp-label">訂金</label>
                <input type="number" step="0.01" className="erp-input" value={form.depositAmount} onChange={set("depositAmount")} />
              </div>
              <div className="erp-form-group">
                <label className="erp-label">付款人員</label>
                <input className="erp-input" value={form.depositPayer} onChange={set("depositPayer")} />
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <button onClick={handleCreateBooking} disabled={saving} className="btn btn-primary">
                {saving ? "建立中..." : "確認並建立單據"}
              </button>
            </div>
          </div>
        </div>
      )}

      {parsed?.type === "payment_completion" && (
        <div className="erp-card">
          <div className="erp-card-header"><span className="erp-card-title">解析結果 · 付款完成</span></div>
          <div className="erp-card-body erp-sysinfo">
            <div className="erp-sysinfo-row"><span className="erp-sysinfo-key">訂位代號</span><span className="erp-sysinfo-val">{parsed.bookingCode ?? "—"}</span></div>
            <div className="erp-sysinfo-row"><span className="erp-sysinfo-key">付款時間</span><span className="erp-sysinfo-val">{parsed.paidAt ?? "—"}</span></div>
            <div className="erp-sysinfo-row"><span className="erp-sysinfo-key">交易金額</span><span className="erp-sysinfo-val">{formatCurrency(parsed.amount)}</span></div>
            <div className="erp-sysinfo-row"><span className="erp-sysinfo-key">訂金單號</span><span className="erp-sysinfo-val">{parsed.transactionNo ?? "—"}</span></div>

            <hr className="erp-divider" />

            {checkingMatch && <p>比對單據中...</p>}
            {!checkingMatch && matched && (
              <div className="erp-alert info">
                已比對到單據：{matched.branch} {matched.bookingDate} {matched.timeSlot}，目前登記訂金 {formatCurrency(matched.depositAmount)}
                {parsed.amount != null && matched.depositAmount != null && Number(matched.depositAmount) !== parsed.amount && (
                  <> — <strong>金額不一致，請留意</strong></>
                )}
              </div>
            )}
            {!checkingMatch && matched === null && (
              <div className="erp-alert danger">找不到訂位代號 {parsed.bookingCode} 對應的單據，仍可先留存簡訊內容，之後再手動核對。</div>
            )}

            <div style={{ marginTop: 8 }}>
              <button onClick={handleAttachPaymentLog} disabled={saving || checkingMatch} className="btn btn-primary">
                {saving ? "儲存中..." : matched ? "留存並關聯到這筆單據" : "僅留存簡訊內容"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

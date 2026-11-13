"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseSms, type ParsedSms } from "@/lib/sms-parser";
import { formatCurrency } from "@/lib/utils";
import { VendorSelect } from "@/components/VendorSelect";
import { StaffOptionSelect } from "@/components/StaffOptionSelect";
import { BranchSelect, findBranch, loadBranchOptions } from "@/components/BranchSelect";

type PhoneCandidate = { phone: string; source: "roster" | "booking"; label: string; listName: string | null };
type CustomerCandidate = { name: string; phone: string; source: "roster" | "booking"; label: string };

type ExistingBooking = {
  id: string;
  branch: string | null;
  bookingDate: string;
  timeSlot: string | null;
  partySize: number | null;
  bookingCode: string | null;
  depositAmount: string | null;
  depositPayer: string | null;
};

export default function ImportSmsPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedSms | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [vendorId, setVendorId] = useState("");

  // 付款通知 → 建單據 用的可編輯欄位
  const [form, setForm] = useState({
    branchId: "",
    branch: "",
    category: "現貨單",
    bookingDate: "",
    timeSlot: "",
    partySize: "",
    bookingCode: "",
    paymentDeadline: "",
    depositAmount: "",
    depositPayer: "",
    actualBooker: "",
    customerName: "",
    customerPhone: "",
    isInline: false,
    isEztable: false,
  });

  // 用訂位姓名查到的電話（廠商名單＋以前的單據）；只有一支就直接帶入，多支讓使用者點選
  const [phoneCandidates, setPhoneCandidates] = useState<PhoneCandidate[]>([]);

  // 客人搜尋（模糊搜尋，同時帶入姓名+電話）
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerCandidate[]>([]);
  const [customerSearchTimer, setCustomerSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleCustomerSearchChange = (q: string) => {
    setCustomerSearch(q);
    if (customerSearchTimer) clearTimeout(customerSearchTimer);
    if (!q.trim()) { setCustomerResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/customer-search?q=${encodeURIComponent(q.trim())}`);
      const data = res.ok ? await res.json() : [];
      setCustomerResults(Array.isArray(data) ? data : []);
    }, 250);
    setCustomerSearchTimer(t);
  };

  const pickCustomer = (c: CustomerCandidate) => {
    // 從名單搜到的客人，名單名稱就是實際訂位人員
    setForm((f) => ({ ...f, customerName: c.name, customerPhone: c.phone, actualBooker: c.source === "roster" ? c.label : f.actualBooker }));
    setCustomerSearch("");
    setCustomerResults([]);
    setPhoneCandidates([]);
  };

  const lookupPhone = async (name: string) => {
    setPhoneCandidates([]);
    if (!name.trim()) return;
    const res = await fetch(`/api/customer-phones?name=${encodeURIComponent(name.trim())}`);
    const data = res.ok ? await res.json() : [];
    const list: PhoneCandidate[] = Array.isArray(data) ? data : [];
    if (list.length === 1) setForm((f) => (f.customerPhone ? f : { ...f, customerPhone: list[0].phone, actualBooker: list[0].listName ?? f.actualBooker }));
    else setPhoneCandidates(list);
  };

  // 電話已經有了（簡訊前面寫「姓名/電話」）：查這支電話在哪份名單，只在剛好一份時帶入實際訂位人員
  const lookupListByPhone = async (phone: string) => {
    const res = await fetch(`/api/customer-phones?phone=${encodeURIComponent(phone)}`);
    const data = res.ok ? await res.json() : [];
    const listNames = [...new Set((Array.isArray(data) ? data : []).map((c: PhoneCandidate) => c.listName).filter(Boolean))] as string[];
    if (listNames.length === 1) setForm((f) => ({ ...f, actualBooker: listNames[0] }));
  };

  const pickPhone = (c: PhoneCandidate) =>
    setForm((f) => ({ ...f, customerPhone: c.phone, actualBooker: c.listName ?? f.actualBooker }));

  // 付款完成 → 比對到的既有單據
  const [matched, setMatched] = useState<ExistingBooking | null | undefined>(undefined);
  const [ambiguous, setAmbiguous] = useState(false);
  // 比對到單據時要寫進單據的付款人員（廠商名單名稱），預設帶單據原本的
  const [payer, setPayer] = useState("");
  const [checkingMatch, setCheckingMatch] = useState(false);
  const [rawBranch, setRawBranch] = useState(""); // 簡訊裡原始的分店文字，跟最終確認的分店不同時拿來記對應
  const [matchBranch, setMatchBranch] = useState(""); // 付款完成比對用的分店，可手動修正

  // 之前有沒有人設定過「這段簡訊分店文字」該對應到系統裡哪個分店名稱
  const resolveBranchAlias = async (raw: string) => {
    const res = await fetch(`/api/branch-aliases?rawText=${encodeURIComponent(raw)}`);
    const data = await res.json();
    return data?.canonicalBranch ?? raw;
  };

  const saveBranchAliasIfChanged = async (raw: string, final: string) => {
    if (raw && final && raw !== final) {
      await fetch("/api/branch-aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: raw, canonicalBranch: final }),
      });
    }
  };

  const runLookup = async (branch: string, p: ParsedSms) => {
    if (p.type !== "payment_completion" || !p.bookingCode) return;
    setCheckingMatch(true);
    setError("");
    const qs = new URLSearchParams({ code: p.bookingCode });
    if (branch) qs.set("branch", branch);
    if (p.bookingDate) qs.set("bookingDate", p.bookingDate);
    if (p.timeSlot) qs.set("timeSlot", p.timeSlot);
    if (p.partySize != null) qs.set("partySize", String(p.partySize));
    if (p.amount != null) qs.set("amount", String(p.amount));

    const res = await fetch(`/api/bookings/lookup?${qs.toString()}`);
    const data = await res.json();
    setMatched(data.match ?? null);
    setPayer(data.match?.depositPayer ?? "");
    setAmbiguous(Boolean(data.ambiguous));
    if (data.error) setError(data.error);
    setCheckingMatch(false);
  };

  const handleParse = async () => {
    setError("");
    setMatched(undefined);
    setAmbiguous(false);
    const result = parseSms(text);
    setParsed(result);

    if (result.type === "booking_notice") {
      const branch = result.branch ? await resolveBranchAlias(result.branch) : "";
      setForm((f) => ({
        ...f,
        branchId: "",
        branch,
        bookingDate: result.bookingDate ?? "",
        timeSlot: result.timeSlot ?? "",
        partySize: result.partySize?.toString() ?? "",
        bookingCode: result.bookingCode ?? "",
        paymentDeadline: result.paymentDeadline ?? "",
        customerName: result.customerName ?? "",
        customerPhone: result.customerPhone ?? "",
        isInline: result.isInline,
        isEztable: result.isEztable,
      }));
      setRawBranch(result.branch ?? "");
      // 「姓名/電話」已經帶了電話就不用再用姓名查
      if (result.customerPhone) {
        setPhoneCandidates([]);
        await lookupListByPhone(result.customerPhone);
      } else if (result.customerName) await lookupPhone(result.customerName);
      else setPhoneCandidates([]);
    }

    if (result.type === "payment_completion" && result.bookingCode) {
      const branch = result.branch ? await resolveBranchAlias(result.branch) : "";
      setRawBranch(result.branch ?? "");
      setMatchBranch(branch);
      await runLookup(branch, result);
    }
  };

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleCreateBooking = async () => {
    if (!form.bookingDate || !form.category) {
      setError("請確認日期與類別");
      return;
    }
    // 分店一定要對到主檔（簡訊分店文字沒對應過的話，選了之後會記進分店對應表，下次自動帶入）
    if (!form.branchId && !findBranch(await loadBranchOptions(), form.branch)) {
      setError("請選擇餐廳和分店");
      return;
    }
    if (!form.customerName || !form.customerPhone) {
      setError("現貨單要填訂位姓名與電話");
      return;
    }
    setSaving(true);
    setError("");

    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, vendorId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "建立單據失敗");
      setSaving(false);
      return;
    }
    const booking = await res.json();
    await saveBranchAliasIfChanged(rawBranch, form.branch);

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
        ...(matched ? { depositPayer: payer } : {}),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "留存失敗");
      return;
    }
    if (matched) {
      await saveBranchAliasIfChanged(rawBranch, matchBranch);
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
        <button onClick={() => router.push("/bookings")} className="btn btn-secondary">返回單據管理</button>
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
              <VendorSelect value={vendorId} onChange={setVendorId} />
              <div className="erp-form-group">
                <label className="erp-label">分店</label>
                <BranchSelect branchId={form.branchId} branch={form.branch} onChange={(v) => setForm((f) => ({ ...f, ...v }))} />
              </div>
              <div className="erp-form-group">
                <label className="erp-label">類別</label>
                <input className="erp-input" value={form.category} disabled />
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
                <StaffOptionSelect value={form.depositPayer ?? ""} onChange={(v) => setForm((f) => ({ ...f, depositPayer: v }))} />
              </div>
              <div className="erp-form-group">
                <label className="erp-label">實際訂位人員</label>
                <StaffOptionSelect value={form.actualBooker} onChange={(v) => setForm((f) => ({ ...f, actualBooker: v }))} />
              </div>
              <div className="erp-form-group" style={{ gridColumn: "1 / -1" }}>
                <label className="erp-label">搜尋客人（點選帶入姓名＋電話）</label>
                <div style={{ position: "relative" }}>
                  <input
                    className="erp-input"
                    placeholder="輸入姓名關鍵字..."
                    value={customerSearch}
                    onChange={(e) => handleCustomerSearchChange(e.target.value)}
                    autoComplete="off"
                  />
                  {customerResults.length > 0 && (
                    <div style={{
                      position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20,
                      background: "#fff", border: "1px solid var(--gray-200)", borderRadius: 6,
                      boxShadow: "0 4px 12px rgba(0,0,0,.12)", marginTop: 2, maxHeight: 240, overflowY: "auto",
                    }}>
                      {customerResults.map((c, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => pickCustomer(c)}
                          style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            width: "100%", padding: "8px 12px", background: "none", border: "none",
                            cursor: "pointer", textAlign: "left", fontSize: 13,
                            borderBottom: i < customerResults.length - 1 ? "1px solid var(--gray-100)" : "none",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--gray-50)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                        >
                          <span style={{ fontWeight: 600, color: "var(--gray-800)" }}>{c.name}</span>
                          <span style={{ color: "var(--gray-400)", fontSize: 12 }}>{c.phone}　{c.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="erp-form-group">
                <label className="erp-label">訂位姓名 <span className="required">*</span></label>
                <input
                  className="erp-input"
                  value={form.customerName}
                  onChange={set("customerName")}
                  onBlur={() => { if (!form.customerPhone) lookupPhone(form.customerName); }}
                />
              </div>
              <div className="erp-form-group">
                <label className="erp-label">訂位電話 <span className="required">*</span></label>
                <input className="erp-input" value={form.customerPhone} onChange={set("customerPhone")} />
                {phoneCandidates.length > 1 && (
                  <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "var(--gray-400)", width: "100%" }}>同名有多支電話，點選帶入：</span>
                    {phoneCandidates.map((c) => (
                      <button
                        key={`${c.phone}-${c.label}`}
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: 12, padding: "2px 8px" }}
                        onClick={() => pickPhone(c)}
                      >
                        {c.phone}（{c.label}）
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="erp-form-group">
                <label className="erp-label">訂位平台</label>
                <div style={{ display: "flex", gap: 16, alignItems: "center", height: 38 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={form.isInline} onChange={(e) => setForm((f) => ({ ...f, isInline: e.target.checked }))} />
                    Inline
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={form.isEztable} onChange={(e) => setForm((f) => ({ ...f, isEztable: e.target.checked }))} />
                    EZTABLE
                  </label>
                </div>
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

            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginTop: 8 }}>
              <div className="erp-form-group" style={{ maxWidth: 280 }}>
                <label className="erp-label">
                  比對用分店{rawBranch && matchBranch !== rawBranch ? `（簡訊原文：${rawBranch}）` : ""}
                </label>
                <BranchSelect branchId={null} branch={matchBranch} onChange={(v) => setMatchBranch(v.branch)} />
              </div>
              <button
                onClick={() => runLookup(matchBranch, parsed)}
                disabled={checkingMatch}
                className="btn btn-secondary"
              >
                重新比對
              </button>
            </div>
            <p style={{ fontSize: 12, color: "var(--gray-400)", marginTop: 4 }}>
              如果分店名稱跟系統裡不一樣，改成正確的名稱再按重新比對；比對成功並儲存後，這個對應關係會被記住，下次同樣的簡訊寫法會自動代換。
            </p>

            <hr className="erp-divider" />

            {checkingMatch && <p>比對單據中...</p>}
            {!checkingMatch && matched && (
              <div className="erp-alert info">
                已比對到唯一一筆單據：{matched.branch} {matched.bookingDate} {matched.timeSlot}，訂金 {formatCurrency(matched.depositAmount)}
              </div>
            )}
            {!checkingMatch && matched && (
              <div style={{ marginBottom: 12, maxWidth: 320 }}>
                <label className="erp-label">付款人員</label>
                <StaffOptionSelect value={payer} onChange={setPayer} />
                <span style={{ fontSize: 12, color: "var(--gray-400)" }}>留存時會一起寫進這筆單據</span>
              </div>
            )}
            {!checkingMatch && matched === null && ambiguous && (
              <div className="erp-alert danger">
                訂位代號 {parsed.bookingCode} 用分店/日期/時段/人數還是對到不只一筆或無法確定，請到單據管理手動確認後再處理，避免關聯錯筆。
              </div>
            )}
            {!checkingMatch && matched === null && !ambiguous && (
              <div className="erp-alert danger">找不到訂位代號 {parsed.bookingCode} 對應的單據，仍可先留存簡訊內容，之後再手動核對。</div>
            )}

            <div style={{ marginTop: 8 }}>
              <button onClick={handleAttachPaymentLog} disabled={saving || checkingMatch || ambiguous} className="btn btn-primary">
                {saving ? "儲存中..." : matched ? "留存並關聯到這筆單據" : "僅留存簡訊內容"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

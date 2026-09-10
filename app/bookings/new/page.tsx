"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VendorSelect } from "@/components/VendorSelect";

function NewBookingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetCategory = searchParams.get("category");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [vendorId, setVendorId] = useState("");
  // 純客服（沒有廠商/管理員身份）只能建臨時單／預定單，不用綁廠商
  const [pureCustomerService, setPureCustomerService] = useState(false);
  const [form, setForm] = useState({
    branch: "",
    category: presetCategory || "現貨單",
    bookingDate: new Date().toISOString().split("T")[0],
    timeSlot: "",
    partySize: "",
    bookingCode: "",
    cancelDeadline: "",
    actualBooker: "",
    depositAmount: "",
    depositPayer: "",
    customerName: "",
    customerPhone: "",
    source: "",
    isInline: false,
    isEztable: false,
    info: "",
    note: "",
  });

  useEffect(() => {
    fetch("/api/me")
      .then((res) => res.json())
      .then((me) => {
        const roles: string[] = me.roles ?? [];
        const isPureCS = roles.includes("customer_service") && !roles.includes("vendor") && !roles.includes("admin");
        setPureCustomerService(isPureCS);
        if (isPureCS && !presetCategory) setForm((f) => ({ ...f, category: "臨時單" }));
      });
  }, [presetCategory]);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));
  const setChecked = (field: "isInline" | "isEztable") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.checked }));

  const handleSubmit = async () => {
    if (!form.bookingDate || !form.category) {
      setError("請填寫日期與類別");
      return;
    }
    if (form.category === "現貨單" && (!form.customerName || !form.customerPhone)) {
      setError("現貨單要填訂位姓名與電話");
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, vendorId }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "儲存失敗");
      return;
    }
    router.push("/bookings");
  };

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <h1 className="erp-page-title">新增單據</h1>
        <button onClick={() => router.push("/bookings")} className="btn btn-secondary">取消</button>
      </div>

      {error && <div className="erp-alert danger">{error}</div>}

      <div className="erp-card">
        <div className="erp-card-header"><span className="erp-card-title">基本資訊</span></div>
        <div className="erp-card-body">
          <div className="erp-form-grid">
            <VendorSelect value={vendorId} onChange={setVendorId} />
            <div className="erp-form-group">
              <label className="erp-label">分店</label>
              <input className="erp-input" value={form.branch} onChange={set("branch")} />
            </div>
            <div className="erp-form-group">
              <label className="erp-label">類別 <span className="required">*</span></label>
              {presetCategory ? (
                <input className="erp-input" value={form.category} disabled />
              ) : (
                <select className="erp-select" value={form.category} onChange={set("category")}>
                  <option value="預定單">預定單</option>
                  <option value="臨時單">臨時單</option>
                  {!pureCustomerService && <option value="現貨單">現貨單</option>}
                </select>
              )}
            </div>
            <div className="erp-form-group">
              <label className="erp-label">日期 <span className="required">*</span></label>
              <input type="date" className="erp-input" value={form.bookingDate} onChange={set("bookingDate")} />
            </div>
            <div className="erp-form-group">
              <label className="erp-label">時段</label>
              <input className="erp-input" placeholder="例如 11:30" value={form.timeSlot} onChange={set("timeSlot")} />
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
              <label className="erp-label">退訂期限</label>
              <input type="date" className="erp-input" value={form.cancelDeadline} onChange={set("cancelDeadline")} />
            </div>
            <div className="erp-form-group">
              <label className="erp-label">實際訂位人員</label>
              <input className="erp-input" value={form.actualBooker} onChange={set("actualBooker")} />
            </div>
          </div>
        </div>
      </div>

      <div className="erp-card" style={{ marginTop: 24 }}>
        <div className="erp-card-header"><span className="erp-card-title">餐廳端金流</span></div>
        <div className="erp-card-body">
          <div className="erp-form-grid">
            <div className="erp-form-group">
              <label className="erp-label">訂金</label>
              <input type="number" step="0.01" className="erp-input" value={form.depositAmount} onChange={set("depositAmount")} />
            </div>
            <div className="erp-form-group">
              <label className="erp-label">付款人員</label>
              <input className="erp-input" value={form.depositPayer} onChange={set("depositPayer")} />
            </div>
          </div>
        </div>
      </div>

      <div className="erp-card" style={{ marginTop: 24 }}>
        <div className="erp-card-header">
          <span className="erp-card-title">訂位資訊{form.category !== "現貨單" && "（選填）"}</span>
        </div>
        <div className="erp-card-body">
          <div className="erp-form-grid">
            <div className="erp-form-group">
              <label className="erp-label">姓名{form.category === "現貨單" && <span className="required">*</span>}</label>
              <input className="erp-input" value={form.customerName} onChange={set("customerName")} />
            </div>
            <div className="erp-form-group">
              <label className="erp-label">電話{form.category === "現貨單" && <span className="required">*</span>}</label>
              <input className="erp-input" value={form.customerPhone} onChange={set("customerPhone")} />
            </div>
            <div className="erp-form-group">
              <label className="erp-label">來源</label>
              <input className="erp-input" value={form.source} onChange={set("source")} />
            </div>
            <div className="erp-form-group">
              <label className="erp-label">訂位平台</label>
              <div style={{ display: "flex", gap: 16, alignItems: "center", height: 38 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.isInline} onChange={setChecked("isInline")} />
                  Inline
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.isEztable} onChange={setChecked("isEztable")} />
                  EZTABLE
                </label>
              </div>
            </div>
            <div className="erp-form-group full">
              <label className="erp-label">資訊</label>
              <input className="erp-input" placeholder="快速註記" value={form.info} onChange={set("info")} />
            </div>
            <div className="erp-form-group full">
              <label className="erp-label">備註</label>
              <textarea className="erp-textarea" rows={2} value={form.note} onChange={set("note")} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <button onClick={handleSubmit} disabled={loading} className="btn btn-primary">
          {loading ? "儲存中..." : "儲存單據"}
        </button>
        <button onClick={() => router.push("/bookings")} className="btn btn-secondary">取消</button>
      </div>
    </div>
  );
}

export default function NewBookingPage() {
  return (
    <Suspense>
      <NewBookingForm />
    </Suspense>
  );
}

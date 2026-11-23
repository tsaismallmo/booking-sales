"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StaffOptionSelect } from "@/components/StaffOptionSelect";
import { BranchSelect } from "@/components/BranchSelect";
import { VendorSelect } from "@/components/VendorSelect";
import { ReservedOptionsEditor, optionsToBody, type ReservedOption } from "@/components/AltDatesEditor";
import { fetchMe } from "@/lib/use-me";
import { isPureCustomerService } from "@/lib/roles";

function NewBookingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetCategory = searchParams.get("category");
  // 從哪個看板點「＋新增」進來的，儲存/取消後就回那個看板，不要固定跳單據管理
  const fromParam = searchParams.get("from");
  const RETURN_PATHS: Record<string, string> = { reserved: "/dashboard/reserved" };
  const returnTo = (fromParam && RETURN_PATHS[fromParam]) || "/bookings";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [vendorId, setVendorId] = useState("");
  // 純客服（沒有廠商/管理員身份）只能建預定單，不用綁廠商（臨時單看板已移除）
  const [pureCustomerService, setPureCustomerService] = useState(false);
  // 預定單只有客服／管理員能建（客服面對客人時打的）
  const [canCreateReserved, setCanCreateReserved] = useState(false);
  const [options, setOptions] = useState<ReservedOption[]>([{ branchId: "", branch: "", date: "", timeSlot: "", partySize: "" }]);
  const [form, setForm] = useState({
    branchId: "",
    branch: "",
    category: presetCategory || "現貨單",
    bookingDate: new Date().toISOString().split("T")[0],
    timeSlot: "",
    partySize: "",
    bookingCode: "",
    cancelDeadline: "",
    paymentDeadline: "",
    actualBooker: "",
    depositAmount: "",
    depositPayer: "",
    customerName: "",
    customerPhone: "",
    source: "",
    isInline: false,
    isEztable: false,
    agencyFee: "",
    info: "",
    note: "",
  });

  useEffect(() => {
    fetchMe()
      .then((me) => {
        const roles: string[] = me.roles ?? [];
        const isPureCS = isPureCustomerService(roles);
        setPureCustomerService(isPureCS);
        setCanCreateReserved(roles.includes("customer_service") || roles.includes("admin"));
        if (isPureCS) setForm((f) => ({ ...f, category: "預定單" }));
      });
  }, [presetCategory]);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));
  const setChecked = (field: "isInline" | "isEztable") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.checked }));

  // 預定單跟需求看板一樣：客人姓名在最上面，底下是好幾個候選（各自的分店／日期／時段／人數）
  const isReserved = form.category === "預定單";

  const handleSubmit = async () => {
    if (isReserved && !options[0]?.date) {
      setError("第 1 順位要填日期");
      return;
    }
    if (!isReserved && (!form.bookingDate || !form.category)) {
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
      body: JSON.stringify({ ...form, vendorId, ...(isReserved ? optionsToBody(options) : {}) }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "儲存失敗");
      return;
    }
    router.push(returnTo);
  };

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <h1 className="erp-page-title">新增單據</h1>
        <button onClick={() => router.push(returnTo)} className="btn btn-secondary">取消</button>
      </div>

      {error && <div className="erp-alert danger">{error}</div>}

      {isReserved && (
        <div className="erp-card" style={{ marginBottom: 24 }}>
          <div className="erp-card-header"><span className="erp-card-title">客人與候選日期</span></div>
          <div className="erp-card-body">
            <div className="erp-form-grid" style={{ marginBottom: 16 }}>
              <div className="erp-form-group">
                <label className="erp-label">客人姓名（用這個名字訂位）</label>
                <input className="erp-input" value={form.customerName} onChange={set("customerName")} />
              </div>
              <div className="erp-form-group">
                <label className="erp-label">客人電話</label>
                <input className="erp-input" value={form.customerPhone} onChange={set("customerPhone")} />
              </div>
              <div className="erp-form-group">
                <label className="erp-label">代訂費（總共，先收；沒訂到會退）</label>
                <input type="number" step="0.01" className="erp-input" value={form.agencyFee} onChange={set("agencyFee")} />
              </div>
              <div className="erp-form-group full">
                <label className="erp-label">備註</label>
                <input className="erp-input" placeholder="例如：兩大一小、需要兒童椅" value={form.note} onChange={set("note")} />
              </div>
            </div>
            <ReservedOptionsEditor options={options} onChange={setOptions} />
          </div>
        </div>
      )}

      <div className="erp-card">
        <div className="erp-card-header"><span className="erp-card-title">基本資訊</span></div>
        <div className="erp-card-body">
          <div className="erp-form-grid">
            {form.category !== "預定單" && (
              <VendorSelect value={vendorId} onChange={setVendorId} required={form.category === "現貨單"} />
            )}
            {!isReserved && (
            <div className="erp-form-group">
              <label className="erp-label">分店</label>
              <BranchSelect branchId={form.branchId} branch={form.branch} onChange={(v) => setForm((f) => ({ ...f, ...v }))} />
            </div>
            )}
            <div className="erp-form-group">
              <label className="erp-label">類別 <span className="required">*</span></label>
              {presetCategory || pureCustomerService ? (
                <input className="erp-input" value={form.category} disabled />
              ) : (
                <select className="erp-select" value={form.category} onChange={set("category")}>
                  {canCreateReserved && <option value="預定單">預定單</option>}
                  <option value="臨時單">臨時單</option>
                  <option value="現貨單">現貨單</option>
                </select>
              )}
            </div>
            {!isReserved && (
              <>
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
              </>
            )}
            {/* 預定單是客服剛跟客人談好、還沒訂到，訂位代號/退訂期限/付款期限要等訂到才有，新增時不用填 */}
            {!isReserved && (
              <>
              <div className="erp-form-group">
                <label className="erp-label">訂位代號</label>
                <input className="erp-input" value={form.bookingCode} onChange={set("bookingCode")} />
              </div>
              <div className="erp-form-group">
                <label className="erp-label">退訂期限</label>
                <input type="date" className="erp-input" value={form.cancelDeadline} onChange={set("cancelDeadline")} />
                <span style={{ fontSize: 12, color: "var(--gray-400)" }}>留空會照餐廳設定自動算（例如島語訂位日前 3 天）</span>
              </div>
              <div className="erp-form-group">
                <label className="erp-label">付款期限</label>
                <input type="date" className="erp-input" value={form.paymentDeadline} onChange={set("paymentDeadline")} />
              </div>
              </>
            )}
            {/* 預定單新增時還沒訂到，誰訂到的等按「訂到了」再選 */}
            {!isReserved && (
              <div className="erp-form-group">
                <label className="erp-label">實際訂位人員</label>
                <StaffOptionSelect value={form.actualBooker ?? ""} onChange={(v) => setForm((f) => ({ ...f, actualBooker: v }))} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 預定單還沒訂到，餐廳端金流、來源／平台都還沒有；備註放在上面客人那塊 */}
      {!isReserved && (
        <>
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
                  <StaffOptionSelect value={form.depositPayer ?? ""} onChange={(v) => setForm((f) => ({ ...f, depositPayer: v }))} />
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
                {!isReserved && (
                  <>
                    <div className="erp-form-group">
                      <label className="erp-label">姓名{form.category === "現貨單" && <span className="required">*</span>}</label>
                      <input className="erp-input" value={form.customerName} onChange={set("customerName")} />
                    </div>
                    <div className="erp-form-group">
                      <label className="erp-label">電話{form.category === "現貨單" && <span className="required">*</span>}</label>
                      <input className="erp-input" value={form.customerPhone} onChange={set("customerPhone")} />
                    </div>
                  </>
                )}
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
        </>
      )}

      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <button onClick={handleSubmit} disabled={loading} className="btn btn-primary">
          {loading ? "儲存中..." : "儲存單據"}
        </button>
        <button onClick={() => router.push(returnTo)} className="btn btn-secondary">取消</button>
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

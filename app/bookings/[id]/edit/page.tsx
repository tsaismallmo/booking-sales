"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

export default function EditBookingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromParam = searchParams.get("from");
  const fromSuffix = fromParam ? `?from=${fromParam}` : "";
  const [loading, setLoading] = useState(false);
  const [bookingReady, setBookingReady] = useState(false);
  const [rolesReady, setRolesReady] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const [pureCustomerService, setPureCustomerService] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [csStaff, setCsStaff] = useState<{ id: string; name: string | null }[]>([]);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => res.json())
      .then((me) => {
        const roles: string[] = me.roles ?? [];
        const admin = roles.includes("admin");
        const isCS = roles.includes("customer_service");
        setIsAdmin(admin);
        setPureCustomerService(isCS && !roles.includes("vendor") && !admin);
        setRolesReady(true);
      });
    fetch("/api/directory")
      .then((r) => r.json())
      .then((data) => {
        const cs = (Array.isArray(data) ? data : []).filter((u: { roles: string[] }) => u.roles.includes("customer_service"));
        setCsStaff(cs);
      });
  }, []);

  useEffect(() => {
    fetch(`/api/bookings/${params.id}`)
      .then((res) => res.json())
      .then((data) => {
        setForm({
          branch: data.branch ?? "",
          category: data.category ?? "現貨單",
          bookingDate: data.bookingDate ?? "",
          timeSlot: data.timeSlot ?? "",
          partySize: data.partySize?.toString() ?? "",
          bookingCode: data.bookingCode ?? "",
          status: data.status ?? "unsold",
          cancelDeadline: data.cancelDeadline ?? "",
          paymentDeadline: data.paymentDeadline ?? "",
          depositAmount: data.depositAmount ?? "",
          depositPayer: data.depositPayer ?? "",
          customerName: data.customerName ?? "",
          customerPhone: data.customerPhone ?? "",
          source: data.source ?? "",
          soldDate: data.soldDate ?? "",
          collectedAmount: data.collectedAmount ?? "",
          account: data.account ?? "",
          agencyFee: data.agencyFee ?? "",
          salespersonId: data.salespersonId ?? "",
          info: data.info ?? "",
          note: data.note ?? "",
        });
        setBookingReady(true);
      });
  }, [params.id]);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/bookings/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "儲存失敗");
      return;
    }
    router.replace(`/bookings/${params.id}${fromSuffix}`);
  };

  if (!bookingReady || !rolesReady) return <div className="erp-page">載入中...</div>;

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <h1 className="erp-page-title">編輯單據</h1>
        <button onClick={() => router.replace(`/bookings/${params.id}${fromSuffix}`)} className="btn btn-secondary">取消</button>
      </div>

      {error && <div className="erp-alert danger">{error}</div>}

      {!pureCustomerService && form.status !== "refunded" && form.status !== "sold" && (
        <div className="erp-card">
          <div className="erp-card-header"><span className="erp-card-title">基本資訊</span></div>
          <div className="erp-card-body">
            <div className="erp-form-grid">
              <div className="erp-form-group">
                <label className="erp-label">分店</label>
                <input className="erp-input" value={form.branch} onChange={set("branch")} />
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
                <label className="erp-label">退訂期限</label>
                <input type="date" className="erp-input" value={form.cancelDeadline} onChange={set("cancelDeadline")} />
              </div>
              <div className="erp-form-group">
                <label className="erp-label">付款期限</label>
                <input type="date" className="erp-input" value={form.paymentDeadline} onChange={set("paymentDeadline")} />
              </div>
            </div>
          </div>
        </div>
      )}

      {!pureCustomerService && form.status !== "refunded" && form.status !== "sold" && (
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
      )}

      {!pureCustomerService && form.status !== "refunded" && form.status !== "sold" && (
        <div className="erp-card" style={{ marginTop: 24 }}>
          <div className="erp-card-header"><span className="erp-card-title">訂位資訊</span></div>
          <div className="erp-card-body">
            <div className="erp-form-grid">
              <div className="erp-form-group">
                <label className="erp-label">姓名</label>
                <input className="erp-input" value={form.customerName} onChange={set("customerName")} />
              </div>
              <div className="erp-form-group">
                <label className="erp-label">電話</label>
                <input className="erp-input" value={form.customerPhone} onChange={set("customerPhone")} />
              </div>
              <div className="erp-form-group">
                <label className="erp-label">來源</label>
                <input className="erp-input" value={form.source} onChange={set("source")} />
              </div>
            </div>
          </div>
        </div>
      )}


      {form.status === "refunded" && (
        <div className="erp-card" style={{ marginTop: 24 }}>
          <div className="erp-card-header"><span className="erp-card-title">訂單狀態</span></div>
          <div className="erp-card-body">
            <div className="erp-form-group" style={{ maxWidth: 200 }}>
              <label className="erp-label">狀態</label>
              <select className="erp-select" value={form.status} onChange={set("status")}>
                <option value="refunded">退</option>
                <option value="unsold">未售出</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {isAdmin && form.status !== "refunded" && (
        <div className="erp-card" style={{ marginTop: 24 }}>
          <div className="erp-card-header"><span className="erp-card-title">銷售/收款</span></div>
          <div className="erp-card-body">
            <div className="erp-form-grid">
              {form.status !== "sold" && (
                <div className="erp-form-group">
                  <label className="erp-label">狀態</label>
                  <select className="erp-select" value={form.status} onChange={set("status")}>
                    <option value="unsold">未售出</option>
                    <option value="reserved">訂</option>
                    <option value="sold">售</option>
                    <option value="refunded">退</option>
                  </select>
                </div>
              )}
              <div className="erp-form-group">
                <label className="erp-label">售出日期</label>
                <input type="date" className="erp-input" value={form.soldDate} onChange={set("soldDate")} />
              </div>
              <div className="erp-form-group">
                <label className="erp-label">收款金額</label>
                <input type="number" step="0.01" className="erp-input" value={form.collectedAmount} onChange={set("collectedAmount")} />
              </div>
              <div className="erp-form-group">
                <label className="erp-label">帳戶</label>
                <input className="erp-input" value={form.account} onChange={set("account")} />
              </div>
              <div className="erp-form-group">
                <label className="erp-label">代訂費</label>
                <input type="number" step="0.01" className="erp-input" value={form.agencyFee} onChange={set("agencyFee")} />
              </div>
              <div className="erp-form-group">
                <label className="erp-label">銷售人員</label>
                <select className="erp-select" value={form.salespersonId ?? ""} onChange={set("salespersonId")}>
                  <option value="">— 未指定 —</option>
                  {csStaff.map((u) => (
                    <option key={u.id} value={u.id}>{u.name ?? u.id}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {form.status !== "refunded" && form.status !== "sold" && (
        <div className="erp-card" style={{ marginTop: 24 }}>
          <div className="erp-card-header"><span className="erp-card-title">其他</span></div>
          <div className="erp-card-body">
            <div className="erp-form-grid">
              <div className="erp-form-group full">
                <label className="erp-label">資訊</label>
                <input className="erp-input" value={form.info} onChange={set("info")} />
              </div>
              <div className="erp-form-group full">
                <label className="erp-label">備註</label>
                <textarea className="erp-textarea" rows={2} value={form.note} onChange={set("note")} />
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <button onClick={handleSubmit} disabled={loading} className="btn btn-primary">
          {loading ? "儲存中..." : "儲存變更"}
        </button>
        <button onClick={() => router.push(`/bookings/${params.id}${fromSuffix}`)} className="btn btn-secondary">取消</button>
      </div>
    </div>
  );
}

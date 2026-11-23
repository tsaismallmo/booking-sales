"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { WEEKDAYS, parseDateOnly } from "@/lib/quote";
import { SalesChannelSelect } from "@/components/SalesChannelSelect";
import { formatAltDates } from "@/components/AltDatesEditor";
import { StaffOptionSelect } from "@/components/StaffOptionSelect";
import { ReservedCalendar, optionsOf, matchBranch } from "@/components/ReservedCalendar";
import { todayStr } from "@/lib/dates";

type Booking = {
  id: string;
  branch: string | null;
  category: string;
  bookingDate: string;
  timeSlot: string | null;
  partySize: number | null;
  bookingCode: string | null;
  altDates?: { date: string; timeSlot: string | null; branch?: string | null; partySize?: number | null }[] | null;
  customerName: string | null;
  customerPhone: string | null;
  status: "unsold" | "reserved" | "sold" | "refunded";
  depositAmount: string | null;
  agencyFee?: string | null;
  actualBooker?: string | null;
  note: string | null;
};

// 給臨時單／預定單用的看板，欄位順序跟現貨單看板保持一致
export function CategoryBoard({ category, title }: { category: "臨時單" | "預定單"; title: string }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [canSeeManagement, setCanSeeManagement] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [csStaff, setCsStaff] = useState<{ id: string; name: string | null }[]>([]);
  // 純後勤／純廠商員工只給看還沒有訂位代號的部分，而且不能操作（銷售/編輯要走轉需求，不是在這裡直接動）
  const [restrictedView, setRestrictedView] = useState(false);

  // 銷售／收款 modal，跟現貨單看板同一套
  const [saleTarget, setSaleTarget] = useState<Booking | null>(null);
  const [saleForm, setSaleForm] = useState({ soldDate: "", collectedAmount: "", account: "", agencyFee: "", salespersonId: "", salesChannelId: "", buyerName: "", buyerPhone: "" });
  const [submittingSale, setSubmittingSale] = useState(false);
  const [saleError, setSaleError] = useState("");

  // 帶著 from 參數，這樣從這個看板點進單據詳情/編輯頁時，側邊欄才會繼續亮這個看板，
  // 不會因為網址是 /bookings/... 就被誤判成「單據管理」
  const fromKey = category === "臨時單" ? "temp" : "reserved";

  useEffect(() => {
    fetch("/api/me")
      .then((res) => res.json())
      .then((me) => {
        const roles: string[] = me.roles ?? [];
        setCanSeeManagement(roles.includes("vendor") || roles.includes("admin"));
        setCanCreate(roles.includes("customer_service") || roles.includes("admin") || roles.includes("vendor"));
        const restricted = (roles.includes("logistics") || roles.includes("vendor_staff"))
          && !roles.includes("admin") && !roles.includes("customer_service") && !roles.includes("vendor");
        setRestrictedView(restricted);
      });
    fetch("/api/directory")
      .then((res) => res.json())
      .then((data) => {
        const cs = (Array.isArray(data) ? data : []).filter((u: { roles: string[] }) => u.roles.includes("customer_service"));
        setCsStaff(cs);
      });
  }, []);

  useEffect(() => {
    fetch("/api/bookings")
      .then((res) => res.json())
      .then((data) => {
        const rows: Booking[] = (Array.isArray(data) ? data : []).filter(
          (b: Booking) => b.status === "unsold" && b.category === category
        );
        rows.sort((a, b) => {
          const dateCmp = `${a.bookingDate} ${a.timeSlot ?? ""}`.localeCompare(`${b.bookingDate} ${b.timeSlot ?? ""}`);
          if (dateCmp !== 0) return dateCmp;
          const partyCmp = (a.partySize ?? 0) - (b.partySize ?? 0);
          if (partyCmp !== 0) return partyCmp;
          return (a.bookingCode ?? "").localeCompare(b.bookingCode ?? "", undefined, { numeric: true });
        });
        setBookings(rows);
        setLoading(false);
      });
  }, [category]);

  const handleOpenSale = (b: Booking) => {
    setSaleTarget(b);
    setSaleForm({
      soldDate: todayStr(),
      collectedAmount: "",
      account: "",
      agencyFee: "",
      salespersonId: "",
      salesChannelId: "",
      buyerName: "",
      buyerPhone: "",
    });
    setSaleError("");
  };

  const handleSubmitSale = async () => {
    if (!saleTarget) return;
    setSubmittingSale(true);
    setSaleError("");
    const res = await fetch(`/api/bookings/${saleTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "sold", ...saleForm }),
    });
    setSubmittingSale(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setSaleError(data.error || "儲存失敗");
      return;
    }
    setBookings((prev) => prev.filter((b) => b.id !== saleTarget.id));
    setSaleTarget(null);
  };

  // 預定單：代訂費建單時就先收了，訂到了就完成（算售出、售出日期記今天）；沒訂到就退款（狀態改退）
  // 訂到了要記是誰訂到的（實際訂位人員），用小視窗選；沒訂到直接確認
  const [doneTarget, setDoneTarget] = useState<Booking | null>(null);
  const [doneBooker, setDoneBooker] = useState("");
  const handleReservedResult = async (b: Booking, result: "sold" | "refunded", booker?: string) => {
    if (result === "refunded") {
      const who = b.customerName || "這位客人";
      const fee = b.agencyFee ? `代訂費 ${formatCurrency(b.agencyFee)}` : "代訂費";
      if (!confirm(`${who} 的預定單沒訂到，${fee} 要退給客人。確定標記為沒訂到（退款）？`)) return;
    }
    const res = await fetch(`/api/bookings/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result === "sold"
        ? { status: "sold", soldDate: todayStr(), actualBooker: booker ?? "" }
        : { status: "refunded" }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "儲存失敗");
      return;
    }
    setBookings((prev) => prev.filter((x) => x.id !== b.id));
    setDoneTarget(null);
  };

  // 預定單是用客人的名字去訂位，跟需求看板一樣把客人放第一欄
  const nameFirst = category === "預定單";
  const colCount = nameFirst ? 9 : 11;

  // 預定單月曆：點日期／選分店，下面表格只列有符合候選的客人
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [branchFilter, setBranchFilter] = useState("");
  const baseBookings = restrictedView ? bookings.filter((b) => !b.bookingCode) : bookings;
  const visibleBookings = nameFirst && (selectedDate || branchFilter)
    ? baseBookings.filter((b) => optionsOf(b).some((o) => (!selectedDate || o.date === selectedDate) && matchBranch(branchFilter, o.branch)))
    : baseBookings;

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">{title}</h1>
          <p className="erp-page-subtitle">目前可以銷售（未售出）的{category}，共 {loading ? "…" : baseBookings.length} 筆</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {canCreate && (
            <Link href={`/bookings/new?category=${encodeURIComponent(category)}&from=${fromKey}`} className="btn btn-primary">
              ＋ 新增{category}
            </Link>
          )}
          {canSeeManagement && <Link href="/bookings" className="btn btn-secondary">前往單據管理</Link>}
        </div>
      </div>

      {nameFirst && !loading && (
        <ReservedCalendar
          bookings={baseBookings}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          branchFilter={branchFilter}
          onBranchFilter={setBranchFilter}
        />
      )}
      {nameFirst && selectedDate && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <strong>{selectedDate.replace(/-/g, "/")}（週{WEEKDAYS[parseDateOnly(selectedDate).getDay()]}）的客人（{visibleBookings.length} 組）</strong>
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: "2px 10px" }} onClick={() => setSelectedDate(null)}>顯示全部</button>
        </div>
      )}

      <div className="erp-card">
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                {nameFirst && <th>客人</th>}
                <th>日期</th>
                <th>星期</th>
                <th>時段</th>
                <th>人數</th>
                {!nameFirst && <th>訂位代號</th>}
                {!nameFirst && <th>姓名</th>}
                {!nameFirst && <th>電話</th>}
                {!nameFirst && <th>訂金</th>}
                {nameFirst && <th>代訂費</th>}
                <th>分店</th>
                <th>備註</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={colCount} style={{ textAlign: "center", color: "var(--gray-400)" }}>載入中...</td></tr>
              )}
              {!loading && visibleBookings.map((b) => (
                <tr key={b.id}>
                  {nameFirst && (
                    <td>
                      <strong>{b.customerName || "（未填姓名）"}</strong>
                      {b.customerPhone && <div style={{ fontSize: 12, color: "var(--gray-500)" }}>{b.customerPhone}</div>}
                    </td>
                  )}
                  <td>
                    {b.bookingDate}
                    {formatAltDates(b.altDates) && (
                      <div style={{ fontSize: 12, color: "var(--gray-500)" }}>候選：{formatAltDates(b.altDates)}</div>
                    )}
                  </td>
                  <td>週{WEEKDAYS[parseDateOnly(b.bookingDate).getDay()]}</td>
                  <td>{b.timeSlot ?? "—"}</td>
                  <td>{b.partySize ?? "—"}</td>
                  {!nameFirst && <td className="font-mono">{b.bookingCode ?? "—"}</td>}
                  {!nameFirst && <td>{b.customerName ?? "—"}</td>}
                  {!nameFirst && <td>{b.customerPhone ?? "—"}</td>}
                  {!nameFirst && <td>{formatCurrency(b.depositAmount)}</td>}
                  {nameFirst && <td>{formatCurrency(b.agencyFee ?? null)}</td>}
                  <td>{b.branch ?? "—"}</td>
                  <td>{b.note ?? "—"}</td>
                  <td>
                    {!restrictedView && (
                      nameFirst ? (
                        // 預定單代訂費建單時就先收了：訂到了＝完成；沒訂到＝退款
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => { setDoneTarget(b); setDoneBooker(b.actualBooker ?? ""); }} className="btn btn-primary" style={{ padding: "4px 10px", fontSize: 13 }}>訂到了</button>
                          <button onClick={() => handleReservedResult(b, "refunded")} className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 13, color: "var(--color-danger)" }}>沒訂到</button>
                          <Link href={`/bookings/${b.id}/edit?from=${fromKey}`} className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 13 }}>編輯</Link>
                        </div>
                      ) : b.bookingCode ? (
                        <button onClick={() => handleOpenSale(b)} className="btn btn-primary" style={{ padding: "4px 10px", fontSize: 13 }}>銷售</button>
                      ) : (
                        <Link href={`/bookings/${b.id}/edit?from=${fromKey}`} className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 13 }}>編輯</Link>
                      )
                    )}
                  </td>
                </tr>
              ))}
              {!loading && visibleBookings.length === 0 && (
                <tr><td colSpan={colCount} style={{ textAlign: "center", color: "var(--gray-400)" }}>目前沒有可以銷售的{category}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {doneTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setDoneTarget(null)}>
          <div className="erp-card" style={{ width: 400, maxWidth: "calc(100vw - 32px)", padding: 0 }} onClick={(e) => e.stopPropagation()}>
            <div className="erp-card-header">
              <span className="erp-card-title">預定單訂到了</span>
              <button onClick={() => setDoneTarget(null)} className="btn btn-ghost">✕</button>
            </div>
            <div className="erp-card-body">
              <div style={{ fontSize: 13, color: "var(--gray-600)", marginBottom: 14, lineHeight: 1.8 }}>
                <div><strong>{doneTarget.customerName || "（未填姓名）"}</strong>　{doneTarget.customerPhone}</div>
                <div>{doneTarget.branch}　{doneTarget.bookingDate}　{doneTarget.timeSlot}　{doneTarget.partySize ? `${doneTarget.partySize} 人` : ""}</div>
                <div>代訂費：{formatCurrency(doneTarget.agencyFee ?? null)}</div>
              </div>
              <div className="erp-form-group">
                <label className="erp-label">誰訂到的</label>
                <StaffOptionSelect value={doneBooker} onChange={setDoneBooker} />
              </div>
              <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
                <button onClick={() => handleReservedResult(doneTarget, "sold", doneBooker)} className="btn btn-primary">確認訂到</button>
                <button onClick={() => setDoneTarget(null)} className="btn btn-secondary">取消</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {saleTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setSaleTarget(null)}>
          <div className="erp-card" style={{ width: 460, padding: 0 }} onClick={(e) => e.stopPropagation()}>
            <div className="erp-card-header">
              <span className="erp-card-title">銷售／收款</span>
              <button onClick={() => setSaleTarget(null)} className="btn btn-ghost">✕</button>
            </div>
            <div className="erp-card-body">
              <div style={{ fontSize: 13, color: "var(--gray-600)", marginBottom: 14, lineHeight: 1.8 }}>
                <div>{saleTarget.branch}　{saleTarget.bookingDate}　{saleTarget.timeSlot}　{saleTarget.partySize} 人</div>
                <div>{saleTarget.customerName}　{saleTarget.customerPhone}</div>
                <div>訂位代號：{saleTarget.bookingCode ?? "—"}　訂金：{formatCurrency(saleTarget.depositAmount)}</div>
              </div>
              <div className="erp-form-grid">
                <div className="erp-form-group">
                  <label className="erp-label">買家姓名</label>
                  <input className="erp-input" placeholder="賣給哪位客人" value={saleForm.buyerName} onChange={(e) => setSaleForm((f) => ({ ...f, buyerName: e.target.value }))} />
                </div>
                <div className="erp-form-group">
                  <label className="erp-label">買家電話</label>
                  <input className="erp-input" inputMode="tel" value={saleForm.buyerPhone} onChange={(e) => setSaleForm((f) => ({ ...f, buyerPhone: e.target.value }))} />
                </div>
                <div className="erp-form-group">
                  <label className="erp-label">售出日期</label>
                  <input type="date" className="erp-input" value={saleForm.soldDate} onChange={(e) => setSaleForm((f) => ({ ...f, soldDate: e.target.value }))} />
                </div>
                <div className="erp-form-group">
                  <label className="erp-label">收款金額</label>
                  <input type="number" step="0.01" className="erp-input" placeholder="0" value={saleForm.collectedAmount} onChange={(e) => setSaleForm((f) => ({ ...f, collectedAmount: e.target.value }))} />
                </div>
                <div className="erp-form-group">
                  <label className="erp-label">帳戶</label>
                  <input className="erp-input" value={saleForm.account} onChange={(e) => setSaleForm((f) => ({ ...f, account: e.target.value }))} />
                </div>
                <div className="erp-form-group">
                  <label className="erp-label">代訂費（總共）</label>
                  <input type="number" step="0.01" className="erp-input" placeholder="0" value={saleForm.agencyFee} onChange={(e) => setSaleForm((f) => ({ ...f, agencyFee: e.target.value }))} />
                </div>
                <div className="erp-form-group">
                  <label className="erp-label">銷售平台</label>
                  <SalesChannelSelect value={saleForm.salesChannelId} onChange={(v) => setSaleForm((f) => ({ ...f, salesChannelId: v }))} />
                </div>
                <div className="erp-form-group">
                  <label className="erp-label">銷售人員</label>
                  <select className="erp-select" value={saleForm.salespersonId} onChange={(e) => setSaleForm((f) => ({ ...f, salespersonId: e.target.value }))}>
                    <option value="">— 未指定 —</option>
                    {csStaff.map((u) => (
                      <option key={u.id} value={u.id}>{u.name ?? u.id}</option>
                    ))}
                  </select>
                </div>
              </div>
              {saleError && <div className="erp-alert danger" style={{ marginTop: 10 }}>{saleError}</div>}
              <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
                <button onClick={handleSubmitSale} disabled={submittingSale} className="btn btn-primary">
                  {submittingSale ? "儲存中..." : "確認售出"}
                </button>
                <button onClick={() => setSaleTarget(null)} className="btn btn-secondary">取消</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

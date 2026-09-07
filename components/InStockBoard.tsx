"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import {
  WEEKDAYS,
  getMealPeriod,
  dateLabel,
  parseDateOnly,
  isTaiwanHoliday,
  QUOTE_CLOSING,
  loadPriceSettings,
  savePriceSettings,
  type PriceSettings,
} from "@/lib/quote";

type Booking = {
  id: string;
  vendorId: string | null;
  branch: string | null;
  category: string;
  bookingDate: string;
  timeSlot: string | null;
  partySize: number | null;
  bookingCode: string | null;
  customerName: string | null;
  customerPhone: string | null;
  depositAmount: string | null;
  note: string | null;
  status: "unsold" | "reserved" | "sold" | "refunded";
};

export function InStockBoard() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [vendorMap, setVendorMap] = useState<Map<string, string>>(new Map());
  const [csStaff, setCsStaff] = useState<{ id: string; name: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingBookingIds, setPendingBookingIds] = useState<Set<string>>(new Set());

  // 篩選條件
  const [branchFilter, setBranchFilter] = useState("");
  const [mealFilter, setMealFilter] = useState("");
  const [weekdayFilter, setWeekdayFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [partyMin, setPartyMin] = useState("");
  const [search, setSearch] = useState("");

  // 勾選 + 報時間/報價
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [timeOutput, setTimeOutput] = useState("");
  const [timeCopyMsg, setTimeCopyMsg] = useState("");
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [priceSettings, setPriceSettings] = useState<PriceSettings>(() =>
    typeof window === "undefined" ? { weekdayRate: 300, weekendRate: 300 } : loadPriceSettings()
  );
  const [quoteUnits, setQuoteUnits] = useState("");
  const [showPartyNote, setShowPartyNote] = useState(false);
  const [quoteCopyMsg, setQuoteCopyMsg] = useState("");

  // 轉需求（可一次勾選多筆合併成一組）
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestForm, setRequestForm] = useState({ note: "", proposedBranch: "", proposedBookingDate: "", proposedTimeSlot: "", proposedPartySize: "" });
  const [submittingRequest, setSubmittingRequest] = useState(false);

  // 銷售 modal
  const [saleTarget, setSaleTarget] = useState<Booking | null>(null);
  const [saleForm, setSaleForm] = useState({ soldDate: "", collectedAmount: "", account: "", agencyFee: "", salespersonId: "" });
  const [submittingSale, setSubmittingSale] = useState(false);
  const [saleError, setSaleError] = useState("");

  useEffect(() => {
    fetch("/api/booking-requests?status=pending")
      .then((res) => res.json())
      .then((data) => {
        const ids = (Array.isArray(data) ? data : []).flatMap((r: { bookingIds: string[] }) => r.bookingIds);
        setPendingBookingIds(new Set(ids));
      });

    fetch("/api/directory")
      .then((res) => res.json())
      .then((data) => {
        const all = Array.isArray(data) ? data : [];
        const vendors = all.filter((u: { roles: string[] }) => u.roles.includes("vendor"));
        setVendorMap(new Map(vendors.map((v: { id: string; name: string | null }) => [v.id, v.name ?? v.id])));
        const cs = all.filter((u: { roles: string[] }) => u.roles.includes("customer_service"));
        setCsStaff(cs);
      });

    fetch("/api/me")
      .then((res) => res.json())
      .then((me) => {
        const roles: string[] = me.roles ?? [];
        // 客服看全部廠商的現貨單，廠商只看自己的
        const url = roles.includes("customer_service") ? "/api/admin/bookings" : "/api/bookings";
        return fetch(url).then((res) => res.json());
      })
      .then((data) => {
        const rows: Booking[] = (Array.isArray(data) ? data : []).filter(
          (b: Booking) => b.status === "unsold" && b.category === "現貨單"
        );
        setBookings(rows);
        setLoading(false);
      });
  }, []);

  const branches = useMemo(
    () => Array.from(new Set(bookings.map((b) => b.branch).filter((b): b is string => !!b))).sort(),
    [bookings]
  );

  const filtered = useMemo(() => {
    let rows = bookings;
    if (branchFilter) rows = rows.filter((b) => b.branch === branchFilter);
    if (mealFilter) rows = rows.filter((b) => getMealPeriod(b.timeSlot) === mealFilter);
    if (weekdayFilter !== "") rows = rows.filter((b) => parseDateOnly(b.bookingDate).getDay() === Number(weekdayFilter));
    if (dateFilter) rows = rows.filter((b) => b.bookingDate === dateFilter);
    if (partyMin) rows = rows.filter((b) => (b.partySize ?? 0) >= Number(partyMin));
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (b) => (b.customerName ?? "").toLowerCase().includes(q) || (b.customerPhone ?? "").includes(q)
      );
    }
    return [...rows].sort((a, b) => {
      const d = a.bookingDate.localeCompare(b.bookingDate);
      return d !== 0 ? d : (a.timeSlot ?? "").localeCompare(b.timeSlot ?? "");
    });
  }, [bookings, branchFilter, mealFilter, weekdayFilter, dateFilter, partyMin, search]);

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleSelectAll = () =>
    setSelected((s) => (s.size === filtered.length ? new Set() : new Set(filtered.map((b) => b.id))));

  const selectedBookings = useMemo(
    () => filtered.filter((b) => selected.has(b.id)).sort((a, b) => (a.timeSlot ?? "").localeCompare(b.timeSlot ?? "")),
    [filtered, selected]
  );

  const handleOpenTimeModal = () => {
    const lines = [...selected]
      .map((id) => bookings.find((b) => b.id === id))
      .filter((b): b is Booking => !!b)
      .sort((a, b) => {
        const d = a.bookingDate.localeCompare(b.bookingDate);
        return d !== 0 ? d : (a.timeSlot ?? "").localeCompare(b.timeSlot ?? "");
      })
      .map((b) => `${b.branch ?? ""} ${dateLabel(b.bookingDate)} ${b.timeSlot ?? ""}`);
    setTimeOutput(lines.join("\n"));
    setTimeCopyMsg("");
    setShowTimeModal(true);
  };

  const handleCopyTime = async () => {
    try {
      await navigator.clipboard.writeText(timeOutput);
    } catch {
      // clipboard 權限問題就不特別處理，使用者可以自己選取複製
    }
    setTimeCopyMsg("已複製！");
    setSelected(new Set());
  };

  const buildQuoteText = () => {
    if (selectedBookings.length === 0) return "";
    const b0 = selectedBookings[0];
    const n = parseInt(quoteUnits) || 0;
    const bookingLine = `${b0.branch ?? ""}\t${dateLabel(b0.bookingDate)}\t${b0.timeSlot ?? ""}\t${n}位用餐`;
    const deposit = selectedBookings.reduce((sum, b) => sum + (b.depositAmount ? Number(b.depositAmount) : 0), 0);
    const rate = isTaiwanHoliday(parseDateOnly(b0.bookingDate)) ? priceSettings.weekendRate : priceSettings.weekdayRate;
    const agentFee = rate * n;
    const total = deposit + agentFee;
    const partyNote = showPartyNote
      ? `\n\n因為這筆訂單我們本來是訂${b0.partySize ?? 0}位\n會幫你改${n}位用餐　訂金都能折抵的放心歐`
      : "";
    return `${bookingLine}

這樣費用如下先給您參考
已預繳餐廳訂金${deposit}元
(當天用餐可全額折抵餐費）
代訂費${rate}*${n}=${agentFee}元

共 需要匯款${total}元

${QUOTE_CLOSING}${partyNote}`;
  };

  const handleOpenQuoteModal = () => {
    setQuoteUnits("");
    setShowPartyNote(false);
    setQuoteCopyMsg("");
    setShowQuoteModal(true);
  };

  const handleCopyQuote = async () => {
    const text = buildQuoteText();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 忽略
    }
    setQuoteCopyMsg("已複製！");
    setSelected(new Set());
  };

  const updatePriceSetting = (key: keyof PriceSettings, val: string) => {
    const next = { ...priceSettings, [key]: Math.max(0, parseInt(val) || 0) };
    setPriceSettings(next);
    savePriceSettings(next);
  };

  const handleOpenRequestModal = () => {
    setRequestForm({ note: "", proposedBranch: "", proposedBookingDate: "", proposedTimeSlot: "", proposedPartySize: "" });
    setShowRequestModal(true);
  };

  const handleSubmitRequest = async () => {
    setSubmittingRequest(true);
    const res = await fetch("/api/booking-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingIds: [...selected], ...requestForm }),
    });
    setSubmittingRequest(false);
    if (res.ok) {
      setShowRequestModal(false);
      setSelected(new Set());
      const data = await fetch("/api/booking-requests?status=pending").then((r) => r.json());
      const ids = (Array.isArray(data) ? data : []).flatMap((r: { bookingIds: string[] }) => r.bookingIds);
      setPendingBookingIds(new Set(ids));
    }
  };

  const handleOpenSale = (b: Booking) => {
    setSaleTarget(b);
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    setSaleForm({
      soldDate: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`,
      collectedAmount: "",
      account: "",
      agencyFee: "",
      salespersonId: "",
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

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">現貨單看板</h1>
          <p className="erp-page-subtitle">目前可以銷售（未售出）的現貨單，共 {loading ? "…" : filtered.length} 筆</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
        </div>
      </div>

      <div className="erp-card" style={{ marginBottom: 16 }}>
        <div className="erp-card-body" style={{ padding: "12px 16px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select className="erp-select" style={{ maxWidth: 150 }} value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="">全部分店</option>
            {branches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className="erp-select" style={{ maxWidth: 120 }} value={mealFilter} onChange={(e) => setMealFilter(e.target.value)}>
            <option value="">全部餐期</option>
            <option value="午餐">午餐</option>
            <option value="下午茶">下午茶</option>
            <option value="晚餐">晚餐</option>
          </select>
          <select className="erp-select" style={{ maxWidth: 120 }} value={weekdayFilter} onChange={(e) => setWeekdayFilter(e.target.value)}>
            <option value="">全部星期</option>
            <option value="0">星期日</option>
            <option value="1">星期一</option>
            <option value="2">星期二</option>
            <option value="3">星期三</option>
            <option value="4">星期四</option>
            <option value="5">星期五</option>
            <option value="6">星期六</option>
          </select>
          <input type="date" className="erp-input" style={{ maxWidth: 160 }} value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--gray-600)" }}>
            人數≥
            <input type="number" min="0" className="erp-input" placeholder="不限" style={{ width: 80 }} value={partyMin} onChange={(e) => setPartyMin(e.target.value)} />
          </div>
          <input className="erp-input" style={{ maxWidth: 200 }} placeholder="搜尋姓名或電話" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="erp-card">
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length} onChange={toggleSelectAll} />
                </th>
                <th>廠商</th>
                <th>日期</th>
                <th>星期</th>
                <th>時段</th>
                <th>人數</th>
                <th>訂位代號</th>
                <th>姓名</th>
                <th>電話</th>
                <th>訂金</th>
                <th>分店</th>
                <th>需求</th>
                <th>備註</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={14} style={{ textAlign: "center", color: "var(--gray-400)" }}>載入中...</td></tr>
              )}
              {!loading && filtered.map((b) => (
                <tr key={b.id}>
                  <td><input type="checkbox" checked={selected.has(b.id)} onChange={() => toggleSelect(b.id)} /></td>
                  <td>{b.vendorId ? (vendorMap.get(b.vendorId) ?? "—") : "—"}</td>
                  <td>{b.bookingDate}</td>
                  <td>週{WEEKDAYS[parseDateOnly(b.bookingDate).getDay()]}</td>
                  <td>{b.timeSlot ?? "—"}</td>
                  <td>{b.partySize ?? "—"}</td>
                  <td className="font-mono">{b.bookingCode ?? "—"}</td>
                  <td>{b.customerName ?? "—"}</td>
                  <td>{b.customerPhone ?? "—"}</td>
                  <td>{formatCurrency(b.depositAmount)}</td>
                  <td>{b.branch ?? "—"}</td>
                  <td>{pendingBookingIds.has(b.id) && <span className="badge badge-warning">需求處理中</span>}</td>
                  <td>{b.note ?? "—"}</td>
                  <td><button onClick={() => handleOpenSale(b)} className="btn btn-primary" style={{ padding: "4px 10px", fontSize: 13 }}>銷售</button></td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={14} style={{ textAlign: "center", color: "var(--gray-400)" }}>目前沒有符合條件的現貨單</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: "1px solid var(--gray-100)" }}>
          <span style={{ fontSize: 13, color: "var(--gray-500)" }}>已選 {selected.size} 筆</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button onClick={handleOpenRequestModal} disabled={selected.size === 0} className="btn btn-secondary">轉需求</button>
            <button onClick={handleOpenTimeModal} disabled={selected.size === 0} className="btn btn-secondary">報時間</button>
            <button onClick={handleOpenQuoteModal} disabled={selected.size === 0} className="btn btn-primary">產生報價</button>
          </div>
        </div>
      </div>

      {showRequestModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setShowRequestModal(false)}>
          <div className="erp-card" style={{ width: 460, padding: 0 }} onClick={(e) => e.stopPropagation()}>
            <div className="erp-card-header">
              <span className="erp-card-title">轉需求（已選 {selected.size} 筆合併成一組）</span>
              <button onClick={() => setShowRequestModal(false)} className="btn btn-ghost">✕</button>
            </div>
            <div className="erp-card-body">
              <div style={{ fontSize: 13, color: "var(--gray-600)", marginBottom: 10 }}>
                {selectedBookings.map((b) => (
                  <div key={b.id}>{b.branch}　{b.bookingDate}　{b.timeSlot}　{b.partySize}人</div>
                ))}
              </div>
              <p style={{ fontSize: 12, color: "var(--gray-400)", marginBottom: 10 }}>
                下面填的內容會一次套用到勾選的全部單據上（同一組要改成一樣的）。
              </p>
              <div className="erp-form-grid">
                <div className="erp-form-group">
                  <label className="erp-label">改成人數</label>
                  <input type="number" className="erp-input" placeholder="不改就留空" value={requestForm.proposedPartySize} onChange={(e) => setRequestForm({ ...requestForm, proposedPartySize: e.target.value })} />
                </div>
                <div className="erp-form-group full">
                  <label className="erp-label">說明</label>
                  <textarea className="erp-textarea" rows={2} placeholder="給管理員的說明" value={requestForm.note} onChange={(e) => setRequestForm({ ...requestForm, note: e.target.value })} />
                </div>
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <button onClick={handleSubmitRequest} disabled={submittingRequest} className="btn btn-primary">
                  {submittingRequest ? "送出中..." : "送出需求"}
                </button>
                <button onClick={() => setShowRequestModal(false)} className="btn btn-secondary">取消</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showTimeModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setShowTimeModal(false)}>
          <div className="erp-card" style={{ width: 420, padding: 0 }} onClick={(e) => e.stopPropagation()}>
            <div className="erp-card-header">
              <span className="erp-card-title">時間清單（已選 {selected.size} 筆）</span>
              <button onClick={() => setShowTimeModal(false)} className="btn btn-ghost">✕</button>
            </div>
            <div className="erp-card-body">
              <textarea className="erp-textarea" readOnly rows={7} value={timeOutput} />
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                <button onClick={handleCopyTime} className="btn btn-primary">複製</button>
                <span style={{ fontSize: 13, color: "var(--color-success)" }}>{timeCopyMsg}</span>
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
                  <label className="erp-label">代訂費（全座）</label>
                  <input type="number" step="0.01" className="erp-input" placeholder="0" value={saleForm.agencyFee} onChange={(e) => setSaleForm((f) => ({ ...f, agencyFee: e.target.value }))} />
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

      {showQuoteModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setShowQuoteModal(false)}>
          <div className="erp-card" style={{ width: 480, maxHeight: "85vh", overflowY: "auto", padding: 0 }} onClick={(e) => e.stopPropagation()}>
            <div className="erp-card-header">
              <span className="erp-card-title">產生報價文字</span>
              <button onClick={() => setShowQuoteModal(false)} className="btn btn-ghost">✕</button>
            </div>
            <div className="erp-card-body">
              <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
                  代訂費(平日)
                  <input type="number" min="0" className="erp-input" value={priceSettings.weekdayRate} onChange={(e) => updatePriceSetting("weekdayRate", e.target.value)} />
                </label>
                <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
                  代訂費(假日)
                  <input type="number" min="0" className="erp-input" value={priceSettings.weekendRate} onChange={(e) => updatePriceSetting("weekendRate", e.target.value)} />
                </label>
              </div>
              <div style={{ fontSize: 13, color: "var(--gray-600)", marginBottom: 10 }}>
                {selectedBookings.map((b) => (
                  <div key={b.id}>{b.customerName || "（無姓名）"}　{b.bookingDate}　{b.timeSlot}　{b.partySize}人　{b.branch}</div>
                ))}
              </div>
              <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                代訂費單位數
                <input type="number" min="0" className="erp-input" placeholder="請輸入" style={{ width: 100 }} value={quoteUnits} onChange={(e) => setQuoteUnits(e.target.value)} />
              </label>
              <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <input type="checkbox" checked={showPartyNote} onChange={(e) => setShowPartyNote(e.target.checked)} />
                加註：原訂位人數變動說明
              </label>
              <textarea className="erp-textarea" readOnly rows={10} value={buildQuoteText()} />
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                <button onClick={handleCopyQuote} className="btn btn-primary">複製報價文字</button>
                <span style={{ fontSize: 13, color: "var(--color-success)" }}>{quoteCopyMsg}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

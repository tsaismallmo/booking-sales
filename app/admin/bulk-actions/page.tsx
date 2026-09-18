"use client";

import { useEffect, useState } from "react";

type Account = { id: string; name: string | null; email: string; roles: string[] };

type BookingMatch = {
  id: string;
  bookingCode: string | null;
  bookingDate: string;
  branch: string | null;
  timeSlot: string | null;
  category: string;
  customerName: string | null;
  customerPhone: string | null;
  partySize: number | null;
  status: string;
  isInline: boolean;
  isEztable: boolean;
};

type LookupResult = {
  code: string;
  date: string | null;
  branch: string | null;
  timeSlot: string | null;
  matches: BookingMatch[];
  exactMatch: boolean;
};

type StatusValue = "" | "unsold" | "sold" | "refunded";
type PlatformValue = "" | "eztable" | "inline";

const STATUS_OPTIONS: { value: StatusValue; label: string }[] = [
  { value: "", label: "— 不更新 —" },
  { value: "unsold", label: "空白（未售出）" },
  { value: "sold", label: "售" },
  { value: "refunded", label: "退" },
];
const PLATFORM_OPTIONS: { value: PlatformValue; label: string }[] = [
  { value: "", label: "— 不更新 —" },
  { value: "eztable", label: "EZTABLE" },
  { value: "inline", label: "INLINE" },
];

// 一次貼上就同時比對單據 + 更新所有欄位（狀態、資料來源、售出資訊都在同一批資料裡）。
// 唯一鍵是「分店＋訂位代號＋日期＋時段＋人數＋姓名＋電話」七個欄位一起精準比對，
// 姓名／電話一定要是分開的欄位才能做嚴格比對；customerRaw 是姓名電話合併在同一欄的舊格式，
// 只能拿來做「包含」的模糊比對，兩者都支援，優先用分開的姓名／電話。
type ColMap = {
  bookingCode: number;
  bookingDate: number;
  branch: number;
  timeSlot: number;
  partySize: number;
  customerName: number;
  customerPhone: number;
  customerRaw: number;
  deposit: number;
  vendorRaw: number;
  status: number;
  platform: number;
  soldDate: number;
  collectedAmount: number;
  account: number;
  salespersonRaw: number;
  agencyFee: number;
  soldCount: number;
  note: number;
  cancelDeadline: number;
};

type ParsedRow = {
  lineNo: number;
  bookingCode: string;
  bookingDate: string;
  branch: string;
  timeSlot: string;
  partySize: string;
  customerName: string;
  customerPhone: string;
  customerRaw: string;
  deposit: string;
  vendorRaw: string;
  status: StatusValue;
  platform: PlatformValue;
  soldDate: string;
  collectedAmount: string;
  account: string;
  salespersonRaw: string;
  agencyFee: string;
  soldCount: string;
  note: string;
  cancelDeadline: string;
  // resolved
  lookupResult: LookupResult | null;
  selectedBookingId: string;
  vendorId: string;
  salespersonId: string;
  // result
  updateState: "idle" | "ok" | "error";
  updateMsg: string;
};

type Phase = "input" | "preview" | "done";

// 標題關鍵字對應欄位名稱。customerRaw（姓名電話合併欄）要放在 customerName 前面比對，
// 不然像「姓名+電話」這種標題會先被 customerName 的「姓名」關鍵字誤判掉
const HEADER_ALIASES: Record<keyof ColMap, string[]> = {
  bookingCode:     ["訂位代號", "booking code", "code"],
  bookingDate:     ["日期", "用餐日期", "booking date"],
  branch:          ["分店", "branch"],
  timeSlot:        ["時段", "time slot", "timeslot"],
  partySize:       ["人數", "party size"],
  customerRaw:     ["姓名+電話", "姓名電話", "電話+姓名", "customer"],
  customerName:    ["姓名", "name"],
  customerPhone:   ["電話", "手機", "phone"],
  deposit:         ["餐廳訂金", "訂金", "deposit"],
  vendorRaw:       ["訂單歸屬", "廠商", "vendor"],
  status:          ["狀態", "status"],
  platform:        ["資料來源", "來源", "platform", "source"],
  soldDate:        ["售出日期", "sold date"],
  collectedAmount: ["收款金額", "收款"],
  account:         ["帳戶", "account"],
  salespersonRaw:  ["銷售人員", "銷售", "salesperson"],
  agencyFee:       ["代訂費", "agency fee"],
  soldCount:       ["實賣人數", "實售", "sold count"],
  note:            ["備註", "退訂原因", "note"],
  cancelDeadline:  ["退訂期限", "退訂截止", "cancel deadline"],
};

// 沒有標題列時的預設欄位位置（比對用 A–H 固定，姓名電話合併在 G 欄；
// 姓名／電話分開的獨立欄位、「狀態」「資料來源」等其他更新用欄位都要有標題列才會被抓到）
const DEFAULT_MAP: ColMap = {
  vendorRaw: 0, branch: 1, bookingDate: 2, timeSlot: 3, partySize: 4, bookingCode: 5, customerRaw: 6, deposit: 7,
  customerName: -1, customerPhone: -1,
  status: -1, platform: -1, soldDate: -1, collectedAmount: -1, account: -1, salespersonRaw: -1, agencyFee: -1, soldCount: -1, note: -1, cancelDeadline: -1,
};

function detectColMap(headerCols: string[]): Partial<ColMap> {
  const map: Partial<ColMap> = {};
  headerCols.forEach((h, i) => {
    const norm = h.trim().toLowerCase();
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.some((a) => norm.includes(a.toLowerCase()))) {
        (map as Record<string, number>)[field] = i;
        break;
      }
    }
  });
  return map;
}

// 欄位有偵測到才會解析：偵測不到就回傳 ''（代表「不更新」），
// 偵測到但儲存格是空白，狀態欄位當作「空白＝未售出」，資料來源欄位當作「不更新」
function normaliseStatus(colIdx: number, cell: string): StatusValue {
  if (colIdx < 0) return "";
  if (cell === "售") return "sold";
  if (cell === "退") return "refunded";
  return "unsold";
}
function normalisePlatform(colIdx: number, cell: string): PlatformValue {
  if (colIdx < 0) return "";
  const up = cell.toUpperCase();
  if (up.includes("EZTABLE")) return "eztable";
  if (up.includes("INLINE")) return "inline";
  return "";
}

export default function BulkActionsPage() {
  const [phase, setPhase] = useState<Phase>("input");
  const [tsv, setTsv] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [allUsers, setAllUsers] = useState<Account[]>([]);
  const [vendors, setVendors] = useState<Account[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState("");
  const [detectedCols, setDetectedCols] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data: Account[]) => {
        const all = Array.isArray(data) ? data : [];
        setAllUsers(all);
        setVendors(all.filter((u) => u.roles.includes("vendor")));
      });
  }, []);

  const resolveByName = (list: Account[], raw: string): string => {
    if (!raw.trim()) return "";
    const q = raw.trim().toLowerCase();
    return list.find(
      (u) => (u.name ?? "").toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    )?.id ?? "";
  };

  const handleParse = async () => {
    const lines = tsv.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) return;
    setParsing(true);

    // 偵測是否有標題列
    const firstCols = lines[0].split("\t");
    const colMap = detectColMap(firstCols);
    const hasHeader = Object.keys(colMap).length >= 3; // 至少對應到 3 個已知欄位才算標題列
    const dataLines = hasHeader ? lines.slice(1) : lines;
    const finalMap: ColMap = hasHeader ? { ...DEFAULT_MAP, ...colMap } : DEFAULT_MAP;

    setDetectedCols(hasHeader ? firstCols.map((h) => h.trim()) : []);

    const get = (cols: string[], idx: number) => (idx >= 0 ? (cols[idx] ?? "").trim() : "");

    const parsed: ParsedRow[] = dataLines.map((line, i) => {
      const cols = line.split("\t");
      const vendorRaw = get(cols, finalMap.vendorRaw);
      return {
        lineNo: i + 1,
        bookingCode: get(cols, finalMap.bookingCode),
        bookingDate: normaliseDate(get(cols, finalMap.bookingDate)),
        branch:      get(cols, finalMap.branch),
        timeSlot:    get(cols, finalMap.timeSlot),
        partySize:   get(cols, finalMap.partySize),
        customerName: get(cols, finalMap.customerName),
        customerPhone: get(cols, finalMap.customerPhone),
        customerRaw: get(cols, finalMap.customerRaw),
        deposit:     get(cols, finalMap.deposit),
        vendorRaw,
        status:      normaliseStatus(finalMap.status, get(cols, finalMap.status)),
        platform:    normalisePlatform(finalMap.platform, get(cols, finalMap.platform)),
        soldDate:    normaliseDate(get(cols, finalMap.soldDate)),
        collectedAmount: get(cols, finalMap.collectedAmount),
        account:     get(cols, finalMap.account),
        salespersonRaw: get(cols, finalMap.salespersonRaw),
        agencyFee:   get(cols, finalMap.agencyFee),
        soldCount:   get(cols, finalMap.soldCount),
        note:        get(cols, finalMap.note),
        cancelDeadline: normaliseDate(get(cols, finalMap.cancelDeadline)),
        lookupResult: null,
        selectedBookingId: "",
        vendorId: resolveByName(vendors, vendorRaw),
        salespersonId: "",
        updateState: "idle" as const,
        updateMsg: "",
      };
    }).filter((r) => r.bookingCode); // 跳過沒有訂位代號的列

    // Batch lookup：訂單歸屬（廠商）也要拿來比對，避免不同廠商剛好用了相同的訂位代號互相比對錯
    const lookupItems = parsed.map((r) => ({
      code:        r.bookingCode || undefined,
      date:        r.bookingDate || undefined,
      branch:      r.branch || undefined,
      timeSlot:    r.timeSlot || undefined,
      partySize:   r.partySize || undefined,
      customerName: r.customerName || undefined,
      customerPhone: r.customerPhone || undefined,
      customerRaw: r.customerRaw || undefined,
      deposit:     r.deposit || undefined,
      vendorId:    r.vendorId || undefined,
    }));

    const res = await fetch("/api/admin/bulk-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: lookupItems }),
    });
    const results: LookupResult[] = await res.json();

    const resolved = parsed.map((r, i) => {
      const lr = results[i] ?? null;
      const defaultId = lr?.matches.length === 1 ? lr.matches[0].id : "";
      return {
        ...r,
        lookupResult: lr,
        selectedBookingId: defaultId,
        salespersonId: resolveByName(allUsers, r.salespersonRaw),
      };
    });

    setRows(resolved);
    setParsing(false);
    setPhase("preview");
  };

  const updateRow = (lineNo: number, patch: Partial<ParsedRow>) =>
    setRows((rs) => rs.map((r) => (r.lineNo === lineNo ? { ...r, ...patch } : r)));

  // 一筆一筆序列送出的話，Neon 每次 PATCH 大約 1 秒，上百筆會等超過一分鐘、看起來像卡住；
  // 改成一批併發送出（不要整批一次全丟，避免瞬間打爆連線），並且每批完成就更新畫面看到進度
  const IMPORT_CONCURRENCY = 8;

  const buildBody = (r: ParsedRow): Record<string, string | number | boolean | null | undefined> => {
    const body: Record<string, string | number | boolean | null | undefined> = {
      soldDate:        r.soldDate || undefined,
      collectedAmount: r.collectedAmount ? stripCommas(r.collectedAmount) : undefined,
      account:         r.account || undefined,
      salespersonId:   r.salespersonId || null,
      agencyFee:       r.agencyFee ? stripCommas(r.agencyFee) : undefined,
      soldCount:       r.soldCount ? Number(stripCommas(r.soldCount)) : undefined,
      depositAmount:   r.deposit ? stripCommas(r.deposit) : undefined,
      cancelDeadline:  r.cancelDeadline || undefined,
    };
    if (r.vendorId) body.vendorId = r.vendorId;

    if (r.status) {
      body.status = r.status;
    } else if (r.soldDate) {
      // 沒有「狀態」欄位資料時，維持舊行為：有填售出日期就當作已售出
      body.status = "sold";
    }
    if (body.status === "refunded" && r.note) body.note = r.note;

    if (r.platform === "eztable") body.isEztable = true;
    if (r.platform === "inline") body.isInline = true;

    return body;
  };

  const handleImport = async () => {
    const valid = rows.filter((r) => r.selectedBookingId);
    if (valid.length === 0) return;
    setImporting(true);

    let ok = 0;
    let processed = 0;

    for (let i = 0; i < valid.length; i += IMPORT_CONCURRENCY) {
      const chunk = valid.slice(i, i + IMPORT_CONCURRENCY);
      const chunkResults = await Promise.all(chunk.map(async (r) => {
        const res = await fetch(`/api/bookings/${r.selectedBookingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildBody(r)),
        });
        if (res.ok) return { lineNo: r.lineNo, updateState: "ok" as const, updateMsg: "" };
        const data = await res.json().catch(() => ({}));
        return { lineNo: r.lineNo, updateState: "error" as const, updateMsg: data.error || `HTTP ${res.status}` };
      }));

      ok += chunkResults.filter((r) => r.updateState === "ok").length;
      processed += chunk.length;
      setRows((prev) => prev.map((row) => {
        const result = chunkResults.find((r) => r.lineNo === row.lineNo);
        return result ? { ...row, updateState: result.updateState, updateMsg: result.updateMsg } : row;
      }));
      setSummary(`匯入中... ${processed} / ${valid.length}`);
    }

    setImporting(false);
    setSummary(`完成：${ok} / ${valid.length} 筆更新成功`);
    setPhase("done");
  };

  const matchOk = (r: ParsedRow) => !!r.selectedBookingId;
  const matchCount = rows.filter(matchOk).length;

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">批次作業</h1>
          <p className="erp-page-subtitle">
            {phase === "input" && "從 Excel 複製資料貼上，系統自動比對單據，一次更新狀態、資料來源跟其他售出資訊"}
            {phase === "preview" && (importing ? summary : `解析 ${rows.length} 列，可比對 ${matchCount} 筆`)}
            {phase === "done" && summary}
          </p>
        </div>
        {phase === "preview" && (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setPhase("input"); setRows([]); }} className="btn btn-secondary">重新貼上</button>
            <button onClick={handleImport} disabled={importing || matchCount === 0} className="btn btn-primary">
              {importing ? "匯入中..." : `確認匯入（${matchCount} 筆）`}
            </button>
          </div>
        )}
        {phase === "done" && (
          <button onClick={() => { setPhase("input"); setTsv(""); setRows([]); setSummary(""); }} className="btn btn-secondary">再次匯入</button>
        )}
      </div>

      {phase === "input" && (
        <>
          <div className="erp-card" style={{ marginBottom: 16 }}>
            <div className="erp-card-header"><span className="erp-card-title">格式說明</span></div>
            <div className="erp-card-body" style={{ fontSize: 13, color: "var(--gray-600)", lineHeight: 1.9 }}>
              <p><strong>直接貼入含標題列的試算表</strong>（推薦），系統會自動偵測標題列，識別以下欄位（欄位順序不限）：</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginLeft: 12, marginBottom: 8 }}>
                <div style={{ fontSize: 12 }}>
                  <span style={{ color: "var(--gray-400)" }}>比對用：</span>分店、訂位代號、日期、時段、人數、姓名、電話、訂單歸屬
                </div>
                <div style={{ fontSize: 12 }}>
                  <span style={{ color: "var(--gray-400)" }}>更新用：</span>狀態（售／退／空白）、資料來源（EZTABLE／INLINE）、訂單歸屬、售出日期、收款金額、帳戶、銷售人員、代訂費、餐廳訂金、退訂期限、備註
                </div>
                <div style={{ fontSize: 12 }}>
                  <span style={{ color: "var(--gray-400)" }}>略過：</span>星期 等其他欄位
                </div>
              </div>
              <p style={{ marginTop: 6 }}>
                · <strong>唯一鍵是「分店＋訂位代號＋日期＋時段＋人數＋姓名＋電話」七個欄位一起</strong>——這七欄都有值的話，
                會要求這七個欄位完全一致才算同一筆單據，不會模糊比對；找不到完全一致的就是真的找不到，不會退回去猜。
                姓名、電話要是分開的兩個欄位（標題分別叫「姓名」「電話」），不能合併成一欄，不然沒辦法嚴格比對<br />
                · 日期可用 <code>2026-04-05</code>、<code>4/5</code> 或 <code>4月5日</code><br />
                · 「狀態」欄位填「售」會標記為已售出、「退」會標記為退訂、留空白會標記為未售出——三種值都會覆蓋掉原本的狀態，欄位整個不存在（沒偵測到標題）才會不更新狀態<br />
                · 「資料來源」欄位填「EZTABLE」或「INLINE」會標記對應的平台，不會清掉另一個平台的勾選<br />
                · 訂單歸屬／銷售人員填名字，系統自動比對帳號；沒有標題列時，只有比對用的 A–H 欄會被讀到（姓名電話合併成一欄），其他欄位（含分開的姓名/電話、狀態、資料來源）需要有標題列才能被偵測到
              </p>
            </div>
          </div>

          <div className="erp-card">
            <div className="erp-card-body">
              <textarea
                className="erp-textarea"
                rows={18}
                placeholder={"貼入 Excel 複製的資料（含或不含標題列皆可）"}
                value={tsv}
                onChange={(e) => setTsv(e.target.value)}
                style={{ fontFamily: "monospace", fontSize: 13 }}
              />
              <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={handleParse} disabled={parsing || !tsv.trim()} className="btn btn-primary">
                  {parsing ? "解析中..." : "解析預覽"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {(phase === "preview" || phase === "done") && (
        <div className="erp-card">
          {detectedCols.length > 0 && (
            <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--gray-100)", fontSize: 12, color: "var(--gray-500)" }}>
              已偵測到標題列，共 {detectedCols.length} 欄
            </div>
          )}
          <div style={{ overflowX: "auto" }}>
            <table className="erp-table" style={{ minWidth: 1400 }}>
              <thead>
                <tr>
                  <th style={{ width: 32 }}>#</th>
                  <th style={{ minWidth: 200 }}>比對結果</th>
                  <th style={{ minWidth: 130 }}>訂單歸屬</th>
                  <th style={{ minWidth: 110 }}>狀態</th>
                  <th style={{ minWidth: 110 }}>資料來源</th>
                  <th style={{ minWidth: 120 }}>售出日期</th>
                  <th style={{ minWidth: 100 }}>收款金額</th>
                  <th style={{ minWidth: 120 }}>帳戶</th>
                  <th style={{ minWidth: 120 }}>銷售人員</th>
                  <th style={{ minWidth: 90 }}>代訂費（全座）</th>
                  <th style={{ minWidth: 80 }}>實賣人數</th>
                  <th style={{ minWidth: 100 }}>餐廳訂金</th>
                  <th style={{ minWidth: 120 }}>退訂期限</th>
                  <th style={{ minWidth: 160 }}>備註</th>
                  <th style={{ width: 50 }}>結果</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const lr = r.lookupResult;
                  const noMatch = !lr || lr.matches.length === 0;
                  const selectedMatch = lr?.matches.find((m) => m.id === r.selectedBookingId);
                  const rowBg =
                    r.updateState === "ok" ? "rgba(34,197,94,.06)" :
                    r.updateState === "error" ? "rgba(239,68,68,.06)" :
                    noMatch ? "rgba(239,68,68,.03)" : undefined;

                  return (
                    <tr key={r.lineNo} style={{ background: rowBg }}>
                      <td style={{ color: "var(--gray-400)", fontSize: 12 }}>{r.lineNo}</td>
                      <td>
                        {noMatch && (
                          <div>
                            <span style={{ color: "var(--color-danger)", fontSize: 12 }}>找不到</span>
                            <div style={{ fontSize: 11, color: "var(--gray-400)", marginTop: 2 }}>
                              {r.bookingCode} · {r.branch} · {r.bookingDate} · {r.timeSlot}
                            </div>
                          </div>
                        )}
                        {!noMatch && lr && lr.matches.length > 1 && (
                          <select className="erp-select" style={{ fontSize: 12, marginBottom: 2 }}
                            value={r.selectedBookingId}
                            onChange={(e) => updateRow(r.lineNo, { selectedBookingId: e.target.value })}>
                            <option value="">— 選擇正確筆 —</option>
                            {lr.matches.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.bookingCode} · {m.branch} · {m.bookingDate} · {m.timeSlot}
                                {m.customerName ? ` · ${m.customerName}` : ""}
                              </option>
                            ))}
                          </select>
                        )}
                        {selectedMatch && (
                          <div style={{ fontSize: 12, color: "var(--gray-600)" }}>
                            <span className="badge badge-navy" style={{ fontSize: 11, marginRight: 4 }}>{selectedMatch.category}</span>
                            <strong>{selectedMatch.bookingCode}</strong>
                            {" · "}{selectedMatch.branch} · {selectedMatch.bookingDate} · {selectedMatch.timeSlot}
                            {selectedMatch.customerName && ` · ${selectedMatch.customerName}`}
                            {lr && !lr.exactMatch && lr.matches.length > 1 && (
                              <span style={{ color: "var(--color-warning)", marginLeft: 4 }}>▲ 請確認</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        <select className="erp-select" style={{ fontSize: 13 }}
                          value={r.vendorId}
                          onChange={(e) => updateRow(r.lineNo, { vendorId: e.target.value })}>
                          <option value="">— 不更新 —</option>
                          {vendors.map((v) => (
                            <option key={v.id} value={v.id}>{v.name ?? v.email}</option>
                          ))}
                        </select>
                        {r.vendorRaw && !r.vendorId && (
                          <div style={{ fontSize: 11, color: "var(--color-warning)", marginTop: 2 }}>「{r.vendorRaw}」找不到</div>
                        )}
                      </td>
                      <td>
                        <select className="erp-select" style={{ fontSize: 13 }}
                          value={r.status}
                          onChange={(e) => updateRow(r.lineNo, { status: e.target.value as StatusValue })}>
                          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td>
                        <select className="erp-select" style={{ fontSize: 13 }}
                          value={r.platform}
                          onChange={(e) => updateRow(r.lineNo, { platform: e.target.value as PlatformValue })}>
                          {PLATFORM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td>
                        <input type="date" className="erp-input" style={{ fontSize: 13 }}
                          value={r.soldDate} onChange={(e) => updateRow(r.lineNo, { soldDate: e.target.value })} />
                      </td>
                      <td>
                        <input type="number" className="erp-input" style={{ fontSize: 13 }} placeholder="0"
                          value={r.collectedAmount} onChange={(e) => updateRow(r.lineNo, { collectedAmount: e.target.value })} />
                      </td>
                      <td>
                        <input className="erp-input" style={{ fontSize: 13 }} placeholder="帳戶"
                          value={r.account} onChange={(e) => updateRow(r.lineNo, { account: e.target.value })} />
                      </td>
                      <td>
                        <select className="erp-select" style={{ fontSize: 13 }}
                          value={r.salespersonId}
                          onChange={(e) => updateRow(r.lineNo, { salespersonId: e.target.value })}>
                          <option value="">— 未指定 —</option>
                          {allUsers.map((u) => (
                            <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
                          ))}
                        </select>
                        {r.salespersonRaw && !r.salespersonId && (
                          <div style={{ fontSize: 11, color: "var(--color-warning)", marginTop: 2 }}>「{r.salespersonRaw}」找不到</div>
                        )}
                      </td>
                      <td>
                        <input type="number" className="erp-input" style={{ fontSize: 13 }} placeholder="0"
                          value={r.agencyFee} onChange={(e) => updateRow(r.lineNo, { agencyFee: e.target.value })} />
                      </td>
                      <td>
                        <input type="number" min={1} className="erp-input" style={{ fontSize: 13 }} placeholder="全售可不填"
                          value={r.soldCount} onChange={(e) => updateRow(r.lineNo, { soldCount: e.target.value })} />
                      </td>
                      <td>
                        <input type="number" className="erp-input" style={{ fontSize: 13 }} placeholder="0"
                          value={r.deposit} onChange={(e) => updateRow(r.lineNo, { deposit: e.target.value })} />
                      </td>
                      <td>
                        <input type="date" className="erp-input" style={{ fontSize: 13 }}
                          value={r.cancelDeadline} onChange={(e) => updateRow(r.lineNo, { cancelDeadline: e.target.value })} />
                      </td>
                      <td>
                        <input className="erp-input" style={{ fontSize: 13 }} placeholder="退訂原因等（選填）"
                          value={r.note} onChange={(e) => updateRow(r.lineNo, { note: e.target.value })} />
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {r.updateState === "ok" && <span style={{ color: "var(--color-success)", fontWeight: 600 }}>✓</span>}
                        {r.updateState === "error" && (
                          <div>
                            <span style={{ color: "var(--color-danger)", fontSize: 13, fontWeight: 600 }}>✗</span>
                            <div style={{ fontSize: 11, color: "var(--color-danger)", marginTop: 2, maxWidth: 120, wordBreak: "break-word" }}>{r.updateMsg}</div>
                          </div>
                        )}
                        {r.updateState === "idle" && noMatch && <span style={{ color: "var(--color-danger)", fontSize: 12 }}>✗</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {phase === "preview" && (
            <div style={{ padding: "12px 16px", borderTop: "1px solid var(--gray-100)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => { setPhase("input"); setRows([]); }} className="btn btn-secondary">重新貼上</button>
              <button onClick={handleImport} disabled={importing || matchCount === 0} className="btn btn-primary">
                {importing ? "匯入中..." : `確認匯入（${matchCount} 筆）`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function normaliseDate(s: string): string {
  if (!s) return "";
  // 去掉星期後綴：「4/5 週日」→「4/5」、「4月5日 星期一」→「4月5日」
  s = s.replace(/\s*[週周星期].?\s*$/, "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // YYYY/M/D or YYYY/MM/DD
  const ymd = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  // M/D
  const md = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (md) return `2026-${md[1].padStart(2, "0")}-${md[2].padStart(2, "0")}`;
  // X月Y日
  const chi = s.match(/(\d{1,2})月(\d{1,2})日/);
  if (chi) return `2026-${chi[1].padStart(2, "0")}-${chi[2].padStart(2, "0")}`;
  return s;
}

// 去掉千分位逗號，讓 "6,200" → "6200"（PostgreSQL numeric 不接受逗號）
function stripCommas(s: string): string {
  return s.replace(/,/g, "");
}

"use client";

import { useEffect, useState } from "react";

type Account = { id: string; name: string | null; email: string; roles: string[]; nameAliases?: string[] };

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
};

type LookupResult = {
  code: string;
  date: string | null;
  branch: string | null;
  timeSlot: string | null;
  matches: BookingMatch[];
  exactMatch: boolean;
};

// 從標題列偵測到的欄位 index
type ColMap = {
  bookingCode: number;   // 訂位代號（比對）
  bookingDate: number;   // 日期（比對）
  branch: number;        // 分店（比對）
  timeSlot: number;      // 時段（比對）
  partySize: number;     // 人數（比對）
  customerRaw: number;   // 姓名+電話（比對）
  deposit: number;       // 訂金（比對）
  vendorRaw: number;     // 訂單歸屬（更新）
  soldDate: number;      // 售出日期（更新）
  collectedAmount: number; // 收款金額（更新）
  account: number;       // 帳戶（更新）
  salespersonRaw: number;  // 銷售人員（更新）
  agencyFee: number;     // 代訂費全座（更新）
  soldCount: number;     // 實賣人數（更新）
};

type ParsedRow = {
  lineNo: number;
  bookingCode: string;
  bookingDate: string;
  branch: string;
  timeSlot: string;
  partySize: string;
  customerRaw: string;
  deposit: string;
  vendorRaw: string;
  soldDate: string;
  collectedAmount: string;
  account: string;
  salespersonRaw: string;
  agencyFee: string;
  soldCount: string;
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

// 標題關鍵字對應欄位名稱
const HEADER_ALIASES: Record<keyof ColMap, string[]> = {
  bookingCode:     ["訂位代號", "booking code", "code"],
  bookingDate:     ["日期", "用餐日期", "booking date"],
  branch:          ["分店", "branch"],
  timeSlot:        ["時段", "time slot", "timeslot"],
  partySize:       ["人數", "party size"],
  customerRaw:     ["姓名", "customer", "name"],
  deposit:         ["訂金", "deposit"],
  vendorRaw:       ["訂單歸屬", "廠商", "vendor"],
  soldDate:        ["售出日期", "sold date"],
  collectedAmount: ["收款金額", "收款"],
  account:         ["帳戶", "account"],
  salespersonRaw:  ["銷售人員", "銷售", "salesperson"],
  agencyFee:       ["代訂費", "agency fee"],
  soldCount:       ["實賣人數", "實售", "sold count"],
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

// 當沒有標題列時，使用預設的欄位位置（14 欄，對應截圖格式）
// A:訂單歸屬 | B:分店 | C:日期+星期 | D:時段 | E:人數(略) | F:訂位代號
// G:姓名+電話(略) | H:訂金(略) | I:付款人員(略)
// J:售出日期 | K:收款金額 | L:帳戶 | M:銷售 | N:代訂費
const DEFAULT_MAP: ColMap = {
  vendorRaw:       0,   // A
  branch:          1,   // B
  bookingDate:     2,   // C（含星期，解析時自動去掉）
  timeSlot:        3,   // D
  partySize:       4,   // E
  bookingCode:     5,   // F
  customerRaw:     6,   // G（姓名+電話）
  deposit:         7,   // H
  soldDate:        9,   // J
  collectedAmount: 10,  // K
  account:         11,  // L
  salespersonRaw:  12,  // M
  agencyFee:       13,  // N
  soldCount:       -1,  // 預設沒有此欄，有標題列時自動偵測
};

export default function BulkImportPage() {
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

    const get = (cols: string[], idx: number) => (cols[idx] ?? "").trim();

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
        customerRaw: get(cols, finalMap.customerRaw),
        deposit:     get(cols, finalMap.deposit),
        vendorRaw,
        soldDate:    normaliseDate(get(cols, finalMap.soldDate)),
        collectedAmount: get(cols, finalMap.collectedAmount),
        account:     get(cols, finalMap.account),
        salespersonRaw: get(cols, finalMap.salespersonRaw),
        agencyFee:   get(cols, finalMap.agencyFee),
        soldCount:   finalMap.soldCount >= 0 ? get(cols, finalMap.soldCount) : "",
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

  const handleImport = async () => {
    const valid = rows.filter((r) => r.selectedBookingId);
    if (valid.length === 0) return;
    setImporting(true);

    let ok = 0;
    const updated = [...rows];
    for (const r of valid) {
      const body: Record<string, string | number | null | undefined> = {
        soldDate:        r.soldDate || undefined,
        collectedAmount: r.collectedAmount ? stripCommas(r.collectedAmount) : undefined,
        account:         r.account || undefined,
        salespersonId:   r.salespersonId || null,
        agencyFee:       r.agencyFee ? stripCommas(r.agencyFee) : undefined,
        soldCount:       r.soldCount ? Number(stripCommas(r.soldCount)) : undefined,
      };
      // 有售出日期就一併把狀態標成 sold（跟 InStockBoard 銷售 modal 一致）
      if (r.soldDate) body.status = "sold";
      if (r.vendorId) body.vendorId = r.vendorId;

      const res = await fetch(`/api/bookings/${r.selectedBookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const idx = updated.findIndex((u) => u.lineNo === r.lineNo);
      if (res.ok) {
        updated[idx] = { ...updated[idx], updateState: "ok" };
        ok++;
      } else {
        const data = await res.json().catch(() => ({}));
        updated[idx] = { ...updated[idx], updateState: "error", updateMsg: data.error || `HTTP ${res.status}` };
      }
    }

    setRows(updated);
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
          <h1 className="erp-page-title">批次匯入售出資料</h1>
          <p className="erp-page-subtitle">
            {phase === "input" && "從 Excel 複製資料貼上，系統自動比對單據"}
            {phase === "preview" && `解析 ${rows.length} 列，可比對 ${matchCount} 筆`}
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
              <p><strong>方式一：直接貼入含標題列的試算表</strong>（推薦）</p>
              <p style={{ marginLeft: 12 }}>
                系統會自動偵測標題列，識別以下欄位（欄位順序不限）：
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginLeft: 12, marginBottom: 8 }}>
                {[
                  ["比對用", "訂位代號、分店、日期、時段、人數、姓名+電話、訂金、訂單歸屬"],
                  ["更新用", "訂單歸屬、售出日期、收款金額、帳戶、銷售人員、代訂費"],
                  ["略過", "狀態、星期、付款人員、來源 等其他欄位"],
                ].map(([label, content]) => (
                  <div key={label} style={{ fontSize: 12 }}>
                    <span style={{ color: "var(--gray-400)" }}>{label}：</span>{content}
                  </div>
                ))}
              </div>
              <p><strong>方式二：沒有標題列</strong>（固定 14 欄，A–N）</p>
              <p style={{ marginLeft: 12, fontFamily: "monospace", fontSize: 12, background: "var(--gray-50)", padding: "4px 8px", borderRadius: 4, lineHeight: 1.7 }}>
                A:訂單歸屬 | B:分店 | C:<strong>日期+星期</strong> | D:時段 | E:人數 | F:訂位代號 | G:姓名+電話 | H:訂金 | I:付款人員<br />
                <span style={{ color: "var(--color-danger)" }}>J:售出日期 | K:收款金額 | L:帳戶 | M:銷售 | N:代訂費</span>
              </p>
              <p style={{ marginTop: 6 }}>
                · 日期可用 <code>2026-04-05</code>、<code>4/5</code> 或 <code>4月5日</code><br />
                · 訂單歸屬 / 銷售人員填名字，系統自動比對帳號；留空則不更新
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
            <table className="erp-table" style={{ minWidth: 1200 }}>
              <thead>
                <tr>
                  <th style={{ width: 32 }}>#</th>
                  <th style={{ minWidth: 200 }}>比對結果</th>
                  <th style={{ minWidth: 130 }}>訂單歸屬</th>
                  <th style={{ minWidth: 120 }}>售出日期</th>
                  <th style={{ minWidth: 100 }}>收款金額</th>
                  <th style={{ minWidth: 120 }}>帳戶</th>
                  <th style={{ minWidth: 120 }}>銷售人員</th>
                  <th style={{ minWidth: 90 }}>代訂費（全座）</th>
                  <th style={{ minWidth: 80 }}>實賣人數</th>
                  <th style={{ width: 50 }}>狀態</th>
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
                          <>
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
                          </>
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

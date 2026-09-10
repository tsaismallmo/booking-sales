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

// 從標題列偵測到的欄位 index
type ColMap = {
  bookingCode: number;   // 訂位代號（比對）
  bookingDate: number;   // 日期（比對）
  branch: number;        // 分店（比對）
  timeSlot: number;      // 時段（比對）
  partySize: number;     // 人數（比對）
  customerRaw: number;   // 姓名+電話（比對）
  deposit: number;       // 訂金（比對）
  vendorRaw: number;     // 訂單歸屬（比對）
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
  // resolved
  lookupResult: LookupResult | null;
  selectedBookingId: string;
  vendorId: string;
  // result
  updateState: "idle" | "ok" | "error";
  updateMsg: string;
};

type Phase = "input" | "preview" | "done";
type Platform = "inline" | "eztable";

// 標題關鍵字對應欄位名稱
const HEADER_ALIASES: Record<keyof ColMap, string[]> = {
  bookingCode: ["訂位代號", "booking code", "code"],
  bookingDate: ["日期", "用餐日期", "booking date"],
  branch:      ["分店", "branch"],
  timeSlot:    ["時段", "time slot", "timeslot"],
  partySize:   ["人數", "party size"],
  customerRaw: ["姓名", "customer", "name"],
  deposit:     ["訂金", "deposit"],
  vendorRaw:   ["訂單歸屬", "廠商", "vendor"],
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

// 當沒有標題列時，使用預設的欄位位置，跟批次更新售出共用同一套比對欄位順序
// A:訂單歸屬 | B:分店 | C:日期+星期 | D:時段 | E:人數 | F:訂位代號 | G:姓名+電話 | H:訂金
const DEFAULT_MAP: ColMap = {
  vendorRaw:   0,   // A
  branch:      1,   // B
  bookingDate: 2,   // C（含星期，解析時自動去掉）
  timeSlot:    3,   // D
  partySize:   4,   // E
  bookingCode: 5,   // F
  customerRaw: 6,   // G（姓名+電話）
  deposit:     7,   // H
};

const PLATFORM_LABEL: Record<Platform, string> = { inline: "Inline", eztable: "EZTABLE" };

export default function BulkTagPlatformPage() {
  const [platform, setPlatform] = useState<Platform>("inline");
  const [phase, setPhase] = useState<Phase>("input");
  const [tsv, setTsv] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
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
        lookupResult: null,
        selectedBookingId: "",
        vendorId: resolveByName(vendors, vendorRaw),
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

  const handleImport = async () => {
    const valid = rows.filter((r) => r.selectedBookingId);
    if (valid.length === 0) return;
    setImporting(true);

    let ok = 0;
    let processed = 0;
    const field = platform === "inline" ? "isInline" : "isEztable";

    for (let i = 0; i < valid.length; i += IMPORT_CONCURRENCY) {
      const chunk = valid.slice(i, i + IMPORT_CONCURRENCY);
      const chunkResults = await Promise.all(chunk.map(async (r) => {
        const res = await fetch(`/api/bookings/${r.selectedBookingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: true }),
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
      setSummary(`更新中... ${processed} / ${valid.length}`);
    }

    setImporting(false);
    setSummary(`完成：${ok} / ${valid.length} 筆標記為 ${PLATFORM_LABEL[platform]}`);
    setPhase("done");
  };

  const matchOk = (r: ParsedRow) => !!r.selectedBookingId;
  const matchCount = rows.filter(matchOk).length;

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">批次標記 Inline / EZTABLE</h1>
          <p className="erp-page-subtitle">
            {phase === "input" && `從 Excel 複製資料貼上，系統自動比對單據，全部標記為「${PLATFORM_LABEL[platform]}」`}
            {phase === "preview" && (importing ? summary : `解析 ${rows.length} 列，可比對 ${matchCount} 筆`)}
            {phase === "done" && summary}
          </p>
        </div>
        {phase === "preview" && (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setPhase("input"); setRows([]); }} className="btn btn-secondary">重新貼上</button>
            <button onClick={handleImport} disabled={importing || matchCount === 0} className="btn btn-primary">
              {importing ? "更新中..." : `確認標記 ${PLATFORM_LABEL[platform]}（${matchCount} 筆）`}
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
            <div className="erp-card-header"><span className="erp-card-title">要標記成哪個平台？</span></div>
            <div className="erp-card-body" style={{ display: "flex", gap: 20 }}>
              {(["inline", "eztable"] as Platform[]).map((p) => (
                <label key={p} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
                  <input type="radio" name="platform" checked={platform === p} onChange={() => setPlatform(p)} />
                  {PLATFORM_LABEL[p]}
                </label>
              ))}
            </div>
          </div>

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
                  ["略過", "狀態、星期、備註 等其他欄位"],
                ].map(([label, content]) => (
                  <div key={label} style={{ fontSize: 12 }}>
                    <span style={{ color: "var(--gray-400)" }}>{label}：</span>{content}
                  </div>
                ))}
              </div>
              <p><strong>方式二：沒有標題列</strong>（固定 8 欄，A–H）</p>
              <p style={{ marginLeft: 12, fontFamily: "monospace", fontSize: 12, background: "var(--gray-50)", padding: "4px 8px", borderRadius: 4, lineHeight: 1.7 }}>
                A:訂單歸屬 | B:分店 | C:<strong>日期+星期</strong> | D:時段 | E:人數 | F:訂位代號 | G:姓名+電話 | H:訂金
              </p>
              <p style={{ marginTop: 6 }}>
                · 日期可用 <code>2026-04-05</code>、<code>4/5</code> 或 <code>4月5日</code><br />
                · 比對到的單據會標記為上面選的平台，不會清掉另一個平台的勾選、也不會動到其他欄位
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
            <table className="erp-table" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ width: 32 }}>#</th>
                  <th style={{ minWidth: 220 }}>比對結果</th>
                  <th style={{ minWidth: 130 }}>訂單歸屬</th>
                  <th style={{ width: 50 }}>狀態</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const lr = r.lookupResult;
                  const noMatch = !lr || lr.matches.length === 0;
                  const selectedMatch = lr?.matches.find((m) => m.id === r.selectedBookingId);
                  const alreadyTagged = selectedMatch && (platform === "inline" ? selectedMatch.isInline : selectedMatch.isEztable);
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
                            {alreadyTagged && (
                              <span style={{ color: "var(--gray-400)", marginLeft: 4 }}>（已經標記過 {PLATFORM_LABEL[platform]}）</span>
                            )}
                            {lr && !lr.exactMatch && lr.matches.length > 1 && (
                              <span style={{ color: "var(--color-warning)", marginLeft: 4 }}>▲ 請確認</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: 13, color: "var(--gray-600)" }}>
                        {vendors.find((v) => v.id === r.vendorId)?.name ?? r.vendorRaw ?? "—"}
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
                {importing ? "更新中..." : `確認標記 ${PLATFORM_LABEL[platform]}（${matchCount} 筆）`}
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

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

type Mode = "update" | "refund" | "tag_platform";
type Platform = "inline" | "eztable";

const MODE_LABEL: Record<Mode, string> = {
  update: "更新售出資料",
  refund: "標記退訂",
  tag_platform: "標記 Inline / EZTABLE",
};
const PLATFORM_LABEL: Record<Platform, string> = { inline: "Inline", eztable: "EZTABLE" };

// 三種批次操作共用同一套「比對用」欄位，只有各自要「更新」的欄位不一樣
type ColMap = {
  bookingCode: number;
  bookingDate: number;
  branch: number;
  timeSlot: number;
  partySize: number;
  customerRaw: number;
  deposit: number;
  vendorRaw: number;
  soldDate: number;
  collectedAmount: number;
  account: number;
  salespersonRaw: number;
  agencyFee: number;
  soldCount: number;
  note: number;
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
  note: string;
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

// 標題關鍵字對應欄位名稱（各模式只會用到其中一部分）
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
  note:            ["備註", "退訂原因", "note"],
};

// 各模式在「沒有標題列」時的預設欄位位置；三種模式的比對欄位（A–H）都一樣，
// 只有各自「要更新的欄位」接在後面，位置不一樣
const DEFAULT_MAPS: Record<Mode, ColMap> = {
  update: {
    vendorRaw: 0, branch: 1, bookingDate: 2, timeSlot: 3, partySize: 4, bookingCode: 5, customerRaw: 6, deposit: 7,
    soldDate: 9, collectedAmount: 10, account: 11, salespersonRaw: 12, agencyFee: 13,
    soldCount: -1, note: -1,
  },
  refund: {
    vendorRaw: 0, branch: 1, bookingDate: 2, timeSlot: 3, partySize: 4, bookingCode: 5, customerRaw: 6, deposit: 7,
    note: 8,
    soldDate: -1, collectedAmount: -1, account: -1, salespersonRaw: -1, agencyFee: -1, soldCount: -1,
  },
  tag_platform: {
    vendorRaw: 0, branch: 1, bookingDate: 2, timeSlot: 3, partySize: 4, bookingCode: 5, customerRaw: 6, deposit: 7,
    soldDate: -1, collectedAmount: -1, account: -1, salespersonRaw: -1, agencyFee: -1, soldCount: -1, note: -1,
  },
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

export default function BulkActionsPage() {
  const [mode, setMode] = useState<Mode>("update");
  const [platform, setPlatform] = useState<Platform>("inline");
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

  const switchMode = (m: Mode) => {
    setMode(m);
    setPhase("input");
    setTsv("");
    setRows([]);
    setSummary("");
    setDetectedCols([]);
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
    const finalMap: ColMap = hasHeader ? { ...DEFAULT_MAPS[mode], ...colMap } : DEFAULT_MAPS[mode];

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
        customerRaw: get(cols, finalMap.customerRaw),
        deposit:     get(cols, finalMap.deposit),
        vendorRaw,
        soldDate:    normaliseDate(get(cols, finalMap.soldDate)),
        collectedAmount: get(cols, finalMap.collectedAmount),
        account:     get(cols, finalMap.account),
        salespersonRaw: get(cols, finalMap.salespersonRaw),
        agencyFee:   get(cols, finalMap.agencyFee),
        soldCount:   get(cols, finalMap.soldCount),
        note:        get(cols, finalMap.note),
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

  // 一筆一筆序列送出的話，Neon 每次 PATCH 大約 1 秒，上百筆會等超過一分鐘、看起來像卡住；
  // 改成一批併發送出（不要整批一次全丟，避免瞬間打爆連線），並且每批完成就更新畫面看到進度
  const IMPORT_CONCURRENCY = 8;

  const buildBody = (r: ParsedRow): Record<string, string | number | boolean | null | undefined> => {
    if (mode === "update") {
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
      return body;
    }
    if (mode === "refund") {
      const body: Record<string, string> = { status: "refunded" };
      if (r.note) body.note = r.note;
      return body;
    }
    // tag_platform
    return { [platform === "inline" ? "isInline" : "isEztable"]: true };
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
    const doneMsg =
      mode === "update" ? `完成：${ok} / ${valid.length} 筆更新成功` :
      mode === "refund" ? `完成：${ok} / ${valid.length} 筆標記為退訂` :
      `完成：${ok} / ${valid.length} 筆標記為 ${PLATFORM_LABEL[platform]}`;
    setSummary(doneMsg);
    setPhase("done");
  };

  const matchOk = (r: ParsedRow) => !!r.selectedBookingId;
  const matchCount = rows.filter(matchOk).length;
  const confirmLabel =
    mode === "update" ? `確認匯入（${matchCount} 筆）` :
    mode === "refund" ? `確認標記退訂（${matchCount} 筆）` :
    `確認標記 ${PLATFORM_LABEL[platform]}（${matchCount} 筆）`;

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">批次作業</h1>
          <p className="erp-page-subtitle">
            {phase === "input" && "從 Excel 複製資料貼上，系統自動比對單據"}
            {phase === "preview" && (importing ? summary : `解析 ${rows.length} 列，可比對 ${matchCount} 筆`)}
            {phase === "done" && summary}
          </p>
        </div>
        {phase === "preview" && (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setPhase("input"); setRows([]); }} className="btn btn-secondary">重新貼上</button>
            <button onClick={handleImport} disabled={importing || matchCount === 0} className="btn btn-primary">
              {importing ? "匯入中..." : confirmLabel}
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
            <div className="erp-card-header"><span className="erp-card-title">要做什麼？</span></div>
            <div className="erp-card-body" style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              {(["update", "refund", "tag_platform"] as Mode[]).map((m) => (
                <label key={m} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
                  <input type="radio" name="mode" checked={mode === m} onChange={() => switchMode(m)} />
                  {MODE_LABEL[m]}
                </label>
              ))}
            </div>
            {mode === "tag_platform" && (
              <div className="erp-card-body" style={{ paddingTop: 0, display: "flex", gap: 20 }}>
                {(["inline", "eztable"] as Platform[]).map((p) => (
                  <label key={p} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
                    <input type="radio" name="platform" checked={platform === p} onChange={() => setPlatform(p)} />
                    {PLATFORM_LABEL[p]}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="erp-card" style={{ marginBottom: 16 }}>
            <div className="erp-card-header"><span className="erp-card-title">格式說明</span></div>
            <div className="erp-card-body" style={{ fontSize: 13, color: "var(--gray-600)", lineHeight: 1.9 }}>
              <p><strong>方式一：直接貼入含標題列的試算表</strong>（推薦）</p>
              <p style={{ marginLeft: 12 }}>
                系統會自動偵測標題列，識別以下欄位（欄位順序不限）：
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginLeft: 12, marginBottom: 8 }}>
                <div style={{ fontSize: 12 }}>
                  <span style={{ color: "var(--gray-400)" }}>比對用：</span>訂位代號、分店、日期、時段、人數、姓名+電話、訂金、訂單歸屬
                </div>
                <div style={{ fontSize: 12 }}>
                  <span style={{ color: "var(--gray-400)" }}>更新用：</span>
                  {mode === "update" && "訂單歸屬、售出日期、收款金額、帳戶、銷售人員、代訂費"}
                  {mode === "refund" && "備註（選填，例如退訂原因）"}
                  {mode === "tag_platform" && "（不需要，比對到的單據會直接標記為上面選的平台）"}
                </div>
                <div style={{ fontSize: 12 }}>
                  <span style={{ color: "var(--gray-400)" }}>略過：</span>狀態、星期 等其他欄位
                </div>
              </div>
              <p><strong>方式二：沒有標題列</strong></p>
              <p style={{ marginLeft: 12, fontFamily: "monospace", fontSize: 12, background: "var(--gray-50)", padding: "4px 8px", borderRadius: 4, lineHeight: 1.7 }}>
                A:訂單歸屬 | B:分店 | C:<strong>日期+星期</strong> | D:時段 | E:人數 | F:訂位代號 | G:姓名+電話 | H:訂金
                {mode === "update" && <> | I:付款人員<br /><span style={{ color: "var(--color-danger)" }}>J:售出日期 | K:收款金額 | L:帳戶 | M:銷售 | N:代訂費</span></>}
                {mode === "refund" && <> | <span style={{ color: "var(--color-danger)" }}>I:備註</span></>}
              </p>
              <p style={{ marginTop: 6 }}>
                · 日期可用 <code>2026-04-05</code>、<code>4/5</code> 或 <code>4月5日</code><br />
                · 訂單歸屬{mode === "update" && "／銷售人員"}填名字，系統自動比對帳號；留空則不更新
                {mode === "refund" && <><br />· 比對到的單據會一律標記狀態為「退」，其他欄位不會被改動</>}
                {mode === "tag_platform" && <><br />· 比對到的單據會標記為上面選的平台，不會清掉另一個平台的勾選、也不會動到其他欄位</>}
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
            <table className="erp-table" style={{ minWidth: mode === "update" ? 1200 : 900 }}>
              <thead>
                <tr>
                  <th style={{ width: 32 }}>#</th>
                  <th style={{ minWidth: 200 }}>比對結果</th>
                  <th style={{ minWidth: 130 }}>訂單歸屬</th>
                  {mode === "update" && (
                    <>
                      <th style={{ minWidth: 120 }}>售出日期</th>
                      <th style={{ minWidth: 100 }}>收款金額</th>
                      <th style={{ minWidth: 120 }}>帳戶</th>
                      <th style={{ minWidth: 120 }}>銷售人員</th>
                      <th style={{ minWidth: 90 }}>代訂費（全座）</th>
                      <th style={{ minWidth: 80 }}>實賣人數</th>
                    </>
                  )}
                  {mode === "refund" && <th style={{ minWidth: 200 }}>備註</th>}
                  <th style={{ width: 50 }}>狀態</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const lr = r.lookupResult;
                  const noMatch = !lr || lr.matches.length === 0;
                  const selectedMatch = lr?.matches.find((m) => m.id === r.selectedBookingId);
                  const alreadyTagged = mode === "tag_platform" && selectedMatch && (platform === "inline" ? selectedMatch.isInline : selectedMatch.isEztable);
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
                            {mode === "refund" && selectedMatch.status === "refunded" && (
                              <span style={{ color: "var(--gray-400)", marginLeft: 4 }}>（已經是退訂狀態）</span>
                            )}
                            {alreadyTagged && (
                              <span style={{ color: "var(--gray-400)", marginLeft: 4 }}>（已經標記過 {PLATFORM_LABEL[platform]}）</span>
                            )}
                            {lr && !lr.exactMatch && lr.matches.length > 1 && (
                              <span style={{ color: "var(--color-warning)", marginLeft: 4 }}>▲ 請確認</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        {mode === "update" ? (
                          <>
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
                          </>
                        ) : (
                          <span style={{ fontSize: 13, color: "var(--gray-600)" }}>
                            {vendors.find((v) => v.id === r.vendorId)?.name ?? r.vendorRaw ?? "—"}
                          </span>
                        )}
                      </td>
                      {mode === "update" && (
                        <>
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
                        </>
                      )}
                      {mode === "refund" && (
                        <td>
                          <input className="erp-input" style={{ fontSize: 13 }} placeholder="退訂原因（選填）"
                            value={r.note} onChange={(e) => updateRow(r.lineNo, { note: e.target.value })} />
                        </td>
                      )}
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
                {importing ? "匯入中..." : confirmLabel}
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

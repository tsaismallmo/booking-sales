"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type StatusValue = "unsold" | "sold" | "refunded";
type PlatformValue = "" | "eztable" | "inline";

const STATUS_OPTIONS: { value: StatusValue; label: string }[] = [
  { value: "unsold", label: "空白（未售出）" },
  { value: "sold", label: "售" },
  { value: "refunded", label: "退" },
];
const PLATFORM_OPTIONS: { value: PlatformValue; label: string }[] = [
  { value: "", label: "— 無 —" },
  { value: "eztable", label: "EZTABLE" },
  { value: "inline", label: "INLINE" },
];

type ParsedRow = {
  vendorName: string;
  status: StatusValue;
  branch: string;
  bookingDate: string;
  timeSlot: string;
  partySize: string;
  bookingCode: string;
  customerName: string;
  customerPhone: string;
  depositAmount: string;
  depositPayer: string;
  cancelDeadline: string;
  platform: PlatformValue;
  soldDate: string;
  collectedAmount: string;
  account: string;
  salespersonName: string;
  agencyFee: string;
};

type ColMap = {
  vendorRaw: number;
  status: number;
  branch: number;
  bookingDate: number;
  timeSlot: number;
  partySize: number;
  bookingCode: number;
  customerRaw: number;
  customerName: number;
  customerPhone: number;
  deposit: number;
  depositPayer: number;
  cancelDeadline: number;
  platform: number;
  soldDate: number;
  collectedAmount: number;
  account: number;
  salespersonRaw: number;
  agencyFee: number;
};

// 標題關鍵字對應欄位名稱。customerRaw（姓名電話合併欄）要放在 customerName 前面比對，
// 不然像「姓名+電話」這種標題會先被 customerName 的「姓名」關鍵字誤判掉
const HEADER_ALIASES: Record<keyof ColMap, string[]> = {
  vendorRaw:       ["訂單歸屬", "廠商", "vendor"],
  status:          ["狀態", "status"],
  branch:          ["分店", "branch"],
  bookingDate:     ["日期", "用餐日期", "booking date"],
  timeSlot:        ["時段", "time slot", "timeslot"],
  partySize:       ["人數", "party size"],
  bookingCode:     ["訂位代號", "booking code", "code"],
  customerRaw:     ["姓名+電話", "姓名電話", "電話+姓名", "customer"],
  customerName:    ["姓名", "name"],
  customerPhone:   ["電話", "手機", "phone"],
  deposit:         ["訂金", "deposit"],
  depositPayer:    ["付款人", "depositor"],
  cancelDeadline:  ["退訂期限", "退訂截止", "cancel deadline"],
  platform:        ["資料來源", "來源", "platform", "source"],
  soldDate:        ["售出日期", "sold date"],
  collectedAmount: ["收款金額", "收款"],
  account:         ["帳戶", "account"],
  salespersonRaw:  ["銷售人員", "銷售", "salesperson"],
  agencyFee:       ["代訂費", "agency fee"],
};

// 沒有標題列時的固定欄位順序（新版）：訂單歸屬、狀態、分店、日期、時段、人數、訂位代號、
// 姓名+電話（合併在同一欄）、訂金、付款人員、退訂期限、資料來源（選填，可以沒有這欄）；
// 姓名/電話分開、售出日期、收款金額、帳戶、銷售人員、代訂費這些欄位沒有位置可以固定對應，只有有標題列時才抓得到
const DEFAULT_MAP: ColMap = {
  vendorRaw: 0, status: 1, branch: 2, bookingDate: 3, timeSlot: 4, partySize: 5, bookingCode: 6, customerRaw: 7, deposit: 8, depositPayer: 9, cancelDeadline: 10, platform: 11,
  customerName: -1, customerPhone: -1, soldDate: -1, collectedAmount: -1, account: -1, salespersonRaw: -1, agencyFee: -1,
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

function normaliseStatus(cell: string): StatusValue {
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

// 日期正規化，支援：2026/4/5、4/5、4/5 週三、4月5日 → 2026-04-05
function normalizeDate(raw: string): string {
  if (!raw) return "";
  const s = raw.trim().replace(/週[一二三四五六日]/g, "").trim();
  const full = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (full) return `${full[1]}-${full[2].padStart(2, "0")}-${full[3].padStart(2, "0")}`;
  const short = s.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (short) return `2026-${short[1].padStart(2, "0")}-${short[2].padStart(2, "0")}`;
  const chinese = s.match(/^(\d{1,2})月(\d{1,2})日$/);
  if (chinese) return `2026-${chinese[1].padStart(2, "0")}-${chinese[2].padStart(2, "0")}`;
  return raw.trim();
}

// 拆分「姓名+電話」合併格，例如：
//   "林澤晉 0987369898"  → name=林澤晉, phone=0987369898
//   "林澤晉\n0987369898" → 同上
//   "林澤晉"             → name=林澤晉, phone=""
function splitNamePhone(raw: string): { name: string; phone: string } {
  const s = raw.trim();
  const m = s.match(/^([\s\S]*?)\s*(09\d{8})\s*$/);
  if (m) return { name: m[1].trim(), phone: m[2] };
  return { name: s, phone: "" };
}

function parseTsv(raw: string): ParsedRow[] {
  const lines = raw.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];

  const firstCols = lines[0].split("\t");
  const colMap = detectColMap(firstCols);
  const hasHeader = Object.keys(colMap).length >= 3; // 至少對應到 3 個已知欄位才算標題列
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const finalMap: ColMap = hasHeader ? { ...DEFAULT_MAP, ...colMap } : DEFAULT_MAP;

  const get = (cols: string[], idx: number) => (idx >= 0 ? (cols[idx] ?? "").trim() : "");

  return dataLines.filter((l) => l.trim()).map((line) => {
    const cols = line.split("\t");

    const customerRaw = get(cols, finalMap.customerRaw);
    const split = customerRaw ? splitNamePhone(customerRaw) : { name: "", phone: "" };
    const customerName = get(cols, finalMap.customerName) || split.name;
    const customerPhone = get(cols, finalMap.customerPhone) || split.phone;

    return {
      vendorName:      get(cols, finalMap.vendorRaw),
      status:          normaliseStatus(get(cols, finalMap.status)),
      branch:          get(cols, finalMap.branch),
      bookingDate:     normalizeDate(get(cols, finalMap.bookingDate)),
      timeSlot:        get(cols, finalMap.timeSlot),
      partySize:       get(cols, finalMap.partySize),
      bookingCode:     get(cols, finalMap.bookingCode),
      customerName,
      customerPhone,
      depositAmount:   get(cols, finalMap.deposit),
      depositPayer:    get(cols, finalMap.depositPayer),
      cancelDeadline:  normalizeDate(get(cols, finalMap.cancelDeadline)),
      platform:        normalisePlatform(finalMap.platform, get(cols, finalMap.platform)),
      soldDate:        normalizeDate(get(cols, finalMap.soldDate)),
      collectedAmount: get(cols, finalMap.collectedAmount),
      account:         get(cols, finalMap.account),
      salespersonName: get(cols, finalMap.salespersonRaw),
      agencyFee:       get(cols, finalMap.agencyFee),
    };
  });
}

export default function ImportBookingsPage() {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parsed, setParsed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; errors: string[] } | null>(null);

  const handleParse = () => {
    const r = parseTsv(raw);
    setRows(r);
    setParsed(true);
    setResult(null);
  };

  const updateRow = (i: number, patch: Partial<ParsedRow>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const handleImport = async () => {
    setImporting(true);
    const res = await fetch("/api/bookings/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    const data = await res.json().catch(() => ({ inserted: 0, errors: [`伺服器錯誤（${res.status}）`] }));
    setImporting(false);
    setResult(data);
    if (data.inserted > 0 && (data.errors?.length ?? 0) === 0) {
      setTimeout(() => router.push("/bookings"), 1500);
    }
  };

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">大量匯入單據</h1>
          <p className="erp-page-subtitle">從 Google Sheets 複製後貼上，解析後確認再匯入</p>
        </div>
        <button onClick={() => router.back()} className="btn btn-secondary">返回</button>
      </div>

      <div className="erp-card" style={{ marginBottom: 20 }}>
        <div className="erp-card-header"><span className="erp-card-title">貼上 Google Sheets 資料</span></div>
        <div className="erp-card-body">
          <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 10, lineHeight: 1.8 }}>
            <strong>直接貼入含標題列的試算表</strong>（推薦），系統會自動偵測標題列，識別以下欄位（欄位順序不限）：
            訂單歸屬、狀態、分店、日期、時段、人數、訂位代號、姓名+電話（或分開的姓名／電話）、訂金、付款人、退訂期限、資料來源、售出日期、收款金額、帳戶、銷售、代訂費。<br />
            沒有標題列時，固定欄位順序：訂單歸屬、狀態、分店、日期、時段、人數、訂位代號、姓名+電話（同一格）、訂金、付款人員、退訂期限、資料來源（最後一欄可省略）；其餘欄位（分開的姓名／電話、售出日期、收款金額、帳戶、銷售人員、代訂費）沒有標題列時無法對應，要用才需要貼標題列。
          </p>
          <textarea
            className="erp-textarea"
            rows={8}
            placeholder="在 Google Sheets 選取資料後 Ctrl+C，然後貼在這裡..."
            value={raw}
            onChange={(e) => { setRaw(e.target.value); setParsed(false); setResult(null); }}
          />
          <div style={{ marginTop: 10 }}>
            <button onClick={handleParse} disabled={!raw.trim()} className="btn btn-primary">
              解析預覽
            </button>
          </div>
        </div>
      </div>

      {parsed && rows.length === 0 && (
        <div className="erp-alert danger">解析不到任何資料，請確認欄位格式。</div>
      )}

      {parsed && rows.length > 0 && (
        <>
          <div className="erp-card" style={{ marginBottom: 16 }}>
            <div className="erp-card-header">
              <span className="erp-card-title">預覽（共 {rows.length} 筆）</span>
            </div>
            <div className="erp-table-wrap" style={{ overflowX: "auto" }}>
              <table className="erp-table" style={{ minWidth: 1600 }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>訂單歸屬</th>
                    <th>狀態</th>
                    <th>分店</th>
                    <th>日期</th>
                    <th>時段</th>
                    <th>人數</th>
                    <th>訂位代號</th>
                    <th>姓名</th>
                    <th>電話</th>
                    <th>訂金</th>
                    <th>付款人員</th>
                    <th>退訂期限</th>
                    <th>資料來源</th>
                    <th>售出日期</th>
                    <th>收款金額</th>
                    <th>帳戶</th>
                    <th>銷售人員</th>
                    <th>代訂費</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{r.vendorName || <span style={{ color: "var(--gray-400)" }}>—</span>}</td>
                      <td>
                        <select className="erp-select" style={{ fontSize: 13 }}
                          value={r.status}
                          onChange={(e) => updateRow(i, { status: e.target.value as StatusValue })}>
                          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td>{r.branch || <span style={{ color: "var(--gray-400)" }}>—</span>}</td>
                      <td>{r.bookingDate}</td>
                      <td>{r.timeSlot}</td>
                      <td>{r.partySize}</td>
                      <td>{r.bookingCode}</td>
                      <td>{r.customerName || <span style={{ color: "var(--gray-400)" }}>—</span>}</td>
                      <td>{r.customerPhone || <span style={{ color: "var(--gray-400)" }}>—</span>}</td>
                      <td>{r.depositAmount || "—"}</td>
                      <td>{r.depositPayer || "—"}</td>
                      <td>{r.cancelDeadline || "—"}</td>
                      <td>
                        <select className="erp-select" style={{ fontSize: 13 }}
                          value={r.platform}
                          onChange={(e) => updateRow(i, { platform: e.target.value as PlatformValue })}>
                          {PLATFORM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td>{r.soldDate || "—"}</td>
                      <td>{r.collectedAmount || "—"}</td>
                      <td>{r.account || "—"}</td>
                      <td>{r.salespersonName || <span style={{ color: "var(--gray-400)" }}>—</span>}</td>
                      <td>{r.agencyFee || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {result ? (
            <div className={`erp-alert ${(result.errors?.length ?? 0) > 0 ? "warning" : "success"}`}>
              {result.inserted > 0 && <div>成功匯入 {result.inserted} 筆</div>}
              {(result.errors ?? []).map((e, i) => <div key={i}>{e}</div>)}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={handleImport} disabled={importing} className="btn btn-primary">
                {importing ? "匯入中..." : `確認匯入 ${rows.length} 筆`}
              </button>
              <button onClick={() => { setParsed(false); setRows([]); }} className="btn btn-secondary">重新貼上</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

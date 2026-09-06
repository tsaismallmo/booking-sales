"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ParsedRow = {
  vendorName: string;
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
};

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
  // 電話：09xxxxxxxx，10位數字，前面可以有空白或換行
  const m = s.match(/^([\s\S]*?)\s*(09\d{8})\s*$/);
  if (m) return { name: m[1].trim(), phone: m[2] };
  return { name: s, phone: "" };
}

// 欄位順序（共 10 欄）：
// 0 訂單歸屬 | 1 分店 | 2 日期 | 3 時段 | 4 人數 | 5 訂位代號
// 6 姓名+電話（合併）| 7 訂金 | 8 付款人員 | 9 退訂期限
function parseTsv(raw: string): ParsedRow[] {
  const lines = raw.trim().split(/\r?\n/);
  const results: ParsedRow[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split("\t").map((c) => c.trim());
    // 跳過標題列
    if (cols[0] === "訂單歸屬" || cols[0] === "廠商") continue;

    const namePhone   = cols[6] ?? "";
    const { name: customerName, phone: customerPhone } = splitNamePhone(namePhone);

    results.push({
      vendorName:    cols[0] ?? "",
      branch:        cols[1] ?? "",
      bookingDate:   normalizeDate(cols[2] ?? ""),
      timeSlot:      cols[3] ?? "",
      partySize:     cols[4] ?? "",
      bookingCode:   cols[5] ?? "",
      customerName,
      customerPhone,
      depositAmount: cols[7] ?? "",
      depositPayer:  cols[8] ?? "",
      cancelDeadline:normalizeDate(cols[9] ?? ""),
    });
  }

  return results;
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
          <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 10 }}>
            欄位順序（共 10 欄）：訂單歸屬、分店、日期、時段、人數、訂位代號、姓名+電話（同一格）、訂金、付款人員、退訂期限
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
            <div className="erp-table-wrap">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>訂單歸屬</th>
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
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{r.vendorName || <span style={{ color: "var(--gray-400)" }}>—</span>}</td>
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

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseSms } from "@/lib/sms-parser";
import { formatCurrency } from "@/lib/utils";
import { VendorSelect } from "@/components/VendorSelect";

type ExistingBooking = {
  id: string;
  branch: string | null;
  bookingDate: string;
  timeSlot: string | null;
  partySize: number | null;
  bookingCode: string | null;
  depositAmount: string | null;
};

type NoticeRow = {
  key: string;
  raw: string;
  rawBranch: string;
  branch: string;
  bookingDate: string;
  timeSlot: string;
  partySize: string;
  bookingCode: string;
  paymentDeadline: string;
  depositAmount: string;
  depositPayer: string;
  actualBooker: string;
  customerName: string;
  customerPhone: string;
  status: "idle" | "saving" | "ok" | "error";
  message: string;
};

type MatchState = "checking" | "matched" | "ambiguous" | "notfound";

type CompletionRow = {
  key: string;
  raw: string;
  rawBranch: string;
  matchBranch: string;
  bookingCode: string | null;
  bookingDate: string | null;
  timeSlot: string | null;
  partySize: number | null;
  amount: number | null;
  paidAt: string | null;
  transactionNo: string | null;
  matchState: MatchState;
  matched: ExistingBooking | null;
  status: "idle" | "saving" | "ok" | "error";
  message: string;
};

type UnknownRow = { key: string; raw: string };

// 用一行以上的空白行分隔多則簡訊——手機複製多則訊息貼到聊天室/表單時通常都會這樣分段
function splitSmsBlocks(raw: string): string[] {
  return raw.split(/\n\s*\n+/).map((s) => s.trim()).filter(Boolean);
}

const LOOKUP_CONCURRENCY = 8;

export default function ImportSmsBulkPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(false);
  const [vendorId, setVendorId] = useState("");
  const [noticeRows, setNoticeRows] = useState<NoticeRow[]>([]);
  const [completionRows, setCompletionRows] = useState<CompletionRow[]>([]);
  const [unknownRows, setUnknownRows] = useState<UnknownRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState("");

  const resolveBranchAlias = async (raw: string) => {
    if (!raw) return "";
    const res = await fetch(`/api/branch-aliases?rawText=${encodeURIComponent(raw)}`);
    const data = await res.json();
    return data?.canonicalBranch ?? raw;
  };

  const saveBranchAliasIfChanged = async (raw: string, final: string) => {
    if (raw && final && raw !== final) {
      await fetch("/api/branch-aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: raw, canonicalBranch: final }),
      });
    }
  };

  const runLookup = async (row: CompletionRow): Promise<CompletionRow> => {
    if (!row.bookingCode || !row.matchBranch || !row.bookingDate || !row.timeSlot || row.partySize == null || row.amount == null) {
      return { ...row, matchState: "notfound", matched: null };
    }
    const qs = new URLSearchParams({
      code: row.bookingCode,
      branch: row.matchBranch,
      bookingDate: row.bookingDate,
      timeSlot: row.timeSlot,
      partySize: String(row.partySize),
      amount: String(row.amount),
    });
    const res = await fetch(`/api/bookings/lookup?${qs.toString()}`);
    const data = await res.json();
    if (data.match) return { ...row, matchState: "matched", matched: data.match };
    if (data.ambiguous) return { ...row, matchState: "ambiguous", matched: null };
    return { ...row, matchState: "notfound", matched: null };
  };

  const runLookupsInBatches = async (rows: CompletionRow[]) => {
    let result = rows;
    for (let i = 0; i < result.length; i += LOOKUP_CONCURRENCY) {
      const chunk = result.slice(i, i + LOOKUP_CONCURRENCY);
      const updated = await Promise.all(chunk.map(runLookup));
      const updatedByKey = new Map(updated.map((r) => [r.key, r]));
      result = result.map((r) => updatedByKey.get(r.key) ?? r);
      setCompletionRows(result);
    }
  };

  const handleParse = async () => {
    setParsing(true);
    setSummary("");
    const blocks = splitSmsBlocks(text);

    const rawBranches = new Set<string>();
    const items = blocks.map((raw, i) => ({ key: `${i}`, raw, result: parseSms(raw) }));
    for (const item of items) {
      if (item.result.type === "booking_notice" && item.result.branch) rawBranches.add(item.result.branch);
      if (item.result.type === "payment_completion" && item.result.branch) rawBranches.add(item.result.branch);
    }

    const aliasMap = new Map<string, string>();
    await Promise.all([...rawBranches].map(async (raw) => {
      aliasMap.set(raw, await resolveBranchAlias(raw));
    }));

    const notices: NoticeRow[] = [];
    const completions: CompletionRow[] = [];
    const unknowns: UnknownRow[] = [];

    for (const item of items) {
      const r = item.result;
      if (r.type === "booking_notice") {
        const rawBranch = r.branch ?? "";
        notices.push({
          key: item.key,
          raw: item.raw,
          rawBranch,
          branch: rawBranch ? (aliasMap.get(rawBranch) ?? rawBranch) : "",
          bookingDate: r.bookingDate ?? "",
          timeSlot: r.timeSlot ?? "",
          partySize: r.partySize?.toString() ?? "",
          bookingCode: r.bookingCode ?? "",
          paymentDeadline: r.paymentDeadline ?? "",
          depositAmount: "",
          depositPayer: "",
          actualBooker: "",
          customerName: "",
          customerPhone: "",
          status: "idle",
          message: "",
        });
      } else if (r.type === "payment_completion") {
        const rawBranch = r.branch ?? "";
        completions.push({
          key: item.key,
          raw: item.raw,
          rawBranch,
          matchBranch: rawBranch ? (aliasMap.get(rawBranch) ?? rawBranch) : "",
          bookingCode: r.bookingCode,
          bookingDate: r.bookingDate,
          timeSlot: r.timeSlot,
          partySize: r.partySize,
          amount: r.amount,
          paidAt: r.paidAt,
          transactionNo: r.transactionNo,
          matchState: "checking",
          matched: null,
          status: "idle",
          message: "",
        });
      } else {
        unknowns.push({ key: item.key, raw: item.raw });
      }
    }

    setNoticeRows(notices);
    setCompletionRows(completions);
    setUnknownRows(unknowns);
    setParsed(true);
    setParsing(false);

    if (completions.length > 0) await runLookupsInBatches(completions);
  };

  const updateNotice = (key: string, patch: Partial<NoticeRow>) =>
    setNoticeRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const updateCompletion = (key: string, patch: Partial<CompletionRow>) =>
    setCompletionRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const handleRecheck = async (key: string) => {
    const row = completionRows.find((r) => r.key === key);
    if (!row) return;
    updateCompletion(key, { matchState: "checking" });
    const updated = await runLookup(row);
    updateCompletion(key, updated);
  };

  const noticeReady = (r: NoticeRow) => !!(r.bookingDate && r.customerName && r.customerPhone);

  const handleSubmitAll = async () => {
    setSubmitting(true);

    let noticeOk = 0, noticeFail = 0, noticeSkipped = 0;
    for (const r of noticeRows) {
      if (r.status === "ok") continue;
      if (!noticeReady(r)) { noticeSkipped++; continue; }
      updateNotice(r.key, { status: "saving" });
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId,
          branch: r.branch,
          category: "現貨單",
          bookingDate: r.bookingDate,
          timeSlot: r.timeSlot,
          partySize: r.partySize,
          bookingCode: r.bookingCode,
          paymentDeadline: r.paymentDeadline,
          depositAmount: r.depositAmount,
          depositPayer: r.depositPayer,
          actualBooker: r.actualBooker,
          customerName: r.customerName,
          customerPhone: r.customerPhone,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        updateNotice(r.key, { status: "error", message: data.error || `HTTP ${res.status}` });
        noticeFail++;
        continue;
      }
      const booking = await res.json();
      await fetch("/api/sms-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "booking_notice", rawText: r.raw, bookingId: booking.id, parsedData: { branch: r.branch, bookingDate: r.bookingDate } }),
      });
      await saveBranchAliasIfChanged(r.rawBranch, r.branch);
      updateNotice(r.key, { status: "ok" });
      noticeOk++;
    }

    let compOk = 0, compFail = 0, compSkipped = 0;
    for (const r of completionRows) {
      if (r.status === "ok") continue;
      if (r.matchState === "ambiguous") { compSkipped++; continue; }
      updateCompletion(r.key, { status: "saving" });
      const res = await fetch("/api/sms-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "payment_completion",
          rawText: r.raw,
          bookingId: r.matched ? r.matched.id : null,
          parsedData: { bookingCode: r.bookingCode, amount: r.amount, paidAt: r.paidAt, transactionNo: r.transactionNo },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        updateCompletion(r.key, { status: "error", message: data.error || `HTTP ${res.status}` });
        compFail++;
        continue;
      }
      if (r.matched) await saveBranchAliasIfChanged(r.rawBranch, r.matchBranch);
      updateCompletion(r.key, { status: "ok" });
      compOk++;
    }

    setSubmitting(false);
    setSummary(
      `付款通知：成功建立 ${noticeOk} 筆` +
      (noticeFail > 0 ? `、失敗 ${noticeFail} 筆` : "") +
      (noticeSkipped > 0 ? `、還沒填完跳過 ${noticeSkipped} 筆` : "") +
      `　｜　付款完成：成功留存 ${compOk} 筆` +
      (compFail > 0 ? `、失敗 ${compFail} 筆` : "") +
      (compSkipped > 0 ? `、比對不明確跳過 ${compSkipped} 筆` : "")
    );
  };

  const totalParsed = noticeRows.length + completionRows.length + unknownRows.length;
  const allNoticeDone = noticeRows.length > 0 && noticeRows.every((r) => r.status === "ok");
  const allCompletionDone = completionRows.length > 0 && completionRows.every((r) => r.status === "ok" || r.matchState === "ambiguous");

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">大量解析簡訊</h1>
          <p className="erp-page-subtitle">一次貼上多則簡訊（每則之間留一行空白分隔），自動解析並批次建立/留存</p>
        </div>
        <button onClick={() => router.push("/bookings")} className="btn btn-secondary">返回單據管理</button>
      </div>

      <div className="erp-card" style={{ marginBottom: 20 }}>
        <div className="erp-card-header"><span className="erp-card-title">簡訊內容（付款通知、付款完成都可以混著貼）</span></div>
        <div className="erp-card-body">
          <textarea
            className="erp-textarea"
            rows={14}
            placeholder={"把多則簡訊全文貼在這裡，每則之間留一行空白分隔..."}
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{ fontFamily: "monospace", fontSize: 13 }}
          />
          <div style={{ marginTop: 12 }}>
            <button onClick={handleParse} disabled={parsing || !text.trim()} className="btn btn-primary">
              {parsing ? "解析中..." : "解析簡訊"}
            </button>
          </div>
        </div>
      </div>

      {parsed && (
        <div className="erp-alert info" style={{ marginBottom: 16 }}>
          共解析到 {totalParsed} 則：付款通知 {noticeRows.length} 則、付款完成 {completionRows.length} 則
          {unknownRows.length > 0 && `、無法辨識 ${unknownRows.length} 則`}
        </div>
      )}

      {unknownRows.length > 0 && (
        <div className="erp-card" style={{ marginBottom: 16 }}>
          <div className="erp-card-header"><span className="erp-card-title">無法辨識（{unknownRows.length} 則，不會處理）</span></div>
          <div className="erp-card-body" style={{ fontSize: 12, color: "var(--gray-400)" }}>
            {unknownRows.map((r) => (
              <div key={r.key} style={{ padding: "4px 0", borderBottom: "1px solid var(--gray-100)" }}>{r.raw.slice(0, 60)}...</div>
            ))}
          </div>
        </div>
      )}

      {noticeRows.length > 0 && (
        <div className="erp-card" style={{ marginBottom: 16 }}>
          <div className="erp-card-header"><span className="erp-card-title">付款通知 · 建立單據（{noticeRows.length} 則）</span></div>
          <div className="erp-card-body">
            <div style={{ maxWidth: 320, marginBottom: 12 }}>
              <VendorSelect value={vendorId} onChange={setVendorId} />
            </div>
          </div>
          <div className="erp-table-wrap" style={{ overflowX: "auto" }}>
            <table className="erp-table" style={{ minWidth: 1300 }}>
              <thead>
                <tr>
                  <th>#</th><th>分店</th><th>日期</th><th>時段</th><th>人數</th><th>訂位代號</th>
                  <th>訂金</th><th>付款人員</th><th>實際訂位人員</th>
                  <th>姓名 *</th><th>電話 *</th><th>結果</th>
                </tr>
              </thead>
              <tbody>
                {noticeRows.map((r, i) => (
                  <tr key={r.key} style={{
                    background: r.status === "ok" ? "rgba(34,197,94,.06)" : r.status === "error" ? "rgba(239,68,68,.06)" : !noticeReady(r) ? "rgba(239,68,68,.03)" : undefined,
                  }}>
                    <td>{i + 1}</td>
                    <td><input className="erp-input" style={{ width: 110, fontSize: 13 }} value={r.branch} onChange={(e) => updateNotice(r.key, { branch: e.target.value })} /></td>
                    <td><input type="date" className="erp-input" style={{ fontSize: 13 }} value={r.bookingDate} onChange={(e) => updateNotice(r.key, { bookingDate: e.target.value })} /></td>
                    <td><input className="erp-input" style={{ width: 70, fontSize: 13 }} value={r.timeSlot} onChange={(e) => updateNotice(r.key, { timeSlot: e.target.value })} /></td>
                    <td><input type="number" className="erp-input" style={{ width: 60, fontSize: 13 }} value={r.partySize} onChange={(e) => updateNotice(r.key, { partySize: e.target.value })} /></td>
                    <td><input className="erp-input" style={{ width: 90, fontSize: 13 }} value={r.bookingCode} onChange={(e) => updateNotice(r.key, { bookingCode: e.target.value })} /></td>
                    <td><input type="number" className="erp-input" style={{ width: 80, fontSize: 13 }} value={r.depositAmount} onChange={(e) => updateNotice(r.key, { depositAmount: e.target.value })} /></td>
                    <td><input className="erp-input" style={{ width: 90, fontSize: 13 }} value={r.depositPayer} onChange={(e) => updateNotice(r.key, { depositPayer: e.target.value })} /></td>
                    <td><input className="erp-input" style={{ width: 90, fontSize: 13 }} value={r.actualBooker} onChange={(e) => updateNotice(r.key, { actualBooker: e.target.value })} /></td>
                    <td><input className="erp-input" style={{ width: 90, fontSize: 13 }} value={r.customerName} onChange={(e) => updateNotice(r.key, { customerName: e.target.value })} /></td>
                    <td><input className="erp-input" style={{ width: 110, fontSize: 13 }} value={r.customerPhone} onChange={(e) => updateNotice(r.key, { customerPhone: e.target.value })} /></td>
                    <td style={{ textAlign: "center", fontSize: 12 }}>
                      {r.status === "ok" && <span style={{ color: "var(--color-success)", fontWeight: 600 }}>✓</span>}
                      {r.status === "error" && <span style={{ color: "var(--color-danger)" }} title={r.message}>✗</span>}
                      {r.status === "saving" && "存中..."}
                      {r.status === "idle" && !noticeReady(r) && <span style={{ color: "var(--color-warning)" }}>缺姓名/電話</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {completionRows.length > 0 && (
        <div className="erp-card" style={{ marginBottom: 16 }}>
          <div className="erp-card-header"><span className="erp-card-title">付款完成 · 比對關聯（{completionRows.length} 則）</span></div>
          <div className="erp-table-wrap" style={{ overflowX: "auto" }}>
            <table className="erp-table" style={{ minWidth: 1100 }}>
              <thead>
                <tr>
                  <th>#</th><th>比對用分店</th><th>訂位代號</th><th>日期</th><th>時段</th><th>人數</th><th>金額</th>
                  <th>比對結果</th><th>結果</th>
                </tr>
              </thead>
              <tbody>
                {completionRows.map((r, i) => (
                  <tr key={r.key} style={{
                    background: r.status === "ok" ? "rgba(34,197,94,.06)" : r.status === "error" ? "rgba(239,68,68,.06)" : r.matchState === "ambiguous" ? "rgba(239,68,68,.03)" : undefined,
                  }}>
                    <td>{i + 1}</td>
                    <td><input className="erp-input" style={{ width: 110, fontSize: 13 }} value={r.matchBranch} onChange={(e) => updateCompletion(r.key, { matchBranch: e.target.value })} /></td>
                    <td className="font-mono">{r.bookingCode ?? "—"}</td>
                    <td>{r.bookingDate ?? "—"}</td>
                    <td>{r.timeSlot ?? "—"}</td>
                    <td>{r.partySize ?? "—"}</td>
                    <td>{formatCurrency(r.amount)}</td>
                    <td style={{ fontSize: 12 }}>
                      {r.matchState === "checking" && "比對中..."}
                      {r.matchState === "matched" && r.matched && (
                        <span style={{ color: "var(--color-success)" }}>已比對：{r.matched.branch} {r.matched.bookingDate} {r.matched.timeSlot}</span>
                      )}
                      {r.matchState === "ambiguous" && <span style={{ color: "var(--color-danger)" }}>對到不只一筆，請到單據管理手動確認</span>}
                      {r.matchState === "notfound" && <span style={{ color: "var(--color-warning)" }}>找不到，仍可僅留存</span>}
                      {" "}
                      <button onClick={() => handleRecheck(r.key)} className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 6px" }}>重新比對</button>
                    </td>
                    <td style={{ textAlign: "center", fontSize: 12 }}>
                      {r.status === "ok" && <span style={{ color: "var(--color-success)", fontWeight: 600 }}>✓</span>}
                      {r.status === "error" && <span style={{ color: "var(--color-danger)" }} title={r.message}>✗</span>}
                      {r.status === "saving" && "存中..."}
                      {r.status === "idle" && r.matchState === "ambiguous" && <span style={{ color: "var(--color-danger)" }}>跳過</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {parsed && totalParsed > 0 && (unknownRows.length < totalParsed) && (
        <div className="erp-card">
          <div className="erp-card-body" style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button
              onClick={handleSubmitAll}
              disabled={submitting || (allNoticeDone && allCompletionDone)}
              className="btn btn-primary"
            >
              {submitting ? "送出中..." : "確認送出全部"}
            </button>
            {summary && <span style={{ fontSize: 13, color: "var(--gray-600)" }}>{summary}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

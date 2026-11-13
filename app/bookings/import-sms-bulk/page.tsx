"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { parseSms } from "@/lib/sms-parser";
import { formatCurrency } from "@/lib/utils";
import { VendorSelect } from "@/components/VendorSelect";
import { RosterListSelect } from "@/components/RosterListSelect";
import { BranchSelect, findBranch, loadBranchOptions, type BranchOption } from "@/components/BranchSelect";

type PhoneCandidate = { phone: string; source: "roster" | "booking"; label: string; listName: string | null };

type ExistingBooking = {
  id: string;
  branch: string | null;
  bookingDate: string;
  timeSlot: string | null;
  partySize: number | null;
  bookingCode: string | null;
  depositAmount: string | null;
  depositPayer: string | null;
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
  isInline: boolean;
  isEztable: boolean;
  phoneCandidates: PhoneCandidate[]; // 用姓名查到不只一支電話時列出來讓使用者選
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
  payer: string; // 付款人員（廠商名單名稱），比對到單據時留存一起寫進單據
  status: "idle" | "saving" | "ok" | "error";
  message: string;
};

type UnknownRow = { key: string; raw: string };

// 切開多則簡訊：空白行一定切；沒留空白行的話，遇到「您好」（付款通知）或「您預訂」（付款完成）開頭的那行也當成新的一則，
// 前一行如果是「許登豐/0978812852 inline」這種訂位資訊（短、沒有標點、沒有連結），就跟著歸到新的這一則
const SMS_START_RE = /您好|您預訂/;
const isHeaderLine = (line: string) => line.length <= 40 && !/[。，,]|https?:/.test(line) && !SMS_START_RE.test(line);

function splitSmsBlocks(raw: string): string[] {
  const blocks: string[] = [];
  let cur: string[] = [];
  const flush = () => { if (cur.length) blocks.push(cur.join("\n")); cur = []; };
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) { flush(); continue; }
    if (SMS_START_RE.test(line) && cur.some((l) => SMS_START_RE.test(l))) {
      const header = isHeaderLine(cur[cur.length - 1]) ? cur.pop()! : null;
      flush();
      if (header) cur.push(header);
    }
    cur.push(line);
  }
  flush();
  return blocks;
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
  const [branchOptions, setBranchOptions] = useState<BranchOption[]>([]);

  useEffect(() => {
    loadBranchOptions().then(setBranchOptions);
  }, []);

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
    if (!row.bookingCode || !row.matchBranch || !row.bookingDate || !row.timeSlot || row.partySize == null) {
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
    if (data.match) return { ...row, matchState: "matched", matched: data.match, payer: row.payer || data.match.depositPayer || "" };
    if (data.ambiguous) return { ...row, matchState: "ambiguous", matched: null };
    return { ...row, matchState: "notfound", matched: null };
  };

  const fetchPhones = async (name: string): Promise<PhoneCandidate[]> => {
    if (!name.trim()) return [];
    const res = await fetch(`/api/customer-phones?name=${encodeURIComponent(name.trim())}`);
    const data = res.ok ? await res.json() : [];
    return Array.isArray(data) ? data : [];
  };

  // 電話已知時，查這支電話在哪幾份名單
  const fetchListsByPhone = async (phone: string): Promise<PhoneCandidate[]> => {
    const res = await fetch(`/api/customer-phones?phone=${encodeURIComponent(phone)}`);
    const data = res.ok ? await res.json() : [];
    return Array.isArray(data) ? data : [];
  };

  // 只有一支電話就直接帶入（不蓋掉已經填的），多支就留著讓使用者選；
  // 電話是從名單查到的，名單名稱就帶進實際訂位人員
  const applyPhones = (r: NoticeRow, list: PhoneCandidate[]): NoticeRow =>
    list.length === 1
      ? { ...r, customerPhone: r.customerPhone || list[0].phone, actualBooker: list[0].listName ?? r.actualBooker, phoneCandidates: [] }
      : { ...r, phoneCandidates: list };

  // 只在剛好一份名單時帶入實際訂位人員，多份名單就留空讓使用者選
  const applyListsByPhone = (r: NoticeRow, list: PhoneCandidate[]): NoticeRow => {
    const listNames = [...new Set(list.map((c) => c.listName).filter(Boolean))] as string[];
    return listNames.length === 1 ? { ...r, actualBooker: listNames[0] } : r;
  };

  // 沒電話的列用姓名查電話；「姓名/電話」已經帶了電話的列改用電話查是哪份名單
  const lookupPhonesForRows = async (rows: NoticeRow[]) => {
    const names = [...new Set(rows.filter((r) => !r.customerPhone).map((r) => r.customerName.trim()).filter(Boolean))];
    const phones = [...new Set(rows.map((r) => r.customerPhone).filter(Boolean))];
    const byName = new Map<string, PhoneCandidate[]>();
    const byPhone = new Map<string, PhoneCandidate[]>();
    const jobs = [
      ...names.map((n) => async () => { byName.set(n, await fetchPhones(n)); }),
      ...phones.map((p) => async () => { byPhone.set(p, await fetchListsByPhone(p)); }),
    ];
    for (let i = 0; i < jobs.length; i += LOOKUP_CONCURRENCY) {
      await Promise.all(jobs.slice(i, i + LOOKUP_CONCURRENCY).map((job) => job()));
    }
    setNoticeRows((rs) => rs.map((r) => {
      if (r.customerPhone) {
        const list = byPhone.get(r.customerPhone);
        return list ? applyListsByPhone(r, list) : r;
      }
      const list = byName.get(r.customerName.trim());
      return list ? applyPhones(r, list) : r;
    }));
  };

  const handleNameBlur = async (key: string) => {
    const row = noticeRows.find((r) => r.key === key);
    if (!row || row.customerPhone) return;
    const list = await fetchPhones(row.customerName);
    setNoticeRows((rs) => rs.map((r) => (r.key === key ? applyPhones(r, list) : r)));
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
          customerName: r.customerName ?? "",
          customerPhone: r.customerPhone ?? "",
          isInline: r.isInline,
          isEztable: r.isEztable,
          phoneCandidates: [],
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
          payer: "",
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

    await Promise.all([
      notices.length > 0 ? lookupPhonesForRows(notices) : null,
      completions.length > 0 ? runLookupsInBatches(completions) : null,
    ]);
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

  const branchOk = (text: string) => !!findBranch(branchOptions, text);
  const noticeReady = (r: NoticeRow) => !!(branchOk(r.branch) && r.bookingDate && r.customerName && r.customerPhone);

  // 選了分店後，同一段簡訊分店原文、還沒對到主檔的其他列也一起套用
  const setNoticeBranch = (key: string, branch: string) =>
    setNoticeRows((rs) => {
      const raw = rs.find((r) => r.key === key)?.rawBranch;
      return rs.map((r) => (r.key === key || (raw && r.rawBranch === raw && !branchOk(r.branch)) ? { ...r, branch } : r));
    });

  const noticeLabel = (r: NoticeRow) =>
    [r.branch, r.bookingDate, r.timeSlot, r.bookingCode && `代號 ${r.bookingCode}`, r.customerName].filter(Boolean).join("　");

  // 解析完就即時檢查：付款通知一定要有日期＋姓名＋電話、付款完成不能比對到不只一筆，
  // 只要任一筆有錯，整批都不能送出（按鈕停用），錯誤直接列在按鈕下面
  const missingRows = noticeRows
      .map((r, i) => ({ r, n: i + 1 }))
      .filter(({ r }) => r.status !== "ok" && !noticeReady(r))
      .map(({ r, n }) => ({
        key: r.key,
        n,
        label: noticeLabel(r),
        fields: [!branchOk(r.branch) && "分店", !r.bookingDate && "日期", !r.customerName && "姓名", !r.customerPhone && "電話"].filter(Boolean).join("、"),
      }));
  const missingKeys = new Set(missingRows.map((e) => e.key));
  const ambiguousRows = completionRows
    .map((r, i) => ({ r, n: i + 1 }))
    .filter(({ r }) => r.status !== "ok" && r.matchState === "ambiguous")
    .map(({ r, n }) => ({ key: r.key, n, label: [r.matchBranch, r.bookingDate, r.timeSlot, r.bookingCode && `代號 ${r.bookingCode}`].filter(Boolean).join("　") }));
  const checkingCompletions = completionRows.some((r) => r.matchState === "checking");
  const errorLines = [
    ...missingRows.map((e) => `付款通知第 ${e.n} 筆　${e.label}　缺${e.fields}`),
    ...ambiguousRows.map((e) => `付款完成第 ${e.n} 筆　${e.label}　對到不只一筆單據，請修正分店後重新比對`),
  ];

  const handleSubmitAll = async () => {
    if (errorLines.length > 0) {
      alert(`有 ${errorLines.length} 筆有錯誤，整批都不會送出：\n\n` + errorLines.join("\n"));
      return;
    }
    setSubmitting(true);

    // 送出後失敗的筆數，最後一次跳出來
    const failures: string[] = [];
    let noticeOk = 0, noticeFail = 0;
    for (const r of noticeRows) {
      if (r.status === "ok") continue;
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
          isInline: r.isInline,
          isEztable: r.isEztable,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message = data.error || `HTTP ${res.status}`;
        updateNotice(r.key, { status: "error", message });
        failures.push(`付款通知第 ${noticeRows.indexOf(r) + 1} 筆　${noticeLabel(r)}：${message}`);
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
          ...(r.matched ? { depositPayer: r.payer } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message = data.error || `HTTP ${res.status}`;
        updateCompletion(r.key, { status: "error", message });
        failures.push(`付款完成第 ${completionRows.indexOf(r) + 1} 筆　代號 ${r.bookingCode ?? "—"}：${message}`);
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
      `　｜　付款完成：成功留存 ${compOk} 筆` +
      (compFail > 0 ? `、失敗 ${compFail} 筆` : "") +
      (compSkipped > 0 ? `、比對不明確跳過 ${compSkipped} 筆` : "")
    );
    if (failures.length > 0) alert(`送出後有 ${failures.length} 筆失敗：\n\n` + failures.join("\n"));
  };

  const totalParsed = noticeRows.length + completionRows.length + unknownRows.length;
  const allNoticeDone = noticeRows.length > 0 && noticeRows.every((r) => r.status === "ok");
  const allCompletionDone = completionRows.length > 0 && completionRows.every((r) => r.status === "ok" || r.matchState === "ambiguous");

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">大量解析簡訊</h1>
          <p className="erp-page-subtitle">一次貼上多則簡訊（連著貼或用空白行分隔都可以），自動解析並批次建立/留存；任一筆有錯就整批不能送出</p>
        </div>
        <button onClick={() => router.push("/bookings")} className="btn btn-secondary">返回單據管理</button>
      </div>

      <div className="erp-card" style={{ marginBottom: 20 }}>
        <div className="erp-card-header"><span className="erp-card-title">簡訊內容（付款通知、付款完成都可以混著貼）</span></div>
        <div className="erp-card-body">
          <textarea
            className="erp-textarea"
            rows={14}
            placeholder={"把多則簡訊全文貼在這裡，可以直接連著貼，也可以每則之間留一行空白；付款通知前面可加「姓名/電話 inline」..."}
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
                  <th>姓名 *</th><th>電話 *</th><th>平台</th><th>結果</th>
                </tr>
              </thead>
              <tbody>
                {noticeRows.map((r, i) => (
                  <tr key={r.key} id={`notice-row-${r.key}`} style={{
                    background: r.status === "ok" ? "rgba(34,197,94,.06)" : r.status === "error" || missingKeys.has(r.key) ? "rgba(239,68,68,.12)" : undefined,
                    boxShadow: missingKeys.has(r.key) ? "inset 3px 0 0 var(--color-danger)" : undefined,
                  }}>
                    <td>{i + 1}</td>
                    <td><BranchSelect compact branchId={null} branch={r.branch} onChange={(v) => setNoticeBranch(r.key, v.branch)} /></td>
                    <td><input type="date" className="erp-input" style={{ fontSize: 13 }} value={r.bookingDate} onChange={(e) => updateNotice(r.key, { bookingDate: e.target.value })} /></td>
                    <td><input className="erp-input" style={{ width: 70, fontSize: 13 }} value={r.timeSlot} onChange={(e) => updateNotice(r.key, { timeSlot: e.target.value })} /></td>
                    <td><input type="number" className="erp-input" style={{ width: 60, fontSize: 13 }} value={r.partySize} onChange={(e) => updateNotice(r.key, { partySize: e.target.value })} /></td>
                    <td><input className="erp-input" style={{ width: 90, fontSize: 13 }} value={r.bookingCode} onChange={(e) => updateNotice(r.key, { bookingCode: e.target.value })} /></td>
                    <td><input type="number" className="erp-input" style={{ width: 80, fontSize: 13 }} value={r.depositAmount} onChange={(e) => updateNotice(r.key, { depositAmount: e.target.value })} /></td>
                    <td><RosterListSelect style={{ width: 110, fontSize: 13 }} value={r.depositPayer} onChange={(v) => updateNotice(r.key, { depositPayer: v })} /></td>
                    <td><RosterListSelect style={{ width: 110, fontSize: 13 }} value={r.actualBooker} onChange={(v) => updateNotice(r.key, { actualBooker: v })} /></td>
                    <td><input className="erp-input" style={{ width: 90, fontSize: 13 }} value={r.customerName} onChange={(e) => updateNotice(r.key, { customerName: e.target.value })} onBlur={() => handleNameBlur(r.key)} /></td>
                    <td>
                      <input className="erp-input" style={{ width: 110, fontSize: 13 }} value={r.customerPhone} onChange={(e) => updateNotice(r.key, { customerPhone: e.target.value })} />
                      {r.phoneCandidates.length > 1 && (
                        <select
                          className="erp-select"
                          style={{ width: 110, fontSize: 12, marginTop: 4 }}
                          value=""
                          onChange={(e) => {
                            // 同一支電話可能在不同名單各列一次，用索引分辨選的是哪份名單
                            const c = r.phoneCandidates[Number(e.target.value)];
                            if (c) updateNotice(r.key, { customerPhone: c.phone, actualBooker: c.listName ?? r.actualBooker });
                          }}
                        >
                          <option value="">同名 {r.phoneCandidates.length} 支電話…</option>
                          {r.phoneCandidates.map((c, idx) => (
                            <option key={`${c.phone}-${c.label}`} value={idx}>{c.phone}（{c.label}）</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                        <input type="checkbox" checked={r.isInline} onChange={(e) => updateNotice(r.key, { isInline: e.target.checked })} />
                        Inline
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", marginTop: 4 }}>
                        <input type="checkbox" checked={r.isEztable} onChange={(e) => updateNotice(r.key, { isEztable: e.target.checked })} />
                        EZTABLE
                      </label>
                    </td>
                    <td style={{ textAlign: "center", fontSize: 12 }}>
                      {r.status === "ok" && <span style={{ color: "var(--color-success)", fontWeight: 600 }}>✓</span>}
                      {r.status === "error" && <span style={{ color: "var(--color-danger)" }}>✗ {r.message}</span>}
                      {r.status === "saving" && "存中..."}
                      {r.status === "idle" && !noticeReady(r) && <span style={{ color: "var(--color-danger)" }}>缺資料</span>}
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
                  <th>付款人員</th><th>比對結果</th><th>結果</th>
                </tr>
              </thead>
              <tbody>
                {completionRows.map((r, i) => (
                  <tr key={r.key} id={`completion-row-${r.key}`} style={{
                    background: r.status === "ok" ? "rgba(34,197,94,.06)" : r.status === "error" || r.matchState === "ambiguous" ? "rgba(239,68,68,.12)" : undefined,
                    boxShadow: r.status !== "ok" && r.matchState === "ambiguous" ? "inset 3px 0 0 var(--color-danger)" : undefined,
                  }}>
                    <td>{i + 1}</td>
                    <td><BranchSelect compact branchId={null} branch={r.matchBranch} onChange={(v) => updateCompletion(r.key, { matchBranch: v.branch })} /></td>
                    <td className="font-mono">{r.bookingCode ?? "—"}</td>
                    <td>{r.bookingDate ?? "—"}</td>
                    <td>{r.timeSlot ?? "—"}</td>
                    <td>{r.partySize ?? "—"}</td>
                    <td>{formatCurrency(r.amount)}</td>
                    <td>
                      {r.matched
                        ? <RosterListSelect style={{ width: 110, fontSize: 13 }} value={r.payer} onChange={(v) => updateCompletion(r.key, { payer: v })} />
                        : <span style={{ color: "var(--gray-400)" }}>—</span>}
                    </td>
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
                      {r.status === "error" && <span style={{ color: "var(--color-danger)" }}>✗ {r.message}</span>}
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
          <div className="erp-card-body">
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <button
                onClick={handleSubmitAll}
                disabled={submitting || checkingCompletions || errorLines.length > 0 || (allNoticeDone && allCompletionDone)}
                className="btn btn-primary"
                title={errorLines.length > 0 ? "還有錯誤沒修正，整批不能送出" : undefined}
              >
                {submitting ? "送出中..." : "確認送出全部"}
              </button>
              {errorLines.length > 0 && <span style={{ fontSize: 13, color: "var(--color-danger)", fontWeight: 600 }}>還有 {errorLines.length} 筆錯誤，修正後才能送出</span>}
              {errorLines.length === 0 && checkingCompletions && <span style={{ fontSize: 13, color: "var(--gray-500)" }}>付款完成比對中...</span>}
              {summary && errorLines.length === 0 && <span style={{ fontSize: 13, color: "var(--gray-600)" }}>{summary}</span>}
            </div>
            {errorLines.length > 0 && (
              <div style={{ marginTop: 12, padding: "10px 14px", border: "1px solid var(--color-danger)", borderRadius: 6, background: "rgba(239,68,68,.06)", fontSize: 13 }}>
                {[
                  ...missingRows.map((e) => ({ ...e, rowId: `notice-row-${e.key}`, kind: "付款通知", problem: `缺${e.fields}` })),
                  ...ambiguousRows.map((e) => ({ ...e, rowId: `completion-row-${e.key}`, kind: "付款完成", problem: "對到不只一筆單據，請修正分店後重新比對" })),
                ].map((e) => (
                  <div key={e.rowId} style={{ padding: "3px 0" }}>
                    <button
                      type="button"
                      onClick={() => document.getElementById(e.rowId)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--color-danger)", textDecoration: "underline", fontSize: 13 }}
                    >
                      {e.kind}第 {e.n} 筆
                    </button>
                    <span style={{ color: "var(--gray-600)" }}>　{e.label || "（沒有資料）"}</span>
                    <span style={{ color: "var(--color-danger)", fontWeight: 600 }}>　{e.problem}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

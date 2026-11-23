"use client";

import { BranchSelect } from "@/components/BranchSelect";

// 預定單的一個候選：跟需求看板的候選一樣，各自有餐廳分店／日期／時段／人數
export type ReservedOption = { branchId: string; branch: string; date: string; timeSlot: string; partySize: string };

const emptyOption = (prev?: ReservedOption): ReservedOption => ({
  branchId: prev?.branchId ?? "",
  branch: prev?.branch ?? "",
  date: "",
  timeSlot: prev?.timeSlot ?? "",
  partySize: prev?.partySize ?? "",
});

// 從單據資料組回候選清單：第 1 順位是單據本身的分店/日期/時段/人數，後面接 altDates
export function bookingToOptions(data: {
  branchId?: string | null; branch?: string | null; bookingDate?: string | null; timeSlot?: string | null; partySize?: number | null; altDates?: unknown;
}): ReservedOption[] {
  const main: ReservedOption = {
    branchId: data.branchId ?? "",
    branch: data.branch ?? "",
    date: data.bookingDate ?? "",
    timeSlot: data.timeSlot ?? "",
    partySize: data.partySize?.toString() ?? "",
  };
  const alts = Array.isArray(data.altDates)
    ? data.altDates.map((r) => ({
        branchId: r?.branchId ?? "",
        branch: r?.branch ?? "",
        date: r?.date ?? "",
        timeSlot: r?.timeSlot ?? "",
        partySize: r?.partySize?.toString() ?? "",
      }))
    : [];
  return [main, ...alts];
}

// 送出用：第 1 順位寫回單據本身的欄位，其他放 altDates
export function optionsToBody(options: ReservedOption[]) {
  const [main, ...rest] = options;
  return {
    branchId: main?.branchId ?? "",
    branch: main?.branch ?? "",
    bookingDate: main?.date ?? "",
    timeSlot: main?.timeSlot ?? "",
    partySize: main?.partySize ?? "",
    altDates: rest.filter((r) => r.date),
  };
}

export function ReservedOptionsEditor({ options, onChange }: { options: ReservedOption[]; onChange: (next: ReservedOption[]) => void }) {
  const update = (i: number, patch: Partial<ReservedOption>) => onChange(options.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...options];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    onChange(next);
  };

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {options.map((row, i) => (
          <div key={i} style={{ padding: 10, border: "1px solid var(--gray-200)", borderRadius: 6 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <span className="badge badge-navy" style={{ alignSelf: "center" }}>第{i + 1}順位</span>
              <div style={{ flex: "2 1 260px" }}>
                <label className="erp-label">餐廳／分店</label>
                <BranchSelect branchId={row.branchId} branch={row.branch} onChange={(v) => update(i, v)} />
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <label className="erp-label">日期 <span className="required">*</span></label>
                <input type="date" className="erp-input" value={row.date} onChange={(e) => update(i, { date: e.target.value })} />
              </div>
              <div style={{ flex: "1 1 100px" }}>
                <label className="erp-label">時段</label>
                <input className="erp-input" placeholder="例如 11:30" value={row.timeSlot} onChange={(e) => update(i, { timeSlot: e.target.value })} />
              </div>
              <div style={{ flex: "0 1 80px" }}>
                <label className="erp-label">人數</label>
                <input type="number" min={1} className="erp-input" value={row.partySize} onChange={(e) => update(i, { partySize: e.target.value })} />
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button type="button" className="btn btn-ghost" style={{ padding: "4px 8px" }} disabled={i === 0} onClick={() => move(i, -1)} title="順位往前">↑</button>
                <button type="button" className="btn btn-ghost" style={{ padding: "4px 8px" }} disabled={i === options.length - 1} onClick={() => move(i, 1)} title="順位往後">↓</button>
                <button type="button" className="btn btn-ghost" style={{ padding: "4px 8px", color: "var(--color-danger)" }} disabled={options.length === 1} onClick={() => onChange(options.filter((_, idx) => idx !== i))}>刪除</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-secondary" style={{ marginTop: 10 }} onClick={() => onChange([...options, emptyOption(options.at(-1))])}>
        ＋ 再加一個候選日期
      </button>
      <div style={{ marginTop: 6, fontSize: 11, color: "var(--gray-400)" }}>第 1 順位就是這張單目前的分店／日期／時段；訂到哪一個就把它移到第 1 順位</div>
    </div>
  );
}

// 看板/詳情顯示用：「島語｜台北大巨蛋 12/28 11:30 2人、12/30」
export function formatAltDates(v: unknown): string {
  if (!Array.isArray(v)) return "";
  return v
    .filter((r) => r?.date)
    .map((r) => [r.branch, `${String(r.date).slice(5).replace("-", "/")}`, r.timeSlot, r.partySize ? `${r.partySize}人` : null].filter(Boolean).join(" "))
    .join("、");
}

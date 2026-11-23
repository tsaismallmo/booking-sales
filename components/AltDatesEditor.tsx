"use client";

export type AltDateRow = { date: string; timeSlot: string };

// 預定單：客人常常會給好幾個可以的日期。主要日期/時段照舊填在上面的欄位（第 1 順位），
// 這裡列其他候選（第 2、3… 順位）；訂到哪一個就按「設為主要」跟上面的日期/時段對調。
export function AltDatesEditor({
  mainDate,
  mainTimeSlot,
  rows,
  onChange,
}: {
  mainDate: string;
  mainTimeSlot: string;
  rows: AltDateRow[];
  onChange: (next: { mainDate: string; mainTimeSlot: string; rows: AltDateRow[] }) => void;
}) {
  const update = (i: number, patch: Partial<AltDateRow>) =>
    onChange({ mainDate, mainTimeSlot, rows: rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });
  const remove = (i: number) => onChange({ mainDate, mainTimeSlot, rows: rows.filter((_, idx) => idx !== i) });
  const add = () => onChange({ mainDate, mainTimeSlot, rows: [...rows, { date: "", timeSlot: mainTimeSlot }] });
  const promote = (i: number) => {
    const picked = rows[i];
    const next = rows.map((r, idx) => (idx === i ? { date: mainDate, timeSlot: mainTimeSlot } : r));
    onChange({ mainDate: picked.date, mainTimeSlot: picked.timeSlot, rows: next });
  };

  return (
    <div className="erp-form-group full">
      <label className="erp-label">其他候選日期</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "var(--gray-500)", width: 64 }}>第 {i + 2} 順位</span>
            <input type="date" className="erp-input" style={{ width: 180 }} value={r.date} onChange={(e) => update(i, { date: e.target.value })} />
            <input className="erp-input" style={{ width: 120 }} placeholder="時段" value={r.timeSlot} onChange={(e) => update(i, { timeSlot: e.target.value })} />
            <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 13 }} disabled={!r.date} onClick={() => promote(i)}>
              設為主要
            </button>
            <button type="button" className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 13 }} onClick={() => remove(i)}>
              刪除
            </button>
          </div>
        ))}
        <div>
          <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 13 }} onClick={add}>
            ＋ 新增候選日期
          </button>
        </div>
        <span style={{ fontSize: 12, color: "var(--gray-400)" }}>上面的「日期／時段」是第 1 順位；訂到別的日期就按「設為主要」對調</span>
      </div>
    </div>
  );
}

export function altDatesToRows(v: unknown): AltDateRow[] {
  return Array.isArray(v) ? v.map((r) => ({ date: r?.date ?? "", timeSlot: r?.timeSlot ?? "" })) : [];
}

// 看板/詳情顯示用：「12/28 11:30、12/30」
export function formatAltDates(v: unknown): string {
  return altDatesToRows(v)
    .filter((r) => r.date)
    .map((r) => `${r.date.slice(5).replace("-", "/")}${r.timeSlot ? ` ${r.timeSlot}` : ""}`)
    .join("、");
}

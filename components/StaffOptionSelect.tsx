"use client";

import { useEffect, useState } from "react";

export type StaffOptionKind = "booker" | "payer";
type StaffOption = { id: string; kind: StaffOptionKind; name: string; vendorId: string; vendorName: string };

// 同一頁可能有很多個下拉（大量解析每一列一個），每種只抓一次
const cached: Partial<Record<StaffOptionKind, Promise<StaffOption[]>>> = {};
function loadOptions(kind: StaffOptionKind) {
  cached[kind] ??= fetch(`/api/staff-options?kind=${kind}`)
    .then((res) => (res.ok ? res.json() : []))
    .then((data) => (Array.isArray(data) ? data : []))
    .catch(() => []);
  return cached[kind]!;
}

// 「實際訂位人員」（kind=booker）／「付款人員」（kind=payer）下拉：選項在「人員選項」頁面設定，
// 每個廠商各一份（管理員看全部廠商、依廠商分組；廠商看自己的；廠商員工看所屬廠商的）。
// 存進單據的是名稱文字；舊資料填的值不在選項裡的話也保留顯示，不會被洗掉。
export function StaffOptionSelect({ kind, value, onChange, style }: { kind: StaffOptionKind; value: string; onChange: (name: string) => void; style?: React.CSSProperties }) {
  const [options, setOptions] = useState<StaffOption[]>([]);

  useEffect(() => {
    loadOptions(kind).then(setOptions);
  }, [kind]);

  const vendors = [...new Map(options.map((o) => [o.vendorId, o.vendorName])).entries()];
  const grouped = vendors.length > 1;
  const names = new Set(options.map((o) => o.name));

  return (
    <select className="erp-select" style={style} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">（不指定）</option>
      {value && !names.has(value) && <option value={value}>{value}</option>}
      {grouped
        ? vendors.map(([vendorId, vendorName]) => (
            <optgroup key={vendorId} label={vendorName}>
              {options.filter((o) => o.vendorId === vendorId).map((o) => (
                <option key={o.id} value={o.name}>{o.name}</option>
              ))}
            </optgroup>
          ))
        : [...names].map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  );
}

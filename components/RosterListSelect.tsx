"use client";

import { useEffect, useState } from "react";

type ListOption = { id: string; name: string; vendorId: string; vendorName: string };

// 同一頁可能有很多個下拉（大量解析每一列一個），名單只抓一次
let cached: Promise<ListOption[]> | null = null;
function loadOptions() {
  cached ??= fetch("/api/roster/list-options")
    .then((res) => (res.ok ? res.json() : []))
    .then((data) => (Array.isArray(data) ? data : []))
    .catch(() => []);
  return cached;
}

// 「實際訂位人員」下拉選單：選項是廠商名單的名稱（管理員看全部廠商、依廠商分組；廠商只看自己底下的）。
// 存進單據的還是名單名稱文字；舊資料填的值不在選項裡的話也保留顯示，不會被洗掉。
export function RosterListSelect({ value, onChange, style }: { value: string; onChange: (name: string) => void; style?: React.CSSProperties }) {
  const [options, setOptions] = useState<ListOption[]>([]);

  useEffect(() => {
    loadOptions().then(setOptions);
  }, []);

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

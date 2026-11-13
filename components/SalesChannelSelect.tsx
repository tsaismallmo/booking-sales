"use client";

import { useEffect, useState } from "react";

export type SalesChannel = { id: string; name: string; baseRate: number; isDefault: boolean };

// 銷售平台清單同一頁只抓一次
let cached: Promise<SalesChannel[]> | null = null;
function loadChannels() {
  cached ??= fetch("/api/sales-channels")
    .then((res) => (res.ok ? res.json() : []))
    .then((data) => (Array.isArray(data) ? data : []))
    .catch(() => []);
  return cached;
}

export function useSalesChannels() {
  const [channels, setChannels] = useState<SalesChannel[]>([]);
  useEffect(() => {
    loadChannels().then(setChannels);
  }, []);
  return channels;
}

// 單據的銷售平台名稱：沒指定就是預設平台
export function salesChannelName(channels: SalesChannel[], id: string | null | undefined) {
  return (channels.find((c) => c.id === id) ?? channels.find((c) => c.isDefault))?.name ?? "平台";
}

// 「銷售平台」下拉：value 是銷售平台 id，空字串＝預設平台
export function SalesChannelSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const channels = useSalesChannels();
  const def = channels.find((c) => c.isDefault);
  return (
    <select className="erp-select" value={value || def?.id || ""} onChange={(e) => onChange(e.target.value === def?.id ? "" : e.target.value)}>
      {channels.length === 0 && <option value="">平台</option>}
      {channels.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  );
}

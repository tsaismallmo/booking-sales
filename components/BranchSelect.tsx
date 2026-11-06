"use client";

import { useEffect, useState } from "react";

export type BranchOption = { id: string; name: string; restaurantId: string; restaurantName: string; label: string; active: boolean };

// 同一頁可能有很多個下拉（大量解析每一列一個），分店清單只抓一次
let cached: Promise<BranchOption[]> | null = null;
export function loadBranchOptions() {
  cached ??= fetch("/api/branches")
    .then((res) => (res.ok ? res.json() : []))
    .then((data) => (Array.isArray(data) ? data : []))
    .catch(() => []);
  return cached;
}

// 從「餐廳｜分店」全名或舊式分店名找主檔（跟伺服器 resolveBranch 同一套規則）
export function findBranch(options: BranchOption[], text: string | null | undefined) {
  const t = text?.trim();
  if (!t) return null;
  const byLabel = options.find((o) => o.label === t);
  if (byLabel) return byLabel;
  const byName = options.filter((o) => o.name === t);
  return byName.length === 1 ? byName[0] : null;
}

// 分店下拉：先選餐廳、再選該餐廳的分店（選項由管理員在「餐廳／分店管理」維護）。
// 單據上還是舊的自由文字、對不到主檔的話，會顯示原本的文字提醒重選。
export function BranchSelect({
  branchId,
  branch,
  onChange,
  compact = false,
}: {
  branchId: string | null | undefined;
  branch: string | null | undefined;
  onChange: (v: { branchId: string; branch: string }) => void;
  compact?: boolean;
}) {
  const [options, setOptions] = useState<BranchOption[]>([]);
  const [restaurantId, setRestaurantId] = useState("");

  useEffect(() => {
    loadBranchOptions().then(setOptions);
  }, []);

  const current = (branchId && options.find((o) => o.id === branchId)) || findBranch(options, branch);
  const shownRestaurantId = current?.restaurantId ?? restaurantId;
  const restaurants = [...new Map(options.map((o) => [o.restaurantId, o.restaurantName])).entries()];
  const branchesOfRestaurant = options.filter((o) => o.restaurantId === shownRestaurantId);
  const fontSize = compact ? 13 : undefined;

  return (
    <div style={{ display: "flex", flexDirection: compact ? "column" : "row", gap: compact ? 4 : 8 }}>
      <select
        className="erp-select"
        style={{ fontSize, minWidth: compact ? 110 : 0, flex: compact ? undefined : 1 }}
        value={shownRestaurantId}
        onChange={(e) => {
          setRestaurantId(e.target.value);
          const only = options.filter((o) => o.restaurantId === e.target.value);
          if (only.length === 1) onChange({ branchId: only[0].id, branch: only[0].label });
          else if (current && current.restaurantId !== e.target.value) onChange({ branchId: "", branch: "" });
        }}
      >
        <option value="">選餐廳</option>
        {restaurants.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
      <select
        className="erp-select"
        style={{ fontSize, minWidth: compact ? 110 : 0, flex: compact ? undefined : 1 }}
        value={current?.id ?? ""}
        disabled={!shownRestaurantId}
        onChange={(e) => {
          const hit = options.find((o) => o.id === e.target.value);
          onChange(hit ? { branchId: hit.id, branch: hit.label } : { branchId: "", branch: "" });
        }}
      >
        <option value="">選分店</option>
        {branchesOfRestaurant.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      {!current && branch && (
        <span style={{ fontSize: 12, color: "var(--color-warning)", alignSelf: "center", whiteSpace: "nowrap" }}>原本：{branch}</span>
      )}
    </div>
  );
}

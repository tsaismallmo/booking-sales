"use client";

import { useEffect, useState } from "react";

type Account = { id: string; name: string | null; email: string; roles: string[] };

// 管理員的「代理廠商」：廠商名單、訂位看板、訂金付款看板、解析簡訊等廠商功能，
// 管理員用這裡選的廠商身分操作（存在 cookie，伺服器端 lib/vendor-scope.ts 讀取）
export function ActingVendorSelect() {
  const [vendors, setVendors] = useState<Account[]>([]);
  const [current, setCurrent] = useState("");

  useEffect(() => {
    fetch("/api/accounts")
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: Account[]) => setVendors((Array.isArray(rows) ? rows : []).filter((u) => u.roles.includes("vendor")).sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email, "zh-Hant"))));
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : {}))
      .then((me: { vendorScopeId?: string | null }) => setCurrent(me.vendorScopeId && me.vendorScopeId !== "all" ? me.vendorScopeId : ""));
  }, []);

  if (vendors.length === 0) return null;

  return (
    <div style={{ padding: "4px 18px 8px" }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", marginBottom: 4 }}>代理廠商</div>
      <select
        value={current}
        onChange={(e) => {
          document.cookie = `act_as_vendor=${e.target.value}; path=/; max-age=31536000; samesite=lax`;
          window.location.reload();
        }}
        style={{ width: "100%", fontSize: 13, padding: "4px 6px", borderRadius: 6, background: "rgba(255,255,255,.08)", color: "#fff", border: "1px solid rgba(255,255,255,.2)" }}
      >
        {vendors.map((v) => (
          <option key={v.id} value={v.id} style={{ color: "#000" }}>{v.name ?? v.email}</option>
        ))}
      </select>
    </div>
  );
}

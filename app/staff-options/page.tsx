"use client";

import { useEffect, useState } from "react";
import type { StaffOptionKind } from "@/components/StaffOptionSelect";

type Option = { id: string; kind: StaffOptionKind; name: string };

const SECTIONS: { kind: StaffOptionKind; title: string; hint: string }[] = [
  { kind: "booker", title: "實際訂位人員", hint: "實際打電話／上網訂位的人" },
  { kind: "payer", title: "付款人員", hint: "幫忙付訂金給餐廳的人" },
];

// 人員選項：單據上「實際訂位人員」「付款人員」兩個下拉的選項，各自一份清單。
// 廠商設定自己的；管理員設定側邊欄「代理廠商」選的那個廠商。
// 改名或刪除不會動到已經填在單據上的名稱。
export default function StaffOptionsPage() {
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<StaffOptionKind, string>>({ booker: "", payer: "" });
  const [error, setError] = useState("");

  const load = () =>
    fetch("/api/staff-options?manage=1")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setOptions(Array.isArray(data) ? data : []);
        setLoading(false);
      });

  useEffect(() => {
    load();
  }, []);

  const call = async (url: string, method: string, body?: object) => {
    setError("");
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "儲存失敗");
      return false;
    }
    await load();
    return true;
  };

  const add = async (kind: StaffOptionKind) => {
    const name = drafts[kind].trim();
    if (!name) return;
    if (await call("/api/staff-options", "POST", { kind, name })) setDrafts((d) => ({ ...d, [kind]: "" }));
  };
  const rename = (o: Option) => {
    const name = window.prompt("新的名稱（已經填在單據上的舊名稱不會跟著改）", o.name)?.trim();
    if (name && name !== o.name) void call(`/api/staff-options/${o.id}`, "PATCH", { name });
  };
  const remove = (o: Option) => {
    if (window.confirm(`確定刪除「${o.name}」？已經填在單據上的不會被清掉`)) void call(`/api/staff-options/${o.id}`, "DELETE");
  };
  const move = (o: Option, dir: "up" | "down") => void call(`/api/staff-options/${o.id}`, "PATCH", { move: dir });

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">人員選項</h1>
          <p className="erp-page-subtitle">單據上「實際訂位人員」「付款人員」下拉的選項，兩個各自設定。改名或刪除不會動到已經填在單據上的名稱</p>
        </div>
      </div>

      {error && <div className="erp-alert danger">{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        {SECTIONS.map((sec) => {
          const list = options.filter((o) => o.kind === sec.kind);
          return (
            <div key={sec.kind} className="erp-card">
              <div className="erp-card-header">
                <span className="erp-card-title">{sec.title}</span>
                <span style={{ fontSize: 12, color: "var(--gray-500)" }}>{sec.hint}</span>
              </div>
              <div className="erp-card-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {loading && <span style={{ color: "var(--gray-400)" }}>載入中...</span>}
                {!loading && list.length === 0 && <span style={{ color: "var(--gray-400)" }}>還沒有選項</span>}
                {list.map((o, i) => (
                  <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid var(--gray-100)", paddingBottom: 6 }}>
                    <span style={{ flex: 1, fontWeight: 600 }}>{o.name}</span>
                    <button className="btn btn-ghost" style={{ padding: "2px 8px", fontSize: 13 }} disabled={i === 0} onClick={() => move(o, "up")}>↑</button>
                    <button className="btn btn-ghost" style={{ padding: "2px 8px", fontSize: 13 }} disabled={i === list.length - 1} onClick={() => move(o, "down")}>↓</button>
                    <button className="btn btn-ghost" style={{ padding: "2px 8px", fontSize: 13 }} onClick={() => rename(o)}>改名</button>
                    <button className="btn btn-ghost" style={{ padding: "2px 8px", fontSize: 13, color: "var(--color-danger)" }} onClick={() => remove(o)}>刪除</button>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <input
                    className="erp-input"
                    placeholder={`新增${sec.title}`}
                    value={drafts[sec.kind]}
                    onChange={(e) => setDrafts((d) => ({ ...d, [sec.kind]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") void add(sec.kind); }}
                  />
                  <button className="btn btn-primary" disabled={!drafts[sec.kind].trim()} onClick={() => add(sec.kind)}>新增</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

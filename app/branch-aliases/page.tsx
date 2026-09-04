"use client";

import { useEffect, useState } from "react";

type Alias = {
  id: string;
  rawText: string;
  canonicalBranch: string;
  createdAt: string;
};

export default function BranchAliasesPage() {
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, string>>({});

  const load = () => {
    fetch("/api/branch-aliases")
      .then((res) => res.json())
      .then((data) => {
        setAliases(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  };

  useEffect(load, []);

  const handleSave = async (id: string) => {
    const canonicalBranch = editing[id];
    if (!canonicalBranch) return;
    await fetch(`/api/branch-aliases/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canonicalBranch }),
    });
    setEditing((e) => {
      const next = { ...e };
      delete next[id];
      return next;
    });
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("確定要刪除這筆分店對應嗎？刪除後這段簡訊文字下次不會再自動代換。")) return;
    await fetch(`/api/branch-aliases/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">分店對應表</h1>
          <p className="erp-page-subtitle">解析付款完成簡訊時，簡訊裡的分店文字會自動代換成這裡設定的名稱</p>
        </div>
      </div>

      <div className="erp-card">
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>簡訊原文</th>
                <th>對應到的分店名稱</th>
                <th>建立時間</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--gray-400)" }}>載入中...</td></tr>}
              {!loading && aliases.map((a) => (
                <tr key={a.id}>
                  <td>{a.rawText}</td>
                  <td>
                    <input
                      className="erp-input"
                      style={{ minWidth: 180 }}
                      value={editing[a.id] ?? a.canonicalBranch}
                      onChange={(e) => setEditing((ed) => ({ ...ed, [a.id]: e.target.value }))}
                    />
                  </td>
                  <td>{new Date(a.createdAt).toLocaleString("zh-TW")}</td>
                  <td style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => handleSave(a.id)}
                      disabled={editing[a.id] === undefined || editing[a.id] === a.canonicalBranch}
                      className="btn btn-primary"
                      style={{ padding: "4px 10px", fontSize: 13 }}
                    >
                      儲存
                    </button>
                    <button onClick={() => handleDelete(a.id)} className="btn btn-ghost" style={{ color: "var(--color-danger)", padding: "4px 10px", fontSize: 13 }}>
                      刪除
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && aliases.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--gray-400)" }}>目前還沒有任何對應紀錄</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

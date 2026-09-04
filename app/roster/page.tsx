"use client";

import { useEffect, useState } from "react";

type RosterEntry = {
  id: string;
  name: string;
  phone: string | null;
  note: string | null;
};

export default function RosterPage() {
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", note: "" });

  const load = () => {
    fetch("/api/roster")
      .then((res) => res.json())
      .then((data) => {
        setEntries(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  };

  useEffect(load, []);

  const handleAdd = async () => {
    if (!form.name) { setError("請輸入姓名"); return; }
    setSaving(true);
    setError("");
    const res = await fetch("/api/roster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "新增失敗");
      return;
    }
    setForm({ name: "", phone: "", note: "" });
    load();
  };

  const startEdit = (e: RosterEntry) => {
    setEditingId(e.id);
    setEditForm({ name: e.name, phone: e.phone ?? "", note: e.note ?? "" });
  };

  const handleSaveEdit = async (id: string) => {
    await fetch(`/api/roster/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setEditingId(null);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("確定要刪除這個名單資料嗎？")) return;
    await fetch(`/api/roster/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">廠商名單</h1>
          <p className="erp-page-subtitle">自己手上用來訂位的客戶身份資料，只有你看得到</p>
        </div>
      </div>

      {error && <div className="erp-alert danger">{error}</div>}

      <div className="erp-card" style={{ marginBottom: 20 }}>
        <div className="erp-card-header"><span className="erp-card-title">新增名單</span></div>
        <div className="erp-card-body">
          <div className="erp-form-grid">
            <div className="erp-form-group">
              <label className="erp-label">姓名 <span className="required">*</span></label>
              <input className="erp-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="erp-form-group">
              <label className="erp-label">電話</label>
              <input className="erp-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="erp-form-group full">
              <label className="erp-label">備註</label>
              <input className="erp-input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <button onClick={handleAdd} disabled={saving} className="btn btn-primary">{saving ? "新增中..." : "新增"}</button>
          </div>
        </div>
      </div>

      <div className="erp-card">
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>姓名</th>
                <th>電話</th>
                <th>備註</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--gray-400)" }}>載入中...</td></tr>}
              {!loading && entries.map((e) => (
                <tr key={e.id}>
                  {editingId === e.id ? (
                    <>
                      <td><input className="erp-input" value={editForm.name} onChange={(ev) => setEditForm({ ...editForm, name: ev.target.value })} /></td>
                      <td><input className="erp-input" value={editForm.phone} onChange={(ev) => setEditForm({ ...editForm, phone: ev.target.value })} /></td>
                      <td><input className="erp-input" value={editForm.note} onChange={(ev) => setEditForm({ ...editForm, note: ev.target.value })} /></td>
                      <td style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => handleSaveEdit(e.id)} className="btn btn-primary" style={{ padding: "4px 10px", fontSize: 13 }}>儲存</button>
                        <button onClick={() => setEditingId(null)} className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 13 }}>取消</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{e.name}</td>
                      <td>{e.phone ?? "—"}</td>
                      <td>{e.note ?? "—"}</td>
                      <td style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => startEdit(e)} className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 13 }}>編輯</button>
                        <button onClick={() => handleDelete(e.id)} className="btn btn-ghost" style={{ color: "var(--color-danger)", padding: "4px 10px", fontSize: 13 }}>刪除</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {!loading && entries.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--gray-400)" }}>目前沒有任何名單資料</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

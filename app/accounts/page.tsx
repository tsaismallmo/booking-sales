"use client";

import { useEffect, useState } from "react";

type Account = {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "vendor" | "customer_service";
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ email: "", name: "", role: "vendor" as Account["role"] });
  const [saving, setSaving] = useState(false);

  const load = () => {
    fetch("/api/accounts")
      .then((res) => res.json())
      .then((data) => {
        setAccounts(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  };

  useEffect(load, []);

  const handleAdd = async () => {
    if (!form.email) { setError("請輸入 email"); return; }
    setSaving(true);
    setError("");
    const res = await fetch("/api/accounts", {
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
    setForm({ email: "", name: "", role: "vendor" });
    load();
  };

  const handleRoleChange = async (id: string, role: Account["role"]) => {
    await fetch(`/api/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("確定要移除這個帳號嗎？移除後該帳號將無法登入。")) return;
    const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    if (res.ok) load();
  };

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">帳號管理</h1>
          <p className="erp-page-subtitle">管理誰可以登入系統，以及各自的角色</p>
        </div>
      </div>

      {error && <div className="erp-alert danger">{error}</div>}

      <div className="erp-card" style={{ marginBottom: 20 }}>
        <div className="erp-card-header"><span className="erp-card-title">新增帳號</span></div>
        <div className="erp-card-body">
          <div className="erp-form-grid">
            <div className="erp-form-group">
              <label className="erp-label">Email <span className="required">*</span></label>
              <input className="erp-input" placeholder="name@gmail.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="erp-form-group">
              <label className="erp-label">名稱</label>
              <input className="erp-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="erp-form-group">
              <label className="erp-label">角色</label>
              <select className="erp-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Account["role"] })}>
                <option value="vendor">廠商</option>
                <option value="customer_service">客服</option>
                <option value="admin">管理員</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <button onClick={handleAdd} disabled={saving} className="btn btn-primary">{saving ? "新增中..." : "新增帳號"}</button>
          </div>
        </div>
      </div>

      <div className="erp-card">
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>名稱</th>
                <th>角色</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--gray-400)" }}>載入中...</td></tr>}
              {!loading && accounts.map((a) => (
                <tr key={a.id}>
                  <td>{a.email}</td>
                  <td>{a.name ?? "—"}</td>
                  <td>
                    <select className="erp-select" style={{ minWidth: 110 }} value={a.role} onChange={(e) => handleRoleChange(a.id, e.target.value as Account["role"])}>
                      <option value="vendor">廠商</option>
                      <option value="customer_service">客服</option>
                      <option value="admin">管理員</option>
                    </select>
                  </td>
                  <td>
                    <button onClick={() => handleDelete(a.id)} className="btn btn-ghost" style={{ color: "var(--color-danger)", padding: "4px 10px", fontSize: 13 }}>移除</button>
                  </td>
                </tr>
              ))}
              {!loading && accounts.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--gray-400)" }}>尚無帳號</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

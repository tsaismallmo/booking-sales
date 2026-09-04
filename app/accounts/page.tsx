"use client";

import { useEffect, useState } from "react";

type Role = "admin" | "vendor" | "customer_service" | "logistics" | "vendor_staff";

type Account = {
  id: string;
  email: string;
  name: string | null;
  roles: Role[];
  employerVendorId: string | null;
};

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "vendor", label: "廠商" },
  { value: "vendor_staff", label: "廠商員工" },
  { value: "customer_service", label: "客服" },
  { value: "logistics", label: "後勤人員" },
  { value: "admin", label: "管理員" },
];

function RoleCheckboxes({ value, onChange }: { value: Role[]; onChange: (roles: Role[]) => void }) {
  const toggle = (role: Role) => {
    onChange(value.includes(role) ? value.filter((r) => r !== role) : [...value, role]);
  };
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {ROLE_OPTIONS.map((opt) => (
        <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
          <input type="checkbox" checked={value.includes(opt.value)} onChange={() => toggle(opt.value)} />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

function EmployerSelect({ vendors, value, onChange }: { vendors: Account[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="erp-form-group">
      <label className="erp-label">所屬廠商 <span className="required">*</span></label>
      <select className="erp-select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">請選擇廠商</option>
        {vendors.map((v) => (
          <option key={v.id} value={v.id}>{v.name || v.email}</option>
        ))}
      </select>
    </div>
  );
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState<{ email: string; name: string; roles: Role[]; employerVendorId: string }>({
    email: "",
    name: "",
    roles: ["vendor"],
    employerVendorId: "",
  });
  const [saving, setSaving] = useState(false);
  const [editingRoles, setEditingRoles] = useState<Record<string, Role[]>>({});
  const [editingEmployer, setEditingEmployer] = useState<Record<string, string>>({});

  const load = () => {
    fetch("/api/accounts")
      .then((res) => res.json())
      .then((data) => {
        setAccounts(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  };

  useEffect(load, []);

  const vendors = accounts.filter((a) => a.roles.includes("vendor"));

  const handleAdd = async () => {
    if (!form.email) { setError("請輸入 email"); return; }
    if (form.roles.length === 0) { setError("請至少選一個角色"); return; }
    if (form.roles.includes("vendor_staff") && !form.employerVendorId) { setError("廠商員工要選所屬廠商"); return; }
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
    setForm({ email: "", name: "", roles: ["vendor"], employerVendorId: "" });
    load();
  };

  const handleSaveRoles = async (id: string) => {
    const roles = editingRoles[id];
    if (!roles || roles.length === 0) return;
    const employerVendorId = editingEmployer[id] ?? accounts.find((a) => a.id === id)?.employerVendorId ?? "";
    if (roles.includes("vendor_staff") && !employerVendorId) { setError("廠商員工要選所屬廠商"); return; }
    const res = await fetch(`/api/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles, employerVendorId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "更新失敗");
      return;
    }
    setEditingRoles((e) => {
      const next = { ...e };
      delete next[id];
      return next;
    });
    setEditingEmployer((e) => {
      const next = { ...e };
      delete next[id];
      return next;
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
          <p className="erp-page-subtitle">管理誰可以登入系統，以及各自的角色（一個帳號可以同時有多個角色）</p>
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
              <label className="erp-label">角色 <span className="required">*</span></label>
              <RoleCheckboxes value={form.roles} onChange={(roles) => setForm({ ...form, roles })} />
            </div>
            {form.roles.includes("vendor_staff") && (
              <EmployerSelect vendors={vendors} value={form.employerVendorId} onChange={(id) => setForm({ ...form, employerVendorId: id })} />
            )}
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
                <th>所屬廠商</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--gray-400)" }}>載入中...</td></tr>}
              {!loading && accounts.map((a) => {
                const current = editingRoles[a.id] ?? a.roles;
                const currentEmployer = editingEmployer[a.id] ?? a.employerVendorId ?? "";
                const dirty = editingRoles[a.id] !== undefined || editingEmployer[a.id] !== undefined;
                return (
                  <tr key={a.id}>
                    <td>{a.email}</td>
                    <td>{a.name ?? "—"}</td>
                    <td>
                      <RoleCheckboxes value={current} onChange={(roles) => setEditingRoles((e) => ({ ...e, [a.id]: roles }))} />
                    </td>
                    <td>
                      {current.includes("vendor_staff") ? (
                        <select
                          className="erp-select"
                          style={{ minWidth: 140 }}
                          value={currentEmployer}
                          onChange={(e) => setEditingEmployer((ev) => ({ ...ev, [a.id]: e.target.value }))}
                        >
                          <option value="">請選擇廠商</option>
                          {vendors.map((v) => (
                            <option key={v.id} value={v.id}>{v.name || v.email}</option>
                          ))}
                        </select>
                      ) : "—"}
                    </td>
                    <td style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => handleSaveRoles(a.id)}
                        disabled={!dirty}
                        className="btn btn-primary"
                        style={{ padding: "4px 10px", fontSize: 13 }}
                      >
                        儲存
                      </button>
                      <button onClick={() => handleDelete(a.id)} className="btn btn-ghost" style={{ color: "var(--color-danger)", padding: "4px 10px", fontSize: 13 }}>移除</button>
                    </td>
                  </tr>
                );
              })}
              {!loading && accounts.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--gray-400)" }}>尚無帳號</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

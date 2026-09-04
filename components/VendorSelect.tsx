"use client";

import { useEffect, useState } from "react";

type Vendor = { id: string; email: string; name: string | null };

// 有廠商角色的人建立單據時，歸屬預設就是自己，不用選。
// 沒有廠商角色但有管理員角色的人（純管理員/客服）建立單據時，要指定歸屬給哪個廠商。
export function VendorSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [needsSelect, setNeedsSelect] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => res.json())
      .then((me) => {
        const roles: string[] = me.roles ?? [];
        if (roles.includes("vendor") || !roles.includes("admin")) {
          setLoading(false);
          return;
        }
        setNeedsSelect(true);
        fetch("/api/accounts")
          .then((res) => res.json())
          .then((accounts) => {
            setVendors(Array.isArray(accounts) ? accounts.filter((a: { roles: string[] }) => a.roles.includes("vendor")) : []);
            setLoading(false);
          });
      });
  }, []);

  if (loading || !needsSelect) return null;

  return (
    <div className="erp-form-group">
      <label className="erp-label">歸屬廠商 <span className="required">*</span></label>
      <select className="erp-select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">請選擇廠商</option>
        {vendors.map((v) => (
          <option key={v.id} value={v.id}>{v.name || v.email}</option>
        ))}
      </select>
      {vendors.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--color-danger)", marginTop: 4 }}>
          目前還沒有廠商帳號，請先到「帳號管理」新增一個有廠商角色的帳號。
        </p>
      )}
    </div>
  );
}

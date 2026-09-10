"use client";

import { useEffect, useState } from "react";

type Vendor = { id: string; email: string; name: string | null };

// 有廠商角色的人建立單據時，歸屬預設就是自己，不用選。
// required=true（現貨單）：只有純管理員需要選，而且一定要選。
// required=false（例如臨時單）：純管理員或純客服都可以選，但可以先不指定。
export function VendorSelect({ value, onChange, required = true }: { value: string; onChange: (id: string) => void; required?: boolean }) {
  const [needsSelect, setNeedsSelect] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => res.json())
      .then((me) => {
        const roles: string[] = me.roles ?? [];
        const eligible = !roles.includes("vendor") && (required
          ? roles.includes("admin")
          : (roles.includes("admin") || roles.includes("customer_service")));
        if (!eligible) {
          setLoading(false);
          return;
        }
        setNeedsSelect(true);
        fetch("/api/directory")
          .then((res) => res.json())
          .then((accounts) => {
            setVendors(Array.isArray(accounts) ? accounts.filter((a: { roles: string[] }) => a.roles.includes("vendor")) : []);
            setLoading(false);
          });
      });
  }, [required]);

  if (loading || !needsSelect) return null;

  return (
    <div className="erp-form-group">
      <label className="erp-label">歸屬廠商 {required && <span className="required">*</span>}</label>
      <select className="erp-select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{required ? "請選擇廠商" : "不指定（之後可以再補）"}</option>
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

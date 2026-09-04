"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { ClipboardList, Users, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/types/next-auth";

const roleLabel: Record<Role, string> = {
  admin: "管理員",
  vendor: "廠商",
  customer_service: "客服",
};

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();

  return (
    <aside className="erp-sidebar">
      <div className="erp-sidebar-logo">
        <span className="erp-sidebar-logo-icon">📋</span>
        <span className="erp-sidebar-logo-text">訂位銷售管理系統</span>
      </div>

      <nav className="erp-sidebar-nav">
        <Link
          href="/bookings"
          className={cn("erp-sidebar-item", pathname.startsWith("/bookings") && "active")}
        >
          <ClipboardList size={15} />
          {role === "vendor" ? "我的單據" : "單據看板"}
        </Link>

        {role === "admin" && (
          <Link
            href="/accounts"
            className={cn("erp-sidebar-item", pathname.startsWith("/accounts") && "active")}
          >
            <Users size={15} />
            帳號管理
          </Link>
        )}
      </nav>

      <div style={{ padding: "0 18px 8px", fontSize: 12, color: "rgba(255,255,255,.4)" }}>
        {roleLabel[role]}
      </div>
      <button onClick={() => signOut({ callbackUrl: "/login" })} className="erp-sidebar-logout">
        <LogOut size={14} />
        登出
      </button>
    </aside>
  );
}

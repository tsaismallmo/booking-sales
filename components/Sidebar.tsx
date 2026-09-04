"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { ClipboardList, Users, LogOut, MapPinned, Wrench, Package, Clock3, CalendarClock, BookUser, CalendarDays, PieChart } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/types/next-auth";

const roleLabel: Record<Role, string> = {
  admin: "管理員",
  vendor: "廠商",
  customer_service: "客服",
  logistics: "後勤人員",
  vendor_staff: "廠商員工",
};

export function Sidebar({ roles }: { roles: Role[] }) {
  const pathname = usePathname();
  const isAdmin = roles.includes("admin");
  const isVendor = roles.includes("vendor");
  const isCustomerService = roles.includes("customer_service");
  const isLogistics = roles.includes("logistics");
  const isVendorStaff = roles.includes("vendor_staff");
  // 純客服（沒有廠商/管理員身份）看不到「單據管理」，只給看單據看板；
  // 有廠商或管理員身份的人看到的是全部單據（或自己的），稱為「單據管理」
  const canManageBookings = isVendor || isAdmin;
  const seesAllBookings = isAdmin || isCustomerService;

  return (
    <aside className="erp-sidebar">
      <div className="erp-sidebar-logo">
        <span className="erp-sidebar-logo-icon">📋</span>
        <span className="erp-sidebar-logo-text">訂位銷售管理系統</span>
      </div>

      <nav className="erp-sidebar-nav">
        {/* 現貨單看板：客服/管理員專用（後勤人員不處理現貨單） */}
        {(isCustomerService || isAdmin) && (
          <Link
            href="/dashboard"
            className={cn("erp-sidebar-item", pathname === "/dashboard" && "active")}
          >
            <Package size={15} />
            現貨單看板
          </Link>
        )}

        {/* 臨時單／預定單看板：客服/管理員/後勤人員都看得到，後勤人員專門處理這兩種 */}
        {(isCustomerService || isAdmin || isLogistics) && (
          <>
            <Link
              href="/dashboard/temp"
              className={cn("erp-sidebar-item", pathname.startsWith("/dashboard/temp") && "active")}
            >
              <Clock3 size={15} />
              臨時單看板
            </Link>
            <Link
              href="/dashboard/reserved"
              className={cn("erp-sidebar-item", pathname.startsWith("/dashboard/reserved") && "active")}
            >
              <CalendarClock size={15} />
              預定單看板
            </Link>
          </>
        )}

        {canManageBookings && (
          <Link
            href="/bookings"
            className={cn("erp-sidebar-item", pathname.startsWith("/bookings") && "active")}
          >
            <ClipboardList size={15} />
            {seesAllBookings ? "單據管理" : "我的單據"}
          </Link>
        )}

        {/* 廠商名單：廠商本人能建立/管理，廠商員工只能唯讀查看所屬廠商的名單 */}
        {(isVendor || isVendorStaff) && (
          <Link
            href="/roster"
            className={cn("erp-sidebar-item", pathname.startsWith("/roster") && "active")}
          >
            <BookUser size={15} />
            廠商名單
          </Link>
        )}

        {/* 訂位看板（月曆/Inline/EZTABLE）：廠商本人跟廠商員工都看得到 */}
        {(isVendor || isVendorStaff) && (
          <Link
            href="/booking-board"
            className={cn("erp-sidebar-item", pathname.startsWith("/booking-board") && "active")}
          >
            <CalendarDays size={15} />
            訂位看板
          </Link>
        )}

        {/* 平台分潤：只有廠商本人跟管理員能看，廠商員工不行 */}
        {(isVendor || isAdmin) && (
          <Link
            href="/platform-share"
            className={cn("erp-sidebar-item", pathname.startsWith("/platform-share") && "active")}
          >
            <PieChart size={15} />
            平台分潤
          </Link>
        )}

        {/* 需求看板：後勤人員/管理員處理需求，客服可以看到自己發起的需求進度 */}
        {(isLogistics || isAdmin || isCustomerService) && (
          <Link
            href="/requests"
            className={cn("erp-sidebar-item", pathname.startsWith("/requests") && "active")}
          >
            <Wrench size={15} />
            需求看板
          </Link>
        )}

        {isAdmin && (
          <>
            <Link
              href="/accounts"
              className={cn("erp-sidebar-item", pathname.startsWith("/accounts") && "active")}
            >
              <Users size={15} />
              帳號管理
            </Link>
            <Link
              href="/branch-aliases"
              className={cn("erp-sidebar-item", pathname.startsWith("/branch-aliases") && "active")}
            >
              <MapPinned size={15} />
              分店對應表
            </Link>
          </>
        )}
      </nav>

      <div style={{ padding: "0 18px 8px", fontSize: 12, color: "rgba(255,255,255,.4)" }}>
        {roles.map((r) => roleLabel[r]).join("・")}
      </div>
      <button onClick={() => signOut({ callbackUrl: "/login" })} className="erp-sidebar-logout">
        <LogOut size={14} />
        登出
      </button>
    </aside>
  );
}

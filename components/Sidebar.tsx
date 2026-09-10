"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { ClipboardList, Users, LogOut, MapPinned, Wrench, Package, Clock3, CalendarClock, BookUser, CalendarDays, PieChart, BellRing, BadgeCheck, TableProperties, HandCoins, RotateCcw, Landmark, Tags } from "lucide-react";
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
  const searchParams = useSearchParams();
  const fromParam = searchParams.get("from");
  const fromAdmin = fromParam === "admin";
  const fromSold = fromParam === "sold";
  const fromTemp = fromParam === "temp";
  const fromReserved = fromParam === "reserved";
  const isAdmin = roles.includes("admin");
  const isVendor = roles.includes("vendor");
  const isCustomerService = roles.includes("customer_service");
  const isLogistics = roles.includes("logistics");
  const isVendorStaff = roles.includes("vendor_staff");
  return (
    <aside className="erp-sidebar">
      <div className="erp-sidebar-logo">
        <span className="erp-sidebar-logo-icon">📋</span>
        <span className="erp-sidebar-logo-text">訂位銷售管理系統</span>
      </div>

      <nav className="erp-sidebar-nav">

        {/* ── 看板 ── 客服 / 管理員 / 後勤 / 廠商（廠商只看得到需求看板） */}
        {(isCustomerService || isAdmin || isLogistics || isVendor || isVendorStaff) && (
          <div className="erp-sidebar-section">看板</div>
        )}
        {(isCustomerService || isAdmin) && (
          <Link href="/dashboard" className={cn("erp-sidebar-item", pathname === "/dashboard" && "active")}>
            <Package size={15} />
            現貨單看板
          </Link>
        )}
        {(isCustomerService || isAdmin || isLogistics || isVendorStaff) && (
          <Link href="/dashboard/temp" className={cn("erp-sidebar-item", (pathname.startsWith("/dashboard/temp") || (pathname.startsWith("/bookings") && fromTemp)) && "active")}>
            <Clock3 size={15} />
            臨時單看板
          </Link>
        )}
        {(isCustomerService || isAdmin) && (
          <Link href="/dashboard/reserved" className={cn("erp-sidebar-item", (pathname.startsWith("/dashboard/reserved") || (pathname.startsWith("/bookings") && fromReserved)) && "active")}>
            <CalendarClock size={15} />
            預定單看板
          </Link>
        )}
        {(isCustomerService || isAdmin) && (
          <Link href="/dashboard/sold" className={cn("erp-sidebar-item", (pathname.startsWith("/dashboard/sold") || (pathname.startsWith("/bookings") && fromSold)) && "active")}>
            <BadgeCheck size={15} />
            已售看板
          </Link>
        )}
        {(isLogistics || isAdmin || isCustomerService || isVendor || isVendorStaff) && (
          <Link href="/requests" className={cn("erp-sidebar-item", pathname.startsWith("/requests") && "active")}>
            <Wrench size={15} />
            需求看板
          </Link>
        )}

        {/* ── 單據 ── 廠商 */}
        {isVendor && (
          <>
            <div className="erp-sidebar-divider" />
            <div className="erp-sidebar-section">單據</div>
            <Link href="/bookings" className={cn("erp-sidebar-item", pathname.startsWith("/bookings") && !fromAdmin && !fromSold && !fromTemp && !fromReserved && "active")}>
              <ClipboardList size={15} />
              單據管理
            </Link>
          </>
        )}

        {/* ── 廠商 ── 廠商本人 / 廠商員工 / 管理員(平台分潤) */}
        {(isVendor || isVendorStaff || isAdmin) && (
          <>
            <div className="erp-sidebar-divider" />
            <div className="erp-sidebar-section">廠商</div>
          </>
        )}
        {(isVendor || isVendorStaff) && (
          <>
            <Link href="/roster" className={cn("erp-sidebar-item", pathname.startsWith("/roster") && "active")}>
              <BookUser size={15} />
              廠商名單
            </Link>
            <Link href="/booking-board" className={cn("erp-sidebar-item", pathname.startsWith("/booking-board") && "active")}>
              <CalendarDays size={15} />
              訂位看板
            </Link>
          </>
        )}
        {(isVendor || isVendorStaff) && (
          <Link href="/reminder" className={cn("erp-sidebar-item", pathname.startsWith("/reminder") && "active")}>
            <BellRing size={15} />
            退訂提醒
          </Link>
        )}
        {(isVendor || isAdmin) && (
          <Link href="/platform-share" className={cn("erp-sidebar-item", pathname.startsWith("/platform-share") && "active")}>
            <PieChart size={15} />
            平台分潤
          </Link>
        )}


        {/* ── 客服 ── 客服本人 / 管理員 */}
        {(isCustomerService || isAdmin) && (
          <>
            <div className="erp-sidebar-divider" />
            <div className="erp-sidebar-section">客服</div>
            <Link href="/cs-share" className={cn("erp-sidebar-item", pathname.startsWith("/cs-share") && "active")}>
              <HandCoins size={15} />
              客服分潤
            </Link>
          </>
        )}

        {/* ── 系統 ── 管理員 */}
        {isAdmin && (
          <>
            <div className="erp-sidebar-divider" />
            <div className="erp-sidebar-section">系統</div>
            <Link href="/admin/bookings" className={cn("erp-sidebar-item", (pathname.startsWith("/admin/bookings") || (pathname.startsWith("/bookings") && fromAdmin && !fromSold)) && "active")}>
              <ClipboardList size={15} />
              所有單據
            </Link>
            <Link href="/admin/bulk-update" className={cn("erp-sidebar-item", pathname.startsWith("/admin/bulk-update") && "active")}>
              <TableProperties size={15} />
              批次更新
            </Link>
            <Link href="/admin/bulk-refund" className={cn("erp-sidebar-item", pathname.startsWith("/admin/bulk-refund") && "active")}>
              <RotateCcw size={15} />
              批次退訂
            </Link>
            <Link href="/admin/bulk-tag-platform" className={cn("erp-sidebar-item", pathname.startsWith("/admin/bulk-tag-platform") && "active")}>
              <Tags size={15} />
              批次標記平台
            </Link>
            <Link href="/admin/rates" className={cn("erp-sidebar-item", pathname.startsWith("/admin/rates") && "active")}>
              <PieChart size={15} />
              分潤設定
            </Link>
            <Link href="/admin/monthly-summary" className={cn("erp-sidebar-item", pathname.startsWith("/admin/monthly-summary") && "active")}>
              <Landmark size={15} />
              每月金流總覽
            </Link>
            <Link href="/accounts" className={cn("erp-sidebar-item", pathname.startsWith("/accounts") && "active")}>
              <Users size={15} />
              帳號管理
            </Link>
            <Link href="/branch-aliases" className={cn("erp-sidebar-item", pathname.startsWith("/branch-aliases") && "active")}>
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

import type { Metadata } from "next";
import "./globals.css";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { Sidebar, SidebarExpandButton } from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "訂位銷售管理系統",
  description: "訂位銷售管理系統",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const h = await headers();
  const pathname = h.get("x-pathname") ?? "";
  const isPublic = pathname.startsWith("/login") || pathname.startsWith("/dev");
  const session = isPublic ? null : await auth();

  return (
    <html lang="zh-TW" suppressHydrationWarning>
      <head>
        {/* 側邊欄收合狀態：畫面出來前就套上，避免先展開再收起的閃動 */}
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem("sidebar-collapsed")==="1")document.documentElement.classList.add("sidebar-collapsed")}catch(e){}` }} />
      </head>
      <body>
        {isPublic || !session ? (
          children
        ) : (
          <div className="erp-layout">
            <Sidebar roles={session.user.roles} />
            <SidebarExpandButton />
            <main className="erp-main">{children}</main>
          </div>
        )}
      </body>
    </html>
  );
}

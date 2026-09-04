import type { Metadata } from "next";
import "./globals.css";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { Sidebar } from "@/components/Sidebar";

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
  const isPublic = pathname.startsWith("/login");
  const session = isPublic ? null : await auth();

  return (
    <html lang="zh-TW">
      <body>
        {isPublic || !session ? (
          children
        ) : (
          <div className="erp-layout">
            <Sidebar role={session.user.role} />
            <main className="erp-main">{children}</main>
          </div>
        )}
      </body>
    </html>
  );
}

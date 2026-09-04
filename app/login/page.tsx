"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginContent() {
  const params = useSearchParams();
  const error = params.get("error");

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>訂位銷售管理系統</h1>
        <p style={{ fontSize: 13, color: "var(--gray-400)", marginBottom: 24 }}>
          請使用授權的 Google 帳號登入
        </p>

        {error === "AccessDenied" && (
          <div className="erp-alert danger">此帳號沒有使用權限，請聯絡管理員新增帳號。</div>
        )}

        <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={() => signIn("google", { callbackUrl: "/bookings" })}>
          使用 Google 帳號登入
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

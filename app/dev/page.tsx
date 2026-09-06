import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

const roleLabel: Record<string, string> = {
  admin: "管理員",
  vendor: "廠商",
  customer_service: "客服",
  logistics: "後勤人員",
  vendor_staff: "廠商員工",
};

export default async function DevSwitchPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const accounts = await db.select().from(users);

  return (
    <div className="erp-page" style={{ maxWidth: 640, margin: "60px auto" }}>
      <div className="erp-page-header">
        <h1 className="erp-page-title">開發用帳號切換</h1>
      </div>
      <div className="erp-alert danger">
        僅限本機開發環境（next dev）使用，正式環境（Vercel 部署）這個頁面會直接 404，不會有繞過登入的風險。
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
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>{a.email}</td>
                  <td>{a.name ?? "—"}</td>
                  <td>{a.roles.map((r) => roleLabel[r]).join("・")}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <a href={`/api/dev/login?email=${encodeURIComponent(a.email)}`} className="btn btn-primary" style={{ padding: "4px 10px", fontSize: 13, whiteSpace: "nowrap" }}>
                      登入為此帳號
                    </a>
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--gray-400)" }}>尚無帳號</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

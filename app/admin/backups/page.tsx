"use client";

import { useEffect, useState } from "react";

type Backup = {
  id: string;
  label: string | null;
  createdAt: string;
  createdByName: string | null;
};

export default function AdminBackupsPage() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadBackups = () => {
    fetch("/api/admin/backups")
      .then((res) => res.json())
      .then((data) => {
        setBackups(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadBackups();
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    setError("");
    setMessage("");
    const res = await fetch("/api/admin/backups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label || undefined }),
    });
    setCreating(false);
    if (!res.ok) {
      setError("建立備份失敗");
      return;
    }
    setLabel("");
    setMessage("備份建立成功");
    loadBackups();
  };

  const handleRestore = async (backup: Backup) => {
    const typed = prompt(
      `確定要還原到「${new Date(backup.createdAt).toLocaleString("zh-TW")}」${backup.label ? `（${backup.label}）` : ""}這個備份嗎？\n\n這會覆蓋掉現在的單據、名單、分潤設定等業務資料（不含帳號），這個備份之後新增的資料會不見。還原前系統會自動先存一份現在的狀態當安全備份。\n\n請輸入「確認還原」繼續：`
    );
    if (typed !== "確認還原") return;

    setRestoringId(backup.id);
    setError("");
    setMessage("");
    const res = await fetch(`/api/admin/backups/${backup.id}/restore`, { method: "POST" });
    setRestoringId(null);
    if (!res.ok) {
      setError("還原失敗，資料可能還原到一半，建議立刻用下面清單最新一筆「還原前自動備份」再還原回去");
      loadBackups();
      return;
    }
    setMessage("還原完成，還原前的狀態已經自動存成一筆新備份，需要的話可以再還原回去");
    loadBackups();
  };

  const handleDelete = async (backup: Backup) => {
    if (!confirm(`確定要刪除這筆備份嗎？（${new Date(backup.createdAt).toLocaleString("zh-TW")}）刪除後無法復原`)) return;
    setDeletingId(backup.id);
    const res = await fetch(`/api/admin/backups/${backup.id}`, { method: "DELETE" });
    setDeletingId(null);
    if (!res.ok) {
      setError("刪除失敗");
      return;
    }
    loadBackups();
  };

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">資料備份</h1>
          <p className="erp-page-subtitle">
            手動備份業務資料（單據、名單、分潤設定等，不含帳號資料），需要時可以整包還原回去。只有管理員看得到
          </p>
        </div>
      </div>

      <div className="erp-card" style={{ marginBottom: 16 }}>
        <div className="erp-card-body" style={{ padding: "12px 16px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            className="erp-input"
            style={{ maxWidth: 280 }}
            placeholder="備注（選填，例如「改分潤設定前」）"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button onClick={handleCreate} disabled={creating} className="btn btn-primary">
            {creating ? "備份中..." : "＋ 建立備份"}
          </button>
        </div>
      </div>

      {message && <div className="erp-alert info" style={{ marginBottom: 16 }}>{message}</div>}
      {error && <div className="erp-alert danger" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="erp-card">
        <div className="erp-card-header"><span className="erp-card-title">備份紀錄</span></div>
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>時間</th><th>備注</th><th>建立人</th><th></th>
              </tr>
            </thead>
            <tbody>
              {!loading && backups.map((b) => (
                <tr key={b.id}>
                  <td>{new Date(b.createdAt).toLocaleString("zh-TW")}</td>
                  <td>{b.label ?? "—"}</td>
                  <td>{b.createdByName ?? "—"}</td>
                  <td style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => handleRestore(b)}
                      disabled={restoringId === b.id}
                      className="btn btn-secondary"
                      style={{ padding: "5px 10px", fontSize: 13 }}
                    >
                      {restoringId === b.id ? "還原中..." : "還原"}
                    </button>
                    <button
                      onClick={() => handleDelete(b)}
                      disabled={deletingId === b.id}
                      className="btn btn-ghost"
                      style={{ padding: "5px 10px", fontSize: 13, color: "var(--color-danger)" }}
                    >
                      刪除
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && backups.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--gray-400)" }}>還沒有任何備份</td></tr>
              )}
              {loading && (
                <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--gray-400)" }}>載入中...</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

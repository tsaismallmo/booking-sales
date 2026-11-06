"use client";

import { useEffect, useState } from "react";

type Restaurant = { id: string; name: string; active: boolean; sortOrder: number; cancelDaysBefore: number };
type Branch = { id: string; name: string; restaurantId: string; restaurantName: string; active: boolean };

// 餐廳／分店主檔：只有管理員能維護。不提供刪除，只能停用（舊單據、備份都還指著它們）；
// 改名或把分店移到別的餐廳，已經建好的單據上顯示的「餐廳｜分店」也會跟著更新。
export default function RestaurantsPage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newRestaurant, setNewRestaurant] = useState("");
  const [newBranch, setNewBranch] = useState<Record<string, string>>({});
  const [renaming, setRenaming] = useState<Record<string, string>>({});
  const [cancelDays, setCancelDays] = useState<Record<string, string>>({});

  const load = () =>
    Promise.all([
      fetch("/api/restaurants").then((res) => res.json()),
      fetch("/api/branches?all=1").then((res) => res.json()),
    ]).then(([r, b]) => {
      setRestaurants(Array.isArray(r) ? r : []);
      setBranches(Array.isArray(b) ? b : []);
      setLoading(false);
    });

  useEffect(() => {
    void load();
  }, []);

  const call = async (url: string, method: string, body: object) => {
    setError("");
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "儲存失敗");
      return false;
    }
    await load();
    return true;
  };

  const addRestaurant = async () => {
    if (!newRestaurant.trim()) return;
    if (await call("/api/restaurants", "POST", { name: newRestaurant.trim() })) setNewRestaurant("");
  };

  const addBranch = async (restaurantId: string) => {
    const name = newBranch[restaurantId]?.trim();
    if (!name) return;
    if (await call("/api/branches", "POST", { restaurantId, name })) setNewBranch((n) => ({ ...n, [restaurantId]: "" }));
  };

  const rename = async (kind: "restaurants" | "branches", id: string) => {
    const name = renaming[id]?.trim();
    if (!name) return;
    if (await call(`/api/${kind}/${id}`, "PATCH", { name })) {
      setRenaming((r) => {
        const next = { ...r };
        delete next[id];
        return next;
      });
    }
  };

  const nameInput = (kind: "restaurants" | "branches", id: string, name: string, width: number) => {
    const editing = renaming[id] !== undefined && renaming[id] !== name;
    return (
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <input
          className="erp-input"
          style={{ width, fontSize: 13 }}
          value={renaming[id] ?? name}
          onChange={(e) => setRenaming((r) => ({ ...r, [id]: e.target.value }))}
          onKeyDown={(e) => { if (e.key === "Enter") rename(kind, id); }}
        />
        {editing && <button className="btn btn-primary" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => rename(kind, id)}>改名</button>}
      </span>
    );
  };

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">餐廳／分店管理</h1>
          <p className="erp-page-subtitle">建立單據時先選餐廳再選分店。單據沒填退訂期限時，會照餐廳設定的天數自動算。不能刪除只能停用；改名或移動分店，已建立的單據會跟著更新顯示名稱</p>
        </div>
      </div>

      {error && <div className="erp-card" style={{ marginBottom: 16 }}><div className="erp-card-body" style={{ color: "var(--color-danger)", fontSize: 13 }}>{error}</div></div>}

      <div className="erp-card" style={{ marginBottom: 16 }}>
        <div className="erp-card-body" style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="erp-form-group" style={{ minWidth: 220 }}>
            <label className="erp-label">新增餐廳</label>
            <input className="erp-input" placeholder="例如：島語" value={newRestaurant} onChange={(e) => setNewRestaurant(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addRestaurant(); }} />
          </div>
          <button className="btn btn-primary" disabled={!newRestaurant.trim()} onClick={addRestaurant}>新增</button>
        </div>
      </div>

      {loading && <div style={{ color: "var(--gray-400)" }}>載入中...</div>}
      {!loading && restaurants.length === 0 && <div style={{ color: "var(--gray-400)" }}>還沒有任何餐廳</div>}

      {restaurants.map((r) => {
        const own = branches.filter((b) => b.restaurantId === r.id);
        return (
          <div key={r.id} className="erp-card" style={{ marginBottom: 16, opacity: r.active ? 1 : 0.6 }}>
            <div className="erp-card-header" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {nameInput("restaurants", r.id, r.name, 160)}
              {!r.active && <span className="badge badge-gray">已停用</span>}
              <span style={{ fontSize: 12, color: "var(--gray-500)" }}>{own.length} 間分店</span>
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                退訂期限：訂位日前
                <input
                  type="number"
                  min={0}
                  className="erp-input"
                  style={{ width: 64, fontSize: 13 }}
                  value={cancelDays[r.id] ?? String(r.cancelDaysBefore)}
                  onChange={(e) => setCancelDays((c) => ({ ...c, [r.id]: e.target.value }))}
                />
                天
                {cancelDays[r.id] !== undefined && cancelDays[r.id] !== String(r.cancelDaysBefore) && (
                  <button
                    className="btn btn-primary"
                    style={{ padding: "4px 10px", fontSize: 12 }}
                    onClick={async () => {
                      if (await call(`/api/restaurants/${r.id}`, "PATCH", { cancelDaysBefore: Number(cancelDays[r.id]) })) {
                        setCancelDays((c) => {
                          const next = { ...c };
                          delete next[r.id];
                          return next;
                        });
                      }
                    }}
                  >
                    儲存
                  </button>
                )}
              </span>
              <button className="btn btn-ghost" style={{ marginLeft: "auto", padding: "4px 10px", fontSize: 12 }} onClick={() => call(`/api/restaurants/${r.id}`, "PATCH", { active: !r.active })}>
                {r.active ? "停用餐廳" : "重新啟用"}
              </button>
            </div>
            <div className="erp-card-body">
              <div className="erp-table-wrap">
                <table className="erp-table">
                  <thead>
                    <tr><th>分店名稱</th><th>單據上顯示</th><th>所屬餐廳</th><th>狀態</th><th>操作</th></tr>
                  </thead>
                  <tbody>
                    {own.map((b) => (
                      <tr key={b.id} style={{ opacity: b.active ? 1 : 0.6 }}>
                        <td>{nameInput("branches", b.id, b.name, 140)}</td>
                        <td style={{ color: "var(--gray-500)" }}>{r.name}｜{b.name}</td>
                        <td>
                          <select className="erp-select" style={{ fontSize: 13, width: 120 }} value={b.restaurantId} onChange={(e) => {
                            const target = restaurants.find((x) => x.id === e.target.value);
                            if (target && confirm(`把「${b.name}」移到「${target.name}」？已建立的單據會一起改成「${target.name}｜${b.name}」`)) {
                              call(`/api/branches/${b.id}`, "PATCH", { restaurantId: target.id });
                            }
                          }}>
                            {restaurants.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                          </select>
                        </td>
                        <td>{b.active ? <span className="badge badge-green">啟用中</span> : <span className="badge badge-gray">已停用</span>}</td>
                        <td>
                          <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => call(`/api/branches/${b.id}`, "PATCH", { active: !b.active })}>
                            {b.active ? "停用" : "重新啟用"}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {own.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--gray-400)" }}>還沒有分店</td></tr>}
                  </tbody>
                </table>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <input
                  className="erp-input"
                  style={{ maxWidth: 220 }}
                  placeholder={`新增${r.name}的分店，例如：台中洲際`}
                  value={newBranch[r.id] ?? ""}
                  onChange={(e) => setNewBranch((n) => ({ ...n, [r.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") addBranch(r.id); }}
                />
                <button className="btn btn-secondary" disabled={!newBranch[r.id]?.trim()} onClick={() => addBranch(r.id)}>新增分店</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

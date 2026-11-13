"use client";

import { useEffect, useMemo, useState } from "react";

type RosterList = {
  id: string;
  name: string;
  ownerEmail: string | null;
  sortOrder: number;
  entryCount: number;
};

type RosterEntry = {
  groupId?: string | null; // 這個名字是在哪個集團登記的；空的＝所有集團都適用
  id: string;
  listId: string;
  name: string;
  phone: string | null;
  note: string | null;
};

type TeamMember = {
  id: string;
  email: string;
  name: string | null;
};

type LookupHit = {
  entryId: string;
  name: string;
  listId: string;
  listName: string;
};

export default function RosterPage() {
  const [canEdit, setCanEdit] = useState(false);

  const [lists, setLists] = useState<RosterList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [team, setTeam] = useState<TeamMember[]>([]);

  const [form, setForm] = useState({ name: "", phone: "", groupId: "" });
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    fetch("/api/restaurant-groups").then((res) => (res.ok ? res.json() : [])).then((g) => setGroups(Array.isArray(g) ? g : []));
  }, []);
  const groupName = (id: string | null | undefined) => groups.find((g) => g.id === id)?.name;
  // 同一支電話在不同集團登記的名字放在同一張卡片（沒電話的各自一張）
  const phoneGroups = useMemo(() => {
    const map = new Map<string, { key: string; phone: string | null; items: RosterEntry[] }>();
    for (const e of entries) {
      const digits = e.phone?.replace(/\D/g, "");
      const key = digits ? `p:${digits}` : `id:${e.id}`;
      const cur = map.get(key) ?? { key, phone: e.phone, items: [] };
      cur.items.push(e);
      map.set(key, cur);
    }
    return [...map.values()];
  }, [entries]);
  // 正在幫哪一支電話加「其他集團的名字」
  const [addingFor, setAddingFor] = useState<{ key: string; name: string; groupId: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [lookupPhone, setLookupPhone] = useState("");
  const [lookupResults, setLookupResults] = useState<LookupHit[] | null>(null);

  const loadLists = () =>
    fetch("/api/roster/lists")
      .then((res) => res.json())
      .then((data: RosterList[]) => {
        const rows = Array.isArray(data) ? data : [];
        setLists(rows);
        return rows;
      });

  useEffect(() => {
    fetch("/api/me")
      .then((res) => res.json())
      // 廠商本人、管理員（代理廠商）可以新增／改名／刪除名單和成員，後端也是這兩種角色能寫
      .then((me) => setCanEdit((me.roles ?? []).includes("vendor") || (me.roles ?? []).includes("admin")));
    fetch("/api/roster/team")
      .then((res) => res.json())
      .then((data) => setTeam(Array.isArray(data) ? data : []));
    loadLists().then((rows) => {
      if (rows.length > 0) setSelectedListId(rows[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedListId) return;
    fetch(`/api/roster?listId=${selectedListId}`)
      .then((res) => res.json())
      .then((data) => {
        setEntries(Array.isArray(data) ? data : []);
        setLoadingEntries(false);
      });
  }, [selectedListId]);

  const selectedList = useMemo(() => lists.find((l) => l.id === selectedListId) ?? null, [lists, selectedListId]);

  const handleCreateList = async () => {
    const name = window.prompt("請輸入新名單的名稱");
    if (!name) return;
    const res = await fetch("/api/roster/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) { setError("新增名單失敗"); return; }
    const row = await res.json();
    await loadLists();
    setSelectedListId(row.id);
  };

  const handleRenameList = async () => {
    if (!selectedList) return;
    const name = window.prompt("重新命名這份名單", selectedList.name);
    if (!name || name === selectedList.name) return;
    await fetch(`/api/roster/lists/${selectedList.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    loadLists();
  };

  const handleDeleteList = async () => {
    if (!selectedList) return;
    if (!window.confirm(`確定要刪除「${selectedList.name}」嗎？名單裡的成員也會一起被刪除。`)) return;
    await fetch(`/api/roster/lists/${selectedList.id}`, { method: "DELETE" });
    const rows = await loadLists();
    setSelectedListId(rows.length > 0 ? rows[0].id : null);
  };

  const handleReorder = async (direction: "up" | "down") => {
    if (!selectedList) return;
    await fetch(`/api/roster/lists/${selectedList.id}/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction }),
    });
    loadLists();
  };

  const handleOwnerEmailChange = async (email: string) => {
    if (!selectedList) return;
    await fetch(`/api/roster/lists/${selectedList.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerEmail: email }),
    });
    loadLists();
  };

  const handleLookup = async () => {
    if (!lookupPhone) { setLookupResults(null); return; }
    const res = await fetch(`/api/roster/lookup?phone=${encodeURIComponent(lookupPhone)}`);
    const data = await res.json();
    setLookupResults(Array.isArray(data) ? data : []);
  };

  const handleAdd = async () => {
    if (!selectedListId) { setError("請先選擇或建立一份名單"); return; }
    if (!form.name) { setError("請輸入姓名"); return; }
    setSaving(true);
    setError("");
    const res = await fetch("/api/roster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, listId: selectedListId }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "新增失敗");
      return;
    }
    setForm((f) => ({ name: "", phone: "", groupId: f.groupId }));
    fetch(`/api/roster?listId=${selectedListId}`)
      .then((res) => res.json())
      .then((data) => setEntries(Array.isArray(data) ? data : []));
    loadLists();
  };

  // 同一支電話加一筆「在某個集團登記的名字」（存成同一份名單裡、同電話、標了集團的另一筆成員）
  const addGroupName = async (phone: string) => {
    if (!addingFor || !selectedListId || !addingFor.name.trim() || !addingFor.groupId) return;
    setError("");
    const res = await fetch("/api/roster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listId: selectedListId, name: addingFor.name.trim(), phone, groupId: addingFor.groupId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return setError(data.error || "新增失敗");
    }
    setAddingFor(null);
    fetch(`/api/roster?listId=${selectedListId}`)
      .then((r) => r.json())
      .then((data) => setEntries(Array.isArray(data) ? data : []));
    loadLists();
  };

  const handleRemoveEntry = async (id: string) => {
    if (!window.confirm("確定要刪除這位名單成員嗎？")) return;
    await fetch(`/api/roster/${id}`, { method: "DELETE" });
    setEntries((es) => es.filter((e) => e.id !== id));
    loadLists();
  };

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">廠商名單</h1>
          <p className="erp-page-subtitle">
            {canEdit ? "自己手上用來訂位的客戶身份資料，同一間廠商的人都看得到彼此的名單" : "所屬廠商的訂位身份名單（唯讀）"}
          </p>
        </div>
      </div>

      {error && <div className="erp-alert danger">{error}</div>}

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* 左：名單選擇與管理 */}
        <div className="erp-card" style={{ width: 300, flexShrink: 0 }}>
          <div className="erp-card-body" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            {lists.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--gray-400)" }}>
                {canEdit ? "還沒有任何名單，點下面新增第一份。" : "廠商尚未建立任何名單。"}
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <select className="erp-select" style={{ flex: 1 }} value={selectedListId ?? ""} onChange={(e) => setSelectedListId(e.target.value)}>
                    {lists.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}（{l.entryCount}）</option>
                    ))}
                  </select>
                </div>
                {canEdit && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 13 }} onClick={() => handleReorder("up")}>↑</button>
                    <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 13 }} onClick={() => handleReorder("down")}>↓</button>
                    <span style={{ fontSize: 12, color: "var(--gray-400)", alignSelf: "center" }}>調整名單順序</span>
                  </div>
                )}
              </>
            )}

            {canEdit && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button className="btn btn-secondary" style={{ padding: "5px 10px", fontSize: 13 }} onClick={handleCreateList}>＋ 新名單</button>
                {selectedList && <button className="btn btn-secondary" style={{ padding: "5px 10px", fontSize: 13 }} onClick={handleRenameList}>重新命名</button>}
                {selectedList && <button className="btn btn-ghost" style={{ padding: "5px 10px", fontSize: 13, color: "var(--color-danger)" }} onClick={handleDeleteList}>刪除名單</button>}
              </div>
            )}

            {selectedList && canEdit && (
              <div className="erp-form-group">
                <label className="erp-label">帳號歸屬</label>
                <select className="erp-select" value={selectedList.ownerEmail ?? ""} onChange={(e) => handleOwnerEmailChange(e.target.value)}>
                  <option value="">未指定</option>
                  {team.map((m) => (
                    <option key={m.id} value={m.email}>{m.name || m.email}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="erp-form-group">
              <label className="erp-label">查詢電話是否存在於其他名單</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input className="erp-input" placeholder="09XXXXXXXX" value={lookupPhone} onChange={(e) => setLookupPhone(e.target.value)} />
                <button className="btn btn-secondary" style={{ padding: "5px 10px", fontSize: 13 }} onClick={handleLookup}>查詢</button>
              </div>
              {lookupResults && (
                <div style={{ marginTop: 6, fontSize: 12, color: lookupResults.length > 0 ? "var(--color-warning)" : "var(--gray-400)" }}>
                  {lookupResults.length === 0
                    ? "沒有找到，可以新增"
                    : lookupResults.map((r) => `${r.name}（${r.listName}）`).join("、")}
                </div>
              )}
            </div>

            {canEdit && selectedListId && (
              <div className="erp-form-group">
                <label className="erp-label">新增成員</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <input className="erp-input" placeholder="姓名" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  <input className="erp-input" placeholder="09XXXXXXXX" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  <select className="erp-select" value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })} title="這個名字是在哪個餐廳集團登記的">
                    <option value="">所有集團都適用</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>只用在 {g.name}</option>)}
                  </select>
                  <button onClick={handleAdd} disabled={saving} className="btn btn-primary">{saving ? "新增中..." : "新增"}</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 右：名單成員 */}
        <div className="erp-card" style={{ flex: 1, minWidth: 320 }}>
          <div className="erp-card-header">
            <span className="erp-card-title">{selectedList ? `${selectedList.name}（${entries.length} 位）` : "名單成員"}</span>
          </div>
          <div className="erp-card-body">
            {!selectedListId && <div style={{ color: "var(--gray-400)", textAlign: "center", padding: 30 }}>請先選擇或建立一份名單</div>}
            {selectedListId && loadingEntries && <div style={{ color: "var(--gray-400)", textAlign: "center", padding: 30 }}>載入中...</div>}
            {selectedListId && !loadingEntries && entries.length === 0 && (
              <div style={{ color: "var(--gray-400)", textAlign: "center", padding: 30 }}>這份名單目前是空的</div>
            )}
            {selectedListId && !loadingEntries && entries.length > 0 && (
              <div className="erp-person-grid">
                {phoneGroups.map(({ key, phone, items }) => (
                  <div key={key} className="erp-roster-card" style={{ flexDirection: "column", alignItems: "stretch" }}>
                    <div style={{ fontSize: 12, color: "var(--gray-500)" }}>{phone ?? "—"}</div>
                    {items.map((e) => (
                      <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-800)", flex: 1 }}>{e.name}</span>
                        {canEdit ? (
                          <select
                            className="erp-select"
                            style={{ fontSize: 11, padding: "1px 4px", width: "auto" }}
                            value={e.groupId ?? ""}
                            onChange={async (ev) => {
                              const groupId = ev.target.value || null;
                              await fetch(`/api/roster/${e.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groupId }) });
                              setEntries((es) => es.map((x) => (x.id === e.id ? { ...x, groupId } : x)));
                            }}
                          >
                            <option value="">所有集團</option>
                            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                        ) : (
                          <span className="badge badge-gray" style={{ fontSize: 11 }}>{groupName(e.groupId) ?? "所有集團"}</span>
                        )}
                        {canEdit && <button className="erp-roster-card-remove" onClick={() => handleRemoveEntry(e.id)}>✕</button>}
                      </div>
                    ))}
                    {canEdit && phone && (addingFor?.key === key ? (
                      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                        <input
                          className="erp-input"
                          style={{ flex: 1, minWidth: 80, fontSize: 12, padding: "3px 6px" }}
                          placeholder="在這個集團的名字"
                          value={addingFor.name}
                          onChange={(ev) => setAddingFor({ ...addingFor, name: ev.target.value })}
                          onKeyDown={(ev) => { if (ev.key === "Enter") void addGroupName(phone); }}
                        />
                        <select className="erp-select" style={{ fontSize: 11, padding: "1px 4px", width: "auto" }} value={addingFor.groupId} onChange={(ev) => setAddingFor({ ...addingFor, groupId: ev.target.value })}>
                          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                        <button className="btn btn-primary" style={{ padding: "2px 8px", fontSize: 12 }} disabled={!addingFor.name.trim() || !addingFor.groupId} onClick={() => addGroupName(phone)}>新增</button>
                        <button className="btn btn-ghost" style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => setAddingFor(null)}>取消</button>
                      </div>
                    ) : (
                      <button
                        className="btn btn-ghost"
                        style={{ padding: "2px 6px", fontSize: 12, alignSelf: "flex-start" }}
                        onClick={() => setAddingFor({ key, name: "", groupId: groups.find((g) => !items.some((e) => e.groupId === g.id))?.id ?? groups[0]?.id ?? "" })}
                      >
                        ＋ 其他集團的名字
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

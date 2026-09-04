"use client";

import { useMemo, useState } from "react";

type Tab = "calendar" | "inline" | "eztable";

const TABS: { key: Tab; label: string }[] = [
  { key: "calendar", label: "月曆" },
  { key: "inline", label: "Inline" },
  { key: "eztable", label: "EZTABLE" },
];

const PLACEHOLDER: Record<Tab, string> = {
  calendar: "月曆功能開發中",
  inline: "Inline 功能開發中",
  eztable: "EZTABLE 功能開發中",
};

export default function BookingBoardPage() {
  const [tab, setTab] = useState<Tab>("calendar");
  const [branchFilter, setBranchFilter] = useState("");
  const [mealFilter, setMealFilter] = useState("");
  const [weekdayFilter, setWeekdayFilter] = useState("");

  const branches = useMemo(() => [] as string[], []);

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">訂位看板</h1>
          <p className="erp-page-subtitle">月曆／Inline／EZTABLE 訂位額度管理</p>
        </div>
      </div>

      <div className="erp-card" style={{ marginBottom: 16 }}>
        <div className="erp-card-body" style={{ padding: "12px 16px" }}>
          <div className="erp-tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={`erp-tab${tab === t.key ? " active" : ""}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="erp-card" style={{ marginBottom: 16 }}>
        <div className="erp-card-body" style={{ padding: "12px 16px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select className="erp-select" style={{ maxWidth: 150 }} value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="">全部分店</option>
            {branches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className="erp-select" style={{ maxWidth: 120 }} value={mealFilter} onChange={(e) => setMealFilter(e.target.value)}>
            <option value="">全部餐期</option>
            <option value="午餐">午餐</option>
            <option value="下午茶">下午茶</option>
            <option value="晚餐">晚餐</option>
          </select>
          <select className="erp-select" style={{ maxWidth: 120 }} value={weekdayFilter} onChange={(e) => setWeekdayFilter(e.target.value)}>
            <option value="">全部星期</option>
            <option value="0">星期日</option>
            <option value="1">星期一</option>
            <option value="2">星期二</option>
            <option value="3">星期三</option>
            <option value="4">星期四</option>
            <option value="5">星期五</option>
            <option value="6">星期六</option>
          </select>
        </div>
      </div>

      <div className="erp-card">
        <div className="erp-card-body" style={{ padding: 40, textAlign: "center", color: "var(--gray-400)" }}>
          {PLACEHOLDER[tab]}
        </div>
      </div>
    </div>
  );
}

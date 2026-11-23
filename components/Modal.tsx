"use client";

// 共用的彈出視窗：點背景或 ✕ 關閉；手機上寬度會縮到螢幕內、內容太長可以捲
export function Modal({
  title,
  onClose,
  width = 460,
  children,
}: {
  title: React.ReactNode;
  onClose: () => void;
  width?: number;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}
      onClick={onClose}
    >
      <div
        className="erp-card"
        style={{ width, maxWidth: "100%", maxHeight: "calc(100vh - 32px)", overflowY: "auto", padding: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="erp-card-header">
          <span className="erp-card-title">{title}</span>
          <button onClick={onClose} className="btn btn-ghost">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

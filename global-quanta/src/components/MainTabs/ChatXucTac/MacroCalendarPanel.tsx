import { Calendar } from "lucide-react";
import type { MacroCalendarEvent } from "../../../types/catalyst";

// Chi hien ten su kien + so ngay con lai - KHONG hien nhan tich cuc/tieu cuc
// vi cac su kien lich (CPI/FOMC...) khong gan voi ticker/nganh cu the nen
// direction tu Engine khong co y nghia that (luon la "benefit" mac dinh).
export default function MacroCalendarPanel({ events }: { events: MacroCalendarEvent[] }) {
  if (events.length === 0) return null;

  return (
    <div style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, marginTop: 16 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", margin: "0 0 8px", display: "flex", alignItems: "center", gap: 6 }}>
        <Calendar className="w-3.5 h-3.5" /> LICH VI MO SAP TOI
      </p>
      {events.map((ev) => (
        <div key={ev.sourceId} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "6px 4px", fontSize: 11, borderBottom: "1px solid rgba(148,163,184,0.08)",
        }}>
          <span style={{ color: "var(--text-primary)" }}>{ev.title}</span>
          <span style={{ color: "var(--text-tertiary)", fontSize: 10, whiteSpace: "nowrap", marginLeft: 8 }}>
            {new Date(ev.executionDate).toLocaleDateString("vi-VN")} · con {Math.round(ev.daysRemaining)} ngay
          </span>
        </div>
      ))}
    </div>
  );
}

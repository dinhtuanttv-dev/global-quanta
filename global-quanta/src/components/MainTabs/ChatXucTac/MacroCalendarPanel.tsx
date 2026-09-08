import { Calendar, Landmark, TrendingUp, Factory } from "lucide-react";
import type { MacroCalendarEvent } from "../../../types/catalyst";

// Chi hien ten su kien + so ngay con lai - KHONG hien nhan tich cuc/tieu cuc
// vi cac su kien lich (CPI/FOMC...) khong gan voi ticker/nganh cu the nen
// direction tu Engine khong co y nghia that (luon la "benefit" mac dinh).

type EventKind = "fomc" | "cpi" | "pmi" | "other";

function classifyEvent(title: string): { kind: EventKind; icon: typeof Landmark; label: string; accent: string } {
  const t = title.toLowerCase();
  if (t.includes("fomc") || t.includes("fed")) {
    return { kind: "fomc", icon: Landmark, label: "FED - QUOC TE", accent: "#4c8dff" };
  }
  if (t.includes("cpi") || t.includes("xuat nhap khau") || t.includes("xuất nhập khẩu")) {
    return { kind: "cpi", icon: TrendingUp, label: "CPI & XNK - GSO", accent: "#fbbf24" };
  }
  if (t.includes("pmi")) {
    return { kind: "pmi", icon: Factory, label: "PMI SAN XUAT", accent: "#a78bfa" };
  }
  return { kind: "other", icon: Calendar, label: "LICH VI MO", accent: "var(--text-tertiary)" };
}

function monthLabel(iso: string): string {
  const d = new Date(iso);
  return `Thang ${d.getMonth() + 1}/${d.getFullYear()}`;
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Thanh dem nguoc: cang gan ngay hieu luc thi thanh cang day, dua tren
// cua so 60 ngay (du de bao phu tat ca su kien FOMC/CPI/PMI dang thay).
const COUNTDOWN_WINDOW_DAYS = 60;

function EventRow({ ev }: { ev: MacroCalendarEvent }) {
  const { icon: Icon, label, accent } = classifyEvent(ev.title);
  const isUrgent = ev.daysRemaining <= 7;
  const progressPct = Math.max(0, Math.min(100, 100 - (ev.daysRemaining / COUNTDOWN_WINDOW_DAYS) * 100));

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "9px 10px",
      background: isUrgent ? "rgba(251,191,36,0.06)" : "var(--bg-surface)",
      border: isUrgent ? "1px solid rgba(251,191,36,0.25)" : "1px solid transparent",
      borderRadius: 8, marginBottom: 6,
    }}>
      <div style={{
        flexShrink: 0, width: 30, height: 30, borderRadius: 7, display: "flex",
        alignItems: "center", justifyContent: "center", background: `${accent}1a`,
      }}>
        <Icon size={15} color={accent} strokeWidth={2} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 8.5, fontWeight: 700, color: accent, letterSpacing: 0.3 }}>{label}</span>
          {isUrgent && (
            <span style={{ fontSize: 8, fontWeight: 700, color: "#fbbf24", background: "rgba(251,191,36,0.15)", padding: "1px 5px", borderRadius: 4 }}>
              SAP TOI
            </span>
          )}
        </div>
        <p style={{ fontSize: 11.5, color: "var(--text-primary)", margin: 0, lineHeight: 1.3 }}>{ev.title}</p>
        <div style={{ height: 3, borderRadius: 2, background: "var(--bg-surface-2)", marginTop: 6, overflow: "hidden" }}>
          <div style={{ width: `${progressPct}%`, height: "100%", background: accent, borderRadius: 2, opacity: 0.6 }} />
        </div>
      </div>

      <div style={{ flexShrink: 0, textAlign: "right" }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: isUrgent ? "#fbbf24" : "var(--text-secondary)" }}>
          {ev.daysRemaining <= 0 ? "Hom nay" : `${Math.round(ev.daysRemaining)} ngay`}
        </div>
        <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 1 }}>
          {new Date(ev.executionDate).toLocaleDateString("vi-VN")}
        </div>
      </div>
    </div>
  );
}

export default function MacroCalendarPanel({ events }: { events: MacroCalendarEvent[] }) {
  if (events.length === 0) return null;

  const sorted = [...events].sort((a, b) => a.daysRemaining - b.daysRemaining);
  const groups = new Map<string, MacroCalendarEvent[]>();
  sorted.forEach((ev) => {
    const key = monthKey(ev.executionDate);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ev);
  });

  return (
    <div style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, marginTop: 16 }}>
      <p style={{
        fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", margin: "0 0 10px",
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <Calendar size={13} /> LICH VI MO SAP TOI
        <span style={{ fontWeight: 400, color: "var(--text-tertiary)", fontSize: 9.5, marginLeft: "auto" }}>
          {events.length} su kien
        </span>
      </p>

      {Array.from(groups.entries()).map(([key, monthEvents]) => (
        <div key={key} style={{ marginBottom: 10 }}>
          <p style={{ fontSize: 9.5, fontWeight: 700, color: "var(--text-tertiary)", margin: "0 0 6px", textTransform: "uppercase" }}>
            {monthLabel(monthEvents[0].executionDate)}
          </p>
          {monthEvents.map((ev) => <EventRow key={ev.sourceId} ev={ev} />)}
        </div>
      ))}
    </div>
  );
}

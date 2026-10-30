import { AlertTriangle, Calendar, Factory, Landmark, Repeat, Scale, TrendingUp } from "lucide-react";
import type { MacroCalendarEvent } from "../../../types/catalyst";
import { mergeMacroCalendar, useMacroCatalystEvents, type UnifiedCalendarEvent } from "../../../hooks/useMacroCatalystEvents";

// Lịch vĩ mô HỢP NHẤT (X3): lịch công bố số liệu VN (ước tính) + FOMC (chính thức) + cảnh báo / chuyển chế độ vĩ mô
// (chỉ khi Trung tâm vĩ mô có số liệu thật) từ Gateway, cộng sự kiện chính sách có ngày hiệu lực của engine xúc tác.
// KHÔNG hiện nhãn tích cực/tiêu cực cho lịch công bố: hướng chỉ biết sau khi có số liệu.

interface KindStyle {
  icon: typeof Landmark;
  label: string;
  accent: string;
}

function styleOf(ev: UnifiedCalendarEvent): KindStyle {
  if (ev.kind === "fomc") return { icon: Landmark, label: "FED · QUỐC TẾ", accent: "#4c8dff" };
  if (ev.kind === "alert") return { icon: AlertTriangle, label: "CẢNH BÁO VĨ MÔ", accent: "var(--warning, #f59e0b)" };
  if (ev.kind === "regime") return { icon: Repeat, label: "CHẾ ĐỘ VĨ MÔ", accent: "var(--negative, #f87171)" };
  if (ev.kind === "policy") return { icon: Scale, label: "CHÍNH SÁCH", accent: "var(--text-tertiary)" };
  const t = ev.title.toLowerCase();
  if (t.includes("pmi")) return { icon: Factory, label: "PMI SẢN XUẤT", accent: "#a78bfa" };
  if (t.includes("nhnn")) return { icon: Landmark, label: "NHNN · TIỀN TỆ", accent: "#34d399" };
  return { icon: TrendingUp, label: "GSO · SỐ LIỆU THÁNG", accent: "#fbbf24" };
}

const monthLabel = (iso: string) => {
  const d = new Date(iso);
  return `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`;
};
const monthKey = (iso: string) => iso.slice(0, 7);

// Thanh đếm ngược trên cửa sổ 60 ngày.
const COUNTDOWN_WINDOW_DAYS = 60;

function EventRow({ ev }: { ev: UnifiedCalendarEvent }) {
  const { icon: Icon, label, accent } = styleOf(ev);
  const isUrgent = ev.daysRemaining <= 7;
  const progressPct = Math.max(0, Math.min(100, 100 - (ev.daysRemaining / COUNTDOWN_WINDOW_DAYS) * 100));

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "9px 10px",
      background: isUrgent ? "color-mix(in srgb, var(--warning, #f59e0b) 6%, transparent)" : "var(--bg-surface)",
      border: isUrgent ? "1px solid color-mix(in srgb, var(--warning, #f59e0b) 25%, transparent)" : "1px solid transparent",
      borderRadius: 8, marginBottom: 6,
    }}>
      <div style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", background: `color-mix(in srgb, ${accent} 12%, transparent)` }}>
        <Icon size={15} color={accent} strokeWidth={2} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
          <span style={{ fontSize: 8.5, fontWeight: 700, color: accent, letterSpacing: 0.3 }}>{label}</span>
          {isUrgent && ev.daysRemaining > 0 && (
            <span style={{ fontSize: 8, fontWeight: 700, color: "var(--warning, #f59e0b)", background: "color-mix(in srgb, var(--warning, #f59e0b) 15%, transparent)", padding: "1px 5px", borderRadius: 4 }}>
              SẮP TỚI
            </span>
          )}
          {ev.estimated && (
            <span title="Ngày ước tính từ độ trễ và ngày công bố điển hình — đối chiếu lịch chính thức" style={{ fontSize: 8, color: "var(--text-tertiary)", border: "1px solid var(--border)", padding: "0 4px", borderRadius: 4 }}>
              ước tính
            </span>
          )}
        </div>
        <p style={{ fontSize: 11.5, color: "var(--text-primary)", margin: 0, lineHeight: 1.3 }}>{ev.title}</p>
        <div style={{ height: 3, borderRadius: 2, background: "var(--bg-surface-2)", marginTop: 6, overflow: "hidden" }}>
          <div style={{ width: `${progressPct}%`, height: "100%", background: accent, borderRadius: 2, opacity: 0.6 }} />
        </div>
      </div>

      <div style={{ flexShrink: 0, textAlign: "right" }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: isUrgent ? "var(--warning, #f59e0b)" : "var(--text-secondary)" }}>
          {ev.daysRemaining <= 0 ? "Hôm nay" : `${Math.round(ev.daysRemaining)} ngày`}
        </div>
        <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 1 }}>
          {new Date(ev.date).toLocaleDateString("vi-VN")}
        </div>
      </div>
    </div>
  );
}

export default function MacroCalendarPanel({ events }: { events: MacroCalendarEvent[] }) {
  const { data, error } = useMacroCatalystEvents(60);
  const merged = mergeMacroCalendar(events, data?.events ?? null);
  if (merged.length === 0) return null;

  const groups = new Map<string, UnifiedCalendarEvent[]>();
  merged.forEach((ev) => {
    const key = monthKey(ev.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ev);
  });

  return (
    <div style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, marginTop: 16 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
        <Calendar size={13} /> LỊCH VĨ MÔ SẮP TỚI
        <span style={{ fontWeight: 400, color: "var(--text-tertiary)", fontSize: 9.5, marginLeft: "auto" }}>{merged.length} sự kiện</span>
      </p>
      {error && (
        <p style={{ fontSize: 9.5, color: "var(--text-tertiary)", margin: "0 0 8px" }}>
          Không tải được lịch từ Trung tâm vĩ mô — đang hiện lịch dự phòng của engine xúc tác.
        </p>
      )}

      {Array.from(groups.entries()).map(([key, monthEvents]) => (
        <div key={key} style={{ marginBottom: 10 }}>
          <p style={{ fontSize: 9.5, fontWeight: 700, color: "var(--text-tertiary)", margin: "0 0 6px", textTransform: "uppercase" }}>
            {monthLabel(monthEvents[0].date)}
          </p>
          {monthEvents.map((ev) => <EventRow key={ev.id} ev={ev} />)}
        </div>
      ))}
      {data?.caveat && <p style={{ fontSize: 9, color: "var(--text-tertiary)", margin: "4px 0 0", lineHeight: 1.4 }}>{data.caveat}</p>}
    </div>
  );
}

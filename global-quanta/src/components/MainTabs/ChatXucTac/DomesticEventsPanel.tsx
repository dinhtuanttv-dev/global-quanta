import type { DomesticEvent } from "../../../types/catalyst";

const TAG_LABEL: Record<string, string> = {
  NANG_HANG_THI_TRUONG: "NANG HANG THI TRUONG",
  KY_REVIEW_CHI_SO: "KY REVIEW CHI SO",
  ROOM_NGOAI: "ROOM NGOAI",
  IPO_NIEM_YET: "IPO / NIEM YET",
  CHINH_SACH: "CHINH SACH",
};

function EventCard({ event }: { event: DomesticEvent }) {
  const totalStages = event.stages.length;
  const progressPct = ((event.activeStageIndex + 1) / totalStages) * 100;

  return (
    <div style={{
      background: "linear-gradient(135deg, var(--bg-surface-2), var(--bg-surface))",
      border: "1px solid var(--border)", borderRadius: 10, padding: 14, marginBottom: 10,
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: 3, height: "100%", background: "var(--gold-bright)" }} />

      <span style={{
        fontSize: 9.5, fontWeight: 700, color: "var(--gold-bright)", background: "rgba(251,191,36,0.1)",
        padding: "3px 8px", borderRadius: 5, display: "inline-block", marginBottom: 6,
      }}>{TAG_LABEL[event.tag] ?? event.tag}</span>

      <p style={{ fontSize: 13.5, fontWeight: 700, margin: "0 0 12px", lineHeight: 1.4 }}>{event.title}</p>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: "var(--text-tertiary)", marginBottom: 6 }}>
        {event.stages.map((s, i) => (
          <span key={i} style={{
            color: i === event.activeStageIndex ? "var(--gold-bright)" : "var(--text-tertiary)",
            fontWeight: i === event.activeStageIndex ? 700 : 400,
            maxWidth: 90, textAlign: i === 0 ? "left" : i === event.stages.length - 1 ? "right" : "center",
          }}>{s.label}</span>
        ))}
      </div>
      <div style={{ height: 5, borderRadius: 3, background: "var(--bg-surface)", position: "relative", marginBottom: 10 }}>
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 3, width: `${progressPct}%`,
          background: "linear-gradient(90deg, #d97706, #fbbf24)",
        }} />
      </div>

      <div style={{
        display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
        paddingTop: 10, borderTop: "1px solid var(--border)",
      }}>
        <span style={{ fontSize: 10.5, color: "var(--text-secondary)" }}>{event.note}</span>
        <span style={{
          marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "var(--gold-bright)",
          background: "rgba(251,191,36,0.08)", padding: "4px 10px", borderRadius: 6, whiteSpace: "nowrap",
        }}>
          {event.isPast ? "Da co hieu luc" : `Con ${event.daysUntil} ngay`}
        </span>
      </div>

      <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer" style={{
        fontSize: 9, color: "var(--text-tertiary)", display: "block", marginTop: 6, textDecoration: "underline",
      }}>Nguon: {event.sourceName}</a>
    </div>
  );
}

export default function DomesticEventsPanel({ events }: { events: DomesticEvent[] }) {
  if (events.length === 0) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", margin: "0 0 8px" }}>SU KIEN CO CAU THI TRUONG TRONG NUOC</p>
      {events.map((ev) => <EventCard key={ev.id} event={ev} />)}
    </div>
  );
}

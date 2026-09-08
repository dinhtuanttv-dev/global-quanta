import { useVn30ReviewWatch } from "../../../hooks/useVn30ReviewWatch";

function formatDate(iso: string | null): string {
  if (!iso) return "Chua ro";
  const d = new Date(iso);
  return d.toLocaleDateString("vi-VN");
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const target = new Date(iso + "T00:00:00Z");
  return Math.round((target.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// Chi render neu finding.found === true VA co sourceUrl that - day la lop
// phong ve thu 2 o tang UI (lop 1 da co trong watcher.ts), khong bao gio
// hien thi du lieu khong co nguon xac thuc.
export default function Vn30ReviewWatchPanel() {
  const { finding } = useVn30ReviewWatch();

  if (!finding || !finding.found || !finding.sourceUrl) return null;

  const days = daysUntil(finding.effectiveDate);

  return (
    <div style={{
      background: "linear-gradient(135deg, var(--bg-surface-2), var(--bg-surface))",
      border: "1px solid var(--border)", borderRadius: 10, padding: 14, marginTop: 10,
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: 3, height: "100%", background: "#4c8dff" }} />

      <span style={{
        fontSize: 9.5, fontWeight: 700, color: "#4c8dff", background: "rgba(76,141,255,0.1)",
        padding: "3px 8px", borderRadius: 5, display: "inline-block", marginBottom: 6,
      }}>KY REVIEW CHI SO - MOI PHAT HIEN</span>

      <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 8px" }}>
        HOSE da cong bo ky ra soat danh muc VN30 tiep theo
      </p>

      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8 }}>
        <div>Ngay cong bo: <b style={{ color: "var(--text-primary)" }}>{formatDate(finding.announcementDate)}</b></div>
        <div>Ngay hieu luc: <b style={{ color: "var(--text-primary)" }}>{formatDate(finding.effectiveDate)}</b></div>
      </div>

      {days !== null && (
        <span style={{
          fontSize: 11, fontWeight: 700, color: "#4c8dff", background: "rgba(76,141,255,0.08)",
          padding: "4px 10px", borderRadius: 6, display: "inline-block", marginBottom: 8,
        }}>
          {days >= 0 ? `Con ${days} ngay den khi hieu luc` : "Da co hieu luc"}
        </span>
      )}

      <a href={finding.sourceUrl} target="_blank" rel="noopener noreferrer" style={{
        fontSize: 9, color: "var(--text-tertiary)", display: "block", textDecoration: "underline",
      }}>Nguon: {finding.sourceName ?? finding.sourceUrl}</a>

      <p style={{ fontSize: 8.5, color: "var(--text-tertiary)", marginTop: 6 }}>
        Phat hien tu dong boi AI (Gemini + Google Search) - kiem tra lai nguon truoc khi ra quyet dinh.
      </p>
    </div>
  );
}

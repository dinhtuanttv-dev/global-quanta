import { useMarketAnnouncementWatch } from "../../../hooks/useMarketAnnouncementWatch";
import type { MarketAnnouncementFinding } from "../../../types/catalyst";

const KIND_LABEL: Record<MarketAnnouncementFinding["kind"], { title: string; accent: string }> = {
  vn30: { title: "KY REVIEW VN30 - MOI PHAT HIEN", accent: "#4c8dff" },
  msci: { title: "MSCI NANG HANG - MOI PHAT HIEN", accent: "#22c55e" },
  sbv: { title: "SBV THAY DOI LAI SUAT - MOI PHAT HIEN", accent: "#fbbf24" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "Chua ro";
  return new Date(iso).toLocaleDateString("vi-VN");
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.round((new Date(iso + "T00:00:00Z").getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function FindingCard({ finding }: { finding: MarketAnnouncementFinding }) {
  const { title, accent } = KIND_LABEL[finding.kind];
  const days = daysUntil(finding.effectiveDate);

  return (
    <div style={{
      background: "linear-gradient(135deg, var(--bg-surface-2), var(--bg-surface))",
      border: "1px solid var(--border)", borderRadius: 10, padding: 14, marginBottom: 10,
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: 3, height: "100%", background: accent }} />

      <span style={{
        fontSize: 9.5, fontWeight: 700, color: accent, background: `${accent}1a`,
        padding: "3px 8px", borderRadius: 5, display: "inline-block", marginBottom: 8,
      }}>{title}</span>

      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8 }}>
        <div>Ngay cong bo: <b style={{ color: "var(--text-primary)" }}>{formatDate(finding.announcementDate)}</b></div>
        <div>Ngay hieu luc: <b style={{ color: "var(--text-primary)" }}>{formatDate(finding.effectiveDate)}</b></div>
      </div>

      {days !== null && (
        <span style={{
          fontSize: 11, fontWeight: 700, color: accent, background: `${accent}14`,
          padding: "4px 10px", borderRadius: 6, display: "inline-block", marginBottom: 8,
        }}>
          {days >= 0 ? `Con ${days} ngay den khi hieu luc` : "Da co hieu luc"}
        </span>
      )}

      {finding.sourceUrl && (
        <a href={finding.sourceUrl} target="_blank" rel="noopener noreferrer" style={{
          fontSize: 9, color: "var(--text-tertiary)", display: "block", textDecoration: "underline",
        }}>Nguon: {finding.sourceName ?? finding.sourceUrl}</a>
      )}

      <p style={{ fontSize: 8.5, color: "var(--text-tertiary)", marginTop: 6 }}>
        Phat hien tu dong boi AI (Gemini + Google Search) - kiem tra lai nguon truoc khi ra quyet dinh.
      </p>
    </div>
  );
}

// Chi render khi CO it nhat 1 finding da xac thuc nguon that - khong bao gio
// hien du lieu chua co nguon (da loc o tang backend + o day lan nua).
export default function MarketAnnouncementWatchPanel() {
  const { findings } = useMarketAnnouncementWatch();
  const validFindings = findings.filter((f) => f.found && f.sourceUrl);

  if (validFindings.length === 0) return null;

  return (
    <div style={{ marginTop: 10 }}>
      {validFindings.map((f) => <FindingCard key={f.kind} finding={f} />)}
    </div>
  );
}

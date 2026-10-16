import { useMarketAnnouncementWatch } from "../../../hooks/useMarketAnnouncementWatch";
import type { MarketAnnouncementFinding } from "../../../types/catalyst";
import { isTrustedUrl } from "../../../lib/urlSafety";

const KIND_LABEL: Record<MarketAnnouncementFinding["kind"], { title: string; accent: string }> = {
  vn30: { title: "KỲ REVIEW VN30 · MỚI PHÁT HIỆN", accent: "#4c8dff" },
  msci: { title: "MSCI NÂNG HẠNG · MỚI PHÁT HIỆN", accent: "#22c55e" },
  sbv: { title: "NHNN THAY ĐỔI LÃI SUẤT · MỚI PHÁT HIỆN", accent: "#fbbf24" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "Chưa rõ";
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
        <div>Ngày công bố: <b style={{ color: "var(--text-primary)" }}>{formatDate(finding.announcementDate)}</b></div>
        <div>Ngày hiệu lực: <b style={{ color: "var(--text-primary)" }}>{formatDate(finding.effectiveDate)}</b></div>
      </div>

      {days !== null && (
        <span style={{
          fontSize: 11, fontWeight: 700, color: accent, background: `${accent}14`,
          padding: "4px 10px", borderRadius: 6, display: "inline-block", marginBottom: 8,
        }}>
          {days >= 0 ? `Còn ${days} ngày đến khi hiệu lực` : "Đã có hiệu lực"}
        </span>
      )}

      {finding.sourceUrl && isTrustedUrl(finding.sourceUrl) && (
        <a href={finding.sourceUrl} target="_blank" rel="noopener noreferrer" style={{
          fontSize: 9, color: "var(--text-tertiary)", display: "block", textDecoration: "underline",
        }}>Nguon: {finding.sourceName ?? finding.sourceUrl}</a>
      )}
      {finding.sourceUrl && !isTrustedUrl(finding.sourceUrl) && (
        <span style={{ fontSize: 9, color: "var(--text-tertiary)", display: "block" }}>
          Nguồn: {finding.sourceName ?? "chưa xác thực"} (URL chưa xác thực — đã ẩn liên kết)
        </span>
      )}

      <p style={{ fontSize: 8.5, color: "var(--text-tertiary)", marginTop: 6 }}>
        Phát hiện tự động bởi AI (Gemini + Google Search) — kiểm tra lại nguồn trước khi ra quyết định.
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

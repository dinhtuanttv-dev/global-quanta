// TOPBAR — nhãn trạng thái dữ liệu (spec §8.4): luôn có CHỮ, không chỉ màu; title nêu nguồn, thời điểm và lý do.
import type { DataMeta, DataStatus } from "../../hooks/useTopbar";

export const STATUS_TEXT: Record<DataStatus, { text: string; glyph: string; cls: string }> = {
  live: { text: "LIVE", glyph: "●", cls: "st-live" },
  delayed: { text: "CHẬM", glyph: "◐", cls: "st-warn" },
  stale: { text: "CŨ", glyph: "○", cls: "st-warn" },
  fallback: { text: "DỰ PHÒNG", glyph: "◇", cls: "st-warn" },
  simulated: { text: "MÔ PHỎNG", glyph: "◇", cls: "st-sim" },
  loading: { text: "…", glyph: "", cls: "st-muted" },
  empty: { text: "—", glyph: "", cls: "st-muted" },
  error: { text: "LỖI", glyph: "✕", cls: "st-bad" },
  closed: { text: "NGOÀI PHIÊN", glyph: "◌", cls: "st-muted" },
};

const fmtTime = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : null;
};

/** Mô tả đầy đủ (title / aria): trạng thái · nguồn · thời điểm dữ liệu · lý do. */
export function describeMeta(m: DataMeta): string {
  const s = STATUS_TEXT[m.status];
  return [s.text === "—" ? "Chưa có dữ liệu" : s.text, m.source ? `Nguồn: ${m.source}` : null, fmtTime(m.asOf) ? `Số liệu lúc ${fmtTime(m.asOf)}` : null, m.reason].filter(Boolean).join(" · ");
}

export default function StatusTag({ meta, compact = false }: { meta: DataMeta; compact?: boolean }) {
  const s = STATUS_TEXT[meta.status];
  return (
    <span className={`tb-status ${s.cls}`} title={describeMeta(meta)} aria-label={describeMeta(meta)} data-status={meta.status}>
      {s.glyph && <span aria-hidden>{s.glyph}</span>}{compact && meta.status === "live" ? "" : ` ${s.text}`}
    </span>
  );
}

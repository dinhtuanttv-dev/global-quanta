import type { ForensicScoreResult } from "../../../types/financialEngineering";

interface Props { forensic: ForensicScoreResult; }

function zoneLabel(zone: ForensicScoreResult["altmanZone"]) {
  return { safe: "An toàn", grey: "Vùng xám", distress: "Nguy cơ" }[zone];
}
function zoneColor(zone: ForensicScoreResult["altmanZone"]) {
  return { safe: "var(--positive)", grey: "var(--text-secondary)", distress: "var(--negative)" }[zone];
}
function fLabel(flag: ForensicScoreResult["piotroskiFlag"]) {
  return { strong: "Mạnh", moderate: "Trung bình", weak: "Yếu" }[flag];
}
function fColor(flag: ForensicScoreResult["piotroskiFlag"]) {
  return { strong: "var(--positive)", moderate: "var(--text-secondary)", weak: "var(--negative)" }[flag];
}
function beneishLabel(flag: ForensicScoreResult["beneishFlag"]) {
  return { likely_manipulator: "Cần rà soát thêm", unlikely: "Bình thường", insufficient_data: "Thiếu dữ liệu" }[flag];
}

// A.1 (Phase 1) - hien gon 3 chi so forensic + co canh bao aspect-conflict.
export default function ForensicScoreBadge({ forensic }: Props) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
      {forensic.fundamentalSentimentConflict && (
        <div style={{
          fontSize: 10.5, fontWeight: 700, color: "#fbbf24", background: "rgba(251,191,36,0.1)",
          border: "1px solid rgba(251,191,36,0.3)", borderRadius: 6, padding: "5px 8px", marginBottom: 8,
        }}>
          ⚠ Tin tích cực nhưng nền tảng tài chính suy yếu
        </div>
      )}
      <Row label="Altman Z''" value={`${forensic.altmanZScore.toFixed(2)} · ${zoneLabel(forensic.altmanZone)}`} color={zoneColor(forensic.altmanZone)} />
      <Row label="Piotroski F" value={`${forensic.piotroskiFScore}/9 · ${fLabel(forensic.piotroskiFlag)}`} color={fColor(forensic.piotroskiFlag)} />
      <Row
        label="Beneish M"
        value={`${Number.isNaN(forensic.beneishMScore) ? "—" : forensic.beneishMScore.toFixed(2)} · ${beneishLabel(forensic.beneishFlag)}`}
        color={forensic.beneishFlag === "likely_manipulator" ? "var(--negative)" : "var(--positive)"}
      />
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", fontSize: 11 }}>
      <span style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <span style={{ fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

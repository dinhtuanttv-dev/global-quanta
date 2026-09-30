import type { ForensicScoreResult } from "../../../types/financialEngineering";

interface Props { forensic: ForensicScoreResult; }

function zoneLabel(zone: ForensicScoreResult["altmanZone"]) {
  return { safe: "An toan", grey: "Vung xam", distress: "Nguy co" }[zone];
}
function zoneColor(zone: ForensicScoreResult["altmanZone"]) {
  return { safe: "var(--positive)", grey: "var(--text-secondary)", distress: "var(--negative)" }[zone];
}
function fLabel(flag: ForensicScoreResult["piotroskiFlag"]) {
  return { strong: "Manh", moderate: "Trung binh", weak: "Yeu" }[flag];
}
function fColor(flag: ForensicScoreResult["piotroskiFlag"]) {
  return { strong: "var(--positive)", moderate: "var(--text-secondary)", weak: "var(--negative)" }[flag];
}
function beneishLabel(flag: ForensicScoreResult["beneishFlag"]) {
  return { likely_manipulator: "Can ra soat them", unlikely: "Binh thuong", insufficient_data: "Thieu du lieu" }[flag];
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
          ⚠ Tin tich cuc nhung nen tang tai chinh suy yeu
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

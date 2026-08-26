import type { RRGPoint } from "../../../hooks/useSectorRRG";
import type { ConfluenceStock } from "../../../hooks/useTop20Radar";

interface Props {
  rrgPoints: RRGPoint[];
  top20: ConfluenceStock[];
  totalAnalyzed: number;
  selectedSectorKey: string | null;
  onSelectSector: (key: string) => void;
  onSelectTicker: (ticker: string) => void;
}

const QUADRANT_LABEL: Record<string, string> = {
  Leading: "Dan dat", Improving: "Cai thien", Weakening: "Suy yeu", Lagging: "Tut hau",
};

export default function LocNganhPanel({
  rrgPoints, top20, totalAnalyzed, selectedSectorKey, onSelectSector, onSelectTicker,
}: Props) {
  const quadrants = ["Leading", "Improving", "Lagging", "Weakening"];

  return (
    <div className="panel-block">
      <div className="sb-row" style={{ marginBottom: 12 }}>
        <b style={{ color: "var(--gold)" }}>Ma Tran Vong Doi Nganh & RRG</b>
        <span style={{ color: "var(--text-tertiary)", fontSize: 11, marginLeft: 8 }}>
          HARD_DATA - tinh tu gia thuc, so voi VN-Index
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        {quadrants.map((q) => {
          const stocksInQuadrant = rrgPoints.filter((p) => p.quadrant === q);
          return (
            <div key={q} className="panel-block" style={{ padding: 10, minHeight: 100 }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, color: "var(--text-secondary)" }}>
                {QUADRANT_LABEL[q]} ({stocksInQuadrant.length})
              </div>
              {stocksInQuadrant.map((s) => (
                <div
                  key={s.sectorKey}
                  className="sb-row"
                  onClick={() => onSelectSector(s.sectorKey)}
                  style={{
                    cursor: "pointer", padding: "4px 8px", borderRadius: 6, marginBottom: 4,
                    background: selectedSectorKey === s.sectorKey ? "var(--bg-surface-2)" : "transparent",
                    border: selectedSectorKey === s.sectorKey ? "1px solid var(--gold)" : "1px solid transparent",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{s.sectorLabel}</span>
                  <span style={{ fontSize: 10, color: "var(--text-tertiary)", marginLeft: 6 }}>
                    RS {s.rsRatio} - Mom {s.rsMomentum}
                  </span>
                </div>
              ))}
              {stocksInQuadrant.length === 0 && (
                <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Khong co nganh nao</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="sb-row" style={{ marginBottom: 8 }}>
        <b style={{ color: "var(--gold)" }}>Radar Top 20 Hoi Tu Dong Tien</b>
        <span style={{ color: "var(--text-tertiary)", fontSize: 11, marginLeft: 8 }}>
          Da phan tich: {totalAnalyzed} ma
          {selectedSectorKey && ` - Loc theo: ${selectedSectorKey}`}
        </span>
      </div>

      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: "var(--text-tertiary)", fontSize: 10, textTransform: "uppercase" }}>
            <th style={{ textAlign: "left", padding: "4px 0" }}>Ma</th>
            <th style={{ textAlign: "left" }}>Nganh</th>
            <th style={{ textAlign: "center" }}>RRG</th>
            <th style={{ textAlign: "center" }}>RS</th>
            <th style={{ textAlign: "center" }}>Vol</th>
            <th style={{ textAlign: "right" }}>Confluence</th>
          </tr>
        </thead>
        <tbody>
          {top20.length === 0 && (
            <tr><td colSpan={6} style={{ textAlign: "center", padding: 16, color: "var(--text-tertiary)" }}>Chua co ma nao dat tieu chuan.</td></tr>
          )}
          {top20.map((s, i) => (
            <tr
              key={i}
              onClick={() => onSelectTicker(s.ticker)}
              style={{ cursor: "pointer", borderTop: "1px solid var(--bg-surface-2)" }}
            >
              <td style={{ padding: "6px 0", fontWeight: 700, color: "var(--gold)" }}>{s.ticker}</td>
              <td style={{ color: "var(--text-secondary)", fontSize: 11 }}>{s.sectorKey}</td>
              <td style={{ textAlign: "center", fontSize: 11 }}>{s.rrgScore}</td>
              <td style={{ textAlign: "center", fontSize: 11 }}>{s.rsScore}</td>
              <td style={{ textAlign: "center", fontSize: 11 }}>{s.volumeScore}</td>
              <td style={{ textAlign: "right" }}>
                <span style={{
                  fontWeight: 700, fontSize: 11, padding: "2px 8px", borderRadius: 10,
                  color: s.confluenceScore >= 70 ? "var(--positive)" : "var(--gold)",
                  background: s.confluenceScore >= 70 ? "rgba(52,211,153,0.1)" : "rgba(245,158,11,0.1)",
                }}>{s.confluenceScore}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
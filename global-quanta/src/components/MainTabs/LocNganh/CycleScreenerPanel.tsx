type Quadrant = "Leading" | "Improving" | "Weakening" | "Lagging";

interface Props {
  selectedQuadrant: Quadrant | null;
  onSelectQuadrant: (q: Quadrant | null) => void;
  minRsScore: number;
  onChangeMinRs: (v: number) => void;
  minVolumeScore: number;
  onChangeMinVolume: (v: number) => void;
  onReset: () => void;
}

const QUADRANTS: Quadrant[] = ["Leading", "Improving", "Weakening", "Lagging"];

export default function CycleScreenerPanel({
  selectedQuadrant, onSelectQuadrant, minRsScore, onChangeMinRs,
  minVolumeScore, onChangeMinVolume, onReset,
}: Props) {
  return (
    <div className="panel-block" style={{ marginBottom: 16 }}>
      <div className="sb-row" style={{ marginBottom: 10 }}>
        <b style={{ color: "var(--gold)" }}>Bo Loc Da Tang Chu Ky</b>
      </div>

      <div style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 10, color: "var(--text-tertiary)", display: "block", marginBottom: 4 }}>Trang thai RRG</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {QUADRANTS.map((q) => (
            <button
              key={q}
              onClick={() => onSelectQuadrant(selectedQuadrant === q ? null : q)}
              style={{
                fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 8, cursor: "pointer",
                background: selectedQuadrant === q ? "var(--gold)" : "var(--bg-surface-2)",
                color: selectedQuadrant === q ? "#0a0a0a" : "var(--text-secondary)",
                border: "1px solid " + (selectedQuadrant === q ? "var(--gold)" : "transparent"),
              }}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 8 }}>
        <div>
          <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>RS Score toi thieu: {minRsScore}</span>
          <input type="range" min={0} max={100} value={minRsScore}
            onChange={(e) => onChangeMinRs(Number(e.target.value))}
            style={{ width: "100%", accentColor: "var(--gold)" }} />
        </div>
        <div>
          <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Volume Score toi thieu: {minVolumeScore}</span>
          <input type="range" min={0} max={100} value={minVolumeScore}
            onChange={(e) => onChangeMinVolume(Number(e.target.value))}
            style={{ width: "100%", accentColor: "var(--gold)" }} />
        </div>
      </div>

      <button onClick={onReset} style={{ fontSize: 10, color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer" }}>
        Xoa toan bo bo loc
      </button>
    </div>
  );
}
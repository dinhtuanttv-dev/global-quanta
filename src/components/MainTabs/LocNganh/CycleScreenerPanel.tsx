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
    <div
      className="panel-block"
      style={{
        marginBottom: 16,
        padding: "14px 16px",
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
      }}
    >
      <div
        style={{
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <b style={{ color: "var(--gold)", fontSize: 13 }}>
          ⚙ Bo Loc Da Tang Chu Ky
        </b>
        <span style={{ fontSize: 9.5, color: "var(--text-tertiary)" }}>
          Lọc theo trạng thái RRG + điểm RS/Volume
        </span>
      </div>

      <div style={{ marginBottom: 14 }}>
        <span
          style={{
            fontSize: 10,
            color: "var(--text-tertiary)",
            display: "block",
            marginBottom: 6,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Trạng thái RRG
        </span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {QUADRANTS.map((q) => {
            const active = selectedQuadrant === q;
            return (
              <button
                key={q}
                onClick={() => onSelectQuadrant(active ? null : q)}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "6px 12px",
                  borderRadius: 8,
                  cursor: "pointer",
                  background: active ? "var(--gold)" : "var(--bg-surface-2)",
                  color: active ? "#0a0a0a" : "var(--text-secondary)",
                  border: "1px solid " + (active ? "var(--gold)" : "var(--border)"),
                  transition: "all 0.15s",
                }}
              >
                {q}
              </button>
            );
          })}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
          marginBottom: 10,
        }}
      >
        <div>
          <span
            style={{
              fontSize: 10,
              color: "var(--text-tertiary)",
              display: "block",
              marginBottom: 4,
            }}
          >
            RS Score tối thiểu: <b style={{ color: "var(--gold-bright)" }}>{minRsScore}</b>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={minRsScore}
            onChange={(e) => onChangeMinRs(Number(e.target.value))}
            style={{ width: "100%", accentColor: "var(--gold)" }}
          />
        </div>
        <div>
          <span
            style={{
              fontSize: 10,
              color: "var(--text-tertiary)",
              display: "block",
              marginBottom: 4,
            }}
          >
            Volume Score tối thiểu:{" "}
            <b style={{ color: "var(--gold-bright)" }}>{minVolumeScore}</b>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={minVolumeScore}
            onChange={(e) => onChangeMinVolume(Number(e.target.value))}
            style={{ width: "100%", accentColor: "var(--gold)" }}
          />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 8,
          borderTop: "1px solid var(--border)",
        }}
      >
        <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
          Đang lọc: {selectedQuadrant ?? "Tất cả"} · RS≥{minRsScore} · Vol≥{minVolumeScore}
        </span>
        <button
          onClick={onReset}
          style={{
            fontSize: 10,
            color: "var(--gold)",
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "4px 10px",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          ↺ Xóa toàn bộ bộ lọc
        </button>
      </div>
    </div>
  );
}
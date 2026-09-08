import type { HeatmapCell } from "../../../hooks/useCatalystHeatmap";

const GROUPS: HeatmapCell["group"][] = ["Truc tiep", "Lan toa"];

// Mau theo cuong do that (khong bia nguong) - scale tuyen tinh theo max tuyet doi
// trong toan bo du lieu hien co, khong dung nguong co dinh tuy y.
function cellColor(avgImpact: number, maxAbs: number): { bg: string; text: string } {
  if (maxAbs === 0 || avgImpact === 0) return { bg: "rgba(100,116,139,0.08)", text: "var(--text-tertiary)" };
  const intensity = Math.min(Math.abs(avgImpact) / maxAbs, 1);
  const alpha = 0.1 + intensity * 0.55;
  if (avgImpact > 0) return { bg: `rgba(52,211,153,${alpha})`, text: "var(--positive)" };
  return { bg: `rgba(248,113,113,${alpha})`, text: "var(--negative)" };
}

export default function CatalystHeatmap({ cells }: { cells: HeatmapCell[] }) {
  if (cells.length === 0) return null;

  const sectors = Array.from(new Set(cells.map((c) => c.sector)));
  const maxAbs = Math.max(...cells.map((c) => Math.abs(c.avgImpact)), 0.0001);

  return (
    <div style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, marginTop: 16 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", margin: "0 0 10px" }}>
        BAN DO NHIET: NGANH x LOAI TAC DONG
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 420 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", fontSize: 10, color: "var(--text-tertiary)", padding: "4px 8px" }}>Nganh</th>
              {GROUPS.map((g) => (
                <th key={g} style={{ fontSize: 10, color: "var(--text-tertiary)", padding: "4px 8px", textAlign: "center" }}>{g}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sectors.map((sector) => (
              <tr key={sector}>
                <td style={{ fontSize: 11, fontWeight: 600, padding: "6px 8px", whiteSpace: "nowrap" }}>{sector}</td>
                {GROUPS.map((g) => {
                  const cell = cells.find((c) => c.sector === sector && c.group === g);
                  if (!cell) return <td key={g} />;
                  const { bg, text } = cellColor(cell.avgImpact, maxAbs);
                  return (
                    <td key={g} style={{ padding: 4 }}>
                      <div style={{
                        background: bg, color: text, borderRadius: 6, padding: "8px 10px",
                        textAlign: "center", fontSize: 11, fontWeight: 700, minWidth: 80,
                      }}>
                        {cell.cardCount === 0 ? "-" : `${(cell.avgImpact * 100).toFixed(1)}%`}
                        {cell.cardCount > 0 && (
                          <div style={{ fontSize: 8.5, fontWeight: 400, opacity: 0.7, marginTop: 2 }}>{cell.cardCount} tin</div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 8 }}>
        Mau dam = tac dong manh hon (xanh: tich cuc, do: tieu cuc). So la trung binh netSignedImpact cac tin trong o.
      </p>
    </div>
  );
}

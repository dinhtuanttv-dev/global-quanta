import type { CSSProperties } from "react";
import type { ConfluenceStock } from "../../../hooks/useTop20Radar";
import type { SectorTimingSignal } from "../../../lib/locnganh/types";
import { SectorScreenerCells } from "./timing/SectorScreenerCells";

interface Props {
  top20: ConfluenceStock[];
  totalAnalyzed: number;
  riskOnScore: number | null; // mới (2026-09-11)
  /** Ngành ICB đang lọc (mã + tên) — chọn từ bảng Xoay vòng ngành. */
  selectedSector: { code: string; name: string } | null;
  onClearSector: () => void;
  onSelectTicker: (ticker: string) => void;
  /** L4: tín hiệu thời điểm của NGÀNH ICB chứa mã (engine xoay vòng ngành) — có thì thêm 4 cột. */
  timingOf?: (ticker: string) => SectorTimingSignal | null;
}

const QUADRANT_LABEL: Record<string, string> = {
  Leading: "Dẫn dắt", Improving: "Cải thiện", Weakening: "Suy yếu", Lagging: "Tụt hậu",
};

// Nguong khop DUNG voi backend (lib/scoring/weighted-macro-score.ts) - de
// nhan dinh hien thi luon dong bo voi cach he thong da phan loai.
function riskOnLabel(score: number): { text: string; explain: string; color: string } {
  if (score >= 65) return { text: "RISK-ON", explain: "Ưu tiên dòng tiền (Volume/PVT/A-D)", color: "var(--positive)" };
  if (score <= 35) return { text: "RISK-OFF", explain: "Ưu tiên độ bền xu hướng (RRG/RS)", color: "var(--negative)" };
  return { text: "TRUNG LẬP", explain: "Trọng số cân bằng giữa các yếu tố", color: "var(--gold)" };
}

// Mau nen cho o diem 0-100 (dung chung cho PVT/A-D/Confluence) - xanh khi
// manh, do khi yeu, khong mau khi trung lap (50 - thieu du lieu lich su).
function scoreCellStyle(score: number): CSSProperties {
  if (score >= 65) return { color: "var(--positive)" };
  if (score <= 35) return { color: "var(--negative)" };
  return { color: "var(--text-secondary)" };
}

export default function LocNganhPanel({
  top20, totalAnalyzed, riskOnScore, selectedSector, onClearSector, onSelectTicker, timingOf,
}: Props) {
  const riskInfo = riskOnScore !== null ? riskOnLabel(riskOnScore) : null;

  return (
    <div className="panel-block">
      <div className="sb-row" style={{ marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <b style={{ color: "var(--gold)" }}>Radar Top 20 hội tụ dòng tiền</b>
        <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
          Đã phân tích: {totalAnalyzed} mã
          {selectedSector && <> · Lọc theo ngành: <b style={{ color: "var(--gold)" }}>{selectedSector.name}</b>{" "}
            <button type="button" onClick={onClearSector} data-testid="top20-clear-sector" style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 11 }}>✕ bỏ lọc</button></>}
        </span>
        {/* MOI: giai thich TAI SAO trong so hien tai lai nhu vay - minh
            bach hoa, khong de nguoi dung thay diem doi ma khong hieu ly do */}
        {riskInfo && (
          <span
            title="Trọng số RRG/RS/Volume/PVT/A-D thay đổi theo chỉ số này"
            style={{
              marginLeft: "auto", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
              color: riskInfo.color, background: "rgba(148,163,184,0.08)",
            }}
          >
            Risk-On {riskOnScore}/100 · {riskInfo.text} · {riskInfo.explain}
          </span>
        )}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", minWidth: timingOf ? 980 : 640 }}>
          <thead>
            <tr style={{ color: "var(--text-tertiary)", fontSize: 10, textTransform: "uppercase" }}>
              <th style={{ textAlign: "left", padding: "4px 0" }}>Mã</th>
              <th style={{ textAlign: "left" }}>Ngành</th>
              <th style={{ textAlign: "center" }}>RRG</th>
              <th style={{ textAlign: "center" }}>RS</th>
              <th style={{ textAlign: "center" }}>Vol</th>
              <th style={{ textAlign: "center" }} title="Price-Volume Trend — dòng tiền có trọng số, phát hiện tích lũy/rút ròng bền vững qua nhiều phiên">PVT</th>
              <th style={{ textAlign: "center" }} title="Accumulation/Distribution Line — áp lực mua/bán thực qua vị trí đóng cửa, phát hiện tích lũy/phân phối ngầm kể cả khi giá đi ngang">A/D</th>
              <th style={{ textAlign: "right" }}>Confluence</th>
              {timingOf && <>
                <th style={{ textAlign: "left", paddingLeft: 10 }} title="Cửa sổ tối ưu của NGÀNH ICB chứa mã (phiên sau khi ngành vào Cải thiện)">Cửa sổ ngành</th>
                <th style={{ textAlign: "left" }}>Kỳ vọng ròng</th>
                <th style={{ textAlign: "left" }}>Tin cậy</th>
                <th style={{ textAlign: "left" }}>P(outperform)</th>
              </>}
            </tr>
          </thead>
          <tbody>
            {top20.length === 0 && (
              <tr><td colSpan={timingOf ? 12 : 8} style={{ textAlign: "center", padding: 16, color: "var(--text-tertiary)" }}>Chưa có mã nào đạt tiêu chuẩn.</td></tr>
            )}
            {top20.map((s, i) => (
              <tr
                key={i}
                onClick={() => onSelectTicker(s.ticker)}
                style={{ cursor: "pointer", borderTop: "1px solid var(--bg-surface-2)" }}
              >
                <td style={{ padding: "6px 0", fontWeight: 700, color: "var(--gold)" }}>{s.ticker}</td>
                <td style={{ color: "var(--text-secondary)", fontSize: 11 }} title={s.icbCode ? `ICB ${s.icbCode}` : undefined}>{s.icbName ?? s.sectorKey}</td>
                <td style={{ textAlign: "center", fontSize: 11 }} title={`Góc RRG của ngành: ${QUADRANT_LABEL[s.sectorQuadrant] ?? s.sectorQuadrant}`}>{s.rrgScore}</td>
                <td style={{ textAlign: "center", fontSize: 11 }}>{s.rsScore}</td>
                <td style={{ textAlign: "center", fontSize: 11 }}>{s.volumeScore}</td>
                <td style={{ textAlign: "center", fontSize: 11, ...scoreCellStyle(s.pvtScoreNormalized) }}>{s.pvtScoreNormalized}</td>
                <td style={{ textAlign: "center", fontSize: 11, ...scoreCellStyle(s.adScoreNormalized) }}>{s.adScoreNormalized}</td>
                <td style={{ textAlign: "right" }}>
                  <span style={{
                    fontWeight: 700, fontSize: 11, padding: "2px 8px", borderRadius: 10,
                    color: s.confluenceScore >= 70 ? "var(--positive)" : "var(--gold)",
                    background: s.confluenceScore >= 70 ? "rgba(52,211,153,0.1)" : "rgba(245,158,11,0.1)",
                  }}>{s.confluenceScore}</span>
                </td>
                {timingOf && (() => { const sig = timingOf(s.ticker); return sig ? <SectorScreenerCells signal={sig} /> : <td colSpan={4} style={{ fontSize: 11, color: "var(--text-tertiary)", paddingLeft: 10 }}>—</td>; })()}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

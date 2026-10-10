import { Fragment, useState, type CSSProperties } from "react";
import type { ConfluenceStock } from "../../../hooks/useTop20Radar";
import type { SectorTimingSignal } from "../../../lib/locnganh/types";
import { SectorScreenerCells } from "./timing/SectorScreenerCells";

interface Props {
  top20: ConfluenceStock[];
  totalAnalyzed: number;
  riskOnScore: number | null; // mới (2026-09-11)
  /** T0: nguồn dữ liệu & nhãn bằng chứng từ backend. */
  dataSource?: { provider: string; priceBasis: string; dataAsOf: string | null; universe: number; liquid: number; fallbackReason?: string };
  evidence?: { label: string; reason: string };
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

const fmt = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? "—" : x.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }));
const fmtDate = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

/** T0: thẻ chi tiết một mã — giá trị thô, điểm chuẩn hoá, trọng số và đóng góp vào điểm hội tụ (bấm mã mở thẻ, không mở biểu đồ). */
function Top20Detail({ s, onClose }: { s: ConfluenceStock; onClose: () => void }) {
  const w = s.weightsUsed;
  const parts = [
    { k: "Góc RRG ngành", raw: `${QUADRANT_LABEL[s.sectorQuadrant] ?? s.sectorQuadrant}${s.icbName ? ` · ${s.icbName}` : ""}`, score: s.rrgScore, w: w.rrg },
    { k: "RS 3 tháng so VN-Index", raw: s.rs3m == null ? "—" : `${s.rs3m > 0 ? "+" : ""}${fmt(s.rs3m)} điểm %`, score: s.rsScore, w: w.rs },
    { k: "Dòng tiền GTGD 20/250 (so thị trường)", raw: s.volumeSpikeRatio == null ? "—" : `${fmt(s.volumeSpikeRatio, 2)}×`, score: s.volumeScore, w: w.volume },
    { k: "PVT 20 phiên", raw: s.pvtScore == null ? "—" : `${s.pvtScore}`, score: s.pvtScoreNormalized, w: w.pvt },
    { k: "A/D 20 phiên", raw: s.adScore == null ? "—" : `${s.adScore}`, score: s.adScoreNormalized, w: w.ad },
  ];
  return (
    <tr data-testid="top20-detail"><td colSpan={12} style={{ padding: 0 }}>
      <div style={{ border: "1px solid var(--gold)", borderRadius: 8, padding: "10px 12px", margin: "6px 0" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
          <b style={{ color: "var(--gold)", fontSize: 14 }}>{s.ticker}</b>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Điểm hội tụ {s.confluenceScore} = Σ điểm thành phần × trọng số</span>
          <button type="button" onClick={onClose} aria-label="Đóng" style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer" }}>✕</button>
        </div>
        <table style={{ width: "100%", fontSize: 11.5, borderCollapse: "collapse", marginTop: 6 }}>
          <thead><tr style={{ color: "var(--text-tertiary)", fontSize: 10, textTransform: "uppercase" }}>
            <th style={{ textAlign: "left" }}>Thành phần</th><th style={{ textAlign: "left" }}>Giá trị</th><th style={{ textAlign: "right" }}>Điểm 0–100</th><th style={{ textAlign: "right" }}>Trọng số</th><th style={{ textAlign: "right" }}>Đóng góp</th>
          </tr></thead>
          <tbody>{parts.map((p) => (
            <tr key={p.k} style={{ borderTop: "1px solid var(--bg-surface-2)" }}>
              <td style={{ padding: "4px 0" }}>{p.k}</td><td>{p.raw}</td><td style={{ textAlign: "right", ...scoreCellStyle(p.score) }}>{p.score}</td>
              <td style={{ textAlign: "right" }}>{Math.round(p.w * 100)}%</td><td style={{ textAlign: "right" }}>{fmt(p.score * p.w)}</td>
            </tr>
          ))}</tbody>
        </table>
        <p style={{ fontSize: 10.5, color: "var(--text-tertiary)", margin: "6px 0 0" }}>
          Điểm hội tụ chưa qua kiểm định ngoài mẫu — dùng để sàng lọc / quan sát, không phải khuyến nghị.
        </p>
      </div>
    </td></tr>
  );
}

export default function LocNganhPanel({
  top20, totalAnalyzed, riskOnScore, selectedSector, onClearSector, onSelectTicker, timingOf, dataSource, evidence,
}: Props) {
  const riskInfo = riskOnScore !== null ? riskOnLabel(riskOnScore) : null;
  const [open, setOpen] = useState<string | null>(null);

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

      {evidence && (
        <p data-testid="top20-evidence" style={{ fontSize: 11, lineHeight: 1.5, color: "var(--warning, #f59e0b)", margin: "0 0 6px" }}>
          <b style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(245,158,11,0.14)", marginRight: 6 }}>{evidence.label}</b>{evidence.reason}
        </p>
      )}
      {dataSource && (
        <p data-testid="top20-source" style={{ fontSize: 10.5, color: "var(--text-tertiary)", margin: "0 0 8px" }}>
          {dataSource.provider === "GATEWAY_TOP20_INPUTS"
            ? `Nguồn: Gateway · giá điều chỉnh cộng dồn · dữ liệu tới ${fmtDate(dataSource.dataAsOf)} · ${dataSource.liquid}/${dataSource.universe} mã đủ thanh khoản (GTGD TB60 ≥ 5 tỷ)`
            : `Nguồn dự phòng: Yahoo (Gateway lỗi: ${dataSource.fallbackReason ?? "không rõ"}) — số liệu kém tin cậy`}
        </p>
      )}
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
            {top20.map((s, i) => (<Fragment key={s.ticker}>
              <tr
                data-testid="top20-row"
                onClick={() => { onSelectTicker(s.ticker); setOpen(open === s.ticker ? null : s.ticker); }}
                aria-expanded={open === s.ticker}
                style={{ cursor: "pointer", borderTop: "1px solid var(--bg-surface-2)", background: open === s.ticker ? "var(--bg-surface-2)" : undefined }}
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
              {open === s.ticker && <Top20Detail s={s} onClose={() => setOpen(null)} />}
            </Fragment>))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

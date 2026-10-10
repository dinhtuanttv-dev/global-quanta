// Lọc ngành (L4) — Xoay vòng ngành ICB: RRG Clock (vệt đuôi 12 tuần, độ đậm theo P(outperform)) + bảng toàn bộ ngành với 4 cột
// thời điểm của engine (Cửa sổ tối ưu · Kỳ vọng ròng · Tin cậy · P(outperform)) và quyết định; bấm ngành (dòng hoặc chấm trên
// đồng hồ) -> bảng phụ phân tích chuyên sâu. Nguồn: Gateway sector-rrg/L1 + Project A locnganh-timing/L2 (EXPERIMENTAL).
import { useMemo, useState } from "react";
import { useSectorRrg } from "../../../../hooks/useSectorRotation";
import { useSectorTimingSignals } from "../../../../hooks/useSectorTimingSignals";
import type { Quadrant, SectorTimingSignalV2 } from "../../../../lib/locnganh/types";
import { RRGClockTimeline, type SectorRRGHistory } from "./RRGClockTimeline";
import { SectorScreenerCells } from "./SectorScreenerCells";
import { SectorDeepPanel } from "./SectorDeepPanel";
import { QUADRANT_VI } from "./quadrant";

const QUADRANT_COLOR: Record<Quadrant, string> = { LEADING: "var(--positive)", IMPROVING: "var(--gold)", WEAKENING: "var(--warning)", LAGGING: "var(--text-tertiary)" };
/** Tên ngành rút gọn cho nhãn trên đồng hồ (≤ 2 từ đầu, bỏ phần sau "&"). */
const shortName = (n: string) => { const h = n.split(/\s*[&,]\s*/)[0]; const w = h.split(" "); return w.length > 2 ? w.slice(0, 2).join(" ") : h; };
const LEVEL_VI = { FAVORABLE: "Thuận lợi", WATCH: "Quan sát", AVOID: "Chưa nên" } as const;
const LEVEL_RANK = { FAVORABLE: 0, WATCH: 1, AVOID: 2 } as const;
const ACTION_VI: Record<string, string> = { NO_DATE: "Chưa từng vào Cải thiện", NO_SIGNAL: "Chưa đủ bằng chứng", TOO_EARLY: "Chưa tới vùng mua", IN_WINDOW: "Trong vùng mua", WINDOW_PASSED: "Qua vùng mua", POST_EX: "Hết chu kỳ" };

export default function SectorRotationPanel() {
  const rrg = useSectorRrg();
  const timing = useSectorTimingSignals();
  const [level, setLevel] = useState<2 | 3>(2);
  const [open, setOpen] = useState<string | null>(null);
  const bySector = timing.bySector as ReadonlyMap<string, SectorTimingSignalV2>;
  const sectors = useMemo(() => (rrg.data?.sectors ?? []).filter((s) => s.level === level), [rrg.data, level]);
  const clock = useMemo<SectorRRGHistory[]>(() => sectors.map((s) => ({
    sectorKey: s.code, sectorLabel: s.name, shortLabel: shortName(s.name),
    points: s.tail.map((p) => ({ sectorKey: s.code, sectorLabel: s.name, rsRatio: p.ratio, rsMomentum: p.momentum, quadrant: p.quadrant, asOf: p.date })),
    reactionProbabilityMean: bySector.get(s.code)?.reactionProbability?.mean ?? null,
    isFreshlyInTarget: s.quadrant === "IMPROVING" && (s.weeksSinceImproving ?? 99) <= 2,
  })), [sectors, bySector]);
  const rows = useMemo(() => [...sectors].sort((a, b) => {
    const sa = bySector.get(a.code), sb = bySector.get(b.code);
    return (LEVEL_RANK[sa?.decision.level ?? "AVOID"] - LEVEL_RANK[sb?.decision.level ?? "AVOID"])
      || ((sb?.reactionProbability?.ci[0] ?? -1) - (sa?.reactionProbability?.ci[0] ?? -1))
      || (b.latestClosed.ratio - a.latestClosed.ratio);
  }), [sectors, bySector]);
  const toggle = (code: string) => setOpen((c) => (c === code ? null : code));
  const data = timing.data as (typeof timing.data & { market?: { riskOnScore: number | null; macroRegime: string }; evidence?: { label: string; reason: string } }) | null;

  return (
    <div className="panel-block" style={{ marginBottom: 16 }} data-testid="sector-rotation-panel">
      <div className="sb-row" style={{ marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
        <b style={{ color: "var(--gold)" }}>Xoay vòng ngành ICB · RRG tuần (JdK)</b>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "rgba(245,158,11,0.12)", color: "var(--gold)" }} title={data?.evidence?.reason}>{data?.evidence?.label ?? "EXPERIMENTAL"}</span>
        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          {([2, 3] as const).map((l) => (
            <button key={l} type="button" onClick={() => { setLevel(l); setOpen(null); }} aria-pressed={level === l} data-testid={`sector-level-${l}`}
              style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 8, cursor: "pointer", border: "none", background: level === l ? "var(--gold)" : "var(--bg-surface-2)", color: level === l ? "#0a0a0a" : "var(--text-secondary)" }}>
              ICB cấp {l}
            </button>
          ))}
        </div>
      </div>
      <p style={{ fontSize: 10, color: "var(--text-tertiary)", margin: "0 0 10px" }}>
        {rrg.data ? <>Gateway · phiên {rrg.data.dataAsOf} · tuần đã đóng {rrg.data.closedThrough} · {rrg.data.coverage.l2Covered}/{rrg.data.coverage.l2Total} ngành cấp 2{rrg.data.coverage.missing.length ? ` (thiếu: ${rrg.data.coverage.missing.map((m) => m.name).join(", ")})` : ""}</> : "Đang tải RRG ngành…"}
        {data?.market && <> · Risk-On {data.market.riskOnScore ?? "—"} ({data.market.macroRegime})</>}
        {" "}· Chỉ số ngành = rổ mã ICB, trọng số GTGD; RRG chuẩn hoá z (1 đơn vị = 1σ), lọc nhiễu 0,15σ.
      </p>
      {rrg.error && <div className="t1-state-msg t1-error">Không tải được RRG ngành: {rrg.error.message}</div>}
      {timing.status === "error" && <div className="t1-state-msg t1-error">Không tải được tín hiệu thời điểm ngành: {timing.error?.message}</div>}
      {sectors.length > 0 && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ maxWidth: 520, width: "100%", margin: "0 auto" }}>
            <RRGClockTimeline sectors={clock} tailLength={12} onSelectSector={toggle} />
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", minWidth: 620 }} data-testid="sector-table">
              <thead>
                <tr style={{ color: "var(--text-tertiary)", fontSize: 10, textTransform: "uppercase" }}>
                  <th style={{ textAlign: "left", padding: "4px 0" }}>Ngành</th>
                  <th style={{ textAlign: "left" }}>Góc RRG</th>
                  <th style={{ textAlign: "right" }} title="Số phiên giao dịch kể từ tuần chuyển vào Cải thiện gần nhất">Phiên</th>
                  <th style={{ textAlign: "left" }}>Cửa sổ tối ưu</th>
                  <th style={{ textAlign: "left" }}>Kỳ vọng ròng</th>
                  <th style={{ textAlign: "left" }}>Tin cậy</th>
                  <th style={{ textAlign: "left" }}>P(outperform)</th>
                  <th style={{ textAlign: "right" }}>Quyết định</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const sig = bySector.get(s.code);
                  return (
                    <tr key={s.code} onClick={() => toggle(s.code)} data-testid="sector-row" aria-expanded={open === s.code}
                      style={{ cursor: "pointer", borderTop: "1px solid var(--bg-surface-2)", background: open === s.code ? "var(--bg-surface-2)" : undefined }}>
                      <td style={{ padding: "6px 0" }}>
                        <b style={{ color: "var(--gold)" }}>{s.name}</b>
                        <span style={{ display: "block", fontSize: 9, color: "var(--text-tertiary)" }}>{s.code} · {s.indexMembers} mã{s.thin ? " · rổ mỏng" : ""}</span>
                      </td>
                      <td style={{ color: QUADRANT_COLOR[s.quadrant], fontWeight: 600, fontSize: 11 }}>
                        {QUADRANT_VI[s.quadrant]}
                        <span style={{ display: "block", fontSize: 9, color: "var(--text-tertiary)", fontWeight: 400 }}>{s.latestClosed.ratio.toFixed(1).replace(".", ",")} / {s.latestClosed.momentum.toFixed(1).replace(".", ",")}</span>
                      </td>
                      <td style={{ textAlign: "right", fontSize: 11 }}>{sig?.tdSinceTransition ?? "—"}</td>
                      {sig ? <SectorScreenerCells signal={sig} /> : <td colSpan={4} style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{timing.status === "loading" ? "Đang tính…" : "—"}</td>}
                      <td style={{ textAlign: "right" }}>
                        {sig && <span title={`${ACTION_VI[sig.action] ?? sig.action} · ${sig.decision.headline}`} data-testid="sector-decision" style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
                          color: sig.decision.level === "FAVORABLE" ? "var(--positive)" : sig.decision.level === "WATCH" ? "var(--warning)" : "var(--text-tertiary)",
                          background: "rgba(148,163,184,0.08)" }}>{LEVEL_VI[sig.decision.level]}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {open && <SectorDeepPanel code={open} sector={sectors.find((s) => s.code === open)} onClose={() => setOpen(null)} />}
    </div>
  );
}

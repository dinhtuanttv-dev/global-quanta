// Lọc ngành (L4–L5) — Xoay vòng ngành ICB: bản đồ dòng tiền dịch chuyển giữa các ngành (4 tuần), tích lũy / phân phối âm thầm,
// RRG Clock (vệt 12 tuần), bảng toàn bộ ngành: Trạng thái (Tăng trưởng / Tích lũy / Tích lũy đáy / Phân phối / Suy thoái), Giai đoạn,
// Dòng tiền (thị phần GTGD, CMF), Góc RRG, 4 cột thời điểm của engine, Quyết định; bấm ngành -> bảng phụ phân tích chuyên sâu.
// Nguồn: Gateway sector-rrg/L5 + Project A locnganh-timing/L2. EXPERIMENTAL (kiểm định L3 không đạt).
import { useMemo, useState } from "react";
import { useSectorRrg } from "../../../../hooks/useSectorRotation";
import { useSectorTimingSignals } from "../../../../hooks/useSectorTimingSignals";
import type { GatewaySectorRrg, Quadrant, SectorRotation, SectorStateKey, SectorTimingSignalV2 } from "../../../../lib/locnganh/types";
import { RRGClockTimeline, type SectorRRGHistory } from "./RRGClockTimeline";
import { SectorScreenerCells } from "./SectorScreenerCells";
import { SectorDeepPanel } from "./SectorDeepPanel";
import { QUADRANT_VI } from "./quadrant";

const QUADRANT_COLOR: Record<Quadrant, string> = { LEADING: "var(--positive)", IMPROVING: "var(--gold)", WEAKENING: "var(--warning)", LAGGING: "var(--text-tertiary)" };
export const STATE_COLOR: Record<SectorStateKey, string> = { GROWTH: "var(--positive)", ACCUMULATION: "var(--gold)", BOTTOMING: "#38bdf8", DISTRIBUTION: "var(--warning)", DECLINE: "var(--negative)", NEUTRAL: "var(--text-tertiary)" };
const STATE_RANK: Record<SectorStateKey, number> = { GROWTH: 0, ACCUMULATION: 1, BOTTOMING: 2, NEUTRAL: 3, DISTRIBUTION: 4, DECLINE: 5 };
const FLOW_VI = { INFLOW: "Tiền vào mạnh", RISING: "Tiền vào", FALLING: "Tiền ra", OUTFLOW: "Tiền ra mạnh" } as const;
/** Tên ngành rút gọn cho nhãn trên đồng hồ (≤ 2 từ đầu, bỏ phần sau "&"). */
const shortName = (n: string) => { const h = n.split(/\s*[&,]\s*/)[0]; const w = h.split(" "); return w.length > 2 ? w.slice(0, 2).join(" ") : h; };
const LEVEL_VI = { FAVORABLE: "Thuận lợi", WATCH: "Quan sát", AVOID: "Chưa nên" } as const;
const LEVEL_RANK = { FAVORABLE: 0, WATCH: 1, AVOID: 2 } as const;
const ACTION_VI: Record<string, string> = { NO_DATE: "Chưa từng vào Cải thiện", NO_SIGNAL: "Chưa đủ bằng chứng", TOO_EARLY: "Chưa tới vùng mua", IN_WINDOW: "Trong vùng mua", WINDOW_PASSED: "Qua vùng mua", POST_EX: "Hết chu kỳ" };
const num = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d).replace(".", ","));
const signed = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${num(v, d)}`);

function Chip({ color, children, title, testId }: { color: string; children: React.ReactNode; title?: string; testId?: string }) {
  return <span title={title} data-testid={testId} style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, color, background: "rgba(148,163,184,0.08)", whiteSpace: "nowrap" }}>{children}</span>;
}

/** Bản đồ dòng tiền: ngành nhận / mất thị phần GTGD và các luồng dịch chuyển ước lượng lớn nhất. */
function FlowMap({ sectors, rotation }: { sectors: GatewaySectorRrg[]; rotation: SectorRotation | undefined }) {
  const acc = sectors.filter((s) => s.flow?.money.stealthAccumulation || s.state?.key === "BOTTOMING" || s.state?.key === "ACCUMULATION");
  const dist = sectors.filter((s) => s.flow?.money.stealthDistribution || s.state?.key === "DISTRIBUTION");
  return (
    <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", marginBottom: 12 }} data-testid="sector-flow-map">
      <div className="panel-block" style={{ padding: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>Dòng tiền dịch chuyển · {rotation?.weeks ?? 4} tuần</div>
        {rotation?.transfers.length ? (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 12 }} data-testid="sector-transfers">
            {rotation.transfers.slice(0, 6).map((t) => (
              <li key={`${t.from}-${t.to}`} style={{ display: "flex", gap: 6, alignItems: "baseline", padding: "2px 0" }}>
                <span style={{ color: "var(--negative)" }}>{t.fromName}</span><span style={{ color: "var(--text-tertiary)" }}>→</span>
                <span style={{ color: "var(--positive)", fontWeight: 600 }}>{t.toName}</span>
                <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-secondary)" }}>{num(t.pp, 2)} đ%</span>
              </li>
            ))}
          </ul>
        ) : <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Chưa đủ lịch sử thị phần.</span>}
        <p style={{ fontSize: 9, color: "var(--text-tertiary)", margin: "6px 0 0" }} title={rotation?.note}>Điểm % thị phần GTGD (TB 20 phiên) — ước lượng phân bổ, không phải dòng tiền khớp lệnh thực.</p>
      </div>
      <div className="panel-block" style={{ padding: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>Thị phần GTGD thay đổi (TB20 so TB60)</div>
        <div style={{ display: "grid", gap: 3 }} data-testid="sector-share-bars">
          {[...sectors].filter((s) => s.flow).sort((a, b) => (b.flow!.share.changePct ?? 0) - (a.flow!.share.changePct ?? 0)).slice(0, 8).map((s) => {
            const v = s.flow!.share.changePct, w = Math.min(100, Math.abs(v) * 1.5);
            return (
              <div key={s.code} style={{ display: "grid", gridTemplateColumns: "110px 1fr 46px", gap: 6, alignItems: "center", fontSize: 11 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                <span style={{ height: 6, borderRadius: 3, background: "var(--bg-surface-2)", position: "relative" }}><span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${w}%`, borderRadius: 3, background: v >= 0 ? "var(--positive)" : "var(--negative)" }} /></span>
                <span style={{ textAlign: "right", color: v >= 0 ? "var(--positive)" : "var(--negative)" }}>{signed(v)}%</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="panel-block" style={{ padding: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>Tích lũy · phân phối âm thầm</div>
        <div style={{ fontSize: 11, marginBottom: 6 }} data-testid="sector-accumulating">
          <span style={{ color: "var(--text-tertiary)" }}>Tích lũy: </span>
          {acc.length ? acc.map((s) => <span key={s.code} style={{ marginRight: 6, color: STATE_COLOR[s.state?.key ?? "ACCUMULATION"], fontWeight: 600 }}>{s.name}{s.flow?.money.stealthAccumulation ? " (âm thầm)" : ""}</span>) : "—"}
        </div>
        <div style={{ fontSize: 11 }} data-testid="sector-distributing">
          <span style={{ color: "var(--text-tertiary)" }}>Phân phối: </span>
          {dist.length ? dist.map((s) => <span key={s.code} style={{ marginRight: 6, color: "var(--warning)", fontWeight: 600 }}>{s.name}{s.flow?.money.stealthDistribution ? " (âm thầm)" : ""}</span>) : "—"}
        </div>
        <p style={{ fontSize: 9, color: "var(--text-tertiary)", margin: "6px 0 0" }}>Tích lũy âm thầm = giá chỉ số ngành đi ngang, biến động co lại, CMF-20 &gt; 0, GTGD phiên tăng &gt; giảm, thị phần GTGD tăng.</p>
      </div>
    </div>
  );
}

export default function SectorRotationPanel({ selectedSector = null, onFilterSector }: { selectedSector?: string | null; onFilterSector?: (code: string) => void } = {}) {
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
      || (STATE_RANK[a.state?.key ?? "NEUTRAL"] - STATE_RANK[b.state?.key ?? "NEUTRAL"])
      || ((b.flow?.share.changePct ?? 0) - (a.flow?.share.changePct ?? 0));
  }), [sectors, bySector]);
  const toggle = (code: string) => setOpen((c) => (c === code ? null : code));
  const data = timing.data as (typeof timing.data & { market?: { riskOnScore: number | null; macroRegime: string }; evidence?: { label: string; reason: string } }) | null;
  const evidence = rrg.data?.evidence ?? data?.evidence;

  return (
    <div className="panel-block" style={{ marginBottom: 16 }} data-testid="sector-rotation-panel">
      <div className="sb-row" style={{ marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
        <b style={{ color: "var(--gold)" }}>Xoay vòng ngành ICB · dòng tiền · RRG tuần (JdK)</b>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "rgba(245,158,11,0.12)", color: "var(--gold)" }} title={evidence?.reason}>{evidence?.label ?? "EXPERIMENTAL"}</span>
        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          {([2, 3] as const).map((l) => (
            <button key={l} type="button" onClick={() => { setLevel(l); setOpen(null); }} aria-pressed={level === l} data-testid={`sector-level-${l}`}
              style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 8, cursor: "pointer", border: "none", background: level === l ? "var(--gold)" : "var(--bg-surface-2)", color: level === l ? "#0a0a0a" : "var(--text-secondary)" }}>
              ICB cấp {l}
            </button>
          ))}
        </div>
      </div>
      <p style={{ fontSize: 10, color: "var(--text-tertiary)", margin: "0 0 4px" }}>
        {rrg.data ? <>Gateway · phiên {rrg.data.dataAsOf} · tuần đã đóng {rrg.data.closedThrough} · {rrg.data.coverage.l2Covered}/{rrg.data.coverage.l2Total} ngành cấp 2{rrg.data.coverage.missing.length ? ` (thiếu: ${rrg.data.coverage.missing.map((m) => m.name).join(", ")})` : ""}</> : "Đang tải dữ liệu ngành…"}
        {data?.market && <> · Risk-On {data.market.riskOnScore ?? "—"} ({data.market.macroRegime})</>}
        {" "}· Chỉ số ngành = rổ mã ICB, trọng số GTGD; RRG chuẩn hoá z (1 đơn vị = 1σ), lọc nhiễu 0,15σ.
      </p>
      {evidence && <p style={{ fontSize: 10, color: "var(--warning)", margin: "0 0 10px" }} data-testid="sector-evidence">Kiểm định đặt trước L3: {evidence.reason}</p>}
      {rrg.error && <div className="t1-state-msg t1-error">Không tải được dữ liệu ngành: {rrg.error.message}</div>}
      {timing.status === "error" && <div className="t1-state-msg t1-error">Không tải được tín hiệu thời điểm ngành: {timing.error?.message}</div>}
      {sectors.length > 0 && (
        <>
          <FlowMap sectors={sectors} rotation={rrg.data?.rotation?.[String(level) as "2" | "3"]} />
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ maxWidth: 520, width: "100%", margin: "0 auto" }}>
              <RRGClockTimeline sectors={clock} tailLength={12} onSelectSector={toggle} />
            </div>
            <div style={{ overflowX: "auto" }}>
              <style>{".ln-sector-table th,.ln-sector-table td{padding-left:6px;padding-right:6px}.ln-sector-table th:first-child,.ln-sector-table td:first-child{padding-left:0}"}</style>
              <table className="ln-sector-table" style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", minWidth: 1000 }} data-testid="sector-table">
                <thead>
                  <tr style={{ color: "var(--text-tertiary)", fontSize: 10, textTransform: "uppercase" }}>
                    <th style={{ textAlign: "left", padding: "4px 0" }}>Ngành</th>
                    <th style={{ textAlign: "left" }}>Trạng thái</th>
                    <th style={{ textAlign: "center" }} title="Giai đoạn Weinstein/Minervini của chỉ số ngành">GĐ</th>
                    <th style={{ textAlign: "left" }} title="Thị phần GTGD TB20 so TB60 · CMF-20">Dòng tiền</th>
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
                    const sig = bySector.get(s.code), f = s.flow;
                    return (
                      <tr key={s.code} onClick={() => toggle(s.code)} data-testid="sector-row" aria-expanded={open === s.code}
                        style={{ cursor: "pointer", borderTop: "1px solid var(--bg-surface-2)", background: open === s.code ? "var(--bg-surface-2)" : selectedSector === s.code ? "rgba(245,158,11,0.06)" : undefined }}>
                        <td style={{ padding: "6px 0" }}>
                          <b style={{ color: "var(--gold)" }}>{s.name}</b>
                          <span style={{ display: "block", fontSize: 9, color: "var(--text-tertiary)" }}>{s.code} · {s.indexMembers} mã{s.thin ? " · rổ mỏng" : ""}</span>
                        </td>
                        <td>{s.state ? <Chip color={STATE_COLOR[s.state.key]} title={s.state.why.join(" · ")} testId="sector-state">{s.state.label}</Chip> : "—"}</td>
                        <td style={{ textAlign: "center", fontSize: 11 }} title={f?.stage?.label}>{f?.stage?.stage ?? "—"}</td>
                        <td style={{ fontSize: 11 }} data-testid="sector-flow-cell">
                          {f ? <>
                            <span style={{ color: f.share.changePct >= 0 ? "var(--positive)" : "var(--negative)", fontWeight: 600 }}>{signed(f.share.changePct)}%</span>
                            <span style={{ display: "block", fontSize: 9, color: "var(--text-tertiary)" }}>{FLOW_VI[f.share.state]} · CMF {signed(f.money.cmf20, 2)}{f.money.stealthAccumulation ? " · ✦ âm thầm" : ""}</span>
                          </> : "—"}
                        </td>
                        <td style={{ color: QUADRANT_COLOR[s.quadrant], fontWeight: 600, fontSize: 11 }}>
                          {QUADRANT_VI[s.quadrant]}
                          <span style={{ display: "block", fontSize: 9, color: "var(--text-tertiary)", fontWeight: 400 }}>{num(s.latestClosed.ratio)} / {num(s.latestClosed.momentum)}</span>
                        </td>
                        <td style={{ textAlign: "right", fontSize: 11 }}>{sig?.tdSinceTransition ?? "—"}</td>
                        {sig ? <SectorScreenerCells signal={sig} /> : <td colSpan={4} style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{timing.status === "loading" ? "Đang tính…" : "—"}</td>}
                        <td style={{ textAlign: "right" }}>
                          {sig && <span title={`${ACTION_VI[sig.action] ?? sig.action} · ${sig.decision.headline}`} data-testid="sector-decision" style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, whiteSpace: "nowrap",
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
        </>
      )}
      {open && <SectorDeepPanel code={open} sector={sectors.find((s) => s.code === open)} onClose={() => setOpen(null)} onFilterSector={onFilterSector} filtered={selectedSector === open} />}
    </div>
  );
}

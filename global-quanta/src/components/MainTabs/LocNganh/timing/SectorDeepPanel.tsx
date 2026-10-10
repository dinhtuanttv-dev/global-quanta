// Lọc ngành (L4–L5) — bảng phụ một ngành:
//   - Trạng thái tổng hợp + lý do; dòng tiền (thị phần GTGD 26 tuần, CMF-20, GTGD tăng/giảm, khối ngoại 20 phiên, tích lũy âm thầm);
//     độ rộng (MA50/MA200/đỉnh 52 tuần); giai đoạn ngành; CỔ PHIẾU DẪN DẮT (tiêu chí + nhãn bộ lọc); rổ chỉ số ngành.
//   - Thanh quyết định (DecisionState engine ngành), kế hoạch vào lệnh chia đợt, CycleTimeline (DÙNG LẠI nguyên vẹn của tab Cổ tức)
//     quanh các lần chuyển vào Cải thiện, sổ theo dõi tín hiệu ngành thực tế.
// Dữ liệu: Gateway /api/market/sectors/rrg (flow) + Project A /api/locnganh/sector-cycle, /signal-tracking.
import { CycleTimeline, type CycleTimelineStats } from "../../CoTuc/CycleTimeline";
import { useSectorCycle, useSectorTracking } from "../../../../hooks/useSectorRotation";
import type { GatewaySectorRrg, SectorFlow } from "../../../../lib/locnganh/types";
import { DecisionBar as SectorDecisionBar } from "./SectorDecisionBar";
import { SignalTrackingPanel } from "./SignalTrackingPanel";
import { QUADRANT_VI } from "./quadrant";

const pct = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d).replace(".", ",")}%`);
const num = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d).replace(".", ","));
const tyVnd = (v: number | null) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Math.round(v / 1e9).toLocaleString("vi-VN")} tỷ`);
const STAGE_VI: Record<number, string> = { 0: "Chưa đủ dữ liệu", 1: "GĐ1 · tích lũy / tạo nền", 2: "GĐ2 · tăng trưởng", 3: "GĐ3 · phân phối / tạo đỉnh", 4: "GĐ4 · suy thoái" };
const CHECK_VI: Record<string, string> = { aboveMa50: "trên MA50", aboveMa200: "trên MA200", nearHigh: "cách đỉnh 52T ≤ 15%", beatsSector: "mạnh hơn ngành 3T", rsStrong: "RS ≥ 70", volumeUp: "GTGD tăng > giảm" };

/** Diễn biến thị phần GTGD (TB 20 phiên) 26 tuần — một chuỗi, nét mảnh, ghim điểm cuối. */
function ShareSpark({ h }: { h: SectorFlow["share"]["history"] }) {
  if (h.length < 2) return null;
  const W = 260, H = 48, xs = h.map((x) => x.share), lo = Math.min(...xs), hi = Math.max(...xs), sp = hi - lo || 1;
  const pts = h.map((x, i) => `${((i / (h.length - 1)) * (W - 8) + 4).toFixed(1)},${(H - 6 - ((x.share - lo) / sp) * (H - 12)).toFixed(1)}`).join(" ");
  const ptl = pts.split(" "), last = ptl[ptl.length - 1].split(",");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W, height: "auto" }} role="img" aria-label={`Thị phần GTGD 26 tuần: từ ${num(h[0].share, 2)}% tới ${num(h[h.length - 1].share, 2)}%`} data-testid="sector-share-spark">
      <polyline points={pts} fill="none" stroke="var(--gold)" strokeWidth={2} strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={3} fill="var(--gold)" />
      <title>{h.map((x) => `${x.date}: ${num(x.share, 2)}%`).join("\n")}</title>
    </svg>
  );
}

function FlowCard({ sector }: { sector: GatewaySectorRrg }) {
  const f = sector.flow; if (!f) return null;
  const row = (k: string, v: React.ReactNode, tone?: "pos" | "neg") => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, padding: "1px 0" }}><span style={{ color: "var(--text-tertiary)" }}>{k}</span><span style={{ fontWeight: 600, color: tone === "pos" ? "var(--positive)" : tone === "neg" ? "var(--negative)" : undefined }}>{v}</span></div>
  );
  return (
    <div className="panel-block" style={{ padding: 10 }} data-testid="sector-flow-card">
      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Dòng tiền & sức khỏe ngành</div>
      {sector.state && <div style={{ fontSize: 11, marginBottom: 6 }}><b>{sector.state.label}</b> — <span style={{ color: "var(--text-secondary)" }}>{sector.state.why.join(" · ")}</span></div>}
      <ShareSpark h={f.share.history} />
      {row("Thị phần GTGD (TB20 / TB60)", `${num(f.share.share20, 2)}% / ${num(f.share.share60, 2)}% (${f.share.changePct >= 0 ? "+" : ""}${num(f.share.changePct)}%, z ${num(f.share.z, 2)})`, f.share.changePct >= 0 ? "pos" : "neg")}
      {row("CMF-20 theo GTGD", num(f.money.cmf20, 3), f.money.cmf20 >= 0 ? "pos" : "neg")}
      {row("GTGD phiên tăng / giảm (20 phiên)", `${num(f.money.upDownValue, 2)}×`, f.money.upDownValue >= 1 ? "pos" : "neg")}
      {row("Khối ngoại ròng 20 phiên", tyVnd(f.money.foreignNet20), (f.money.foreignNet20 ?? 0) >= 0 ? "pos" : "neg")}
      {row("Điểm tích lũy", `${f.money.accumulationScore}/100${f.money.stealthAccumulation ? " · ✦ tích lũy âm thầm" : f.money.stealthDistribution ? " · phân phối âm thầm" : ""}`)}
      {row("Co biến động (σ20 / σ60)", num(f.money.volContraction, 2))}
      {row("Giai đoạn chỉ số ngành", f.stage ? `${STAGE_VI[f.stage.stage] ?? f.stage.label}${f.stage.stage === 2 && f.stage.stage2Start ? ` từ ${f.stage.stage2Start}` : ""}` : "—")}
      {row("Độ rộng: trên MA50 / MA200 / gần đỉnh 52T", `${num(f.breadth.aboveMa50, 0)}% / ${num(f.breadth.aboveMa200, 0)}% / ${num(f.breadth.nearHigh52, 0)}%`)}
      {row("Chỉ số ngành 20 / 63 phiên", `${num(f.price.ret20)}% / ${num(f.price.ret63)}%`)}
    </div>
  );
}

function LeadersTable({ sector }: { sector: GatewaySectorRrg }) {
  const L = sector.flow?.leaders ?? [];
  return (
    <div className="panel-block" style={{ padding: 10 }} data-testid="sector-leaders">
      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Cổ phiếu dẫn dắt ngành</div>
      {L.length ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse", minWidth: 380 }}>
            <thead><tr style={{ color: "var(--text-tertiary)", fontSize: 9, textTransform: "uppercase" }}><th style={{ textAlign: "left" }}>Mã</th><th style={{ textAlign: "right", paddingLeft: 8 }}>RS</th><th style={{ textAlign: "right", paddingLeft: 8 }}>3T</th><th style={{ textAlign: "right", paddingLeft: 8 }}>Cách đỉnh</th><th style={{ textAlign: "left", paddingLeft: 8 }}>Tiêu chí · bộ lọc</th></tr></thead>
            <tbody>
              {L.map((l) => (
                <tr key={l.ticker} style={{ borderTop: "1px solid var(--bg-surface-2)" }} data-testid="sector-leader-row">
                  <td style={{ padding: "4px 0", whiteSpace: "nowrap" }}><b style={{ color: l.leader ? "var(--gold)" : "var(--text-secondary)" }}>{l.ticker}</b>{l.leader && <span style={{ fontSize: 10, color: "var(--positive)" }} title="Cổ phiếu dẫn dắt ngành"> ★</span>}</td>
                  <td style={{ textAlign: "right", paddingLeft: 8 }}>{l.rs ?? "—"}</td>
                  <td style={{ textAlign: "right", paddingLeft: 8, color: (l.ret63 ?? 0) >= 0 ? "var(--positive)" : "var(--negative)" }}>{num(l.ret63)}%</td>
                  <td style={{ textAlign: "right", paddingLeft: 8, whiteSpace: "nowrap" }}>{num(l.fromHigh)}%</td>
                  <td style={{ paddingLeft: 8, fontSize: 10, color: "var(--text-secondary)" }} title={Object.entries(l.checks).map(([k, v]) => `${v ? "✔" : v === false ? "✖" : "·"} ${CHECK_VI[k]}`).join("\n")}>
                    {l.passed}/6{l.tags.length ? ` · ${l.tags.join(", ")}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Chưa có mã đủ 1 năm dữ liệu.</span>}
      <p style={{ fontSize: 9, color: "var(--text-tertiary)", margin: "6px 0 0" }}>★ = RS ≥ 70 (kiểu IBD, phân vị universe), trên MA200, đạt ≥ 5/6 tiêu chí: trên MA50/MA200, cách đỉnh 52 tuần ≤ 15%, mạnh hơn ngành 3 tháng, GTGD tăng &gt; giảm.</p>
    </div>
  );
}

export function SectorDeepPanel({ code, sector, onClose, onFilterSector, filtered = false }: { code: string; sector: GatewaySectorRrg | undefined; onClose: () => void; onFilterSector?: (code: string) => void; filtered?: boolean }) {
  const { data, error, isLoading } = useSectorCycle(code);
  const tracking = useSectorTracking();
  return (
    <div className="panel-block" style={{ marginTop: 10, borderColor: "var(--gold)" }} data-testid="sector-deep-panel">
      <div className="sb-row" style={{ marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <b style={{ color: "var(--gold)", fontSize: 14, marginRight: 6 }}>{sector?.name ?? data?.name ?? code}</b>
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
          ICB {code} · {sector ? `${QUADRANT_VI[sector.quadrant]} (tuần đã đóng) · rổ ${sector.indexMembers} mã${sector.thin ? " · rổ mỏng" : ""} · ${sector.historyWeeks} tuần lịch sử` : ""}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "rgba(245,158,11,0.12)", color: "var(--gold)" }} title={data?.evidence.reason}>{data?.evidence.label ?? "EXPERIMENTAL"}</span>
        {onFilterSector && (
          <button type="button" onClick={() => onFilterSector(code)} data-testid="sector-filter-top20" style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 8, cursor: "pointer", border: "1px solid var(--gold)", background: filtered ? "var(--gold)" : "transparent", color: filtered ? "#0a0a0a" : "var(--gold)" }}>
            {filtered ? "Đang lọc Top 20 theo ngành này" : "Lọc Top 20 theo ngành này"}
          </button>
        )}
        <button type="button" onClick={onClose} aria-label="Đóng phân tích ngành" style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>
      {sector && (
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", marginBottom: 10 }}>
          <FlowCard sector={sector} />
          <LeadersTable sector={sector} />
        </div>
      )}
      {isLoading && !data && <div className="t1-state-msg">Đang tính chu kỳ ngành…</div>}
      {error && !data && <div className="t1-state-msg t1-error">Không tải được chi tiết ngành: {error.message}</div>}
      {data && (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
          <div>
            <SectorDecisionBar state={data.decision} ticker={data.name} />
            {data.entryPlan && data.signal?.window && (
              <div style={{ marginTop: 8, fontSize: 12 }} data-testid="sector-entry-plan">
                <b>Kế hoạch vào lệnh</b> (phiên sau lần chuyển vào Cải thiện {data.signal.lastTransitionDate}):{" "}
                {data.entryPlan.tranches.map((t) => `+${t.offset} (${Math.round(t.fraction * 100)}%)`).join(" · ")} → thoát +{data.signal.window.exitOffset}
                {data.entryPlan.invalidationLevel != null && <> · vô hiệu nếu chỉ số ngành dưới {data.entryPlan.invalidationLevel.toFixed(2).replace(".", ",")}</>}
              </div>
            )}
            <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-secondary)" }}>
              Kỳ vọng ròng {pct(data.signal?.expectedNetReturn)} · cận dưới {pct(data.signal?.expectedNetReturnLcb)} · {data.signal?.nEvents ?? 0} lần chuyển vào Cải thiện
              {data.signal?.reactionProbability && <> · P(outperform) {Math.round(data.signal.reactionProbability.mean * 100)}% [{Math.round(data.signal.reactionProbability.ci[0] * 100)}–{Math.round(data.signal.reactionProbability.ci[1] * 100)}%]</>}
            </div>
            {sector && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 4 }}>Rổ chỉ số ngành (trọng số GTGD, trần 25%)</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }} data-testid="sector-constituents">
                  {sector.constituents.map((c) => <span key={c.ticker} style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: "var(--bg-surface-2)" }}><b style={{ color: "var(--gold)" }}>{c.ticker}</b> {Math.round(c.weight * 100)}%</span>)}
                </div>
              </div>
            )}
            <div style={{ marginTop: 10 }} data-testid="sector-tracking">
              <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 4 }}>Sổ theo dõi tín hiệu ngành (thực tế, mọi ngành)</div>
              {tracking.data ? <SignalTrackingPanel summary={tracking.data.summary} /> : <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{tracking.error ? `Không tải được: ${tracking.error.message}` : "Đang tải…"}</span>}
              {tracking.data && tracking.data.summary.totalSignals === 0 && <p style={{ fontSize: 10, color: "var(--text-tertiary)", margin: "4px 0 0" }}>Chưa có tín hiệu nào được ghi — sổ chỉ ghi khi một ngành vào vùng mua với quyết định Thuận lợi / Quan sát.</p>}
            </div>
          </div>
          <div style={{ minWidth: 0 }} data-testid="sector-cycle-timeline">
            <CycleTimeline
              stats={{ ...data.stats, ticker: data.code } as unknown as CycleTimelineStats}
              paths={{ ticker: data.code, version: data.version, asOf: data.asOf, ...data.paths }}
              todayOffset={data.signal?.tdSinceTransition ?? null}
              eventLabel="vào Cải thiện"
            />
          </div>
        </div>
      )}
      <p style={{ fontSize: 10, color: "var(--text-tertiary)", margin: "8px 0 0" }}>
        Sự kiện = tuần chỉ số ngành chuyển vào góc Cải thiện (RRG tuần, lọc nhiễu); lợi suất vượt trội so VN-Index theo ngày giao dịch. Kiểm định đặt trước L3 KHÔNG ĐẠT — tham khảo, không phải khuyến nghị đầu tư.
      </p>
    </div>
  );
}

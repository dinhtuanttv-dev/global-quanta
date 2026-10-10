// Lọc ngành (L4) — bảng phụ một ngành: thanh quyết định (DecisionState của engine ngành), CycleTimeline (DÙNG LẠI nguyên vẹn
// từ tab Cổ tức) với đường lợi suất vượt trội quanh các lần chuyển vào Cải thiện, kế hoạch vào lệnh chia đợt, rổ chỉ số ngành,
// vệt RRG gần nhất. Dữ liệu: Project A /api/locnganh/sector-cycle (engine L2) + Gateway /api/market/sectors/rrg.
import { CycleTimeline, type CycleTimelineStats } from "../../CoTuc/CycleTimeline";
import { useSectorCycle } from "../../../../hooks/useSectorRotation";
import type { GatewaySectorRrg } from "../../../../lib/locnganh/types";
import { DecisionBar as SectorDecisionBar } from "./SectorDecisionBar";
import { QUADRANT_VI } from "./quadrant";

const pct = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d).replace(".", ",")}%`);

export function SectorDeepPanel({ code, sector, onClose }: { code: string; sector: GatewaySectorRrg | undefined; onClose: () => void }) {
  const { data, error, isLoading } = useSectorCycle(code);
  return (
    <div className="panel-block" style={{ marginTop: 10, borderColor: "var(--gold)" }} data-testid="sector-deep-panel">
      <div className="sb-row" style={{ marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <b style={{ color: "var(--gold)", fontSize: 14 }}>{sector?.name ?? data?.name ?? code}</b>
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
          ICB {code} · {sector ? `${QUADRANT_VI[sector.quadrant]} (tuần đã đóng) · rổ ${sector.indexMembers} mã${sector.thin ? " · rổ mỏng" : ""} · ${sector.historyWeeks} tuần lịch sử` : ""}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "rgba(245,158,11,0.12)", color: "var(--gold)" }}>{data?.evidence.label ?? "EXPERIMENTAL"}</span>
        <button type="button" onClick={onClose} aria-label="Đóng phân tích ngành" style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>
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
        Sự kiện = tuần chỉ số ngành chuyển vào góc Cải thiện (RRG tuần, lọc nhiễu); lợi suất vượt trội so VN-Index theo ngày giao dịch. Chưa kiểm định ngoài mẫu — tham khảo, không phải khuyến nghị đầu tư.
      </p>
    </div>
  );
}

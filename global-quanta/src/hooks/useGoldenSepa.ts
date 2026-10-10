// Golden SEPA (SP5) — thay Golden Filter × Top 20 Kỹ thuật (đã gỡ): lõi là SEPA Minervini của Gateway, đối chiếu XÁC NHẬN CHÉO
// với các bộ lọc khác cũng chạy trên Gateway, cùng universe, cùng chuỗi giá điều chỉnh, cùng phiên quét:
//   CAN SLIM (cốc tay cầm O'Neil), Base Breakout, Hợp lưu v2 (chỉ phía mua), Mô hình giá Pring (P5: mô hình TĂNG đang hiệu lực —
//   vừa phá vỡ / đã xác nhận / pullback — ở khung ngày hoặc tuần).
// Không có điểm composite tự đặt: xếp theo danh sách SEPA -> số xác nhận -> điểm SEPA. Mọi thành phần đều EXPERIMENTAL
// (riêng tín hiệu S2 của SEPA đạt ngưỡng ngoài mẫu, kèm cảnh báo — xem kiểm định SP3).
import { useMemo } from "react";
import { useSepa, type SepaRow } from "./useSepa";
import { useTechnicalFilter } from "./useTechnicalFilter";
import { useConvergenceV2 } from "./useConvergenceV2";
import { usePatterns, type PatternSummary } from "./usePatterns";

export interface GoldenConfirm { key: "camslim" | "base-breakout" | "convergence" | "patterns"; label: string; detail: string }
/** Số nguồn xác nhận chéo. */
export const GOLDEN_SOURCES = 4;
const PRING_ACTIVE = new Set(["BREAKOUT", "CONFIRMED", "PULLBACK"]);
export interface GoldenSepaRow { sepa: SepaRow; confirms: GoldenConfirm[] }

const ORDER: Record<string, number> = { "SẴN SÀNG MUA": 0, "CẢNH BÁO MUA": 1, "THEO DÕI": 2 };

export function useGoldenSepa() {
  const sepa = useSepa();
  const cs = useTechnicalFilter("camslim");
  const bb = useTechnicalFilter("base-breakout");
  const cv = useConvergenceV2();
  const pt = usePatterns();
  const rows = useMemo<GoldenSepaRow[]>(() => {
    if (!sepa.data) return [];
    const csMap = new Map((cs.data?.results ?? []).map((r) => [r.ticker, r]));
    const bbMap = new Map((bb.data?.results ?? []).map((r) => [r.ticker, r]));
    const cvMap = new Map((cv.data?.results ?? []).filter((r) => r.side === "buy").map((r) => [r.ticker, r]));
    const ptMap = new Map<string, PatternSummary>();
    for (const r of pt.data?.results ?? []) { const p = r.patterns.find((x) => x.dir === "bull" && PRING_ACTIVE.has(x.state)); if (p) ptMap.set(r.ticker, p); }
    return sepa.data.results
      .filter((r) => r.list in ORDER)
      .map((r) => {
        const confirms: GoldenConfirm[] = [];
        const c = csMap.get(r.ticker), b = bbMap.get(r.ticker), v = cvMap.get(r.ticker), m = ptMap.get(r.ticker);
        if (c) confirms.push({ key: "camslim", label: "CAN SLIM", detail: `${c.status === "BREAKOUT" ? "phá vỡ" : "chờ pivot"}${c.grade ? ` · hạng ${c.grade}` : ""} · ${c.metrics.score} điểm` });
        if (b) confirms.push({ key: "base-breakout", label: "Base Breakout", detail: `${b.status === "BREAKOUT" ? "phá vỡ" : "chờ pivot"}${b.grade ? ` · hạng ${b.grade}` : ""}` });
        if (v) confirms.push({ key: "convergence", label: "Hợp lưu v2", detail: `${v.status === "READY" ? "READY" : "theo dõi"} · Phase ${v.wyckoff.cyclePhase ?? "?"} · ${v.metrics.score} điểm` });
        if (m) confirms.push({ key: "patterns", label: "Mô hình giá (Pring)", detail: `${m.label} · ${m.timeframe === "W" ? "tuần" : "ngày"} · ${m.stateLabel}` });
        return { sepa: r, confirms };
      })
      .sort((a, b) => ORDER[a.sepa.list] - ORDER[b.sepa.list] || b.confirms.length - a.confirms.length || b.sepa.score - a.sepa.score);
  }, [sepa.data, cs.data, bb.data, cv.data, pt.data]);
  const sources = {
    camslim: cs.data ? cs.data.dataAsOf : null, "base-breakout": bb.data ? bb.data.dataAsOf : null, convergence: cv.data ? cv.data.dataAsOf : null, patterns: pt.data ? pt.data.dataAsOf : null,
  };
  return {
    rows, doc: sepa.data, sources,
    isLoading: sepa.isLoading, error: sepa.error,
    partial: !cs.data || !bb.data || !cv.data || !pt.data,
    refresh: () => { void sepa.refresh(); void cs.refresh(); void bb.refresh(); void cv.refresh(); void pt.refresh(); },
  };
}

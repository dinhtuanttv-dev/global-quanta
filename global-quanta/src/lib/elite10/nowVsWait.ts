// MP-b / MP-c (20/11/2026, tài liệu 19 mục 3–4) — hàm thuần cho khối Mô phỏng thời điểm:
//  - withCost: cùng nghiên cứu sự kiện với mức phí khứ hồi khác (mọi phép tính ròng đọc es.costPerRoundTrip); phí bằng phí engine -> trả
//    nguyên đối tượng (kết quả giữ nguyên tuyệt đối).
//  - nowVsWait: đặt cạnh nhau "vào hôm nay" (quạt kịch bản có điều kiện) và "chờ vùng Timeline" (mô phỏng cửa sổ trên mọi đợt lịch sử).
//    Hai phương pháp khác nhau trên cùng ≤ vài đợt: KHÔNG kết luận cách nào tốt hơn (không có trường "thắng").
import type { AnalogFan } from "./analogFan";
import { simulate, type EventStudy, type EventStudyWindow } from "./timingSim";
import type { TimelineRow } from "../cotuc/buy-timeline";

export const COST_REALISTIC = 0.008; // cận trên "0,6–0,8% chi phí thực tế mỗi lần đổi mã" (Bảng quyết định); duyệt 20/11/2026

export function withCost(es: EventStudy, cost: number): EventStudy {
  return Math.abs(cost - es.costPerRoundTrip) < 1e-12 ? es : { ...es, costPerRoundTrip: cost };
}

export interface NowSide { fromOffset: number; exitOffset: number; pWin: { mean: number; lo: number; hi: number }; median: number | null; lo: number | null; hi: number | null; level: number; nEff: number; events: number; coverageAdjusted: number | null; conformalFeasible: boolean }
export interface WaitSide { entry: number; exit: number; n: number; wins: number; prob: { mean: number; ci: [number, number] } | null; median: number | null; mean: number | null; min: number | null; max: number | null }
export type NowVsWait = { ok: true; now: NowSide; wait: WaitSide; cost: number } | { ok: false; reason: string };

/**
 * Điều kiện: có dòng Timeline (vùng SẮP TỚI) cho đúng mã + loại sự kiện, cửa sổ đang xem là cửa sổ Timeline, quạt kịch bản có P(lãi) tại
 * phiên thoát, và mốc vào / thoát có trong nghiên cứu sự kiện. Thiếu điều kiện nào -> lý do cụ thể (hiển thị thay cho khối).
 */
export function nowVsWait(es: EventStudy | null, tl: Pick<TimelineRow, "status" | "windowId" | "entryTo" | "exitOffset"> | null, fan: AnalogFan | null, win: EventStudyWindow | null, lastOff: number | null = null): NowVsWait {
  if (!es) return { ok: false, reason: "chưa có nghiên cứu sự kiện cho mã và loại sự kiện này" };
  if (!tl) return { ok: false, reason: "chưa có vùng Timeline cho mã và loại sự kiện này — không có gì để so" };
  if (tl.status !== "UPCOMING") return { ok: false, reason: tl.status === "IN_WINDOW" ? "vùng Timeline đang mở — so sánh chỉ có nghĩa trước vùng" : "vùng Timeline đã qua" };
  if (win?.id !== tl.windowId) return { ok: false, reason: "đang xem một cửa sổ khác cửa sổ Timeline — chọn lại cửa sổ có nhãn TIMELINE để so" };
  if (!es.offsets.includes(tl.entryTo) || !es.offsets.includes(tl.exitOffset)) return { ok: false, reason: "mốc vào / thoát của Timeline không có trong nghiên cứu sự kiện" };
  if (!fan?.pWin || fan.pWin.exitOffset !== tl.exitOffset) {
    // Quạt chỉ dựng khi hôm nay đã ở trong khoảng của nghiên cứu sự kiện (từ mốc đầu tiên tới trước sự kiện).
    const from = es.offsets[0];
    if (lastOff != null && lastOff < from) return { ok: false, reason: `hôm nay ở phiên ${lastOff}, quạt kịch bản chỉ dựng từ phiên ${from} — khối sẽ hiện sau khoảng ${from - lastOff} phiên nữa` };
    return { ok: false, reason: "quạt kịch bản chưa dựng được tới phiên thoát (cần ≥ 4 đợt đủ nến ngày, trước sự kiện)" };
  }
  const ex = fan.points.find((p) => p.offset === tl.exitOffset) ?? null;
  const base = Math.expm1(fan.anchorCar);
  const fwd = (v: number | null | undefined) => (v == null ? null : (1 + v) / (1 + base) - 1); // từ hôm nay tới phiên thoát (vượt VN-Index)
  const s = simulate(es, tl.entryTo, tl.exitOffset);
  const nets = s.outcomes.map((o) => o.net);
  return {
    ok: true, cost: es.costPerRoundTrip,
    now: {
      fromOffset: fan.todayOff, exitOffset: tl.exitOffset, pWin: { mean: fan.pWin.mean, lo: fan.pWin.lo, hi: fan.pWin.hi },
      median: fwd(ex?.mid), lo: fwd(ex ? ex.loAdj ?? ex.lo : null), hi: fwd(ex ? ex.hiAdj ?? ex.hi : null), level: fan.level,
      nEff: fan.nEff, events: fan.weights.length, coverageAdjusted: fan.coverage?.adjusted ?? null, conformalFeasible: fan.conformalFeasible,
    },
    wait: {
      entry: tl.entryTo, exit: tl.exitOffset, n: s.n, wins: s.wins, prob: s.prob ? { mean: s.prob.mean, ci: s.prob.ci } : null,
      median: s.medianNet, mean: s.meanNet, min: nets.length ? Math.min(...nets) : null, max: nets.length ? Math.max(...nets) : null,
    },
  };
}

// BỘ NÃO CHU KỲ & THỜI ĐIỂM — CT3 (20/11/2026, docs/elite-cycle-timing-brain). Nguồn thời điểm HAI LÀN cho các khối HIỂN THỊ của Elite:
// Timeline Gateway gốc (gồm cửa sổ cổ tức W1–W5) + Săn cổ tức TO-v1, tách làn có nhãn (quyết định Q1). Cùng khoá SWR với
// useEliteTiming (trường rawRows) -> KHÔNG gọi thêm API. Lớp "Thời điểm hợp nhất" tắt -> trả đúng dòng của useEliteTiming như cũ.
// KHÔNG dùng cho chọn mã / bộ lọc / tiêu chí Radar / thông báo: các phần đó giữ useEliteTiming / useGatewayBuyTimeline nguyên trạng.
import { useMemo } from "react";
import { useEliteTiming } from "./useEliteTiming";
import { useHlLayerOn } from "./useHlRowSignals";
import { buildTimingBrain } from "../../lib/timing-brain";
import type { LaneRow } from "../../lib/elite10/buyZoneLane";
import type { TimelineRow } from "../../lib/cotuc/buy-timeline";

export function useTimingBrain() {
  const elite = useEliteTiming();
  const on = useHlLayerOn("timing");
  const raw = elite.rawRows as LaneRow[] | null | undefined;
  const vm = useMemo(() => (on && raw ? buildTimingBrain(raw, elite.toRows) : null), [on, raw, elite.toRows]);
  /** Dòng để hiển thị: hai làn khi lớp bật, đường Elite cũ khi lớp tắt. */
  const rows = (vm ? vm.rows : elite.data?.rows ?? null) as TimelineRow[] | null;
  /** Lớp bật VÀ có dữ liệu gốc: mọi phần hiển thị mới chỉ hiện khi active (không có dữ liệu -> giao diện y như cũ). */
  return { ...elite, on, vm, rows, active: vm != null };
}

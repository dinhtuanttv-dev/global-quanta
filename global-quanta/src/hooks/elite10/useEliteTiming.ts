// Elite × TO (07/11/2026) — nguồn định thời điểm DUY NHẤT cho Elite 10 (Bảng quyết định, Ứng viên, Bộ lọc Elite, Radar, Radar lệnh):
// Timeline Gateway (/api/elite/buy-timing) với vùng cổ tức W1–W5 cũ được THAY bằng vùng "Săn cổ tức" TO-v1 (/api/corp-events/to);
// vùng mùa vụ KQKD giữ nguyên. Kèm đợt cổ tức đang diễn ra theo mã + số lịch sử "giữ qua GDKHQ" cho cảnh báo GDKHQ.
import { useMemo } from "react";
import { useGatewayBuyTimeline } from "../useGatewayBuyTimeline";
import { useToOverview } from "../useCorpEvents";
import { toLaneRows, withToRows } from "../../lib/elite10/toTiming";
import type { TimelineRow } from "../../lib/cotuc/buy-timeline";
import type { ToRadarRow } from "../../lib/cotuc/to";
import type { LaneRow } from "../../lib/elite10/buyZoneLane";

export function useEliteTiming() {
  const buy = useGatewayBuyTimeline();
  const { data: to } = useToOverview(true);
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const toRows: LaneRow[] = useMemo(() => toLaneRows(to?.radar.rows ?? [], today, buy.sessions ?? []), [to, today, buy.sessions]);
  const data = useMemo(() => (buy.data ? { ...buy.data, rows: withToRows(buy.data.rows, toRows) as TimelineRow[] } : null), [buy.data, toRows]);
  return {
    ...buy, data, toRows,
    /** Mọi đợt cổ tức tiền đang chờ GDKHQ (mọi nhóm lợi suất) — cho cảnh báo GDKHQ / hồ sơ mã. */
    toEvents: (to?.radar.rows ?? []) as ToRadarRow[],
    postEx: to?.reference?.postEx ?? null,
    toLabel: to?.label ?? null,
  };
}

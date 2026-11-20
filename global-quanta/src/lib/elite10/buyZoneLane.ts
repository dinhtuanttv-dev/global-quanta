// Kiểu dòng vùng mua dùng chung (Timeline + vùng Săn cổ tức TO, bậc EXPLORATORY = thăm dò).
// Dọn rác 20/11/2026: dải "Gantt" vùng mua (laneAxis, buyLane, headlineZone, zoneRing, zoneChips) đã gỡ khỏi Bảng quyết định và không
// còn nơi nào dùng; lịch sử trong git.
import type { TimelineRow } from "../cotuc/buy-timeline";

/** Dòng vùng mua: dòng Timeline (tab Cổ tức) hoặc vùng tối ưu Elite (thêm bậc EXPLORATORY = thăm dò). */
export type LaneRow = Omit<TimelineRow, "tier"> & { tier: "VALIDATED" | "NEAR" | "EXPLORATORY" };

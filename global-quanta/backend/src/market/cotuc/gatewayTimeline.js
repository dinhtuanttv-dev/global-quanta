// B3 — Timeline điểm mua tính trên Gateway từ kho Cổ tức (cùng đầu vào + cùng hàm với route /api/cotuc/buy-timeline của Project A).
// Đệm theo (ngày VN, lần ghi cuối của 3 bảng): dữ liệu không đổi -> trả lại đúng kết quả cũ, không tính lại.
import { isTradingDay, vnDate } from "../calendar.js";
import { dayNumberToIso, timelineBody } from "./buyTimelineCore.js";

export const TIMELINE_DECISION_FIELDS = ["ticker", "computedAt", "snapshot.exDate", "snapshot.decision.level", "snapshot.signals", "snapshot.backtest"];
export const TIMELINE_SEASON_FIELDS = ["ticker", "earningsSignal", "stats", "finalizedAt"];
const gatewayCal = { isTradingDay: (n) => isTradingDay(new Date(`${dayNumberToIso(n)}T03:00:00Z`)) };

export function createGatewayTimeline({ cotucStore, now = Date.now, cal = gatewayCal }) {
  let memo = null;
  return async function gatewayTimeline() {
    const today = vnDate(new Date(now()));
    const st = (await cotucStore.status()).tables;
    const key = [today, st.decision.updatedAt, st.season.updatedAt, st.meta.updatedAt].join("|");
    if (memo?.key === key) return memo.body;
    if (!st.decision.rows) return null;
    const [decisionRows, seasonRows, meta] = await Promise.all([
      cotucStore.list("decision", { fields: TIMELINE_DECISION_FIELDS }),
      cotucStore.list("season", { fields: TIMELINE_SEASON_FIELDS }),
      cotucStore.list("meta", { keys: ["universe"] }),
    ]);
    const uni = Array.isArray(meta[0]?.tickers) ? meta[0].tickers : [];
    const body = timelineBody({ today, cal, decisionRows, seasonRows, sectors: new Map(uni), universeSize: uni.length });
    memo = { key, body };
    return body;
  };
}

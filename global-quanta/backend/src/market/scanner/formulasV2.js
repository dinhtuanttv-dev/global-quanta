// Siêu Quét v2 — các công thức đã sửa (Q2/Q5, anh duyệt 22/10/2026). formulas.js giữ nguyên bản Project A cho golden test.
//   - Điểm FA trung lập ngành: phân vị trong NHÓM CÙNG NGÀNH (ngân hàng so ngân hàng…), nhóm < MIN_PEERS mã có số liệu -> so toàn
//     universe. Thành phần thiếu (null) bị BỎ và chia lại trọng số, không bị xếp như giá trị 0.
//   - Smart Score: thành phần thiếu (FA không có BCTC, sự kiện không có nguồn) bỏ khỏi trung bình có trọng số thay vì gán 50/0.
//   - R/R: từ vùng hỗ trợ / kháng cự THẬT của engine cấu trúc (thay cho MA50 ± 3%, vốn luôn ≈ 1).
import { clamp } from "./formulas.js";

export const MIN_PEERS = 8;
export const FA_WEIGHTS = [["roe", 0.40], ["netMargin", 0.30], ["revenueGrowth", 0.30]];
const SMART_WEIGHTS = { fa: 0.40, ta: 0.35, event: 0.25 };
const PEER_INDUSTRY = { "Ngân hàng": "bank", "Chứng khoán": "securities", "Bảo hiểm": "insurance", "Bất động sản": "realestate" };

const round1 = (x) => Math.round(x * 10) / 10;

/** Phân vị (cùng công thức percentileRank của Project A) trên các giá trị KHÁC null; null nếu không xếp được. */
export function rankPct(value, values) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const pool = values.filter((v) => v !== null && v !== undefined && Number.isFinite(v));
  if (!pool.length) return null;
  return Math.round((pool.filter((v) => v <= value).length / pool.length) * 1000) / 10;
}

/** Nhóm so sánh: loại BCTC tài chính (VCI) > ngành đặc thù > nhóm ngành. */
export function peerKeyOf({ kind = null, industry = null, sectorGroup = null } = {}) {
  if (kind === "bank" || kind === "securities" || kind === "insurance") return kind;
  return PEER_INDUSTRY[industry] ?? sectorGroup ?? "Khác";
}

/**
 * @param t   { roe, netMargin, revenueGrowth, peer }
 * @param uni { roe: [], margin: [], growth: [], peer: [] } thẳng hàng theo mã
 * @returns {{ score: number|null, basis: "PEER"|"UNIVERSE"|"MIXED"|null, components: number }}
 */
export function computeFaScoreV2(t, uni) {
  const col = { roe: uni.roe, netMargin: uni.margin, revenueGrowth: uni.growth };
  let acc = 0, wsum = 0, peerUsed = 0, n = 0;
  for (const [metric, w] of FA_WEIGHTS) {
    const v = t[metric];
    if (v === null || v === undefined) continue;
    const all = col[metric];
    const peers = all.filter((x, i) => uni.peer[i] === t.peer && x !== null && x !== undefined);
    const usePeer = peers.length >= MIN_PEERS;
    const r = rankPct(v, usePeer ? peers : all);
    if (r === null) continue;
    acc += w * r; wsum += w; n++;
    if (usePeer) peerUsed++;
  }
  if (!wsum) return { score: null, basis: null, components: 0 };
  return { score: round1(acc / wsum), basis: peerUsed === n ? "PEER" : peerUsed === 0 ? "UNIVERSE" : "MIXED", components: n };
}

/** Smart Score v2: trung bình có trọng số 40/35/25 trên các thành phần CÓ dữ liệu, rồi nhân hệ số đồng thuận như bản gốc. */
export function computeSmartScoreV2(faScore, taScore, eventImpactScore, boost) {
  let acc = 0, wsum = 0;
  for (const [v, w] of [[faScore, SMART_WEIGHTS.fa], [taScore, SMART_WEIGHTS.ta], [eventImpactScore, SMART_WEIGHTS.event]]) {
    if (v === null || v === undefined) continue;
    acc += w * v; wsum += w;
  }
  if (!wsum) return null;
  return round1(clamp((acc / wsum) * (1 + 0.12 * boost)));
}

/** Nhãn chất lượng (ngưỡng như bản gốc) nhưng không suy diễn từ dữ liệu thiếu. */
export function computeQualityTagV2(leverage, netMargin) {
  if (leverage !== null && leverage !== undefined && leverage < 0.5) return "Low Debt";
  if (netMargin !== null && netMargin !== undefined && netMargin > 0.15) return "High Margin";
  if ((leverage === null || leverage === undefined) && (netMargin === null || netMargin === undefined)) return null;
  return "Core Cash Flow";
}

/** R/R = (kháng cự − giá) / (giá − hỗ trợ); null khi giá không nằm giữa hai vùng. */
export function riskRewardFromLevels(price, support, resistance) {
  if (!(price > 0 && support > 0 && resistance > 0 && support < price && resistance > price)) return null;
  return Math.round(((resistance - price) / (price - support)) * 100) / 100;
}

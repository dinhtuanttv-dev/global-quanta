import type { RadarCoreNode, RadarRingNode, ConcentrationRisk, RadarDigest } from "../types";
import { CONVERGENCE_LABELS } from "../types";
import type { SieuQuetStockItem } from "../hooks/useSieuQuetScanner";

// ELITE COMMAND RADAR tính từ DỮ LIỆU THẬT cho các mã trong một ★ Danh mục (mặc định "Danh mục của tôi").
// Mỗi mã chấm 6 tiêu chí hội tụ — đúng 6 tab của trang (CONVERGENCE_LABELS):
//   1 Siêu quét AI     : Smart Score ≥ 60 và không bị loại vì F-Score thấp (Gateway, cả mã ngoài universe)
//   2 Kết nối thế giới : mã hưởng lợi từ diễn biến ngành Mỹ / Âu / Á (cùng phép tính tab Kết nối thế giới)
//   3 Lọc ngành        : thuộc Top 20 Hội tụ dòng tiền của tab Lọc ngành
//   4 TA VN-Index      : thuộc danh sách đồng thuận kỹ thuật (Golden Filter ∩ Convergence Scan)
//   5 Chất xúc tác     : tác động "hưởng lợi" từ chất xúc tác tin tức, hoặc sự kiện đã xác nhận cho ngành
//   6 Cổ tức · điểm mua: có vùng mua ĐẠT KIỂM ĐỊNH (chu kỳ cổ tức hoặc mùa vụ KQKD — Timeline tab Cổ tức) đang mở hoặc bắt
//                        đầu trong ≤ 10 phiên, HOẶC DecisionBar "Thuận lợi". "Gần đạt" KHÔNG tính (chỉ ghi lý do). Từ
//                        phiên bản tiêu chí 2 (RADAR_CRITERIA_VERSION) — trước đó là "thuộc rổ 17 mã cổ tức".
// Core = ≥ CORE_MIN/6 tiêu chí (tối đa 5 mã); Ring = các mã còn lại có điểm cao nhất (tối đa 11 mã).

export const CORE_MIN = 4;
export const MAX_CORE = 5;
export const MAX_RING = 11;
export const SMART_MIN = 60;

/** Mã -> bằng chứng (câu ngắn hiển thị ở Giải trình hội tụ); có mặt = đạt tiêu chí. */
export type Evidence = Map<string, string> | Set<string>;

export interface RadarSources {
  /** Kết quả Siêu Quét (kể cả mã ngoài universe đã chấm qua /scanner/custom). */
  scanner: Map<string, SieuQuetStockItem>;
  /** null = nguồn chưa tải được (tiêu chí tính là "chưa có dữ liệu", không phải "không đạt"). */
  world: Evidence | null;
  sector: Evidence | null;
  ta: Evidence | null;
  catalyst: Evidence | null;
  dividend: Evidence | null;
  /** Lý do KHÔNG đạt theo từng mã (VD "gần đạt — thiếu q-value") — thay câu chung FAIL_TEXT nếu có. */
  dividendFail?: Map<string, string>;
}

export type CriterionStatus = "pass" | "fail" | "missing";
export interface CriterionEvidence { label: string; status: CriterionStatus; text: string }

export interface ScoredTicker {
  ticker: string;
  convergence: number[];
  /** Bằng chứng từng tiêu chí (cùng thứ tự CONVERGENCE_LABELS). */
  evidence: CriterionEvidence[];
  score: number;
  /** Nguồn chưa có dữ liệu (theo thứ tự tiêu chí). */
  missing: string[];
  item: SieuQuetStockItem | null;
}

const excluded = (i: SieuQuetStockItem) => i.piotroskiFScore !== null && i.piotroskiFScore <= Math.floor(i.fScoreMax * 3 / 9);

const FAIL_TEXT = [
  "", "Không thuộc nhóm hưởng lợi từ diễn biến ngành Mỹ / Âu / Á", "Ngoài Top 20 Hội tụ dòng tiền (Lọc ngành)",
  "Không có trong danh sách đồng thuận kỹ thuật", "Chưa có chất xúc tác / sự kiện hưởng lợi", "Chưa có vùng mua cổ tức/KQKD đạt kiểm định trong 10 phiên",
];
const PASS_TEXT = ["", "Hưởng lợi từ diễn biến ngành quốc tế", "Thuộc Top 20 Hội tụ dòng tiền", "Trong danh sách đồng thuận kỹ thuật", "Có chất xúc tác hưởng lợi", "Có vùng mua cổ tức/KQKD đạt kiểm định"];
const lookup = (e: Evidence, t: string): string | null => (e instanceof Map ? e.get(t) ?? null : e.has(t) ? "" : null);

export function scoreTicker(ticker: string, s: RadarSources): ScoredTicker {
  const item = s.scanner.get(ticker) ?? null;
  const evidence: CriterionEvidence[] = [];
  // 1 Siêu quét AI
  if (!item) evidence.push({ label: CONVERGENCE_LABELS[0], status: "missing", text: "Chưa có điểm Siêu Quét" });
  else {
    const smart = item.smartScore ?? 0;
    const bad = excluded(item);
    evidence.push({
      label: CONVERGENCE_LABELS[0], status: smart >= SMART_MIN && !bad ? "pass" : "fail",
      text: bad ? `F-Score ${item.piotroskiFScore}/${item.fScoreMax} quá thấp (Smart ${smart.toFixed(1)})`
        : smart >= SMART_MIN ? `Smart ${smart.toFixed(1)} ≥ ${SMART_MIN}` : `Smart ${smart.toFixed(1)} < ${SMART_MIN}`,
    });
  }
  // 2–6 các tab còn lại
  const others: [Evidence | null, number][] = [[s.world, 1], [s.sector, 2], [s.ta, 3], [s.catalyst, 4], [s.dividend, 5]];
  for (const [src, k] of others) {
    if (!src) { evidence.push({ label: CONVERGENCE_LABELS[k], status: "missing", text: "Nguồn chưa tải được" }); continue; }
    let hit = lookup(src, ticker);
    // Chất xúc tác: sự kiện đã xác nhận cho ngành (Siêu Quét) cũng tính.
    if (hit === null && k === 4 && item && (item.eventImpactScore ?? 0) > 0) hit = `Sự kiện ngành đã xác nhận (+${item.eventImpactScore})`;
    evidence.push(hit === null
      ? { label: CONVERGENCE_LABELS[k], status: "fail", text: (k === 5 ? s.dividendFail?.get(ticker) : undefined) ?? FAIL_TEXT[k] }
      : { label: CONVERGENCE_LABELS[k], status: "pass", text: hit || PASS_TEXT[k] });
  }
  const convergence: number[] = evidence.map((e) => (e.status === "pass" ? 1 : 0));
  const missing = evidence.filter((e) => e.status === "missing").map((e) => e.label);
  return { ticker, convergence, evidence, score: convergence.reduce((a, b) => a + b, 0), missing, item };
}

function coreState(item: SieuQuetStockItem | null): Pick<RadarCoreNode, "state" | "stateLabel" | "holdSuggestion" | "trendWarning"> {
  if (!item) return { state: "stable", stateLabel: "Chưa có điểm Siêu Quét", holdSuggestion: "Theo dõi — chờ Siêu Quét chấm điểm", trendWarning: null };
  if (excluded(item) || item.trendTag === "Down-Trend") {
    return {
      state: "caution",
      stateLabel: excluded(item) ? `Cảnh báo · F-Score ${item.piotroskiFScore}/${item.fScoreMax}` : "Cảnh báo · Down-Trend",
      holdSuggestion: "Thận trọng — chờ xu hướng xác nhận lại trước khi tăng tỷ trọng",
      trendWarning: item.trendTag === "Down-Trend" ? "Giá dưới MA20 < MA50" : null,
    };
  }
  if (item.breakoutBoostBadge || (item.trendTag === "Up-Trend" && (item.rsRating ?? 0) >= 80)) {
    return {
      state: "breakout",
      stateLabel: `Bứt phá · RS ${(item.rsRating ?? 0).toFixed(0)}`,
      holdSuggestion: "Ngắn–trung hạn (2–6 tuần), nâng dừng lỗ theo MA20",
      trendWarning: null,
    };
  }
  return {
    state: "stable",
    stateLabel: `Ổn định · ${item.trendTag ?? "—"}`,
    holdSuggestion: "Trung hạn (1–3 tháng) khi còn giữ trên MA50",
    trendWarning: null,
  };
}

export type RadarState = "stable" | "breakout" | "caution";

/** Trạng thái hiển thị trên Radar: cảnh báo (Down-Trend / F-Score thấp), bứt phá, ổn định. */
export function radarState(x: ScoredTicker): RadarState {
  const i = x.item;
  if (!i) return "stable";
  const excluded = i.piotroskiFScore !== null && i.piotroskiFScore <= Math.floor(i.fScoreMax * 3 / 9);
  if (excluded || i.trendTag === "Down-Trend") return "caution";
  if (i.breakoutBoostBadge || (i.trendTag === "Up-Trend" && (i.rsRating ?? 0) >= 80)) return "breakout";
  return "stable";
}

const rank = (a: ScoredTicker, b: ScoredTicker) => b.score - a.score || (b.item?.smartScore ?? -1) - (a.item?.smartScore ?? -1) || a.ticker.localeCompare(b.ticker);

export interface RadarModel {
  core: RadarCoreNode[];
  ring: RadarRingNode[];
  scored: ScoredTicker[];
  /** Mã trong danh mục không hiển thị trên vòng (quá 16 điểm). */
  hidden: number;
  risk: ConcentrationRisk | null;
  digest: RadarDigest | null;
  /** Nguồn chưa tải được (để ghi chú, không coi là "không đạt"). */
  missingSources: string[];
}

/**
 * @param live giá realtime theo mã (MarketFeed); thiếu thì dùng giá chốt của Siêu Quét.
 * @param groupOf nhóm ngành của mã (tính rủi ro tập trung).
 */
export function buildRadarModel(
  tickers: string[], s: RadarSources,
  live: Record<string, { price: number; changePct: number | null }> = {},
  today = new Date().toISOString().slice(0, 10),
): RadarModel {
  const scored = [...new Set(tickers)].map((t) => scoreTicker(t, s)).sort(rank);
  const coreList = scored.filter((x) => x.score >= CORE_MIN).slice(0, MAX_CORE);
  const coreSet = new Set(coreList.map((x) => x.ticker));
  const ringList = scored.filter((x) => !coreSet.has(x.ticker)).slice(0, MAX_RING);
  const priceOf = (x: ScoredTicker) => {
    const l = live[x.ticker];
    return { price: l?.price ?? x.item?.price ?? 0, changePct: l?.changePct ?? x.item?.changePct ?? 0, livePrice: Boolean(l) };
  };
  const core: RadarCoreNode[] = coreList.map((x) => ({
    ticker: x.ticker, name: x.item?.companyName ?? x.ticker, sector: x.item?.industry ?? x.item?.sector ?? "-",
    ...priceOf(x), ...coreState(x.item), convergence: x.convergence,
  }));
  const ring: RadarRingNode[] = ringList.map((x) => ({
    ticker: x.ticker, score: x.score, sector: x.item?.industry ?? x.item?.sector ?? "-", ...priceOf(x),
  }));

  // Rủi ro tập trung: tỷ trọng nhóm ngành lớn nhất trong Core (Core < 2 mã thì xét toàn danh mục).
  const basis = coreList.length >= 2 ? coreList : scored;
  let risk: ConcentrationRisk | null = null;
  if (basis.length >= 2) {
    const counts = new Map<string, number>();
    for (const x of basis) { const g = x.item?.sectorGroup ?? "Chưa phân nhóm"; counts.set(g, (counts.get(g) ?? 0) + 1); }
    const [topGroup, n] = [...counts].sort((a, b) => b[1] - a[1])[0];
    const share = n / basis.length;
    const scope = coreList.length >= 2 ? `${coreList.length} mã Core` : `${basis.length} mã trong danh mục`;
    // Một nhóm chỉ có 1 mã thì không tính là tập trung (VD Core 2 mã thuộc 2 nhóm khác nhau).
    risk = n >= 2 && share >= 0.6
      ? { level: "high", note: `${Math.round(share * 100)}% ${scope} cùng nhóm ${topGroup} — cân nhắc đa dạng hoá.` }
      : n >= 2 && share >= 0.4
        ? { level: "medium", note: `${n}/${basis.length} ${scope.replace(/^\d+ /, "")} thuộc nhóm ${topGroup}.` }
        : { level: "low", note: `${scope} trải đều ${counts.size} nhóm ngành.` };
  }

  // Tóm tắt: mã gần Core nhất và tiêu chí còn thiếu.
  const near = scored.find((x) => !coreSet.has(x.ticker));
  const parts: string[] = [];
  parts.push(coreList.length ? `Core: ${coreList.map((x) => `${x.ticker} ${x.score}/6`).join(", ")}.` : `Chưa mã nào đạt Core (≥ ${CORE_MIN}/6).`);
  if (near) {
    const lack = near.convergence.map((v, i) => (v ? null : CONVERGENCE_LABELS[i])).filter(Boolean).slice(0, 3);
    parts.push(`${near.ticker} gần Core nhất (${near.score}/6)${lack.length ? `, còn thiếu: ${lack.join(", ")}` : ""}.`);
  }
  const digest: RadarDigest | null = scored.length ? { text: parts.join(" "), date: today } : null;

  const missingSources = [
    s.world ? null : CONVERGENCE_LABELS[1], s.sector ? null : CONVERGENCE_LABELS[2],
    s.ta ? null : CONVERGENCE_LABELS[3], s.catalyst ? null : CONVERGENCE_LABELS[4], s.dividend ? null : CONVERGENCE_LABELS[5],
  ].filter((x): x is string => Boolean(x));

  return { core, ring, scored, hidden: Math.max(0, scored.length - core.length - ring.length), risk, digest, missingSources };
}

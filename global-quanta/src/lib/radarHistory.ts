// Lịch sử ELITE COMMAND RADAR: ảnh chụp hằng ngày (rút gọn), so sánh để sinh "sự kiện radar",
// và quỹ đạo điểm hội tụ theo ngày cho vệt chuyển động. Hàm thuần — lưu/đọc qua Gateway ở useRadarHistory.

import { RADAR_CRITERIA_VERSION } from "./radarTimeline";
import { CORE_MIN, radarState, type RadarState, type ScoredTicker } from "./radarModel";

/** Một mã trong ảnh chụp (khoá ngắn để gói nhỏ): t mã · s điểm 0–6 · g nhóm ngành · sm Smart · st trạng thái ·
 *  core · pass chuỗi 6 ký tự 1/0/- theo 6 tiêu chí · p giá · c % thay đổi · sg Stealth 20 đang bật (+1 tích luỹ / −1 phân phối / 0;
 *  thiếu = ảnh chụp cũ hoặc chưa có dữ liệu dòng tiền). */
/** cv = phiên bản bộ tiêu chí (thiếu = 1: tiêu chí 6 "thuộc rổ 17 mã"; 2: "Cổ tức · điểm mua"). */
export interface SnapItem { t: string; s: number; g: string | null; sm: number | null; st: RadarState; core: boolean; pass: string | null; p: number | null; c: number | null; sg?: number; cv?: number }
export interface RadarSnapshot { date: string; items: SnapItem[]; updatedAt?: string | null }

export function toSnapItems(
  scored: ScoredTicker[], coreSet: Set<string>,
  live: Record<string, { price: number; changePct: number | null }> = {},
  stealth: Map<string, number> | null = null,
): SnapItem[] {
  return scored.map((x) => ({
    t: x.ticker,
    s: x.score,
    g: x.item?.sectorGroup ?? null,
    sm: x.item?.smartScore ?? null,
    st: radarState(x),
    core: coreSet.has(x.ticker),
    pass: x.evidence.map((e) => (e.status === "pass" ? "1" : e.status === "fail" ? "0" : "-")).join(""),
    p: live[x.ticker]?.price ?? x.item?.price ?? null,
    c: live[x.ticker]?.changePct ?? x.item?.changePct ?? null,
    ...(stealth?.has(x.ticker) ? { sg: stealth.get(x.ticker)! } : {}),
    cv: RADAR_CRITERIA_VERSION,
  }));
}

/** Dấu vân tay để biết ảnh chụp có đổi không (bỏ giá — giá đổi liên tục, chỉ lưu kèm khi radar đổi hoặc mỗi 30 phút). */
export function snapFingerprint(items: SnapItem[]): string {
  return items.map((i) => `${i.t}:${i.s}:${i.st}:${i.core ? 1 : 0}:${i.pass ?? ""}:${i.sg ?? ""}:${i.cv ?? 1}`).sort().join("|");
}

export type RadarEventKind = "enter_core" | "leave_core" | "stealth_on" | "score_up" | "score_down" | "turn_caution" | "turn_breakout";
export interface RadarEvent { kind: RadarEventKind; ticker: string; from: number; to: number; text: string; tone: "up" | "down" | "info" }

const RANK: Record<RadarEventKind, number> = { enter_core: 0, leave_core: 1, stealth_on: 2, turn_caution: 3, turn_breakout: 4, score_up: 5, score_down: 6 };

/**
 * So ảnh chụp trước với hiện tại (chỉ các mã có ở cả hai — thêm/bớt mã khỏi danh mục không phải sự kiện).
 * Vào/ra Core; Stealth 20 vừa bật (cả hai ảnh chụp phải có dữ liệu dòng tiền); điểm thay đổi ≥ 2 tiêu chí; chuyển sang cảnh báo / bứt phá.
 */
export function radarEvents(prev: SnapItem[] | null | undefined, cur: SnapItem[]): RadarEvent[] {
  if (!prev?.length) return [];
  const before = new Map(prev.map((i) => [i.t, i]));
  const out: RadarEvent[] = [];
  for (const now of cur) {
    const was = before.get(now.t);
    if (!was) continue;
    // Đổi bộ tiêu chí (cv) giữa hai ảnh chụp: điểm không so sánh được -> bỏ sự kiện vào/ra Core và ±2 tiêu chí (tránh "rời Core" giả).
    const sameCriteria = (was.cv ?? 1) === (now.cv ?? 1);
    const inCore = now.s >= CORE_MIN, wasCore = was.s >= CORE_MIN;
    if (!sameCriteria) { /* bỏ qua so sánh điểm */ }
    else if (inCore && !wasCore) out.push({ kind: "enter_core", ticker: now.t, from: was.s, to: now.s, tone: "up", text: `${now.t} vào Core (${was.s}/6 → ${now.s}/6)` });
    else if (!inCore && wasCore) out.push({ kind: "leave_core", ticker: now.t, from: was.s, to: now.s, tone: "down", text: `${now.t} rời Core (${was.s}/6 → ${now.s}/6)` });
    else if (now.s - was.s >= 2) out.push({ kind: "score_up", ticker: now.t, from: was.s, to: now.s, tone: "up", text: `${now.t} tăng ${now.s - was.s} tiêu chí (${was.s}/6 → ${now.s}/6)` });
    else if (was.s - now.s >= 2) out.push({ kind: "score_down", ticker: now.t, from: was.s, to: now.s, tone: "down", text: `${now.t} giảm ${was.s - now.s} tiêu chí (${was.s}/6 → ${now.s}/6)` });
    if (now.sg !== undefined && was.sg !== undefined && now.sg !== 0 && now.sg !== was.sg) {
      out.push({ kind: "stealth_on", ticker: now.t, from: was.s, to: now.s, tone: now.sg > 0 ? "up" : "down",
        text: `${now.t} bật ◆ Stealth 20: ${now.sg > 0 ? "tích luỹ" : "phân phối"} âm thầm` });
    }
    if (now.st !== was.st && now.st === "caution") out.push({ kind: "turn_caution", ticker: now.t, from: was.s, to: now.s, tone: "down", text: `${now.t} chuyển sang ⚠ cảnh báo (Down-Trend / F-Score thấp)` });
    else if (now.st !== was.st && now.st === "breakout") out.push({ kind: "turn_breakout", ticker: now.t, from: was.s, to: now.s, tone: "up", text: `${now.t} chuyển sang ⚡ bứt phá` });
  }
  return out.sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.ticker.localeCompare(b.ticker));
}

/** Ảnh chụp gần nhất TRƯỚC ngày `date` (để so sánh). */
export function previousSnapshot(history: RadarSnapshot[], date: string): RadarSnapshot | null {
  let best: RadarSnapshot | null = null;
  for (const s of history) if (s.date < date && (!best || s.date > best.date)) best = s;
  return best;
}

/** Điểm hội tụ của từng mã trong `n` ảnh chụp gần nhất trước `date` (cũ → mới), cho vệt chuyển động. */
/** `cv`: chỉ lấy điểm cùng phiên bản bộ tiêu chí (vệt không nối qua mốc đổi tiêu chí). */
export function scoreTrails(history: RadarSnapshot[], date: string, n = 5, cv?: number): Map<string, number[]> {
  const past = history.filter((s) => s.date < date).sort((a, b) => a.date.localeCompare(b.date)).slice(-n);
  const out = new Map<string, number[]>();
  for (const snap of past) for (const i of snap.items) {
    if (cv !== undefined && (i.cv ?? 1) !== cv) continue;
    const arr = out.get(i.t) ?? [];
    arr.push(i.s);
    out.set(i.t, arr);
  }
  return out;
}

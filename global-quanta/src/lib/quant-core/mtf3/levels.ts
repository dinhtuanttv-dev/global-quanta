// @gq/quant-core · MTF v3 · S4 — mức hỗ trợ / kháng cự ngang từ đỉnh–đáy sóng của Ngày, Tuần, Tháng (K7, K9: đường "ai cũng thấy",
// khung lớn mạnh hơn, chuyển đổi hỗ trợ ↔ kháng cự). Gom cụm theo ATR ngày; sức mạnh = Σ (số lần chạm × trọng số khung M 3 · W 2 · D 1).
// Chỉ dùng sóng đã xác nhận tại t và kỳ tuần / tháng đã đóng.
import type { Analysis3, Frame3 } from "./frame";

export const LEVELS = { tolAtr: 0.6, weight: { D: 1, W: 2, M: 3 } as const, maxLevels: 8, lookbackD: 500 } as const;

export interface Level3 {
  price: number; lo: number; hi: number;
  strength: number; touches: number; frames: ("D" | "W" | "M")[];
  role: "support" | "resistance";
  /** Từng là kháng cự (chạm bằng đỉnh) nay nằm dưới giá, hoặc ngược lại — "chuyển đổi hỗ trợ ↔ kháng cự". */
  flipped: boolean;
  lastTouch: string;
}

interface Pt { price: number; kind: "H" | "L"; tf: "D" | "W" | "M"; date: string }

function points(f: Frame3, upTo: number, fromDate: string | null): Pt[] {
  const out: Pt[] = [];
  for (const s of f.minor) {
    if (s.confirmedIndex > upTo) continue;
    const date = f.r.bars[s.index].date;
    if (fromDate && date < fromDate) continue;
    out.push({ price: s.price, kind: s.kind, tf: f.tf, date });
  }
  return out;
}

/** Mức giá tại nến ngày t (đã sắp xếp theo sức mạnh, tối đa 8 mức). */
export function levelsAt(a: Analysis3, t: number): Level3[] {
  const D = a.D, atr = D.r.atr[t], close = D.r.bars[t].close;
  if (!(atr > 0)) return [];
  const fromD = D.r.bars[Math.max(0, t - LEVELS.lookbackD)].date;
  const wi = a.ribbon.wIdx[t] ?? -1, mi = a.ribbon.mIdx[t] ?? -1;
  const pts = [
    ...points(D, t, fromD),
    ...(wi >= 0 ? points(a.W, wi, null) : []),
    ...(mi >= 0 ? points(a.M, mi, null) : []),
  ].sort((x, y) => x.price - y.price);
  // gom cụm tham lam theo khoảng cách ≤ tolAtr × ATR ngày so với tâm cụm
  const tol = LEVELS.tolAtr * atr, clusters: Pt[][] = [];
  for (const p of pts) {
    const c = clusters[clusters.length - 1];
    if (c && Math.abs(p.price - avg(c.map((x) => x.price))) <= tol) c.push(p); else clusters.push([p]);
  }
  const out: Level3[] = [];
  for (const c of clusters) {
    // một khung chạm nhiều lần trong cùng cụm vẫn tính từng lần; cần ≥ 2 lần chạm, hoặc 1 lần ở khung tháng
    const strength = c.reduce((s, p) => s + LEVELS.weight[p.tf], 0);
    if (c.length < 2 && !c.some((p) => p.tf === "M")) continue;
    const price = avg(c.map((p) => p.price)), role = price < close ? "support" : "resistance";
    const highs = c.filter((p) => p.kind === "H").length, lows = c.length - highs;
    const flipped = (role === "support" && highs > 0 && highs >= lows) || (role === "resistance" && lows > 0 && lows >= highs);
    out.push({
      price: r2(price), lo: r2(Math.min(...c.map((p) => p.price))), hi: r2(Math.max(...c.map((p) => p.price))), strength, touches: c.length,
      frames: [...new Set(c.map((p) => p.tf))].sort() as Level3["frames"], role, flipped, lastTouch: c.map((p) => p.date).sort().pop()!,
    });
  }
  return out.sort((x, y) => y.strength - x.strength).slice(0, LEVELS.maxLevels).sort((x, y) => y.price - x.price);
}

/** Kháng cự gần nhất của khung Tuần / Tháng phía trên giá trong khoảng `atrs` × ATR ngày (cổng cấm vào (b) của MTF-v3-prereg). */
export function htfResistanceNear(levels: Level3[], close: number, atr: number, atrs = 1): Level3 | null {
  return levels.filter((l) => l.role === "resistance" && (l.frames.includes("W") || l.frames.includes("M")) && l.touches >= 2 && l.lo > close && l.lo <= close + atrs * atr)
    .sort((x, y) => x.lo - y.lo)[0] ?? null;
}

const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const r2 = (x: number) => Math.round(x * 100) / 100;

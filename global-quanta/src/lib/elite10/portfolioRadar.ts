// RADAR DANH MỤC ELITE 10 (30/10/2026) — logic thuần cho bảng xếp hạng 2D + canvas của "Danh mục Elite 10":
//   • Hạng = hạng Điểm Elite (Z) TOÀN VŨ TRỤ của phiên quyết định (1 = cao nhất) — vị trí đầu tiên luôn là hạng cao nhất.
//   • Lên / xuống hạng so phiên quyết định trước (lịch sử gọn /api/elite/rank-history), MỚI vào / RA khỏi danh mục.
//   • Vệt Z 5 phiên (như vệt điểm hội tụ của Elite Command Radar).
//   • Chế độ "Trực tiếp": tự xếp lại theo lợi suất VƯỢT VN-Index từ giá lúc dựng tới giá khớp hiện tại (luồng SSI) — chỉ để theo dõi,
//     hạng Elite chính thức chỉ đổi khi dựng phiên mới.
import type { PortfolioPick } from "./decisionTypes";

export interface RankSession { date: string; portfolio: { ticker: string; rank: number | null; Z: number | null; weight: number | null; retained: boolean }[]; ranks: Record<string, { rank: number | null; Z: number | null }> }
export interface RankHistory { dates: string[]; sessions: RankSession[] }
export type SortMode = "rank" | "live" | "prob" | "weight";

export interface RankMove { prevRank: number | null; delta: number | null; isNew: boolean }
/** Thay đổi hạng (vũ trụ) so phiên quyết định liền trước `date`. delta > 0 = LÊN hạng. */
export function rankMoves(history: RankHistory | null, date: string, picks: { ticker: string; rank: number }[]): Map<string, RankMove> {
  const out = new Map<string, RankMove>();
  const prev = history ? [...history.sessions].filter((s) => s.date < date).sort((a, b) => a.date.localeCompare(b.date)).pop() ?? null : null;
  for (const p of picks) {
    const pr = prev?.ranks[p.ticker]?.rank ?? null;
    out.set(p.ticker, { prevRank: pr, delta: pr != null && p.rank != null ? pr - p.rank : null, isNew: prev ? !prev.portfolio.some((x) => x.ticker === p.ticker) : false });
  }
  return out;
}

/** Z của `n` phiên trước `date` (cũ -> mới) cho từng mã — vệt trên rãnh Z. */
export function zTrails(history: RankHistory | null, date: string, tickers: string[], n = 5): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const past = history ? [...history.sessions].filter((s) => s.date < date).sort((a, b) => a.date.localeCompare(b.date)).slice(-n) : [];
  for (const t of tickers) {
    const zs = past.map((s) => s.ranks[t]?.Z).filter((z): z is number => z != null && Number.isFinite(z));
    if (zs.length) out.set(t, zs);
  }
  return out;
}

export interface PortfolioEvent { kind: "enter" | "leave" | "rank_up" | "rank_down"; ticker: string; text: string; tone: "up" | "down" | "info" }
/** Sự kiện danh mục so phiên trước: vào / ra danh mục, lên / xuống ≥ 3 hạng. */
export function portfolioEvents(history: RankHistory | null, date: string, picks: { ticker: string; rank: number }[], minMove = 3): PortfolioEvent[] {
  if (!history) return [];
  const sorted = [...history.sessions].sort((a, b) => a.date.localeCompare(b.date));
  const prev = sorted.filter((s) => s.date < date).pop();
  if (!prev) return [];
  const cur = new Set(picks.map((p) => p.ticker));
  const curSession = sorted.find((s) => s.date === date);
  const ev: PortfolioEvent[] = [];
  for (const p of picks) {
    const was = prev.portfolio.find((x) => x.ticker === p.ticker);
    const pr = prev.ranks[p.ticker]?.rank ?? null;
    if (!was) ev.push({ kind: "enter", ticker: p.ticker, text: `${p.ticker} vào danh mục (hạng ${p.rank}${pr != null ? `, trước #${pr}` : ""})`, tone: "up" });
    else if (pr != null && pr - p.rank >= minMove) ev.push({ kind: "rank_up", ticker: p.ticker, text: `${p.ticker} lên ${pr - p.rank} hạng (#${pr} → #${p.rank})`, tone: "up" });
    else if (pr != null && p.rank - pr >= minMove) ev.push({ kind: "rank_down", ticker: p.ticker, text: `${p.ticker} xuống ${p.rank - pr} hạng (#${pr} → #${p.rank})`, tone: "down" });
  }
  for (const x of prev.portfolio) if (!cur.has(x.ticker)) {
    const now = curSession?.ranks[x.ticker]?.rank ?? null;
    ev.push({ kind: "leave", ticker: x.ticker, text: `${x.ticker} ra khỏi danh mục${now != null ? ` (nay hạng #${now})` : ""}`, tone: "down" });
  }
  const order = { enter: 0, leave: 1, rank_up: 2, rank_down: 3 };
  return ev.sort((a, b) => order[a.kind] - order[b.kind] || a.ticker.localeCompare(b.ticker));
}

/** Lợi suất VƯỢT VN-Index từ giá lúc dựng: (P/P0) / (I/I0) − 1. Thiếu dữ liệu -> null. */
export function liveExcess(close0: number | null | undefined, price: number | null | undefined, idx0: number | null | undefined, idxNow: number | null | undefined): number | null {
  if (!(Number(close0) > 0) || !(Number(price) > 0)) return null;
  const r = Number(price) / Number(close0);
  return Number(idx0) > 0 && Number(idxNow) > 0 ? r / (Number(idxNow) / Number(idx0)) - 1 : r - 1;
}

/** Thứ tự hàng theo chế độ. Hạng Elite: hạng vũ trụ tăng dần (1 trước). Trực tiếp: vượt VN-Index giảm dần (thiếu số -> cuối, giữ hạng). */
export function sortPicks<T extends Pick<PortfolioPick, "ticker" | "rank" | "pOutperform" | "weight">>(picks: T[], mode: SortMode, live: Map<string, number | null> = new Map()): T[] {
  const byRank = (a: T, b: T) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.ticker.localeCompare(b.ticker);
  const arr = [...picks];
  if (mode === "rank") return arr.sort(byRank);
  if (mode === "prob") return arr.sort((a, b) => b.pOutperform - a.pOutperform || byRank(a, b));
  if (mode === "weight") return arr.sort((a, b) => b.weight - a.weight || byRank(a, b));
  return arr.sort((a, b) => {
    const x = live.get(a.ticker), y = live.get(b.ticker);
    if (x == null && y == null) return byRank(a, b);
    if (x == null) return 1;
    if (y == null) return -1;
    return y - x || byRank(a, b);
  });
}

/** Vị trí giá hiện tại trong dải cắt lỗ → mục tiêu (0 = cắt lỗ, 1 = mục tiêu; có thể < 0 / > 1). */
export function stopTargetPosition(price: number | null | undefined, stop: number, target: number): number | null {
  if (!(Number(price) > 0) || !(target > stop)) return null;
  return (Number(price) - stop) / (target - stop);
}

/**
 * R4 (06/11/2026): bố cục radar danh mục theo BỀ RỘNG THẬT của khung (không theo màn hình) để không phải cuộn ngang ở màn 1366–1440.
 *   ≥ 1000px: đủ cột · 882–999px: bỏ cột "Động lực chính" (đưa vào dòng phụ dưới mã), GIỮ cột P vượt · < 882px hoặc người dùng
 *   chọn Gọn: chế độ gọn. Rãnh Z và dải vùng mua co giãn trong [140, 230] và [170, 270] px.
 */
export const RADAR_GAP = 8;
export function radarLayout(availW: number, compactPref: boolean) {
  const FULL_MIN = 1000, MEDIUM_MIN = 882;
  const dense = compactPref || availW < MEDIUM_MIN;
  const showDrivers = !dense && availW >= FULL_MIN;
  const fixed = dense ? [64, 92, 78, 112, 96] : showDrivers ? [64, 92, 78, 112, 74, 96, 110] : [64, 92, 78, 112, 74, 96];
  const nCols = fixed.length + 2;
  const flex = Math.max(0, availW - fixed.reduce((a, b) => a + b, 0) - (nCols - 1) * RADAR_GAP);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.floor(v)));
  const trackW = clamp(flex * 0.46, 140, 230);
  const laneW = clamp(flex - trackW, 170, 270);
  const cols = dense
    ? `64px 92px ${trackW}px 78px ${laneW}px 112px 96px`
    : `64px 92px ${trackW}px 78px ${laneW}px 112px 74px 96px${showDrivers ? " minmax(110px,1fr)" : ""}`;
  const minWidth = fixed.reduce((a, b) => a + b, 0) + trackW + laneW + (nCols - 1) * RADAR_GAP;
  return { dense, showDrivers, trackW, laneW, cols, minWidth };
}

/** R4: "Hôm nay đổi gì và vì sao" — so danh mục phiên d với phiên quyết định liền trước (lịch sử hạng gọn). */
export interface DiffItem { ticker: string; rank: number | null; reasonVi: string }
export interface PortfolioDiff { prevDate: string | null; added: DiffItem[]; removed: DiffItem[]; kept: number }
type DiffScore = { ticker: string; rank: number; Z: number; eligible: boolean; reason: string | null; rrgPenalty?: boolean };
type DiffDecision = { date: string; portfolio: { ticker: string; rank: number; Z: number; retained?: boolean; rrgPenalty?: boolean }[]; scores: DiffScore[]; candidates?: { ticker: string; reason: string }[] };
export function portfolioDiff(history: RankHistory | null, d: DiffDecision, bufferRank = 20): PortfolioDiff {
  const prev = history ? [...history.sessions].filter((s) => s.date < d.date).sort((a, b) => a.date.localeCompare(b.date)).pop() ?? null : null;
  if (!prev) return { prevDate: null, added: [], removed: [], kept: 0 };
  const before = new Set(prev.portfolio.map((p) => p.ticker));
  const now = new Set(d.portfolio.map((p) => p.ticker));
  const score = new Map(d.scores.map((s) => [s.ticker, s]));
  const cand = new Map((d.candidates ?? []).map((c) => [c.ticker, c.reason]));
  const fz = (z: number) => z.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const added = d.portfolio.filter((p) => !before.has(p.ticker)).map((p) => ({
    ticker: p.ticker, rank: p.rank,
    reasonVi: `vào vì hạng ${p.rank} toàn vũ trụ (Z ${fz(p.Z)})${p.rrgPenalty ? ", dù ngành Tụt hậu bị trừ 30% Z" : ""}`,
  }));
  const removed = prev.portfolio.filter((p) => !now.has(p.ticker)).map((p) => {
    const s = score.get(p.ticker);
    let reasonVi: string;
    if (!s) reasonVi = "không còn trong bảng tín hiệu phiên này";
    else if (!s.eligible) reasonVi = `không còn đủ điều kiện${s.reason ? ` (${s.reason})` : ""}`;
    else if (s.rrgPenalty && s.rank > bufferRank) reasonVi = `ngành Tụt hậu (Z trừ 30%), rơi xuống hạng ${s.rank}`;
    else if (s.rank > bufferRank) reasonVi = `rơi khỏi vùng đệm top ${bufferRank} (hạng ${s.rank})`;
    else if (cand.get(p.ticker) === "sector_cap") reasonVi = `ngành đã đủ 3 mã có Z cao hơn (hạng ${s.rank})`;
    else reasonVi = `bị mã có Z cao hơn thay chỗ (hạng ${s.rank})`;
    return { ticker: p.ticker, rank: s?.rank ?? null, reasonVi };
  });
  return { prevDate: prev.date, added, removed, kept: d.portfolio.filter((p) => before.has(p.ticker)).length };
}

/** Hàm phân phối chuẩn (Abramowitz–Stegun 7.1.26, sai số < 1,5e-7). */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}
/**
 * R4: khoảng 95% của xác suất vượt trung vị vũ trụ, từ sai số IC đo được ngoài mẫu (E7 hồi cứu: IC trung bình và t Newey–West).
 * P = Φ(IC·Z / √(1 − IC²)); khoảng = P tại IC ± 1,96·(IC / t). Thiếu dữ liệu -> null.
 */
export function pOutperformRange(z: number, ic: number | null | undefined, t: number | null | undefined): [number, number] | null {
  if (ic == null || t == null || !Number.isFinite(ic) || !Number.isFinite(t) || t === 0 || !Number.isFinite(z)) return null;
  const se = Math.abs(ic / t);
  const p = (c: number) => normCdf((c * z) / Math.sqrt(Math.max(1e-9, 1 - c * c)));
  const a = p(ic - 1.96 * se), b = p(ic + 1.96 * se);
  return [Math.min(a, b), Math.max(a, b)];
}

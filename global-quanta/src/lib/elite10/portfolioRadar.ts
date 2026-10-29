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

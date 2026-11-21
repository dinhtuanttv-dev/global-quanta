// Mạng tri thức (L2): thực thể CHỈ lấy từ dữ liệu công cụ có cấu trúc — không dò chữ trong câu trả lời của AI.
// Allowlist trường theo đặc tả 01 §2: elite_decision, elite_ticker; công cụ khác chỉ dùng tên + trạng thái.
import type { LaneLike, ToolRunLike } from "./types";

const TICKER = /^[A-Z0-9]{3,10}$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const obj = (x: unknown): Record<string, unknown> | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
const str = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x.trim() : null);
const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

/** Tên nút Obsidian an toàn: bỏ ký tự phá cú pháp liên kết. */
export const safeNodeName = (s: string) => s.replace(/[[\]|#^\\]/g, " ").replace(/\s{2,}/g, " ").trim();

export interface PortfolioRow { ticker: string; sectorIcb: string | null; weightPct: number | null; hlRank: number | null; lsPercentile: number | null; sectorRrg: string | null; close: number | null; returnSinceEntryPct: number | null }
export interface DecisionSummary { date: string | null; portfolioKind: string | null; cashPct: number | null; rows: PortfolioRow[] }
export interface TickerSummary { ticker: string; date: string | null; icb: { l1: string | null; l2: string | null; l3: string | null }; rank: number | null; inPortfolio: boolean | null }

export function decisionSummary(data: unknown): DecisionSummary | null {
  const d = obj(data); if (!d) return null;
  const hl = obj(d.hl);
  const rows = Array.isArray(d.portfolio) ? d.portfolio.map(obj).filter((r): r is Record<string, unknown> => Boolean(r && str(r.ticker))).slice(0, 20).map((r) => ({
    ticker: str(r.ticker)!, sectorIcb: str(r.sectorIcb), weightPct: num(r.weightPct), hlRank: num(r.hlRank), lsPercentile: num(r.lsPercentile),
    sectorRrg: str(r.sectorRrg), close: num(r.close), returnSinceEntryPct: num(r.returnSinceEntryPct),
  })) : [];
  const date = str(d.date);
  return { date: date && ISO.test(date) ? date : null, portfolioKind: str(d.portfolioKind), cashPct: num(hl?.cashPct), rows };
}
export function tickerSummary(data: unknown): TickerSummary | null {
  const d = obj(data); const t = str(d?.ticker);
  if (!d || !t || !TICKER.test(t)) return null;
  const icb = obj(d.icb), e = obj(d.elite), date = str(d.date);
  return { ticker: t, date: date && ISO.test(date) ? date : null, icb: { l1: str(icb?.l1), l2: str(icb?.l2), l3: str(icb?.l3) }, rank: num(e?.rank), inPortfolio: typeof e?.inPortfolio === "boolean" ? e.inPortfolio : null };
}

export interface Evidence {
  tools: { lane: string; tool: ToolRunLike }[];
  decision: DecisionSummary | null;
  tickers: Map<string, TickerSummary>;
  dataAsOf: string | null;
  topics: Set<"macro" | "world" | "worldSectors" | "catalyst">;
}
/** Gom bằng chứng từ các làn (theo thứ tự truyền vào: kết quả sau ghi đè kết quả trước cho cùng mã). */
export function collectEvidence(lanes: [string, LaneLike | null | undefined][]): Evidence {
  const ev: Evidence = { tools: [], decision: null, tickers: new Map(), dataAsOf: null, topics: new Set() };
  const dates: string[] = [];
  for (const [label, lane] of lanes) {
    for (const t of lane?.tools ?? []) {
      ev.tools.push({ lane: label, tool: t });
      if (/^macro_/.test(t.name)) ev.topics.add("macro");
      else if (/^world_/.test(t.name)) ev.topics.add("world");
      else if (/^ws_/.test(t.name)) ev.topics.add("worldSectors");
      else if (/^catalyst_/.test(t.name)) ev.topics.add("catalyst");
      if (!t.result?.ok) continue;
      if (t.name === "elite_decision") { const s = decisionSummary(t.result.data); if (s) { ev.decision = s; if (s.date) dates.push(s.date); } }
      if (t.name === "elite_ticker") { const s = tickerSummary(t.result.data); if (s) { ev.tickers.set(s.ticker, s); if (s.date) dates.push(s.date); } }
    }
  }
  ev.dataAsOf = dates.length ? dates.sort()[dates.length - 1] : null;
  return ev;
}

/** Mã ngành cụ thể nhất của một mã đã xác nhận (l3 -> l2 -> l1), hoặc từ dòng danh mục. */
export function sectorOf(ev: Evidence, ticker: string | null): string | null {
  if (!ticker) return null;
  const t = ev.tickers.get(ticker);
  if (t) return t.icb.l3 ?? t.icb.l2 ?? t.icb.l1;
  return ev.decision?.rows.find((r) => r.ticker === ticker)?.sectorIcb ?? null;
}
/** Mã được công cụ xác nhận: elite_ticker trả ok cho đúng mã, hoặc mã nằm trong danh mục của elite_decision. */
export function confirmedTicker(ev: Evidence, subject: string | null): string | null {
  if (!subject) return null;
  const s = subject.trim().toUpperCase();
  return ev.tickers.has(s) || ev.decision?.rows.some((r) => r.ticker === s) ? s : null;
}

export const sectorNode = (code: string, names?: Record<string, string>) => safeNodeName(names?.[code] ? `ICB ${code} · ${names[code]}` : `ICB ${code}`);
const TOPIC_NODE = { macro: "Vĩ mô Việt Nam", world: "Kinh tế thế giới", worldSectors: "Ngành thế giới", catalyst: "Chất xúc tác" } as const;

/** Danh sách liên kết (đã sắp, không trùng) cho mục "Liên kết". */
export function linksFor(ev: Evidence, ticker: string | null, names?: Record<string, string>, extra: string[] = []): string[] {
  const out: string[] = [];
  if (ticker) out.push(ticker);
  else for (const r of ev.decision?.rows ?? []) out.push(r.ticker);
  const sectors = new Set<string>();
  const sec = sectorOf(ev, ticker); if (sec) sectors.add(sec);
  if (!ticker) for (const r of ev.decision?.rows ?? []) if (r.sectorIcb) sectors.add(r.sectorIcb);
  for (const s of [...sectors].sort()) out.push(sectorNode(s, names));
  for (const k of ["macro", "world", "worldSectors", "catalyst"] as const) if (ev.topics.has(k)) out.push(TOPIC_NODE[k]);
  out.push(...extra);
  return [...new Set(out.map(safeNodeName).filter(Boolean))];
}

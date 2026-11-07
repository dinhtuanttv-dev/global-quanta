// TO-v1 (07/11/2026) — "Săn cổ tức trước GDKHQ": kiểu dữ liệu Gateway /api/corp-events/to* + định dạng dùng chung.
export interface ToStats { n: number; mean: number | null; ci95: [number | null, number | null]; hit: number | null }
export interface ToRadarRow {
  t: string; name: string | null; sector: string | null; ex: string; disclosed: string; check: string | null; cash: number;
  yieldPre: number; bucket: "<3%" | "3–5%" | "≥5%"; yieldNow: number | null; lastPrice: number | null; lastPriceDate: string | null;
  adv: number | null; liquidityOk: boolean; entryDate: string | null; limitUpEntry: boolean | null; qualifies: boolean; sessionsSinceAnn: number;
  runUp: number | null; runUpPct: number | null; runUpShareOfTypical: number | null;
  buyDate: string; lastCumDate: string | null; sessionsLeft: number | null; t2Ok: boolean; expected: ToStats | null; weakSector: boolean; label: string;
}
export interface ToRunUpPoint { k: number; n: number; p25: number; p50: number; p75: number; p90: number }
export interface ToLedgerEntry { id: string; t: string; sector: string | null; disclosed: string; cash: number; y: number; adv: number | null; entryDate: string; ex: string; status: "OPEN" | "DONE" | "VOID"; result: { exitDate: string; excess: number; abs: number } | null }
export interface ToLedger {
  registered: string; start: string; label: string; nextLook: number | null; looks: { n: number; at: string; mean: number | null; lower975: number | null; pass: boolean }[];
  counts: { open: number; done: number; void: number }; stats: ToStats;
  cusum: { S: number | null; alarmed: boolean; h: number; k: number; mu0: number; sigma0: number; quarters: Record<string, { n: number; S: number }> };
  entries: ToLedgerEntry[];
}
export interface ToOverview {
  version: string; label: string; builtAt: string | null;
  rule: { minYield: number; minAdv: number; costBuy: number; costSell: number; minHold: number };
  r1: { start: string; mu0: number; sigma0: number; looks: number[] };
  reference: { byBucket: Record<string, ToStats>; rule: ToStats; byYear: Record<string, ToStats>; postEx?: Record<string, ToStats> | null; runUp: Record<string, { profile: ToRunUpPoint[]; fullMedian: number | null }>; weakSectors: string[]; sectors: Record<string, ToStats> } | null;
  radar: { asOf: string; priceAsOf: string | null; rows: ToRadarRow[] };
  ledger: ToLedger;
}
export interface ToSimResult { from: string; to?: string; trades: number; closed?: number; hit?: number | null; total?: number; vnTotal?: number; cagr?: number | null; maxDD?: number; vnMaxDD?: number; sharpe?: number | null; exposure?: number; curve: [string, number, number][]; recent?: { t: string; entryDate: string; exitDate: string; ret: number }[] }
export interface ToSim { history: ToSimResult | null; forward: ToSimResult }
export interface ToWindowStat { n: number; mean: number | null; hit: number | null; p: number | null; q: number | null }
export interface ToWindows {
  pooled: Record<string, ToStats & { label: string; knownAtEntry: number | null }>; significant: string[]; tests: number;
  ticker?: string; windows?: Record<string, ToWindowStat> | null;
}

/** % có dấu, 1–2 chữ số thập phân (kiểu Việt Nam). */
export const pctS = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? "—" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x * 100).toLocaleString("vi-VN", { maximumFractionDigits: d, minimumFractionDigits: d })}%`);
export const pct = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? "—" : `${(x * 100).toLocaleString("vi-VN", { maximumFractionDigits: d, minimumFractionDigits: d })}%`);
export const dm = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");
export const ciText = (s: ToStats | null | undefined) => (s?.ci95?.[0] == null ? "" : `[${pctS(s.ci95[0])}; ${pctS(s.ci95[1])}]`);
export const bil = (v: number | null | undefined) => (v == null ? "—" : `${(v / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỷ`);
/** Lợi suất theo giá khớp trực tiếp SSI (ĐỒNG, như useBoardQuotes) nếu có, ngược lại theo giá đóng cửa gần nhất của Gateway (nghìn đồng, đã tính sẵn). */
export const liveYield = (r: ToRadarRow, live?: number | null) => (live && live > 0 ? r.cash / live : r.yieldNow);
/** Thay đổi của giá trực tiếp (đồng) so với đóng cửa gần nhất của Gateway (nghìn đồng). */
export const liveChange = (r: ToRadarRow, live?: number | null) => (live && live > 0 && r.lastPrice ? live / (r.lastPrice * 1000) - 1 : null);
/** Elite × TO — lịch sử đợt cổ tức tiền của một mã (Gateway /api/corp-events/to/ticker/:t). */
export interface ToTickerEvent {
  ex: string; disclosed: string; cash: number; y: number; bucket: ToRadarRow["bucket"]; adv: number | null; entryDate: string | null; limitUp: boolean | null; qualifies: boolean;
  outcome: { exitDate: string; excess: number; abs: number } | null; postEx5: { date: string; excess: number } | null; runUp: number | null;
}
export interface ToTickerHistory { ticker: string; sector: string | null; events: ToTickerEvent[] }

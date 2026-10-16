// Nhịp đập thế giới (W6/W7, 2026-10-16): giá thị trường mới nhất từ Yahoo qua Gateway.
// Đây là MỘT nguồn cho DXY/VIX/US10Y/vàng/Brent/WTI và 10 chỉ số; MỖI con số kèm ngày phiên và nguồn.
// Nó thay cho luồng SSE của Project A (Prisma, có thể trễ hoặc hết quota), hoặc làm dự phòng khi luồng đó lỗi.
// Risk-On được tính lại theo cùng công thức nhưng gắn nhãn HEURISTIC_FAILED (RON-results.md).
import { riskOnBreakdown, riskOnIndex } from "../riskOnValidation/riskOnValidate.js";

export const PULSE_MACRO = {
  dxy: { symbol: "DX-Y.NYB", nameVi: "DXY" },
  vix: { symbol: "^VIX", nameVi: "VIX" },
  treasury_10y: { symbol: "^TNX", nameVi: "Lợi suất TPCP Mỹ 10 năm" },
  gold: { symbol: "GC=F", nameVi: "Vàng (HĐ tương lai COMEX kỳ gần)" },
  oil_brent: { symbol: "BZ=F", nameVi: "Brent (HĐ tương lai ICE kỳ gần)" },
  oil_wti: { symbol: "CL=F", nameVi: "WTI (HĐ tương lai NYMEX kỳ gần)" },
};
export const PULSE_MARKETS = [
  ["^GSPC", "S&P 500 (Mỹ)"], ["^DJI", "Dow Jones (Mỹ)"], ["^IXIC", "Nasdaq (Mỹ)"], ["^FTSE", "FTSE 100 (Anh)"], ["^GDAXI", "DAX (Đức)"],
  ["^N225", "Nikkei 225 (Nhật)"], ["^KS11", "KOSPI (Hàn Quốc)"], ["^HSI", "Hang Seng (Hồng Kông)"], ["000001.SS", "Shanghai (Trung Quốc)"], ["^STI", "STI (Singapore)"],
];
const TTL_MS = 5 * 60_000;
const UA = { "user-agent": "Mozilla/5.0 (compatible; GlobalQuanta/1.0)" };
const day = (s) => new Date(s * 1000).toISOString().slice(0, 10);

/** JSON chart Yahoo (interval 1d) -> { value, prevClose, changePct, date, time } của phiên mới nhất; null nếu không có giá. */
export function parseQuote(json) {
  const r = json?.chart?.result?.[0];
  if (!r) return null;
  const ts = r.timestamp ?? [], closes = r.indicators?.quote?.[0]?.close ?? [];
  const bars = ts.map((t, i) => ({ t, c: closes[i] })).filter((b) => Number.isFinite(b.c) && b.c > 0);
  // meta.regularMarketPrice có thể ĐỨNG YÊN nhiều năm (ví dụ TIO=F: meta 2021-08 trong khi nến ngày vẫn chạy đến hiện tại)
  // -> chỉ dùng meta khi nó KHÔNG cũ hơn nến cuối.
  const last = bars.at(-1);
  const metaOk = Number.isFinite(r.meta?.regularMarketPrice) && Number.isFinite(r.meta?.regularMarketTime) && (!last || r.meta.regularMarketTime >= last.t);
  const price = metaOk ? r.meta.regularMarketPrice : last?.c;
  const time = metaOk ? r.meta.regularMarketTime : last?.t;
  if (!Number.isFinite(price) || !Number.isFinite(time)) return null;
  // phiên trước = nến ngày gần nhất có NGÀY khác ngày của giá hiện tại
  const prev = [...bars].reverse().find((b) => day(b.t) < day(time))?.c ?? null;
  return { value: price, prevClose: prev, changePct: prev ? (price / prev - 1) * 100 : null, date: day(time), time: new Date(time * 1000).toISOString() };
}

export function createWorldPulse({ fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  let cache = null, inflight = null;
  async function quote(symbol) {
    const r = await fetchImpl(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=7d&interval=1d`, { headers: UA, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`Yahoo ${symbol} HTTP ${r.status}`);
    return parseQuote(await r.json());
  }
  async function build() {
    const jobs = [...Object.entries(PULSE_MACRO).map(([k, m]) => [k, m.symbol]), ...PULSE_MARKETS.map(([s]) => [s, s])];
    const q = Object.fromEntries(await Promise.all(jobs.map(async ([k, s]) => [k, await quote(s).catch(() => null)])));
    const quotes = {};
    for (const [k, m] of Object.entries(PULSE_MACRO)) if (q[k]) quotes[k] = { ...q[k], symbol: m.symbol, nameVi: m.nameVi, source: `Yahoo:${m.symbol}` };
    const v = (k) => quotes[k]?.value ?? null;
    let macro = null;
    if (v("dxy") != null && v("vix") != null && v("treasury_10y") != null) {
      const x = { dxy: v("dxy"), vix: v("vix"), treasury10y: v("treasury_10y") };
      const ro = riskOnIndex(x);
      macro = {
        dxy: v("dxy"), vix: v("vix"), treasury_10y: v("treasury_10y"), gold: v("gold"), oil_brent: v("oil_brent"), oil_wti: v("oil_wti"),
        risk_on_score: ro.score, risk_status: ro.status, breakdown: riskOnBreakdown(x), risk_on_evidence: "HEURISTIC_FAILED",
        fetched_at: new Date(now()).toISOString(), quotes,
      };
    }
    const markets = PULSE_MARKETS.filter(([s]) => q[s]).map(([s, name]) => ({
      id: s, symbol: s, name, market: name, value: q[s].value, change_percent: q[s].changePct ?? 0, date: q[s].date, fetched_at: q[s].time, source: `Yahoo:${s}`,
    }));
    const missing = [...Object.keys(PULSE_MACRO).filter((k) => !quotes[k]), ...PULSE_MARKETS.filter(([s]) => !q[s]).map(([s]) => s)];
    return { source: "gateway", macro, markets, timestamp: new Date(now()).toISOString(), missing };
  }
  return {
    async get() {
      if (cache && now() - cache.at < TTL_MS) return cache.value;
      inflight ??= build().then((value) => { cache = { at: now(), value }; return value; }).finally(() => { inflight = null; });
      return inflight;
    },
  };
}

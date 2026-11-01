// Dịch vụ MS-GARCH: chỉ tính khi có người bật lớp. Mỗi mã một lần cho mỗi phiên, tính lần lượt từng mã để không chiếm bộ nhớ và luồng chính của Gateway.
import { analyze, seedOf } from "./msGarch.js";

export const MS_GARCH_RULE = "MSG-r1";
export const WINDOW = 500;
export const HORIZON = 20;
export const N_SIMS = 2000;
const MIN_BARS = 260;
const MAX_CACHE = 80;
const MAX_COMPUTE_PER_MIN = 30;
const yieldLoop = () => new Promise((r) => setImmediate(r));

export class MsGarchBusyError extends Error {}

export function createMsGarchService({ getBars, now = Date.now, log = console } = {}) {
  const cache = new Map();
  const running = new Map();
  let queue = Promise.resolve(), stamps = [];

  async function compute(symbol, bars, date) {
    const t = now();
    stamps = stamps.filter((x) => t - x < 60_000);
    if (stamps.length >= MAX_COMPUTE_PER_MIN) throw new MsGarchBusyError("Đang tính nhiều mã, thử lại sau một phút.");
    stamps.push(t);
    await yieldLoop();
    const closes = bars.slice(-(WINDOW + 1)).map((b) => b.close);
    const r = analyze(closes, { horizon: HORIZON, nSims: N_SIMS, seed: seedOf(`${symbol}|${date}`) });
    return r && { symbol, asOf: date, lastClose: closes[closes.length - 1], rule: MS_GARCH_RULE, grade: "C", horizon: HORIZON, nSims: N_SIMS, sessions: closes.length - 1, ...r };
  }

  return {
    async get(symbol) {
      const bars = (await getBars(symbol)).filter((b) => b.close > 0 && !b.partial);
      if (bars.length < MIN_BARS) return { symbol, available: false, reason: `Cần ít nhất ${MIN_BARS} phiên, hiện có ${bars.length}.` };
      const date = String(bars[bars.length - 1].date).slice(0, 10), key = `${symbol}|${date}`;
      if (cache.has(key)) return cache.get(key);
      if (running.has(key)) return running.get(key);
      const job = queue.then(() => compute(symbol, bars, date));
      queue = job.catch(() => {});
      const p = job.then((r) => {
        const doc = r ? { available: true, ...r } : { symbol, available: false, reason: "Không ước lượng được với chuỗi giá này." };
        cache.set(key, doc);
        if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
        return doc;
      }).finally(() => running.delete(key));
      running.set(key, p);
      return p;
    },
    log,
  };
}

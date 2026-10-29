// MV1 (29/10/2026) — Mùa vụ tháng "5 năm gần nhất" cho cả universe (hàm thuần, không I/O). Dùng chung cho MÃ và cho NGÀNH (chỉ số
// ngành coi như một "mã", sectorOf = null -> prior toàn bộ ngành).
//   Mỗi ô (mã, tháng): n/5 năm · lợi suất (TB, trung vị, min/max, tháng dương x/n + Wilson 90%) · vượt VN-Index (như trên) ·
//   excess ĐÃ CO về TB ngành cùng tháng (bỏ chính mã) · xác suất hậu nghiệm P(vượt VN-Index sau phí 0,40% > 0) = Beta(α₀+thắng, β₀+thua),
//   prior mô-men từ tỷ lệ thắng của các mã KHÁC cùng ngành × tháng (cùng hàm Project A dùng cho cổ tức).
//   Mỗi mã: độ mạnh mùa vụ (hoán vị nhãn tháng trong từng năm) + q-value BH-FDR toàn universe.
// KHÔNG gộp với xác suất cổ tức / KQKD / DecisionBar — mỗi nguồn một xác suất riêng.
import { SEAS } from "./config.js";
import { describe, monthlyReturns } from "./monthly.js";
import { benjaminiHochberg, seasonalStrength, seedOf, strengthLabel } from "./strength.js";
import { betaBinomialPosterior, estimatePriorFromRates } from "./betaBinomial.js";

const ym = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Kỳ mẫu: 5 năm dương lịch hoàn tất trước năm của asOf. */
export function sampleYears(asOf, years = SEAS.years) {
  const y1 = Number(String(asOf).slice(0, 4)) - 1;
  return Array.from({ length: years }, (_, i) => y1 - years + 1 + i);
}

/** Dữ liệu thô của một chuỗi: excess theo (năm, tháng) + năm nay + MTD. */
export function seriesMonths(bars, benchReturns, { asOf, years }) {
  const { returns, mtd, firstDate, lastDate } = monthlyReturns(bars, { asOf });
  const cells = Array.from({ length: 12 }, () => ({ years: [], r: [], ex: [] }));
  const rows = [];
  for (const y of years) {
    const row = new Array(12).fill(null);
    for (let m = 0; m < 12; m++) {
      const r = returns.get(ym(y, m)), rb = benchReturns.get(ym(y, m));
      if (r == null) continue;
      cells[m].years.push(y); cells[m].r.push(r);
      const ex = rb == null ? null : r - rb;
      cells[m].ex.push(ex);
      row[m] = ex;
    }
    rows.push(row);
  }
  const thisYear = Number(String(asOf).slice(0, 4));
  const current = [];
  for (let m = 0; m < 12; m++) {
    const r = returns.get(ym(thisYear, m));
    if (r != null) current.push({ month: m + 1, r, excess: benchReturns.has(ym(thisYear, m)) ? r - benchReturns.get(ym(thisYear, m)) : null });
  }
  const benchMtd = mtd && benchReturns.mtd?.ym === mtd.ym ? benchReturns.mtd.r : null;
  return { cells, rows, current, mtd: mtd ? { ...mtd, excess: benchMtd == null ? null : mtd.r - benchMtd } : null, firstDate, lastDate };
}

/** Phương sai trong-tháng gộp của một chuỗi (Σ (x − TB_tháng)² / (N − số tháng)); thiếu bậc tự do -> null. */
function pooledWithinVar(cells) {
  let ss = 0, N = 0, M = 0;
  for (const c of cells) {
    const xs = c.ex.filter((v) => v != null);
    if (!xs.length) continue;
    const mu = mean(xs);
    for (const x of xs) ss += (x - mu) ** 2;
    N += xs.length; M++;
  }
  return N - M > 0 ? ss / (N - M) : null;
}

/**
 * @param {{ seriesOf: Map<string, {date, close}[]>, benchBars: {date, close}[], sectorOf?: Map<string, string|null>|null, asOf: string,
 *           cfg?: typeof SEAS }} input
 */
export function analyzeSeasonality({ seriesOf, benchBars, sectorOf = null, asOf, cfg = SEAS }) {
  const years = sampleYears(asOf, cfg.years);
  const bench = monthlyReturns(benchBars, { asOf });
  const benchReturns = Object.assign(bench.returns, { mtd: bench.mtd });
  const items = [];
  for (const [ticker, bars] of seriesOf) {
    const d = seriesMonths(bars, benchReturns, { asOf, years });
    const raw = d.cells.map((c) => {
      const ex = c.ex.filter((v) => v != null);
      const wins = ex.filter((v) => v - cfg.roundTripCost > 0).length;
      return { n: c.r.length, years: c.years, ret: describe(c.r), excess: describe(ex), wins, losses: ex.length - wins, exMean: mean(ex), exN: ex.length };
    });
    items.push({ ticker, sector: sectorOf?.get(ticker) ?? null, d, raw, withinVar: pooledWithinVar(d.cells) });
  }

  // Phương sai trong-tháng điển hình (trung vị) cho chuỗi thiếu bậc tự do.
  const wv = items.map((i) => i.withinVar).filter((v) => v != null).sort((a, b) => a - b);
  const typicalWithin = wv.length ? wv[Math.floor(wv.length / 2)] : 0.01;

  const bySector = new Map();
  for (const it of items) { const k = it.sector ?? "__all"; if (!bySector.has(k)) bySector.set(k, []); bySector.get(k).push(it); }

  /** Nhóm so sánh (bỏ chính mã): cùng ngành nếu đủ ≥ minSectorPeers mã có dữ liệu tháng đó, ngược lại toàn universe. */
  function peersFor(it, m) {
    const has = (p) => p !== it && p.raw[m].exN > 0;
    const sec = it.sector ? (bySector.get(it.sector) ?? []).filter(has) : [];
    if (sec.length >= cfg.minSectorPeers) return { scope: "SECTOR", peers: sec };
    return { scope: "UNIVERSE", peers: items.filter(has) };
  }

  const out = items.map((it) => {
    const within = it.withinVar ?? typicalWithin;
    const months = it.raw.map((c, m) => {
      const { scope, peers } = peersFor(it, m);
      // SEAS-v1.1 (29/10/2026): đích co = TB của CẢ NHÓM, GỒM chính mã (James–Stein chuẩn: cùng một đích cho mọi mã trong nhóm).
      // v1 co về TB các mã KHÁC (bỏ chính mã): khi co gần toàn phần (n 3–5 năm), dự báo ≈ (tổng − x_i)/(n−1) — NGƯỢC HẠNG với chính
      // lịch sử của mã -> dự báo đảo dấu (kiểm định SEAS-prereg-v1 vô hiệu). Prior Beta (xác suất) vẫn bỏ chính mã để không đếm trùng.
      const group = c.exN > 0 ? [...peers, it] : peers;
      const groupMeans = group.map((p) => p.raw[m].exMean);
      const priorMean = groupMeans.length ? mean(groupMeans) : 0;
      // τ² (phương sai thật giữa các mã cùng tháng) = phương sai TB của nhóm − nhiễu mẫu trung bình của chúng (mô-men, sàn 0).
      let tau2 = 0;
      if (groupMeans.length >= 2) {
        const v = groupMeans.reduce((a, x) => a + (x - priorMean) ** 2, 0) / (groupMeans.length - 1);
        const noise = mean(group.map((p) => (p.withinVar ?? typicalWithin) / p.raw[m].exN));
        tau2 = Math.max(0, v - noise);
      }
      const shrunk = c.exN > 0 ? priorMean + (tau2 / (tau2 + within / c.exN || 1)) * (c.exMean - priorMean) : null;
      const prior = estimatePriorFromRates(peers.map((p) => p.raw[m].wins / p.raw[m].exN), cfg.priorStrength);
      const post = c.exN > 0 ? betaBinomialPosterior(c.wins, c.losses, prior.alpha0, prior.beta0, cfg.level) : null;
      return {
        month: m + 1, n: c.n, expected: years.length, years: c.years, lowSample: c.n < cfg.lowSampleN,
        ret: c.ret, excess: c.excess,
        shrunkExcess: shrunk, shrinkWeight: c.exN > 0 ? tau2 / (tau2 + within / c.exN || 1) : null, priorMean, priorScope: scope,
        prob: post ? { target: "EXCESS_NET_POSITIVE", mean: post.mean, ci: post.ci, wins: c.wins, losses: c.losses, prior: { ...prior, scope, peers: peers.length } } : null,
      };
    });
    const st = seasonalStrength(it.d.rows, { permutations: cfg.permutations, seed: seedOf(`${it.ticker}|${cfg.version}`) });
    return {
      ticker: it.ticker, sector: it.sector,
      period: { fromYear: years[0], toYear: years.at(-1), firstDate: it.d.firstDate, lastDate: it.d.lastDate },
      strength: { S: st.S, p: st.p, q: null, n: st.n, label: "INSUFFICIENT" },
      months, current: it.d.current, mtd: it.d.mtd,
    };
  });

  const q = benjaminiHochberg(out.map((o) => o.strength.p));
  out.forEach((o, i) => { o.strength.q = q[i]; o.strength.label = strengthLabel(q[i]); });
  return {
    version: cfg.version, asOf, years, benchmark: "VNINDEX", target: "EXCESS_NET_POSITIVE", roundTripCost: cfg.roundTripCost,
    benchMonths: [...bench.returns].filter(([k]) => years.includes(Number(k.slice(0, 4)))).map(([k, r]) => ({ ym: k, r })),
    items: out,
  };
}

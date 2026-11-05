// R3 (2026-11-06) — chấm THỰC TẾ kiểu Việt Nam cho sổ theo dõi Elite 10 (MÔ TẢ, song song với cách chấm chính thức của E3-prereg).
// Không đổi tiêu chí hay nhãn bằng chứng; chỉ cho biết lợi suất vượt còn lại bao nhiêu khi thực thi thật ở một quy mô vốn.
//   • Phí: mua 0,15%; bán 0,15% + thuế 0,1%.
//   • Chi phí tác động căn bậc hai mỗi chiều: Y·σ20·√(giá trị lệnh / GTGD TB20), Y = 1 (Almgren và cộng sự 2005; Tóth và cộng sự 2011).
//   • Nửa chênh lệch mua–bán ≈ nửa bước giá / giá (HOSE: 10đ < 10.000đ, 50đ < 50.000đ, 100đ; HNX, UPCoM: 100đ).
//   • Lô 100 cổ phiếu ở quy mô vốn tham chiếu; phần lẻ để tiền mặt (lãi 0).
//   • Trần / sàn: phiên vào lệnh đóng cửa ở giá trần -> coi như không khớp mua (tiền mặt); phiên ra đóng cửa ở giá sàn -> dời bán
//     sang phiên kế không ở giá sàn, tối đa 5 phiên. Biên độ HOSE ±7%, HNX ±10%, UPCoM ±15%; nhận diện qua lợi suất ngày ±(biên − 0,3 điểm %).
//   • T+2: kỳ nắm giữ 5 và 10 phiên đều ≥ 2 phiên nên luôn thoả. Lợi nhuận "giữ một phiên" (như E7-v3 theo ngày) thì không thực hiện được.
// Giá dùng close_adj (gần đúng giá thật cho các phiên gần đây); mốc so sánh = rổ đều vũ trụ trừ 0,40% như cách chấm chính thức.

export const VN_EXEC = Object.freeze({
  version: "R3-exec-v1 (2026-11-06)",
  buyFee: 0.0015, sellFee: 0.0015, sellTax: 0.001, impactY: 1, lot: 100,
  limits: { HOSE: 0.07, HNX: 0.1, UPCOM: 0.15 }, limitTol: 0.003, maxExitDelay: 5, window: 20,
  aums: [1e9, 10e9], benchCost: 0.004, tPlus: 2,
});

export function tickSize(price, exchange = "HOSE") {
  if (String(exchange).toUpperCase() !== "HOSE") return 100;
  return price < 10_000 ? 10 : price < 50_000 ? 50 : 100;
}
const limitOf = (exchange) => VN_EXEC.limits[String(exchange ?? "HOSE").toUpperCase()] ?? VN_EXEC.limits.HOSE;

/** Thống kê tại phiên (index k trong chuỗi): σ20 lợi suất ngày, GTGD TB20, lợi suất phiên k. */
function statsAt(rows, k) {
  if (k < 1) return null;
  const from = Math.max(1, k - VN_EXEC.window + 1);
  const rets = [];
  let vsum = 0, vn = 0;
  for (let j = from; j <= k; j++) {
    rets.push(rows[j].closeAdj / rows[j - 1].closeAdj - 1);
    if (rows[j].value > 0) { vsum += rows[j].value; vn++; }
  }
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = rets.length > 1 ? Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / (rets.length - 1)) : 0;
  return { sigma: sd, adv: vn ? vsum / vn : null, ret: rows[k].closeAdj / rows[k - 1].closeAdj - 1, price: rows[k].closeAdj };
}
const impact = (sigma, adv, notional) => (adv > 0 && sigma > 0 && notional > 0 ? VN_EXEC.impactY * sigma * Math.sqrt(notional / adv) : 0);

/**
 * Chấm thực tế một bản ghi sổ ở kỳ hạn h và quy mô vốn aum.
 * @param {{ date: string, holdings: {ticker:string, weight:number}[] }} entry
 * @param {{ series: Map<string, {date:string, closeAdj:number, value:number|null}[]>, cal: string[], exchangeOf?: (t:string)=>string|null, universeNet?: number|null }} ctx
 */
export function realisticEntry(entry, h, aum, { series, cal, exchangeOf = () => "HOSE", universeNet = null }) {
  const i = cal.indexOf(entry.date);
  if (i < 0 || i + 1 + h >= cal.length) return null;
  const dIn = cal[i + 1];
  let port = 0, filledW = 0, cashW = 0, impactSum = 0, impactN = 0, delayed = 0, unfilled = [], lotCash = 0;
  for (const hl of entry.holdings) {
    const rows = series.get(hl.ticker);
    if (!rows?.length) { cashW += hl.weight; continue; }
    const idx = new Map(rows.map((r, k) => [r.date, k]));
    const kIn = idx.get(dIn);
    if (kIn == null) { cashW += hl.weight; continue; }
    const ex = exchangeOf(hl.ticker) ?? "HOSE";
    const lim = limitOf(ex);
    const sIn = statsAt(rows, kIn);
    if (!sIn) { cashW += hl.weight; continue; }
    // Trần ở phiên vào lệnh -> không khớp mua.
    if (sIn.ret >= lim - VN_EXEC.limitTol) { cashW += hl.weight; unfilled.push(hl.ticker); continue; }
    const shares = Math.floor((hl.weight * aum) / (sIn.price * VN_EXEC.lot)) * VN_EXEC.lot;
    const notional = shares * sIn.price;
    const wReal = notional / aum;
    lotCash += hl.weight - wReal;
    if (shares <= 0) { cashW += hl.weight; continue; }
    // Phiên ra: d+1+h; nếu đóng cửa ở giá sàn -> dời tối đa 5 phiên.
    let kOut = idx.get(cal[i + 1 + h]);
    if (kOut == null) { cashW += hl.weight; continue; }
    let sOut = statsAt(rows, kOut), d = 0;
    while (sOut && sOut.ret <= -lim + VN_EXEC.limitTol && d < VN_EXEC.maxExitDelay && kOut + 1 < rows.length) { kOut++; d++; sOut = statsAt(rows, kOut); }
    if (d) delayed++;
    const impIn = impact(sIn.sigma, sIn.adv, notional);
    const impOut = impact(sOut.sigma, sOut.adv, notional * (sOut.price / sIn.price));
    const spIn = tickSize(sIn.price, ex) / 2 / sIn.price, spOut = tickSize(sOut.price, ex) / 2 / sOut.price;
    const gross = sOut.price / sIn.price - 1;
    const costs = VN_EXEC.buyFee + impIn + spIn + (1 + gross) * (VN_EXEC.sellFee + VN_EXEC.sellTax + impOut + spOut);
    port += wReal * (gross - costs);
    filledW += wReal;
    impactSum += impIn + impOut; impactN += 2;
  }
  const net = port; // tiền mặt (không khớp, phần lẻ lô) lãi 0
  return {
    aum, net, excess: universeNet != null ? net - universeNet : null,
    fillRate: entry.holdings.length ? 1 - unfilled.length / entry.holdings.length : null, unfilled,
    investedPct: filledW, lotCashPct: lotCash, delayedExits: delayed, impactBpsAvg: impactN ? (impactSum / impactN) * 1e4 : null,
  };
}

/** Tổng hợp mô tả theo kỳ hạn và quy mô vốn: lợi suất vượt thực tế trung bình, so với cách chấm chính thức. */
export function summarizeRealistic(entries, horizons = [5, 10]) {
  const out = { version: VN_EXEC.version, horizons: {} };
  for (const h of horizons) {
    const byAum = {};
    for (const aum of VN_EXEC.aums) {
      const rs = entries.map((e) => e.results?.[h]?.realistic?.[String(aum)]).filter((r) => r && r.excess != null);
      // Cách chấm chính thức: (danh mục − 0,40%) − (rổ đều − 0,40%) = danh mục − rổ đều, trên cùng các bản ghi.
      const base = entries.filter((e) => e.results?.[h]?.realistic?.[String(aum)]?.excess != null).map((e) => e.results[h].excess);
      const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
      byAum[String(aum)] = {
        n: rs.length, meanExcess: mean(rs.map((r) => r.excess)), meanOfficialExcess: mean(base),
        meanImpactBps: mean(rs.map((r) => r.impactBpsAvg).filter((v) => v != null)), fillRate: mean(rs.map((r) => r.fillRate).filter((v) => v != null)),
        delayedExits: rs.reduce((a, r) => a + r.delayedExits, 0), meanInvested: mean(rs.map((r) => r.investedPct)),
      };
    }
    out.horizons[h] = byAum;
  }
  return out;
}

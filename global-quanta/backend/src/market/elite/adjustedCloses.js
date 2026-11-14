// 13/11/2026 — chuỗi giá đóng cửa ĐIỀU CHỈNH ĐẦY ĐỦ theo sự kiện quyền cho LS-v1 và engine quyết định.
//
// Vì sao cần: market_daily.close_adj KHÔNG điều chỉnh lùi (DGC 14/09/2026: 46.750 -> 37.400 chỉ vì chia cổ phiếu). Thứ tự nguồn cho MỖI mã:
//   1. Kho Gateway (createScreenerSeries) khi priceBasis = ADJUSTED_CUMULATIVE.
//   2. Kho giá VNDirect (eventStudy.pricesOf — adClose đã điều chỉnh đầy đủ, cập nhật 19:45): dùng khi (1) không dựng được chuỗi cộng dồn
//      (thiếu lịch sử giá danh nghĩa — 73/275 mã ngày 12/11/2026, gồm FPT, DGC, SSI, VIC). Phiên chưa có trong kho VNDirect (bảng E1 dựng
//      17:00) được NỐI bằng tỷ lệ giá danh nghĩa của market_daily; chỉ lệch nếu chính phiên nối là ngày không hưởng quyền, và tự hết khi
//      kho VNDirect cập nhật.
//   3. Không nguồn nào dùng được -> mã vắng mặt trong kết quả; nơi gọi tự lùi về close_adj cho RIÊNG mã đó.
// Kết quả: Map(mã -> [[ngày, giá đóng cửa điều chỉnh (đồng), GTGD]]) và thống kê nguồn.
const MAX_STALE_SESSIONS = 6;

/**
 * Chuỗi điều chỉnh từ kho VNDirect + nối phiên mới bằng giá danh nghĩa.
 * @param pxRows   [[ngày, adClose (nghìn đồng), nmValue, close danh nghĩa (nghìn đồng)]] tăng dần theo ngày
 * @param nominal  [{ date, close (đồng), value }] các phiên gần đây của market_daily, tăng dần
 * @param to       phiên cuối cần có
 * @returns [[ngày, giá (đồng), GTGD]] hoặc null nếu kho quá cũ / không nối được
 */
export function vndAdjustedRows(pxRows, nominal, to) {
  const base = (pxRows ?? []).filter((r) => r[0] <= to && r[1] > 0);
  if (base.length < 30) return null;
  const out = base.map((r) => [r[0], r[1] * 1000, r[2] ?? null]);
  const last = base.at(-1);
  if (last[0] === to) return out;
  const tail = (nominal ?? []).filter((b) => b.date > last[0] && b.date <= to && b.close > 0);
  if (!tail.length || tail.at(-1).date !== to || tail.length > MAX_STALE_SESSIONS || !(last[3] > 0)) return null;
  const k = last[1] / last[3]; // hệ số điều chỉnh của phiên cuối trong kho (≈ 1 khi không có sự kiện sau đó)
  for (const b of tail) out.push([b.date, b.close * k, b.value ?? null]);
  return out;
}

/**
 * @param deps.seriesSource  createScreenerSeries(...) — có prepare(symbols) -> loadSeries(symbol)
 * @param deps.pricesOf      (mã) -> dòng kho VNDirect hoặc null
 * @param deps.store         getMarketDailyRange({ from, to, symbols, columns })
 */
export function createEliteAdjustedCloses({ seriesSource, pricesOf, store, log = console }) {
  let lastStats = null;
  async function adjustedCloses(tickers, to) {
    const out = new Map(), lack = [];
    let load = null;
    try { load = await seriesSource.prepare(tickers); } catch (e) { log.warn?.(`[elite] kho chuỗi giá lỗi: ${e.message}`); }
    for (const t of tickers) {
      let rows = null;
      if (load) {
        try {
          const r = await load(t);
          if (r?.priceBasis === "ADJUSTED_CUMULATIVE") rows = (r.bars ?? []).filter((b) => !b.partial && b.close > 0 && (!to || b.date <= to)).map((b) => [b.date, b.close, Number(b.value) > 0 ? Number(b.value) : b.close * (b.volume ?? 0)]);
        } catch { /* mã thiếu dữ liệu */ }
      }
      if (rows?.length && (!to || rows.at(-1)[0] === to)) out.set(t, rows); else lack.push(t);
    }
    let fromVnd = 0;
    if (lack.length && to) {
      const from = new Date(Date.parse(`${to}T00:00:00Z`) - 20 * 86_400_000).toISOString().slice(0, 10);
      const recent = new Map();
      try {
        for (const r of await store.getMarketDailyRange({ from, to, symbols: lack, columns: "symbol,trading_date,close,value" })) {
          if (!(r.close > 0)) continue;
          if (!recent.has(r.symbol)) recent.set(r.symbol, []);
          recent.get(r.symbol).push({ date: r.date, close: r.close, value: r.value ?? null });
        }
      } catch (e) { log.warn?.(`[elite] market_daily danh nghĩa lỗi: ${e.message}`); }
      for (const t of lack) {
        const rows = vndAdjustedRows(pricesOf(t), (recent.get(t) ?? []).sort((a, b) => a.date.localeCompare(b.date)), to);
        if (rows) { out.set(t, rows); fromVnd++; }
      }
    }
    lastStats = { to: to ?? null, requested: tickers.length, warehouse: out.size - fromVnd, vndirect: fromVnd, missing: tickers.length - out.size };
    if (lastStats.missing) log.warn?.(`[elite] giá điều chỉnh: ${lastStats.missing}/${tickers.length} mã không có chuỗi điều chỉnh đầy đủ (dùng close_adj)`);
    return out;
  }
  adjustedCloses.stats = () => lastStats;
  return adjustedCloses;
}

/**
 * Chuỗi giá cho các engine Elite dạng Map(mã -> [{ date, closeAdj, value }]) trong [from, to]: giá điều chỉnh đầy đủ khi có; mã không có
 * chuỗi điều chỉnh (hoặc không có `adjustedCloses`) dùng close_adj của market_daily cho RIÊNG mã đó — không trộn hai cơ sở trong một mã.
 */
export async function loadAdjustedSeries({ adjustedCloses = null, store, symbols, from, to, log = console }) {
  const out = new Map();
  if (adjustedCloses && symbols.length) {
    try {
      const m = await adjustedCloses(symbols, to);
      for (const [t, rows] of m ?? []) {
        const list = rows.filter((r) => r[0] >= from && r[0] <= to && r[1] > 0).map((r) => ({ date: r[0], closeAdj: r[1], value: r[2] ?? null }));
        if (list.length) out.set(t, list);
      }
    } catch (e) { log.warn?.(`[elite] giá điều chỉnh lỗi (${e.message}) — dùng close_adj`); }
  }
  const lack = symbols.filter((t) => !out.has(t));
  if (lack.length) {
    for (const r of await store.getMarketDailyRange({ from, to, symbols: lack, columns: "symbol,trading_date,close_adj,value" })) {
      if (!(r.closeAdj > 0)) continue;
      if (!out.has(r.symbol)) out.set(r.symbol, []);
      out.get(r.symbol).push({ date: r.date, closeAdj: r.closeAdj, value: r.value ?? null });
    }
    for (const t of lack) out.get(t)?.sort((a, b) => a.date.localeCompare(b.date));
  }
  return out;
}

/**
 * PZ-v2 — thanh giá OHLCV ĐIỀU CHỈNH CỘNG DỒN cho lớp Vị trí giá (cần cao / thấp / khối lượng, không chỉ giá đóng cửa).
 * Chỉ nhận chuỗi priceBasis = ADJUSTED_CUMULATIVE: chuỗi còn bước nhảy quyền sẽ làm sai ATR, SMA50 và pivot — mã đó vắng mặt và
 * lớp Vị trí giá ghi "Chưa xác định" thay vì đoán. Nến lỗi (giá ≤ 0) bị loại.
 * @returns (tickers, to) -> Map(mã -> [{ date, open, high, low, close, volume }])
 */
export function createEliteAdjustedBars({ seriesSource, log = console }) {
  return async function adjustedBars(tickers, to) {
    const out = new Map();
    let load = null;
    try { load = await seriesSource.prepare(tickers); } catch (e) { log.warn?.(`[elite] PZ: kho chuỗi giá lỗi: ${e.message}`); return out; }
    for (const t of tickers) {
      try {
        const r = await load(t);
        if (r?.priceBasis !== "ADJUSTED_CUMULATIVE") continue;
        const bars = (r.bars ?? []).filter((b) => !b.partial && b.close > 0 && b.high > 0 && b.low > 0 && (!to || b.date <= to))
          .map((b) => ({ date: b.date, open: b.open > 0 ? b.open : b.close, high: b.high, low: b.low, close: b.close, volume: Number(b.volume) > 0 ? Number(b.volume) : 0 }));
        if (bars.length) out.set(t, bars);
      } catch { /* mã thiếu dữ liệu -> vắng mặt */ }
    }
    return out;
  };
}

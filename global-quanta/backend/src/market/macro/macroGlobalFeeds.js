// Nguồn THẬT, công khai, không cần khoá cho các biến vĩ mô toàn cầu của danh mục MacroCenter (chỉ tháng ĐÃ ĐÓNG):
//   FED  <- FRED FEDFUNDS (lãi suất quỹ liên bang hiệu dụng, trung bình tháng)
//   OIL  <- FRED DCOILBRENTEU (Brent giao ngay, ngày) -> giá phiên cuối tháng
//   DXY  <- Yahoo DX-Y.NYB (nến tháng, giá đóng cửa cuối tháng)
//   EX   <- Yahoo VND=X (tỷ giá USD/VND thị trường, nến tháng) — KHÔNG phải tỷ giá trung tâm NHNN; ghi rõ ở nguồn.
// asOf = ngày 1 tháng kế tiếp (số liệu tháng đã biết khi tháng khép lại). Biến nội địa (CPI, M2, tín dụng, FDI, XK, IIP, PMI,
// lãi suất liên ngân hàng VN) không có API miễn phí -> nạp CSV qua POST /api/macro/admin/import.
const UA = { "user-agent": "Mozilla/5.0 (compatible; GlobalQuanta/1.0)" };

export const GLOBAL_FEEDS = [
  { seriesId: "FED", source: "FRED:FEDFUNDS", kind: "fred", id: "FEDFUNDS", reduce: "avg-published" },
  { seriesId: "OIL", source: "FRED:DCOILBRENTEU", kind: "fred", id: "DCOILBRENTEU", reduce: "last" },
  { seriesId: "DXY", source: "Yahoo:DX-Y.NYB", kind: "yahoo", id: "DX-Y.NYB" },
  { seriesId: "EX", source: "Yahoo:VND=X (thị trường)", kind: "yahoo", id: "VND=X" },
];

const nextMonthFirst = (period) => {
  const [y, m] = period.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
};

/** CSV fredgraph -> [{ date, value }] (bỏ ô trống / ".") */
export function parseFredCsv(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/).slice(1)) {
    const [date, raw] = line.split(",");
    const v = Number(raw);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") && raw !== "." && raw !== "" && Number.isFinite(v)) out.push({ date, value: v });
  }
  return out;
}

/** Điểm ngày/tháng -> giá trị tháng ĐÃ ĐÓNG. reduce "last": điểm cuối tháng; "avg-published": FRED đã là trung bình tháng (1 điểm/tháng). */
export function toClosedMonths(points, todayIso, reduce = "last") {
  const nowPeriod = todayIso.slice(0, 7);
  const by = new Map();
  for (const p of points) {
    const period = p.date.slice(0, 7);
    if (period >= nowPeriod) continue;
    const prev = by.get(period);
    if (!prev || p.date > prev.date) by.set(period, p);
  }
  return [...by.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([period, p]) => ({ period, value: p.value, asOf: nextMonthFirst(period) }));
}

/** JSON Yahoo chart (interval 1mo) -> [{ date, value }] theo ngày đầu tháng của nến. */
export function parseYahooMonthly(json) {
  const r = json?.chart?.result?.[0];
  const ts = r?.timestamp ?? [];
  const close = r?.indicators?.quote?.[0]?.close ?? [];
  const out = [];
  ts.forEach((t, i) => {
    const v = close[i];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) out.push({ date: new Date(t * 1000).toISOString().slice(0, 10), value: Math.round(v * 1e4) / 1e4 });
  });
  return out;
}

async function getText(url, fetchImpl) {
  const r = await fetchImpl(url, { headers: UA, signal: AbortSignal.timeout(45_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

/** Tải mọi nguồn toàn cầu -> { observations, report }. Lỗi một nguồn không chặn nguồn khác. */
export async function fetchGlobalFeeds({ todayIso, fetchImpl = globalThis.fetch, feeds = GLOBAL_FEEDS } = {}) {
  const observations = [];
  const report = {};
  await Promise.all(feeds.map(async (f) => {
    try {
      const points = f.kind === "fred"
        ? parseFredCsv(await getText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(f.id)}&cosd=2005-01-01`, fetchImpl))
        : parseYahooMonthly(JSON.parse(await getText(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(f.id)}?range=25y&interval=1mo`, fetchImpl)));
      const months = toClosedMonths(points, todayIso, f.reduce ?? "last");
      if (!months.length) throw new Error("nguồn trả rỗng");
      for (const m of months) observations.push({ seriesId: f.seriesId, ...m, source: f.source });
      report[f.seriesId] = { source: f.source, months: months.length, first: months[0].period, last: months.at(-1).period };
    } catch (e) {
      report[f.seriesId] = { source: f.source, error: e.message };
    }
  }));
  return { observations, report };
}

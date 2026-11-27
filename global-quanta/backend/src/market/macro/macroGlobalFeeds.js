// Nguồn THẬT, công khai, không cần khoá cho các biến vĩ mô toàn cầu của danh mục MacroCenter (chỉ tháng ĐÃ ĐÓNG):
//   FED  <- FRED FEDFUNDS (lãi suất quỹ liên bang hiệu dụng, trung bình tháng)
//   OIL  <- FRED DCOILBRENTEU (Brent giao ngay, ngày) -> giá phiên cuối tháng
//   DXY  <- Yahoo DX-Y.NYB (nến tháng, giá đóng cửa cuối tháng)
//   EX   <- Yahoo VND=X (tỷ giá USD/VND thị trường, nến tháng) — KHÔNG phải tỷ giá trung tâm NHNN; ghi rõ ở nguồn.
//   CPI  <- IMF SDMX (api.imf.org, bộ CPI, VNM.CPI._T.IX.M — chỉ số giá tiêu dùng VN do IMF thu từ Tổng cục Thống kê) -> % so cùng kỳ.
//          30/10/2026: trước đây CPI rỗng (chờ nạp CSV tay, chưa từng nạp) -> nhiệt kế 1/6 biến, "Chế độ vĩ mô" lỗi 422.
//          asOf = ngày 6 tháng kế tiếp (lịch công bố CPI của TCTK) — không dùng số liệu trước khi nó có thật.
// asOf các nguồn khác = ngày 1 tháng kế tiếp (số liệu tháng đã biết khi tháng khép lại). Biến nội địa còn lại (M2, tín dụng, FDI, XK,
// IIP, PMI, lãi suất liên ngân hàng VN) không có API miễn phí cập nhật -> nạp CSV qua POST /api/macro/admin/import.
import { scaleOutliers } from "./scaleCheck.js";

const UA = {"user-agent": "Mozilla/5.0 (compatible; GlobalQuanta/1.0)" };

export const GLOBAL_FEEDS = [
  { seriesId: "FED", source: "FRED:FEDFUNDS", kind: "fred", id: "FEDFUNDS", reduce: "avg-published" },
  { seriesId: "OIL", source: "FRED:DCOILBRENTEU", kind: "fred", id: "DCOILBRENTEU", reduce: "last" },
  { seriesId: "DXY", source: "Yahoo:DX-Y.NYB", kind: "yahoo", id: "DX-Y.NYB" },
  { seriesId: "EX", source: "Yahoo:VND=X (thị trường)", kind: "yahoo", id: "VND=X" },
  { seriesId: "CPI", source: "IMF:CPI VNM (TCTK)", kind: "imf", flow: "IMF.STA,CPI", key: "VNM.CPI._T.IX.M", transform: "yoy", releaseDay: 6 },
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
  const toDate = localDateFn(r?.meta?.exchangeTimezoneName);
  const out = [];
  ts.forEach((t, i) => {
    const v = close[i];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) out.push({ date: toDate(t), value: Math.round(v * 1e4) / 1e4 });
  });
  return out;
}

/**
 * V0 (19/11/2026): ngày của nến theo MÚI GIỜ CỦA SÀN, không theo UTC. Yahoo đánh mốc nến bằng 00:00 giờ sàn: tỷ giá (Europe/London)
 * trong giờ mùa hè có mốc "30/09 23:00 UTC" cho nến THÁNG 10 -> đọc theo UTC thì nến tháng 10 rơi vào tháng 9 (giá tháng sau đè lên
 * tháng trước = nhìn trước 1 tháng cho các tháng 3–9, và mất tháng 10). Múi giờ không hợp lệ/thiếu -> UTC như cũ.
 */
const DATE_FMT = new Map();
export function localDateFn(tz) {
  if (!tz) return (t) => new Date(t * 1000).toISOString().slice(0, 10);
  let f = DATE_FMT.get(tz);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    } catch {
      f = null;
    }
    DATE_FMT.set(tz, f);
  }
  return f ? (t) => f.format(new Date(t * 1000)) : (t) => new Date(t * 1000).toISOString().slice(0, 10);
}

/**
 * CSV SDMX của IMF -> [{ date: "YYYY-MM-01", value }] (chỉ dòng tháng "YYYY-Mmm"). Cột tìm theo tên tiêu đề (TIME_PERIOD, OBS_VALUE).
 */
export function parseImfCsv(text) {
  const lines = String(text).trim().split(/\r?\n/);
  const head = (lines[0] ?? "").split(",");
  const iT = head.indexOf("TIME_PERIOD"), iV = head.indexOf("OBS_VALUE");
  if (iT < 0 || iV < 0) return [];
  const out = [];
  for (const line of lines.slice(1)) {
    const c = line.split(",");
    const m = /^(\d{4})-M(\d{2})$/.exec(c[iT] ?? "");
    const v = Number(c[iV]);
    if (m && c[iV] !== "" && Number.isFinite(v)) out.push({ date: `${m[1]}-${m[2]}-01`, value: v });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Chỉ số -> % so cùng kỳ (cần đúng tháng t−12; thiếu thì bỏ kỳ đó, không nội suy). */
export function toYoY(points) {
  const by = new Map(points.map((p) => [p.date.slice(0, 7), p.value]));
  const out = [];
  for (const p of points) {
    const [y, m] = p.date.slice(0, 7).split("-");
    const prev = by.get(`${Number(y) - 1}-${m}`);
    if (prev > 0) out.push({ date: p.date, value: Math.round((p.value / prev - 1) * 1e4) / 1e2 });
  }
  return out;
}

const periodIdx = (p) => Number(p.slice(0, 4)) * 12 + Number(p.slice(5, 7)) - 1;
const periodOf = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;

/** Các kỳ tháng bị thiếu giữa kỳ đầu và kỳ cuối của chuỗi. */
export function missingPeriods(months) {
  const have = new Set(months.map((m) => m.period));
  const out = [];
  if (!months.length) return out;
  for (let i = periodIdx(months[0].period); i <= periodIdx(months.at(-1).period); i++) if (!have.has(periodOf(i))) out.push(periodOf(i));
  return out;
}

/**
 * Thay/điền các kỳ `need` bằng giá cuối tháng từ nến ngày — chỉ khi giá ngày không lệch thang so với trung vị của chuỗi tháng
 * (nến ngày cũng có thể lỗi). Kỳ không dựng được thì bỏ hẳn (để trống, không nội suy). Điểm dựng lại gắn `daily: true`.
 */
export function fillFromDaily(months, dailyMonths, need) {
  const want = new Set(need);
  const byDaily = new Map(dailyMonths.map((m) => [m.period, m]));
  const good = months.filter((m) => !want.has(m.period));
  const filled = [];
  for (const p of want) {
    const d = byDaily.get(p);
    if (!d) continue;
    const probe = [...good, { period: p, value: d.value }].sort((a, b) => (a.period < b.period ? -1 : 1));
    if (scaleOutliers(probe).has(p)) continue;
    good.push({ period: p, value: d.value, asOf: nextMonthFirst(p), daily: true });
    filled.push(p);
  }
  return { months: good.sort((a, b) => (a.period < b.period ? -1 : 1)), filled: filled.sort() };
}

const withReleaseDay =(months, day) => (day ? months.map((m) => ({ ...m, asOf: `${m.asOf.slice(0, 8)}${String(day).padStart(2, "0")}` })) : months);

export async function getText(url, fetchImpl, headers = UA) {
  const r = await fetchImpl(url, { headers, signal: AbortSignal.timeout(45_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

/** Tải mọi nguồn toàn cầu -> { observations, report }. Lỗi một nguồn không chặn nguồn khác. */
export async function fetchGlobalFeeds({ todayIso, fetchImpl = globalThis.fetch, feeds = GLOBAL_FEEDS } = {}) {
  const observations = [];
  const report = {};
  await Promise.all(feeds.map(async (f) => {
    try {
      let points;
      if (f.kind === "fred") points = parseFredCsv(await getText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(f.id)}&cosd=2005-01-01`, fetchImpl));
      else if (f.kind === "imf") {
        points = parseImfCsv(await getText(`https://api.imf.org/external/sdmx/2.1/data/${f.flow}/${f.key}?startPeriod=2004-01`, fetchImpl,
          { ...UA, accept: "application/vnd.sdmx.data+csv;version=1.0.0" }));
        if (f.transform === "yoy") points = toYoY(points);
      } else points = parseYahooMonthly(JSON.parse(await getText(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(f.id)}?range=25y&interval=1mo`, fetchImpl)));
      let months = withReleaseDay(toClosedMonths(points, todayIso, f.reduce ?? "last"), f.releaseDay);
      if (!months.length) throw new Error("nguồn trả rỗng");
      let filled = [];
      // V0: nến THÁNG của Yahoo thiếu kỳ (VND=X thiếu tháng 10 nhiều năm) hoặc lệch thang (÷10.000) -> dựng giá cuối tháng từ nến NGÀY
      if (f.kind === "yahoo") {
        const need = [...missingPeriods(months), ...scaleOutliers(months).keys()];
        if (need.length) {
          try {
            const daily = parseYahooMonthly(JSON.parse(await getText(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(f.id)}?range=25y&interval=1d`, fetchImpl)));
            ({ months, filled } = fillFromDaily(months, toClosedMonths(daily, todayIso, "last"), need));
          } catch (e) {
            report[`${f.seriesId}:daily`] = { error: e.message };
          }
        }
      }
      for (const m of months) {
        const { daily, ...obs } = m;
        observations.push({ seriesId: f.seriesId, ...obs, source: daily ? `${f.source} · nến ngày` : f.source });
      }
      report[f.seriesId] = { source: f.source, months: months.length, first: months[0].period, last: months.at(-1).period, ...(filled.length ? { filledFromDaily: filled } : {}) };
    } catch (e) {
      report[f.seriesId] = { source: f.source, error: e.message };
    }
  }));
  return { observations, report };
}

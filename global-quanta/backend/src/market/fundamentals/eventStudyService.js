// LC3 (06/11/2026) — dịch vụ nghiên cứu sự kiện KQKD trên Gateway. Giá: VNDirect stock_prices (adClose, nmValue) từ 2020-06, cập nhật
// nối tiếp (chỉ tải từ phiên cuối − 5), lưu <dir>/px/<MÃ>.json.gz; VN-Index: vnmarket_prices. Tính tuần tự từng mã (heap thấp),
// ghi <dir>/event-study.json.gz = { aggregate, byTicker (≤ 8 sự kiện gần nhất), live (KL/giá 10 phiên gần nhất của mã chưa công bố) }.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { publishDates } from "./earningsCalendar.js";
import { aggregate, eventReaction, ES_VERSION, series, sueAt } from "./eventStudy.js";

const UA = "Mozilla/5.0 (compatible; GlobalQuanta/1.0)";
const TICKER_FILE = /^[A-Z0-9]{3,10}\.json\.gz$/;
const vnToday = (t) => new Date(t + 7 * 3_600_000).toISOString().slice(0, 10);
const readGz = (f) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString("utf8")); } catch { return null; } };
const writeGz = (f, o) => { const tmp = `${f}.tmp-${process.pid}`; fs.writeFileSync(tmp, zlib.gzipSync(JSON.stringify(o))); fs.renameSync(tmp, f); };

export function createEventStudyService({ dir, fetchImpl = globalThis.fetch, now = Date.now, log = console, since = "2020-06-01" } = {}) {
  const pxDir = path.join(dir, "px");
  const outFile = path.join(dir, "event-study.json.gz");
  fs.mkdirSync(pxDir, { recursive: true });
  let memo = null, running = false, last = null;

  async function getRows(url) {
    for (let a = 0; a < 3; a++) {
      try { const r = await fetchImpl(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(40_000) }); if (r.ok) return (await r.json()).data ?? []; } catch { /* thử lại */ }
      await new Promise((res) => setTimeout(res, 1000 * (a + 1)));
    }
    return null;
  }
  /** Giá một mã: đọc file, tải bổ sung từ phiên cuối − 5 (ghi đè các phiên trùng — VNDirect điều chỉnh adClose khi có quyền: tải lại toàn bộ nếu lệch). */
  async function prices(t, { code = t, market = false } = {}) {
    const f = path.join(pxDir, `${t}.json.gz`);
    let rows = readGz(f)?.rows ?? [];
    const lastDate = rows.at(-1)?.[0] ?? null;
    const from = lastDate ? new Date(Date.parse(`${lastDate}T00:00:00Z`) - 8 * 864e5).toISOString().slice(0, 10) : since;
    const ep = market ? "vnmarket_prices" : "stock_prices";
    const fresh = await getRows(`https://api-finfo.vndirect.com.vn/v4/${ep}?q=code:${code}~date:gte:${from}&size=5000&sort=date:asc`);
    if (!fresh) return rows;
    const map = (r) => (market ? [r.date, r.close, r.nmValue ?? 0] : [r.date, r.adClose, r.nmValue ?? 0]);
    const add = fresh.map(map).filter((r) => r[0] && r[1] > 0);
    // Có điều chỉnh quyền (adClose đổi ở phiên trùng) -> tải lại toàn bộ để chuỗi điều chỉnh nhất quán.
    const old = new Map(rows.map((r) => [r[0], r[1]]));
    const adjusted = !market && add.some((r) => old.has(r[0]) && Math.abs(old.get(r[0]) / r[1] - 1) > 0.002);
    if (adjusted) { const all = await getRows(`https://api-finfo.vndirect.com.vn/v4/${ep}?q=code:${code}~date:gte:${since}&size=5000&sort=date:asc`); if (all) rows = all.map(map).filter((r) => r[0] && r[1] > 0); }
    else { const keep = rows.filter((r) => !add.length || r[0] < add[0][0]); rows = [...keep, ...add]; }
    writeGz(f, { code, rows, fetchedAt: new Date(now()).toISOString() });
    return rows;
  }

  async function run({ statementsDir = dir, disclosures = null } = {}) {
    if (running) return { running: true };
    running = true; const t0 = now();
    try {
      const mktRows = await prices("VNINDEX", { code: "VNINDEX", market: true });
      const mkt = new Map(mktRows.map(([d, c, v]) => [d, { close: c, val: v }]));
      const disc = disclosures ?? readGz(path.join(dir, "disclosures.json.gz"))?.byTicker ?? {};
      const tickers = fs.readdirSync(statementsDir).filter((f) => TICKER_FILE.test(f)).map((f) => f.slice(0, -8)).sort();
      const events = [], byTicker = {}, live = {};
      const today = vnToday(now());
      for (const t of tickers) {
        const rec = readGz(path.join(statementsDir, `${t}.json.gz`)); if (!rec) continue;
        const px = series(await prices(t));
        if (!px.dates.length) continue;
        const mine = [];
        for (const [fiscal, p] of publishDates(rec, disc[t] ?? [])) {
          if (fiscal < "2021-03-31") continue;
          const r = eventReaction(px, mkt, p.date); const s = sueAt(rec, fiscal, p.date);
          const e = { t, fiscal, date: p.date, source: p.source, sue: s.core ?? s.npat, r };
          events.push(e);
          if (r?.insufficient) mine.push({ fiscal, date: p.date, source: p.source, insufficient: true, nEst: r.nEst });
          else if (r) mine.push({ fiscal, date: p.date, source: p.source, sue: e.sue == null ? null : Math.round(e.sue * 100) / 100, e0: r.e0, carPre: r.carPre, carAnn: r.carAnn, carPost: r.carPost, scarAnn: r.scarAnn, avPre: r.avPre, avAnn: r.avAnn, sessionsAfter: r.sessionsAfter, path: r.path });
        }
        byTicker[t] = mine.slice(-8);
        // Hiện tại: 10 phiên gần nhất (như cửa sổ "trước tin" nếu ngày mai là ngày công bố).
        const nextDay = new Date(Date.parse(`${px.dates.at(-1)}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);
        const lr = eventReaction({ ...px, dates: [...px.dates, nextDay], close: [...px.close, px.close.at(-1)], val: [...px.val, px.val.at(-1)] }, mkt, nextDay);
        if (lr && !lr.insufficient) live[t] = { asOf: px.dates.at(-1), car10: lr.carPre, scar10: lr.scarPre, av10: lr.avPre };
      }
      const agg = aggregate(events);
      // Đường CAR không cần lưu cho từng sự kiện trong tổng hợp; byTicker giữ đường của ≤ 8 sự kiện để vẽ trong ngăn chi tiết.
      // S4: danh sách rút gọn mọi sự kiện (không đường CAR) để gộp theo ngành × loại quý.
      const compact = events.filter((e) => e.r && !e.r.insufficient).map((e) => ({ t: e.t, q: Math.ceil(Number(e.fiscal.slice(5, 7)) / 3), s: e.source === "DISCLOSURE" ? 1 : 0, sue: e.sue == null ? null : Math.round(e.sue * 100) / 100, pre: e.r.carPre, ann: e.r.carAnn, post: e.r.carPost }));
      const doc = { version: ES_VERSION, builtAt: new Date(now()).toISOString(), asOf: today, aggregate: agg, byTicker, live, events: compact, ms: now() - t0 };
      writeGz(outFile, doc); memo = doc; last = { at: doc.builtAt, events: agg.events, precise: agg.precise, ms: doc.ms };
      log.log?.(`[event-study] ${agg.events} sự kiện (${agg.precise} có tin BCTC chính thức), ${(doc.ms / 1000).toFixed(0)} s.`);
      return last;
    } finally { running = false; }
  }
  function doc() { if (memo) return memo; memo = readGz(outFile); return memo; }
  return { run, doc, status: () => ({ version: ES_VERSION, running, last, hasData: fs.existsSync(outFile) }), hasData: () => fs.existsSync(outFile) };
}

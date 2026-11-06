// LSK1 (07/11/2026) — kho sự kiện doanh nghiệp trên Gateway (thay Project A /api/cotuc/events cho Lịch sự kiện).
// Nạp TOÀN BỘ sự kiện VNDirect từ 2015 cho danh mục (~6.500 dòng, ~4 giây) 4 lần/ngày — sự kiện cổ tức chỉ được báo trước trung vị 13 ngày
// (P10 7, P90 22 — đo 07/11/2026) nên phải làm mới dày. So với lần nạp trước -> nhật ký thay đổi (mới công bố / đổi ngày / huỷ).
// Kiểm chéo ngày với tin doanh nghiệp CafeF (bộ đọc S8) khi có. Lưu <dir>/corp-events.json.gz.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { CE_VERSION, crossCheck, diffEvents, keyDate, normalize } from "./corpEvents.js";
import { DF_VERSION, forecastTicker } from "./divForecast.js";

const UA = "Mozilla/5.0 (compatible; GlobalQuanta/1.0)";
const readGz = (f) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString("utf8")); } catch { return null; } };
const writeGz = (f, o) => { const tmp = `${f}.tmp-${process.pid}`; fs.writeFileSync(tmp, zlib.gzipSync(JSON.stringify(o))); fs.renameSync(tmp, f); };
const vnToday = (t) => new Date(t + 7 * 3_600_000).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

export function createCorpEvents({ dir, universe, isTradingDay, cafefNews = () => null, fetchImpl = globalThis.fetch, now = Date.now, log = console, since = "2015-01-01", chunk = 40 }) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "corp-events.json.gz");
  let memo = null, running = false, last = null;
  const load = () => (memo ??= readGz(file));

  async function getPage(codes, page) {
    for (let a = 0; a < 3; a++) {
      try {
        const r = await fetchImpl(`https://api-finfo.vndirect.com.vn/v4/events?q=code:${codes.join(",")}~locale:VN~effectiveDate:gte:${since}&size=2000&page=${page}&sort=effectiveDate:asc`, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
        if (r.ok) return (await r.json()).data ?? [];
      } catch { /* thử lại */ }
      await new Promise((res) => setTimeout(res, 1500 * (a + 1)));
    }
    throw new Error(`VNDirect events lỗi (${codes[0]}…)`);
  }

  async function refresh({ reason = "job" } = {}) {
    if (running) return { running: true };
    running = true; const t0 = now();
    try {
      const tickers = (await universe()).sort();
      if (!tickers.length) return { skipped: "chưa có danh mục" };
      const raw = [];
      for (let i = 0; i < tickers.length; i += chunk) {
        const codes = tickers.slice(i, i + chunk);
        for (let p = 1; p <= 20; p++) { const rows = await getPage(codes, p); raw.push(...rows); if (rows.length < 2000) break; }
      }
      const next = new Map();
      for (const r of raw) { const e = normalize(r, isTradingDay); if (e) next.set(e.id, e); }
      const prev = load();
      const at = new Date(now()).toISOString();
      const changes = diffEvents(prev ? new Map(prev.events.map((e) => [e.id, e])) : null, next, at);
      const doc = { version: CE_VERSION, fetchedAt: at, since, tickers: tickers.length, events: [...next.values()].sort((a, b) => keyDate(a).localeCompare(keyDate(b)) || a.t.localeCompare(b.t)),
        changes: [...changes, ...(prev?.changes ?? [])].slice(0, 1000), firstLoadAt: prev?.firstLoadAt ?? at, ms: now() - t0 };
      writeGz(file, doc); memo = doc;
      last = { at, reason, events: doc.events.length, changes: changes.length, ms: doc.ms };
      log.log?.(`[corp-events] ${doc.events.length} sự kiện, ${changes.length} thay đổi, ${(doc.ms / 1000).toFixed(1)} s.`);
      return last;
    } finally { running = false; }
  }

  /** Sự kiện trong [from, to] (theo ngày trọng tâm), lọc nhóm; kèm kiểm chéo CafeF cho sự kiện chưa qua. */
  function window({ from, to, groups = null, tickers = null } = {}) {
    const d = load(); if (!d) return null;
    const today = vnToday(now());
    const f = from ?? addDays(today, -7), t = to ?? addDays(today, 400);
    const gs = groups ? new Set(groups) : null, ts = tickers ? new Set(tickers) : null;
    const events = d.events.filter((e) => { const k = keyDate(e); return k >= f && k <= t && (!gs || gs.has(e.group)) && (!ts || ts.has(e.t)); })
      .map((e) => (keyDate(e) >= today && e.group !== "STATUS" ? { ...e, check: crossCheck(e, cafefNews(e.t)) } : e));
    return { version: d.version, fetchedAt: d.fetchedAt, asOf: today, from: f, to: t, events, changes: d.changes.filter((c) => c.at >= addDays(today, -30)).slice(0, 200) };
  }

  /**
   * Nếp lịch sử (MÔ TẢ — DF-r1 KHÔNG ĐẠT nên không có xác suất / dải ngày): mã có đợt GDKHQ cổ tức tiền thường rơi vào [hôm nay, +days]
   * mà kỳ này chưa công bố. Trả ngày thường gặp của đợt, số năm có trả / số năm quan sát, lần GDKHQ gần nhất của đợt.
   */
  function habits({ days = 90 } = {}) {
    const d = load(); if (!d) return null;
    const today = vnToday(now()), end = addDays(today, days);
    const by = new Map();
    for (const e of d.events) if (e.cat === "CASH" && e.ex) (by.get(e.t) ?? by.set(e.t, []).get(e.t)).push({ ex: e.ex, disclosed: e.disclosed ?? e.ex, cash: e.cash });
    const upcoming = new Set(d.events.filter((e) => e.cat === "CASH" && e.ex && e.ex >= today).map((e) => e.t));
    const rows = [];
    for (const [t, ev] of by) {
      if (upcoming.has(t)) continue; // đã có lịch công bố
      for (const f of forecastTicker(ev, today, 0.5)) {
        if (f.date > end) continue;
        const last = ev.filter((x) => x.ex === f.lastEx)[0];
        rows.push({ t, usual: f.date, paidYears: f.paidYears, years: f.years, lastEx: f.lastEx, lastCash: last?.cash ?? null });
      }
    }
    rows.sort((a, b) => a.usual.localeCompare(b.usual) || b.paidYears - a.paidYears);
    return { version: DF_VERSION, label: "MÔ TẢ", test: "DF-r1 KHÔNG ĐẠT", asOf: today, days, rows };
  }

  /** Toàn bộ lịch sử một mã (ngăn chi tiết, dự báo). */
  function ticker(t) { const d = load(); if (!d) return null; return { version: d.version, fetchedAt: d.fetchedAt, ticker: t, events: d.events.filter((e) => e.t === t) }; }

  return { refresh, window, ticker, habits, hasData: () => fs.existsSync(file), status: () => ({ version: CE_VERSION, running, last, fetchedAt: load()?.fetchedAt ?? null, events: load()?.events?.length ?? 0 }) };
}

// S8-1 (06/11/2026) — đọc lịch sử tin doanh nghiệp CafeF (mục "Tất cả") từ MỚI về CŨ, lưu dần, chạy tiếp từ chỗ dừng.
//   Pha A: mọi mã tới 2020-01-01 (chạy ngay sau khởi động, ~1 lượt/giây). Pha B: tiếp về 2013-01-01 trong khung đêm.
//   Lưu <dir>/cafef-news/<MÃ>.json.gz = { rows: [[ngày, tiêu đề]] } (chỉ tin có từ khoá kỳ/kết quả — đủ để phân loại lại khi đổi quy tắc)
//   và <dir>/cafef-news/_state.json = { MÃ: { next, oldest, exhausted } }.
//   evaluate(): đối chiếu ngày CafeF với ngày tin BCTC chính thức VNDirect (2024+) theo số phiên — tiêu chí đặt trước S8 (≥ 90% lệch ≤ 1 phiên).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { announceFromNews, CA_VERSION, parsePage } from "./cafefAnnounce.js";
import { publishDates } from "./earningsCalendar.js";

export const CA_RULES = Object.freeze({ phaseA: "2020-01-01", phaseB: "2013-01-01", minPrecision: 0.9, maxSessions: 1, delayMs: 1000, maxPages: 400, lanes: 3 });
const UA = "Mozilla/5.0 (compatible; GlobalQuanta/1.0)";
const KEEP = /(qu[yý]|th[aá]ng|n[aă]m|20\d\d|bctc|t[aà]i ch[ií]nh|k[eế]t qu[aả]|l[aã]i|l[oợ]i nhu[aậ]n|lntt|lnst|doanh thu|l[oỗ]|gi[aả]i tr[iì]nh|b[aá]n ni[eê]n|c[oổ] t[uứ]c|đkcc|gdkhq|ch[oố]t|đ[aạ]i h[oộ]i|đhđcđ|quy[eề]n mua|ph[aá]t h[aà]nh|th[uư][oở]ng)/i; // LSK1: giữ cả tin cổ tức / chốt quyền / đại hội để kiểm chéo Lịch sự kiện
const TICKER_FILE = /^[A-Z0-9]{3,10}\.json\.gz$/;
const readGz = (f) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString("utf8")); } catch { return null; } };
const writeGz = (f, o) => { const tmp = `${f}.tmp-${process.pid}`; fs.writeFileSync(tmp, zlib.gzipSync(JSON.stringify(o))); fs.renameSync(tmp, f); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createCafefAnnounce({ dir, fetchImpl = globalThis.fetch, now = Date.now, log = console, delayMs = CA_RULES.delayMs } = {}) {
  const newsDir = path.join(dir, "cafef-news");
  fs.mkdirSync(newsDir, { recursive: true });
  const stateFile = path.join(newsDir, "_state.json");
  let running = false, last = null, evalMemo = null;
  const memo = new Map(); // MÃ -> Map(fiscal -> {date,tier,title})
  const readState = () => { try { return JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch { return {}; } };
  const saveState = (s) => { const tmp = `${stateFile}.tmp-${process.pid}`; fs.writeFileSync(tmp, JSON.stringify(s)); fs.renameSync(tmp, stateFile); };
  const universe = () => fs.readdirSync(dir).filter((f) => TICKER_FILE.test(f)).map((f) => f.slice(0, -8)).sort();

  async function page(t, p) {
    for (let a = 0; a < 3; a++) {
      try {
        const r = await fetchImpl(`https://cafef.vn/du-lieu/Ajax/Events_RelatedNews_New.aspx?symbol=${t}&floorID=0&configID=0&PageIndex=${p}&PageSize=30&Type=2`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(25_000) });
        if (r.ok) return parsePage(await r.text());
      } catch { /* thử lại */ }
      await sleep(3000 * (a + 1));
    }
    return null;
  }

  /** Đọc tiếp tới `until` cho mọi mã (hoặc tới khi hết `maxMs`). Trả tiến độ. */
  async function crawl({ until = CA_RULES.phaseA, maxMs = 3 * 3_600_000, lanes = CA_RULES.lanes } = {}) {
    if (running) return { running: true };
    running = true; const t0 = now(); let pages = 0, failed = 0;
    try {
      const st = readState();
      const queue = universe();
      // `lanes` luồng song song, mỗi luồng một mã một lúc, 1 lượt/giây/luồng.
      await Promise.all(Array.from({ length: lanes }, async () => { while (queue.length && now() - t0 <= maxMs) {
        const t = queue.shift();
        const s = (st[t] ??= { next: 1, oldest: null, exhausted: false });
        if (s.exhausted || (s.oldest && s.oldest < until)) continue;
        const f = path.join(newsDir, `${t}.json.gz`);
        const rows = readGz(f)?.rows ?? [];
        while (!s.exhausted && !(s.oldest && s.oldest < until) && s.next <= CA_RULES.maxPages) {
          if (now() - t0 > maxMs) break;
          const got = await page(t, s.next); pages += 1;
          if (got == null) { failed += 1; break; } // nguồn lỗi: để lượt sau đọc tiếp đúng trang này
          if (!got.length) { s.exhausted = true; break; }
          for (const r of got) if (KEEP.test(r[1])) rows.push(r);
          s.oldest = got.at(-1)[0]; s.next += 1;
          await sleep(delayMs);
        }
        writeGz(f, { rows }); memo.delete(t); saveState(st);
      } }));
      evalMemo = null;
      last = { at: new Date(now()).toISOString(), until, pages, failed, ms: now() - t0, ...progress(st) };
      log.log?.(`[cafef] ${pages} trang, lỗi ${failed}; tới ${until}: ${last.reached}/${last.total} mã.`);
      return last;
    } finally { running = false; }
  }

  /** Tin mới: đọc lại trang đầu (tối đa 5 trang) tới khi gặp ngày đã có; chỉ cho mã đã bắt đầu đọc. */
  async function refreshHead({ maxMs = 2 * 3_600_000 } = {}) {
    if (running) return { running: true };
    running = true; const t0 = now(); let pages = 0, added = 0;
    try {
      const st = readState();
      for (const t of universe()) {
        if (!st[t]?.oldest) continue;
        if (now() - t0 > maxMs) break;
        const f = path.join(newsDir, `${t}.json.gz`);
        const rows = readGz(f)?.rows ?? [];
        const newest = rows.reduce((m, r) => (r[0] > m ? r[0] : m), "");
        const have = new Set(rows.map((r) => `${r[0]}|${r[1]}`));
        const fresh = [];
        for (let p = 1; p <= 5; p++) {
          const got = await page(t, p); pages += 1; await sleep(delayMs);
          if (!got?.length) break;
          for (const r of got) if (KEEP.test(r[1]) && !have.has(`${r[0]}|${r[1]}`)) { fresh.push(r); have.add(`${r[0]}|${r[1]}`); }
          if (got.at(-1)[0] < newest) break;
        }
        if (fresh.length) { writeGz(f, { rows: [...fresh, ...rows] }); memo.delete(t); added += fresh.length; }
      }
      evalMemo = null;
      return { pages, added, ms: now() - t0 };
    } finally { running = false; }
  }

  function progress(st = readState()) {
    const u = universe();
    const reached = (d) => u.filter((t) => st[t]?.exhausted || (st[t]?.oldest && st[t].oldest < d)).length;
    return { total: u.length, reached: reached(CA_RULES.phaseA), reached2013: reached(CA_RULES.phaseB) };
  }

  /** Map(fiscal -> { date, tier, title }) của một mã (rỗng nếu chưa đọc). */
  function dates(t) {
    if (memo.has(t)) return memo.get(t);
    const m = announceFromNews(readGz(path.join(newsDir, `${t}.json.gz`))?.rows ?? []);
    memo.set(t, m); while (memo.size > 400) memo.delete(memo.keys().next().value);
    return m;
  }

  /** Tiêu chí đặt trước: ngày CafeF so ngày tin BCTC chính thức (VNDirect, 2024+) theo số phiên VN-Index. */
  function evaluate() {
    if (evalMemo) return evalMemo;
    const sess = (readGz(path.join(dir, "px", "VNINDEX.json.gz"))?.rows ?? []).map((r) => r[0]);
    const idx = (d) => { let lo = 0, hi = sess.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sess[m] < d) lo = m + 1; else hi = m; } return lo; };
    const disc = readGz(path.join(dir, "disclosures.json.gz"))?.byTicker ?? {};
    const st = readState();
    const r = { official: 0, found: 0, ok: 0, byTier: { FILING: { n: 0, ok: 0 }, PRESS: { n: 0, ok: 0 } }, cov2020: { of: 0, found: 0 }, vndLagSessions: [], worst: [] };
    for (const t of universe()) {
      if (!st[t]?.oldest) continue;
      const rec = readGz(path.join(dir, `${t}.json.gz`)); if (!rec) continue;
      const got = dates(t);
      for (const [fiscal, p] of publishDates(rec, disc[t] ?? [])) {
        const g = got.get(fiscal);
        if (p.source === "DISCLOSURE") {
          r.official += 1; if (!g) continue;
          if (g.tier !== "FILING") { r.byTier.PRESS.n += 1; const d0 = idx(g.date) - idx(p.date); if (Math.abs(d0) <= CA_RULES.maxSessions) r.byTier.PRESS.ok += 1; continue; } // chỉ lớp 1 được dùng
          r.found += 1; const d = idx(g.date) - idx(p.date);
          r.byTier.FILING.n += 1;
          if (Math.abs(d) <= CA_RULES.maxSessions) { r.ok += 1; r.byTier.FILING.ok += 1; } else if (r.worst.length < 30) r.worst.push({ t, fiscal, cafef: g.date, official: p.date, sessions: d, tier: g.tier, title: g.title.slice(0, 90) });
        } else if (fiscal >= "2020-03-31" && st[t].oldest < CA_RULES.phaseA) {
          r.cov2020.of += 1; if (g?.tier === "FILING") { r.cov2020.found += 1; r.vndLagSessions.push(idx(p.date) - idx(g.date)); }
        }
      }
    }
    const lag = r.vndLagSessions.sort((a, b) => a - b);
    const precision = r.found ? r.ok / r.found : null;
    evalMemo = { version: CA_VERSION, at: new Date(now()).toISOString(), official: r.official, found: r.found, ok: r.ok, precision, recall: r.official ? r.found / r.official : null, byTier: r.byTier,
      coverage2020: { of: r.cov2020.of, found: r.cov2020.found, share: r.cov2020.of ? r.cov2020.found / r.cov2020.of : null },
      vndLag: lag.length ? { median: lag[lag.length >> 1], share2plus: lag.filter((x) => x >= 2).length / lag.length } : null,
      pass: precision != null && r.found >= 100 && precision >= CA_RULES.minPrecision, rule: `≥ ${CA_RULES.minPrecision * 100}% số kỳ lệch ≤ ${CA_RULES.maxSessions} phiên so tin BCTC chính thức, ≥ 100 kỳ đối chiếu`, worst: r.worst };
    return evalMemo;
  }

  /** Tin thô đã lưu của một mã ([[ngày, tiêu đề]]) — LSK1 kiểm chéo ngày sự kiện. */
  const newsMemo = new Map();
  function news(t) {
    if (!newsMemo.has(t)) { newsMemo.set(t, readGz(path.join(newsDir, `${t}.json.gz`))?.rows ?? null); while (newsMemo.size > 300) newsMemo.delete(newsMemo.keys().next().value); }
    return newsMemo.get(t);
  }

  return { crawl, refreshHead, dates, news, clearNews: () => newsMemo.clear(), evaluate, hasStarted: () => Object.keys(readState()).length > 0, status: () => ({ version: CA_VERSION, running, last, ...progress(), rules: CA_RULES }) };
}

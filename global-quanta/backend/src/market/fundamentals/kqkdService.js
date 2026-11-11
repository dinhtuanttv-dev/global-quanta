// K0 (06/11/2026) — kho BCTC quý đầy đủ trên Railway Volume + dịch vụ KQKD theo quý.
//   Thư mục: KQKD_DATA_DIR | <RAILWAY_VOLUME_MOUNT_PATH>/fundamentals | backend/data/fundamentals (chạy local). Không dùng Neon / Supabase.
//   Mỗi mã một file gzip (<MÃ>.json.gz, ~15–25 KB) + summary.json.gz (bảng toàn thị trường dựng sẵn).
//   Làm mới: job kqkdRefresh 2 lần/ngày (12:15, 19:15 giờ VN, cả cuối tuần — công ty công bố cả ngày nghỉ); nguồn lỗi -> giữ file cũ.
//   Heap: chỉ giữ bảng tóm tắt (~0,5 MB) + đệm LRU 24 chi tiết mã; đọc file từng mã khi dựng lại bảng.
//   Danh sách mã = universe của job alpha (KV alpha:vnd, ~284 mã) — cùng phạm vi với Chất lượng KQKD (F5).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { ALPHA_KV } from "../alpha/alphaService.js";
import { fetchTickerStatements } from "./statementsVnd.js";
import { LEDGER_VERSION, recordLedger, scoreLedger } from "./kqkdLedger.js";
import { attainment, sameScope } from "./agmPlans.js";
import { buildCalendar, publishDates, seasonQuarters } from "./earningsCalendar.js";
import { auditEventDates, createSeasonalityBundle, SB_VERSION } from "./seasonalityBundle.js";
import { pooledEvidence } from "./eventStudy.js";

/** LC4: tin công bố BCTC chính thức của một mã (VNDirect newsType financialstatement) -> [[date, title]]. */
export async function fetchDisclosures(t, { fetchImpl = globalThis.fetch, since = "2023-01-01" } = {}) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetchImpl(`https://api-finfo.vndirect.com.vn/v4/news?q=tagCodes:${t}~newsType:financialstatement~newsDate:gte:${since}~locale:VN&size=200&sort=newsDate:asc`, { headers: { "user-agent": "Mozilla/5.0 (compatible; GlobalQuanta/1.0)", accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
      if (r.ok) return ((await r.json()).data ?? []).map((n) => [String(n.newsDate ?? "").slice(0, 10), String(n.newsTitle ?? "").slice(0, 200)]).filter((x) => x[0]);
    } catch { /* thử lại */ }
    await new Promise((res) => setTimeout(res, 1000 * (a + 1)));
  }
  return null;
}
import { ytdFromStatements } from "./agmPlansService.js";

/** AGM-v1: kế hoạch ĐHĐCĐ đã kiểm + tiến độ hoàn thành cho một mã. */
export function planView(p, rec, { year, cumShare = null, nowcastEst = null }) {
  if (!p?.plan) return null;
  const ytd = ytdFromStatements(rec, year);
  const att = ytd ? attainment(p.plan, { ytd, through: ytd.through, cumShare, nowcastEst }) : null;
  const items = Object.fromEntries(Object.entries(p.plan.items).map(([k, x]) => [k, x.status === "ABSENT" ? { status: "ABSENT" } : { status: x.status, vnd: x.vnd, basis: x.basis, value: x.value, unit: x.unit, rowLabel: x.rowLabel, quote: x.quote, page: x.page, ratioPrior: x.ratioPrior, priorCheck: x.priorCheck, reason: x.reason, sameScope: sameScope(x) }]));
  return { year, approved: p.plan.approved, draft: p.plan.draft, doc: p.doc, models: p.models, at: p.at, items, attainment: att };
}
import { buildSummary, buildSummaryRow, buildTickerDetail, evidenceFrom, KQ_VERSION } from "./kqkdEngine.js";
import { EPS_V2, selectEps } from "./sharesEps.js";

// KQ-r1 (06/11/2026): kết quả kiểm định đặt trước, chạy một lần (scripts/kqkd-validate.mjs) — gắn vào API để giao diện ghi đúng nhãn.
let EVIDENCE = null;
try { EVIDENCE = evidenceFrom(JSON.parse(fs.readFileSync(new URL("./kq-r1-report.json", import.meta.url), "utf8"))); } catch { /* chưa có báo cáo */ }

const vnToday = (t) => new Date(t + 7 * 3_600_000).toISOString().slice(0, 10);
const TICKER = /^[A-Z0-9]{3,10}$/;

export function kqkdDirFromEnv(env = process.env, cwd = process.cwd()) {
  if (env.KQKD_DATA_DIR) return path.resolve(env.KQKD_DATA_DIR);
  if (env.RAILWAY_VOLUME_MOUNT_PATH) return `${env.RAILWAY_VOLUME_MOUNT_PATH.replace(/\/+$/, "")}/fundamentals`;
  return path.resolve(cwd, "data", "fundamentals");
}

function writeGz(file, obj) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, zlib.gzipSync(JSON.stringify(obj)));
  fs.renameSync(tmp, file);
}
function readGz(file) {
  try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8")); } catch { return null; }
}

export function createKqkdService({ store = null, dir = kqkdDirFromEnv(), fetchImpl = globalThis.fetch, now = Date.now, log = console, concurrency = 2, fetchTicker = fetchTickerStatements, getCloses = null, getPlan = null, getEventStudy = null, getSharesEps = null, getActions = null, seasonalityBundle = createSeasonalityBundle({ fetchImpl }), isHoliday = (d) => [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()), fetchDisc = fetchDisclosures } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const fileOf = (t) => path.join(dir, `${t}.json.gz`);
  const summaryFile = path.join(dir, "summary.json.gz");
  const ledgerFile = path.join(dir, "ledger-nowcast.json");
  const discFile = path.join(dir, "disclosures.json.gz");
  let calendarMemo = null; // { key, doc }
  const pooledMemo = new Map(); // `${builtAt}|${l2}` -> kết quả gộp (S4)
  const readLedger = () => { try { return JSON.parse(fs.readFileSync(ledgerFile, "utf8")); } catch { return { version: LEDGER_VERSION, startedAt: null, entries: [] }; } };
  let ledgerMemo = null; // { key, doc }
  let summaryMemo = null; // { key, doc }
  const detailMemo = new Map(); // key -> doc (LRU 24)
  const state = { running: false, startedAt: null, finishedAt: null, done: 0, total: 0, failed: [], lastError: null, reason: null };

  async function vndDoc() {
    try { return (await store?.getKv?.(ALPHA_KV.vnd))?.value ?? null; } catch { return null; }
  }
  async function universe() {
    const vnd = await vndDoc();
    const fromKv = Object.keys(vnd?.fund ?? {}).filter((t) => TICKER.test(t));
    if (fromKv.length) return fromKv.sort();
    return fs.readdirSync(dir).filter((f) => /^[A-Z0-9]{3,10}\.json\.gz$/.test(f)).map((f) => f.slice(0, -8)).sort();
  }
  async function mcapMap() {
    const vnd = await vndDoc();
    return new Map(Object.entries(vnd?.mcap ?? {}).map(([t, rows]) => [t, [...rows].sort((a, b) => String(a[0]).localeCompare(String(b[0]))).at(-1)?.[1] ?? null]));
  }

  /** Dựng lại bảng toàn thị trường từ các file mã (point-in-time theo hôm nay). */
  async function rebuildSummary(reason = "rebuild") {
    const today = vnToday(now());
    const tickers = await universe();
    const mcap = await mcapMap();
    const rows = []; let fetchedAt = null;
    for (const t of tickers) {
      const rec = readGz(fileOf(t));
      if (!rec) continue;
      if (rec.fetchedAt && (!fetchedAt || rec.fetchedAt > fetchedAt)) fetchedAt = rec.fetchedAt;
      try {
        const row = buildSummaryRow(rec, { today, mcap: mcap.get(t) ?? null });
        if (row && getPlan) {
          const year = Number(row.fiscal.slice(0, 4));
          const v = planView(getPlan(t, year), rec, { year, cumShare: row.nowcast?.cumShare ?? null, nowcastEst: row.nowcast?.est ?? null });
          if (v) row.plan = { approved: v.approved, draft: v.draft, metric: v.attainment?.metric ?? null, done: v.attainment?.done ?? null, pace: v.attainment?.pace ?? null, typical: v.attainment?.typical ?? null, nowcastVsPlan: v.attainment?.nowcastVsPlan ?? null, verified: Object.values(v.items).some((x) => x.status === "VERIFIED") };
        }
        // EPS-v1 (P0): EPS 12 tháng đúng cho mọi mẫu BCTC. EPS-v2 (P1): điều chỉnh hồi tố IAS 33 theo thưởng / cổ tức CP / quyền mua có GDKHQ sau quý.
        if (row?.ttm) { const h = getSharesEps?.()?.(t); const a = getActions?.(t) ?? null;
          const s = selectEps({ npatTtm: row.ttm.npat, quarterEnd: row.fiscal, epsHist: h?.eps, sharesHist: h?.shares, sumEps: row.ttm.eps, tpl: row.tpl, events: a?.events ?? [], asOf: today, pcumOf: a?.pcumOf ?? (() => null) });
          row.ttm = { ...row.ttm, eps: s.eps, epsSource: s.source, epsCheck: s.check, shares: s.shares, epsVersion: EPS_V2,
            epsQ: s.epsQ, epsBasis: s.basis, epsFactor: s.factor, epsActions: s.actions, sharesGap: s.sharesGap, epsFlags: s.flags }; }
        rows.push(row);
      } catch (e) { log.warn?.(`[kqkd] ${t}: ${e.message}`); }
    }
    const missing = tickers.filter((t) => !fs.existsSync(fileOf(t)));
    const doc = { ...buildSummary(rows, { today, fetchedAt, failed: [...new Set([...state.failed, ...missing])] }), builtAt: new Date(now()).toISOString(), reason, evidence: EVIDENCE };
    writeGz(summaryFile, doc);
    // KQ-L1: ghi sổ theo dõi tiến (chỉ thêm, không sửa).
    try {
      const L = readLedger();
      const added = recordLedger(L, doc.rows, today);
      if (added) { L.startedAt ??= today; const tmp = `${ledgerFile}.tmp-${process.pid}`; fs.writeFileSync(tmp, JSON.stringify(L)); fs.renameSync(tmp, ledgerFile); ledgerMemo = null; log.log?.(`[kqkd] sổ tiến: +${added} dòng (${L.entries.length}).`); }
    } catch (e) { log.warn?.(`[kqkd] sổ tiến lỗi: ${e.message}`); }
    summaryMemo = { key: today, doc };
    detailMemo.clear();
    return doc;
  }

  /** Nạp lại BCTC từ VNDirect. force=false: bỏ qua mã đã nạp trong 20 giờ. */
  async function refresh({ force = true, tickers = null, reason = "job" } = {}) {
    if (state.running) return { started: false, running: true, ...status() };
    state.running = true; state.startedAt = new Date(now()).toISOString(); state.finishedAt = null; state.failed = []; state.lastError = null; state.reason = reason;
    try {
      const list = (tickers ?? (await universe())).filter((t) => TICKER.test(t));
      const todo = list.filter((t) => force || !(Date.parse(readGz(fileOf(t))?.fetchedAt ?? 0) > now() - 20 * 3600e3));
      state.total = todo.length; state.done = 0;
      await Promise.all(Array.from({ length: concurrency }, async () => {
        while (todo.length) {
          const t = todo.shift();
          try {
            const rec = await fetchTicker(t, { fetchImpl });
            if (rec?.quarters?.length) writeGz(fileOf(t), { ...rec, fetchedAt: new Date(now()).toISOString(), version: KQ_VERSION });
            else state.failed.push(t);
          } catch (e) { state.failed.push(t); state.lastError = e.message; }
          state.done += 1;
        }
      }));
      // LC4: tin công bố BCTC chính thức (lỗi -> giữ bản cũ của mã đó).
      const disc = readGz(discFile) ?? { fetchedAt: null, byTicker: {} };
      const dtodo = [...list];
      await Promise.all(Array.from({ length: concurrency + 1 }, async () => { while (dtodo.length) { const t = dtodo.shift(); const d = await fetchDisc(t, { fetchImpl }); if (d) disc.byTicker[t] = d; } }));
      disc.fetchedAt = new Date(now()).toISOString();
      writeGz(discFile, disc);
      calendarMemo = null;
      const doc = await rebuildSummary(reason);
      log.log?.(`[kqkd] làm mới ${state.done} mã (lỗi ${state.failed.length}), ${doc.counts.reportedLatest}/${doc.counts.tickers} đã có ${doc.latestQuarter}.`);
    } catch (e) {
      state.lastError = e.message; throw e;
    } finally {
      state.running = false; state.finishedAt = new Date(now()).toISOString();
    }
    return { started: true, ...status() };
  }

  async function summary() {
    const today = vnToday(now());
    if (summaryMemo?.key === today) return summaryMemo.doc;
    const disk = readGz(summaryFile);
    if (disk?.asOf === today && disk.version === KQ_VERSION) { summaryMemo = { key: today, doc: disk }; return disk; }
    if (!(await universe()).some((t) => fs.existsSync(fileOf(t)))) return null; // chưa nạp lần nào
    return rebuildSummary("new-day");
  }

  async function detail(ticker) {
    const t = String(ticker ?? "").toUpperCase();
    if (!TICKER.test(t)) return null;
    let rec = readGz(fileOf(t));
    if (!rec) {
      if (!(await universe()).includes(t)) return null; // chỉ nạp ngay mã thuộc universe (không gọi nguồn ngoài theo tham số tuỳ ý)
      rec = await fetchTicker(t, { fetchImpl });
      if (!rec?.quarters?.length) return null;
      rec = { ...rec, fetchedAt: new Date(now()).toISOString(), version: KQ_VERSION };
      writeGz(fileOf(t), rec);
    }
    const today = vnToday(now());
    const key = `${t}|${today}|${rec.fetchedAt}`;
    if (detailMemo.has(key)) { const d = detailMemo.get(key); detailMemo.delete(key); detailMemo.set(key, d); return d; }
    const mcap = (await mcapMap()).get(t) ?? null;
    const doc = { ...buildTickerDetail(rec, { today, fetchedAt: rec.fetchedAt ?? null }), mcap, evidence: EVIDENCE, reactions: (getEventStudy?.()?.byTicker?.[t] ?? null)?.filter((e) => !e.insufficient) ?? null };
    // LC4: ngày công bố thật của quý mới nhất (tin BCTC chính thức sớm hơn ngày dữ liệu vài ngày).
    if (doc.available) {
      const pub = publishDates(rec, readGz(discFile)?.byTicker?.[t] ?? []).get(doc.latest.fiscal);
      if (pub) doc.latest = { ...doc.latest, published: pub.date, publishedSource: pub.source };
    }
    if (getPlan && doc.available) {
      const year = Number(doc.latest.fiscal.slice(0, 4)), nc = doc.seasonality?.npatParent?.nowcast ?? null;
      doc.plan = planView(getPlan(t, year), rec, { year, cumShare: nc?.cumShare ?? null, nowcastEst: nc?.est ?? null });
    }
    detailMemo.set(key, doc);
    while (detailMemo.size > 24) detailMemo.delete(detailMemo.keys().next().value);
    return doc;
  }

  /** Sổ theo dõi tiến + điểm (giá chỉ nạp cho lứa đã đủ ~85 ngày lịch). */
  async function ledger() {
    const today = vnToday(now());
    const L = readLedger();
    const key = `${today}|${L.entries.length}`;
    if (ledgerMemo?.key === key) return ledgerMemo.doc;
    const ripe = new Set(L.entries.filter((e) => Date.parse(e.recordedAt) + 85 * 864e5 <= now()).map((e) => e.t));
    const closes = new Map();
    if (getCloses) for (const t of ripe) { try { closes.set(t, (await getCloses(t)) ?? []); } catch { closes.set(t, []); } }
    const fyMemo = new Map();
    const fyOf = (t, y) => {
      if (!fyMemo.has(t)) { const rec = readGz(fileOf(t)); const by = new Map((rec?.quarters ?? []).map((q) => [q.fiscal.slice(0, 7), q.v?.npatParent ?? q.v?.npat])); fyMemo.set(t, by); }
      const by = fyMemo.get(t); const v = ["03", "06", "09", "12"].map((m) => by.get(`${y}-${m}`));
      return v.every((x) => typeof x === "number") ? v.reduce((a, b) => a + b, 0) : null;
    };
    const doc = { ...scoreLedger(L, { closesOf: (t) => closes.get(t) ?? [], fyOf }), asOf: today };
    ledgerMemo = { key, doc };
    return doc;
  }

  /** LC4: lịch công bố mùa hiện tại + mùa kế tiếp. */
  async function calendar() {
    const today = vnToday(now());
    const disc = readGz(discFile) ?? { fetchedAt: null, byTicker: {} };
    const sum = await summary();
    const key = `${today}|${sum?.fetchedAt ?? ""}|${disc.fetchedAt ?? ""}|${getEventStudy?.()?.builtAt ?? ""}`;
    if (calendarMemo?.key === key) return calendarMemo.doc;
    const recs = (await universe()).map((t) => readGz(fileOf(t))).filter(Boolean);
    if (!recs.length) return null;
    const resultOf = new Map((sum?.rows ?? []).map((r) => [r.t, r]));
    const { current, next } = seasonQuarters(today);
    const opts = { today, disclosuresOf: (t) => disc.byTicker[t] ?? [], resultOf: (t) => resultOf.get(t) ?? null, isHoliday };
    const doc = { asOf: today, disclosuresFetchedAt: disc.fetchedAt, current: buildCalendar(recs, { ...opts, fiscal: current }), next: buildCalendar(recs, { ...opts, fiscal: next }) };
    // LC3: phản ứng giá — đã công bố: sự kiện của quý; chưa công bố: KL/giá bất thường 10 phiên gần nhất.
    const es = getEventStudy?.() ?? null;
    if (es) {
      for (const season of [doc.current, doc.next]) for (const r of season.rows) {
        const ev = (es.byTicker?.[r.t] ?? []).find((e) => e.fiscal === season.quarter.fiscal);
        r.reaction = ev?.insufficient ? { kind: "THIN", nEst: ev.nEst } : ev ? { kind: "EVENT", carAnn: ev.carAnn, scarAnn: ev.scarAnn, avAnn: ev.avAnn, carPre: ev.carPre, avPre: ev.avPre, sessionsAfter: ev.sessionsAfter, source: ev.source }
          : r.status !== "REPORTED" && es.live?.[r.t] ? { kind: "LIVE", ...es.live[r.t] } : null;
      }
      doc.eventStudy = { version: es.version, builtAt: es.builtAt, aggregate: es.aggregate };
    }
    calendarMemo = { key, doc };
    return doc;
  }

  /** S7/S3/S5: Mùa vụ KQKD của một mã — gói 9 API Project A + kiểm ngày làm mốc + bối cảnh kỳ tới. */
  async function seasonality(ticker) {
    const t = String(ticker ?? "").toUpperCase();
    if (!TICKER.test(t) || !(await universe()).includes(t)) return null; // chỉ mã thuộc universe (không gọi nguồn ngoài theo tham số tuỳ ý)
    const b = await seasonalityBundle.get(t);
    const rec = readGz(fileOf(t));
    const disc = readGz(discFile)?.byTicker?.[t] ?? [];
    const px = readGz(path.join(dir, "px", `${t}.json.gz`))?.rows ?? [];
    const idx = new Map(px.map((r, i) => [r[0], i]));
    const sessionsOf = (d) => { if (idx.has(d)) return idx.get(d); const i = px.findIndex((r) => r[0] >= d); return i < 0 ? null : i; };
    const pathsByQ = Object.fromEntries([1, 2, 3, 4].map((q) => [q, b.items[`paths:${q}`]?.body ?? null]));
    const audit = auditEventDates(pathsByQ, rec, disc, px.length ? sessionsOf : null);
    // Bối cảnh kỳ tới: dòng lịch (mùa hiện tại nếu chưa công bố, ngược lại mùa kế tiếp), ước tính cả năm, kế hoạch ĐHCĐ, KL/giá 10 phiên.
    let context = null;
    try {
      const cal = await calendar();
      const cur = cal?.current.rows.find((r) => r.t === t) ?? null, nxt = cal?.next.rows.find((r) => r.t === t) ?? null;
      const pick = cur && cur.status !== "REPORTED" ? { season: cal.current.quarter, row: cur } : nxt ? { season: cal.next.quarter, row: nxt } : null;
      const sum = await summary();
      const row = sum?.rows.find((r) => r.t === t) ?? null;
      context = {
        next: pick ? { quarter: pick.season.label, fiscal: pick.season.fiscal, deadlineConsolidated: pick.season.deadlineConsolidated, status: pick.row.status, date: pick.row.date, expected: pick.row.expected, band: pick.row.band, pNext: pick.row.pNext, medianLag: pick.row.medianLag, ownN: pick.row.ownN, lateShare: pick.row.lateShare } : null,
        last: cur?.status === "REPORTED" ? { quarter: cal.current.quarter.label, date: cur.date, source: cur.source, result: cur.result, reaction: cur.reaction ?? null } : null,
        nowcast: row?.nowcast ?? null, nowcastLabel: EVIDENCE?.nowcast?.label ?? "MÔ TẢ", plan: row?.plan ?? null,
        live: getEventStudy?.()?.live?.[t] ?? null,
      };
    } catch (e) { log.warn?.(`[kqkd] bối cảnh mùa vụ ${t}: ${e.message}`); }
    // S4: bằng chứng gộp (tham chiếu) — cùng ngành ICB cấp 2 × loại quý và toàn thị trường, từ nghiên cứu sự kiện ES-v1.
    try {
      const es = getEventStudy?.();
      if (es?.events?.length && context) {
        const icb = (await store?.getKv?.("sectors:icb"))?.value ?? null;
        const l2 = icb?.symbols?.[t]?.l2 ?? null;
        const pool = (key, members) => { const k = `${es.builtAt}|${key}`; if (!pooledMemo.has(k)) { pooledMemo.set(k, pooledEvidence(es.events, members)); while (pooledMemo.size > 60) pooledMemo.delete(pooledMemo.keys().next().value); } return pooledMemo.get(k); };
        const members = l2 ? new Set(Object.entries(icb.symbols).filter(([, m]) => m.l2 === l2).map(([s]) => s)) : null;
        context.pooled = { version: es.version, builtAt: es.builtAt,
          sector: l2 ? { code: l2, name: icb.levels?.[2]?.find((x) => x.code === l2)?.name ?? l2, byQ: pool(`l2:${l2}`, members) } : null,
          market: { byQ: pool("all", new Set(es.events.map((e) => e.t))) } };
      }
    } catch (e) { log.warn?.(`[kqkd] gộp ngành ${t}: ${e.message}`); }
    return { version: SB_VERSION, ticker: t, fetchedAt: new Date(b.at).toISOString(), cached: b.cached, stale: b.stale, source: b.origin === "store" ? "gateway-store" : seasonalityBundle.base, origin: b.origin ?? "projectA", items: b.items, audit, context };
  }

  function status() {
    let files = 0;
    try { files = fs.readdirSync(dir).filter((f) => /^[A-Z0-9]{3,10}\.json\.gz$/.test(f)).length; } catch { /* */ }
    return { version: KQ_VERSION, dir: path.basename(dir), files, ...state, failed: state.failed.slice(0, 50), failedCount: state.failed.length };
  }

  return { refresh, summary, detail, status, rebuildSummary, ledger, calendar, seasonality, clearMemo: () => { summaryMemo = null; detailMemo.clear(); }, hasData: () => fs.existsSync(summaryFile) };
}

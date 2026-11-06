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
import { buildSummary, buildSummaryRow, buildTickerDetail, KQ_VERSION } from "./kqkdEngine.js";

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

export function createKqkdService({ store = null, dir = kqkdDirFromEnv(), fetchImpl = globalThis.fetch, now = Date.now, log = console, concurrency = 2, fetchTicker = fetchTickerStatements } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const fileOf = (t) => path.join(dir, `${t}.json.gz`);
  const summaryFile = path.join(dir, "summary.json.gz");
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
    return fs.readdirSync(dir).filter((f) => f.endsWith(".json.gz") && f !== "summary.json.gz").map((f) => f.slice(0, -8)).sort();
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
      try { rows.push(buildSummaryRow(rec, { today, mcap: mcap.get(t) ?? null })); } catch (e) { log.warn?.(`[kqkd] ${t}: ${e.message}`); }
    }
    const missing = tickers.filter((t) => !fs.existsSync(fileOf(t)));
    const doc = { ...buildSummary(rows, { today, fetchedAt, failed: [...new Set([...state.failed, ...missing])] }), builtAt: new Date(now()).toISOString(), reason };
    writeGz(summaryFile, doc);
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
    const doc = { ...buildTickerDetail(rec, { today, fetchedAt: rec.fetchedAt ?? null }), mcap };
    detailMemo.set(key, doc);
    while (detailMemo.size > 24) detailMemo.delete(detailMemo.keys().next().value);
    return doc;
  }

  function status() {
    let files = 0;
    try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".json.gz") && f !== "summary.json.gz").length; } catch { /* */ }
    return { version: KQ_VERSION, dir: path.basename(dir), files, ...state, failed: state.failed.slice(0, 50), failedCount: state.failed.length };
  }

  return { refresh, summary, detail, status, rebuildSummary, hasData: () => fs.existsSync(summaryFile) };
}

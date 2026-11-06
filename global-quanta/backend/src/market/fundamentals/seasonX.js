// S8-2 (06/11/2026) — điều phối Mùa vụ KQKD bản THĂM DÒ "ngày làm mốc = ngày công bố thật (CafeF)".
// Tính trong worker (seasonXJob.mjs, đúng hàm Project A), lưu <dir>/seasonx/<MÃ>.json.gz + seasonx/_index.json. KHÔNG ghi bảng "season"
// (bản chính, Timeline điểm mua đọc bảng đó). Chỉ chạy khi ngày CafeF đạt tiêu chí đặt trước (cafef.evaluate().pass) — trừ khi force.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { itemsFromRow } from "./seasonStore.js";

export const SX_VERSION = "SX-v1 (2026-11-06)";
const JOB = fileURLToPath(new URL("./seasonXJob.mjs", import.meta.url));
const readGz = (f) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString("utf8")); } catch { return null; } };
const writeGz = (f, o) => { const tmp = `${f}.tmp-${process.pid}`; fs.writeFileSync(tmp, zlib.gzipSync(JSON.stringify(o))); fs.renameSync(tmp, f); };

export function createSeasonX({ dir, cafef, listMeta, runJob, now = Date.now, log = console, batch = 8 }) {
  const xDir = path.join(dir, "seasonx");
  fs.mkdirSync(xDir, { recursive: true });
  const indexFile = path.join(xDir, "_index.json");
  let running = false, progress = null;
  const readIndex = () => { try { return JSON.parse(fs.readFileSync(indexFile, "utf8")); } catch { return null; } };

  async function run({ force = false, since = "2019-10-01" } = {}) {
    if (running) return { running: true };
    const ev = cafef.evaluate();
    if (!ev.pass && !force) return { skipped: "ngày CafeF chưa đạt tiêu chí đặt trước", evaluate: { precision: ev.precision, found: ev.found } };
    running = true; const t0 = now(); const asOf = new Date(now()).toISOString();
    try {
      const meta = await listMeta();
      const tickers = meta.map((m) => m.ticker).sort();
      const sector = new Map(meta.map((m) => [m.ticker, m.sector ?? null]));
      const collected = [], failed = [], sources = { cafef: 0, vnd: 0, added: 0 };
      progress = { done: 0, total: tickers.length };
      for (let i = 0; i < tickers.length; i += batch) {
        const part = tickers.slice(i, i + batch);
        const overrides = Object.fromEntries(part.map((t) => [t, Object.fromEntries([...cafef.dates(t)].filter(([f, v]) => f >= since && v.tier === "FILING").map(([f, v]) => [f, v.date]))]));
        let r;
        try { r = await runJob({ fn: "collectX", params: { tickers: part, overrides, asOf }, modulePath: JOB }); } catch (e) { failed.push(...part.map((t) => `${t}: ${e.message}`)); continue; }
        for (const row of r.body?.rows ?? []) {
          if (!row.ok) { failed.push(`${row.ticker}: ${row.error}`); continue; }
          writeGz(path.join(xDir, `${row.ticker}.json.gz`), { ticker: row.ticker, announce: row.announce, sources: row.sources, paths: row.paths, priceSource: row.priceSource });
          for (const k of Object.keys(sources)) sources[k] += row.sources[k];
          collected.push({ ticker: row.ticker, sector: sector.get(row.ticker) ?? null, samples: row.samples, announce: row.announce });
        }
        progress.done = Math.min(tickers.length, i + batch);
      }
      const fin = await runJob({ fn: "finalizeX", params: { collected, asOf }, modulePath: JOB });
      for (const [t, v] of Object.entries(fin.body?.rows ?? {})) {
        const f = path.join(xDir, `${t}.json.gz`), cur = readGz(f) ?? {};
        writeGz(f, { ...cur, stats: v.stats, calendar: v.calendar, priorScope: v.priorScope });
      }
      const doc = { version: SX_VERSION, builtAt: asOf, tickers: collected.length, failed: failed.length, failedSample: failed.slice(0, 10), sources, since, evaluate: { precision: ev.precision, recall: ev.recall, found: ev.found, pass: ev.pass }, ms: now() - t0 };
      fs.writeFileSync(indexFile, JSON.stringify(doc));
      log.log?.(`[season-x] ${collected.length} mã, lỗi ${failed.length}, ngày CafeF ${sources.cafef} / VNDirect ${sources.vnd}, ${((now() - t0) / 1000).toFixed(0)} s.`);
      return doc;
    } finally { running = false; progress = null; }
  }

  /** 9 mục như 9 API Project A (hợp đồng 200/404) + nguồn ngày làm mốc của mã. null nếu chưa dựng. */
  function items(t) {
    const idx = readIndex(); if (!idx) return null;
    const row = readGz(path.join(xDir, `${t}.json.gz`));
    return { version: SX_VERSION, builtAt: idx.builtAt, items: itemsFromRow(row?.stats ? row : null), sources: row?.sources ?? null, announce: row?.announce ?? null };
  }

  return { run, items, status: () => ({ version: SX_VERSION, running, progress, index: readIndex() }) };
}

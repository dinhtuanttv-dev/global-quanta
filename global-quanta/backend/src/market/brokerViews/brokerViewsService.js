// Sổ nhận định CTCK (31/10/2026): thu thập báo cáo công khai, Gemini đề xuất, code kiểm chứng, lưu dữ kiện đã kiểm chứng.
// Xử lý tuần tự từng PDF và không giữ lại file, vì Gateway từng hết bộ nhớ. Có trần token theo ngày.
import { ALLOWED_HOSTS, BROKERS, parseDetail, SOURCES, wanted } from "./brokerSources.js";
import { compact, EXTRACT_SCHEMA, pdfPages, systemPrompt, verifyExtract } from "./brokerExtract.js";
import { buildConsensus } from "./brokerConsensus.js";
import { TOPICS } from "./brokerExtract.js";

export const KV_KEY = "broker:views:v1";
export const MAX_PDF_BYTES = 15 * 1024 * 1024;
export const MAX_PER_RUN = 5;
export const DAILY_TOKEN_CAP = 300_000;
export const BACKFILL_DAYS = 150;
const MAX_ATTEMPTS = 4;
// Báo cáo chỉ đọc một lần nên không dùng bản lite: model bận thì để lượt sau, tránh kết quả nghèo được lưu vĩnh viễn.
const EXTRACT_MODELS = ["gemini-flash-latest", "gemini-3.5-flash", "gemini-3.6-flash"];
const UA = "Mozilla/5.0 (compatible; DinhTuanResearchBot/1.0)";
/** Quá tải, hết hạn mức, hết giờ là lỗi tạm thời: thử lại lượt sau, không tính vào số lần hỏng của báo cáo. */
export function isTransient(e) {
  if (e?.attempts?.length) return e.attempts.every((a) => a.status === 429 || a.status >= 500 || /abort|timeout|fetch failed/i.test(a.error ?? ""));
  return /abort|timeout|fetch failed/i.test(e?.message ?? "");
}
const vnDay = (ms) => new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);

/** Chỉ trang trong danh sách nguồn, sau chuyển hướng vẫn phải đúng host. */
export function allowedUrl(u) {
  try { const x = new URL(u); return (x.protocol === "https:" || x.protocol === "http:") && ALLOWED_HOSTS.has(x.hostname); } catch { return false; }
}

export function createBrokerViews({ store = null, callModel, getIndexBars = async () => [], getQuant = async () => [], fetchImpl = globalThis.fetch, readPdf = pdfPages, now = Date.now, log = console, sources = SOURCES, pauseMs = 1500 } = {}) {
  let state = null, inflight = null;
  async function load() {
    if (state) return;
    try { state = (await store?.getKv?.(KV_KEY))?.value ?? null; } catch (e) { log.warn?.(`[broker-views] đọc kho: ${e.message}`); }
    state ??= { reports: [], seen: {}, tokens: {}, sources: {} };
  }
  const persist = async () => { try { await store?.setKv?.(KV_KEY, state); } catch (e) { log.warn?.(`[broker-views] ghi kho: ${e.message}`); } };
  const pause = () => (pauseMs ? new Promise((r) => setTimeout(r, pauseMs)) : null);

  async function fetchChecked(u, timeoutMs = 25_000) {
    if (!allowedUrl(u)) throw new Error("URL ngoài danh sách nguồn");
    const res = await fetchImpl(u, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(timeoutMs), redirect: "follow" });
    if (res.url && !allowedUrl(res.url)) throw new Error("Chuyển hướng ra ngoài danh sách nguồn");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  }

  async function listAll() {
    const out = [];
    for (const s of sources) {
      try {
        const html = await (await fetchChecked(s.url)).text();
        const items = s.parse(html, s.url).filter((x) => wanted(x.title));
        state.sources[s.id] = { at: new Date(now()).toISOString(), found: items.length, error: null };
        for (const it of items) out.push({ ...it, broker: s.broker, type: s.type, sourceId: s.id });
      } catch (e) { state.sources[s.id] = { at: new Date(now()).toISOString(), found: 0, error: String(e.message).slice(0, 120) }; }
      await pause();
    }
    return out;
  }

  const tokensToday = () => state.tokens[vnDay(now())] ?? 0;
  const keyOf = (it) => it.pdfUrl ?? (it.summary ? `${it.pageUrl}#${it.title}` : it.pageUrl);

  async function extract(it, icb, parts, pages, numPages) {
    const out = await callModel({ systemPrompt: systemPrompt(icb), parts, models: EXTRACT_MODELS, generationConfig: { temperature: 0, responseSchema: EXTRACT_SCHEMA }, timeoutMs: 120_000 });
    const day = vnDay(now());
    state.tokens = { [day]: (state.tokens[day] ?? 0) + (out.usage?.totalTokenCount ?? 0) };
    const checked = verifyExtract(out.json, pages, new Set(icb.map((x) => x.icb)));
    const date = it.publishedAt ?? (/^20\d{2}-\d{2}-\d{2}$/.test(out.json?.reportDate ?? "") ? out.json.reportDate : null);
    return { status: "done", report: { id: `${it.broker}-${date ?? "na"}-${Math.abs(hash(keyOf(it))).toString(36)}`, broker: it.broker, brokerName: BROKERS[it.broker]?.name ?? it.broker, type: it.type, title: it.title, publishedAt: date, url: it.pageUrl?.endsWith(".pdf") ? it.pdfUrl : it.pageUrl ?? it.pdfUrl, pdfUrl: it.pdfUrl ?? null, pages: numPages, publicSummaryOnly: !!it.summary, model: out.modelUsed ?? null, tokens: out.usage?.totalTokenCount ?? null, extractedAt: new Date(now()).toISOString(), ...checked } };
  }

  async function processOne(it, icb) {
    if (it.summary) return extract(it, icb, [{ text: `Báo cáo: ${it.title}\nTrang 1 (tóm tắt công khai):\n${it.summary}` }], ["", compact(it.summary)], 1);
    if (!it.pdfUrl) {
      const d = parseDetail(await (await fetchChecked(it.pageUrl)).text(), it.pageUrl);
      it.pdfUrl = d.pdfUrl; it.publishedAt ??= d.publishedAt;
      if (!it.pdfUrl) return { status: "no_pdf" };
    }
    const res = await fetchChecked(it.pdfUrl, 60_000);
    if (Number(res.headers?.get?.("content-length")) > MAX_PDF_BYTES) return { status: "too_big" };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_PDF_BYTES) return { status: "too_big" };
    if (buf.subarray(0, 4).toString() !== "%PDF") return { status: "not_pdf" };
    const text = await readPdf(buf);
    if (text.tooLong) return { status: "too_long" };
    if ((text.chars ?? 0) < 500) return { status: "no_text" }; // scan ảnh: không kiểm chứng được nên không dùng
    return extract(it, icb, [{ inlineData: { mimeType: "application/pdf", data: buf.toString("base64") } }, { text: `Báo cáo: ${it.title}` }], text.pages, text.numPages);
  }

  async function run({ maxReports = MAX_PER_RUN } = {}) {
    const items = await listAll();
    const cutoff = vnDay(now() - BACKFILL_DAYS * 86_400_000);
    const icb = (await getQuant().catch(() => [])).map((x) => ({ icb: x.icb, nameVi: x.nameVi }));
    const todo = items.filter((it) => { const s = state.seen[keyOf(it)]; return (!it.publishedAt || it.publishedAt >= cutoff) && (!s || (s.status === "error" && s.attempts < MAX_ATTEMPTS)); }).sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    let done = 0;
    for (const it of todo.slice(0, maxReports)) {
      if (tokensToday() >= DAILY_TOKEN_CAP) { state.capped = vnDay(now()); break; }
      const key = keyOf(it);
      try {
        const r = await processOne(it, icb);
        state.seen[key] = { status: r.status, at: new Date(now()).toISOString() };
        if (r.report) { if (!(r.report.publishedAt && r.report.publishedAt < cutoff)) state.reports = [r.report, ...state.reports.filter((x) => x.id !== r.report.id)].slice(0, 200); done++; }
      } catch (e) {
        const prev = state.seen[key]?.attempts ?? 0, transient = isTransient(e);
        state.seen[key] = { status: "error", attempts: transient ? prev : prev + 1, at: new Date(now()).toISOString(), error: String(e.message).slice(0, 120) };
        log.warn?.(`[broker-views] ${it.broker} ${String(it.title).slice(0, 50)}: ${e.message}`);
        // Mọi model đều báo hết hạn mức thì dừng lượt này, để dành hạn mức cho bản tin.
        if (e?.attempts?.some((a) => a.status === 429) && transient) { await persist(); break; }
      }
      await persist();
      await pause();
    }
    state.lastRun = new Date(now()).toISOString();
    state.backlog = Math.max(0, todo.length - maxReports);
    await persist();
    return { listed: items.length, todo: todo.length, done };
  }
  const runOnce = () => (inflight ??= run().finally(() => { inflight = null; }));

  return {
    runOnce,
    async get() {
      await load();
      const [bars, quant] = await Promise.all([getIndexBars().catch(() => []), getQuant().catch(() => [])]);
      const usable = state.reports.filter((r) => r.marketView || r.targets?.length || r.topics?.length || r.sectors?.length);
      const seen = Object.values(state.seen);
      return {
        asOf: new Date(now()).toISOString(), lastRun: state.lastRun ?? null, running: !!inflight, backlog: state.backlog ?? 0,
        brokers: BROKERS, topicNames: TOPICS,
        coverage: {
          brokers: new Set(usable.map((r) => r.broker)).size, listedBrokers: Object.keys(BROKERS).length, reports: usable.length,
          verified: state.reports.reduce((a, r) => a + (r.marketView ? 1 : 0) + (r.targets?.length ?? 0) + (r.topics?.length ?? 0) + (r.sectors?.length ?? 0), 0),
          rejected: state.reports.reduce((a, r) => a + (r.rejected?.length ?? 0), 0), skippedNoText: seen.filter((s) => s.status === "no_text").length,
        },
        sources: Object.fromEntries(sources.map((s) => [s.id, state.sources[s.id]]).filter(([, v]) => v)),
        reports: state.reports.slice(0, 12).map(({ rejected, pdfUrl, ...r }) => ({ id: r.id, broker: r.broker, brokerName: r.brokerName, title: r.title, type: r.type, publishedAt: r.publishedAt, url: r.url, rejected: rejected?.length ?? 0 })),
        ...buildConsensus({ reports: usable, nowMs: now(), indexBars: bars, quant: new Map(quant.map((x) => [x.icb, x])) }),
      };
    },
    /** Dành cho bản tin AI: nhận định đã kiểm chứng mới nhất. */
    async forBrief() {
      await load();
      const cons = buildConsensus({ reports: state.reports, nowMs: now() });
      return { view: cons.view.n >= 2 ? cons.view : { n: 0, items: [] }, reports: state.reports.filter((r) => r.publishedAt && now() - Date.parse(r.publishedAt) <= 45 * 86_400_000).slice(0, 8) };
    },
    /** Có việc tồn thì chạy tiếp mỗi lượt; không thì 6 giờ quét danh sách một lần. */
    async tick() {
      await load();
      if (inflight || !process.env.GEMINI_API_KEY) return false;
      const last = state.lastRun ? Date.parse(state.lastRun) : 0;
      if (!state.backlog && now() - last < 6 * 3_600_000) return false;
      await runOnce().catch((e) => log.warn?.(`[broker-views] ${e.message}`));
      return true;
    },
    startTimer() {
      const h = setInterval(() => { void this.tick(); }, 30 * 60_000);
      h.unref?.();
      const first = setTimeout(() => { void this.tick(); }, 3 * 60_000);
      first.unref?.();
      return h;
    },
  };
}
const hash = (s) => { let h = 0; for (const c of String(s)) h = (Math.imul(h, 31) + c.codePointAt(0)) | 0; return h; };

// AGM-v1 (06/11/2026) — dịch vụ thu kế hoạch kinh doanh ĐHĐCĐ trên Gateway (Railway Volume: <dir>/agm-plans.json).
// Tuần tự từng mã (PDF scan 1–15 MB, không giữ file), trần token theo ngày, mỗi mã thử tối đa 3 lần (cách nhau ≥ 20 giờ).
// Năm kế hoạch = năm hiện tại (giờ VN); từ tháng 1 tới khi có nghị quyết, mã chưa họp sẽ được thử lại ở lượt sau.
import fs from "node:fs";
import path from "node:path";
import { AGM, AGM_VERSION, EXTRACT_SCHEMA, TRANSCRIBE_SCHEMA, extractPrompt, pickDocument, transcribePrompt, unflatten, verifyPlan } from "./agmPlans.js";

/** Quá tải / hết hạn mức / hết giờ: lỗi tạm thời — không tính vào số lần thử của mã, dừng lượt (thử lại lượt sau). */
export function isTransient(e) {
  if (e?.attempts?.length) return e.attempts.every((a) => a.status === 429 || a.status >= 500 || /abort|timeout|fetch failed/i.test(a.error ?? ""));
  return /abort|timeout|fetch failed|HTTP 5\d\d|HTTP 429/i.test(e?.message ?? "");
}

const UA = "Mozilla/5.0 (compatible; DinhTuanResearchBot/1.0)";
const ALLOWED = /(^|\.)vndirect\.com\.vn$/;
const vnDay = (t) => new Date(t + 7 * 3_600_000).toISOString().slice(0, 10);
const fin = (x) => typeof x === "number" && Number.isFinite(x);

/** Thực hiện năm `year` theo BCTC quý (tổng 4 quý) của mã — cùng chỉ tiêu với kế hoạch. */
export function priorFromStatements(rec, year) {
  const qs = new Map((rec?.quarters ?? []).map((q) => [q.fiscal.slice(0, 7), q.v ?? {}]));
  const sum = (pick) => { const v = ["03", "06", "09", "12"].map((m) => qs.get(`${year}-${m}`)).map((x) => (x ? pick(x) : null)); return v.every(fin) ? v.reduce((a, b) => a + b, 0) : null; };
  return (key, basis) => {
    if (key === "top") return sum((v) => (rec.tpl === "bank" ? v.toi : v.revenue));
    if (key === "pbt") return sum((v) => v.pbt);
    if (key === "npat") return sum((v) => (basis === "parent" ? v.npatParent ?? v.npat : v.npat ?? v.npatParent));
    return null;
  };
}

/** Lũy kế năm `year` tới quý mới nhất đã có (đúng chỉ tiêu, không suy từ chỉ tiêu khác). */
export function ytdFromStatements(rec, year) {
  const qs = ["03", "06", "09", "12"].map((m) => (rec?.quarters ?? []).find((q) => q.fiscal.startsWith(`${year}-${m}`))?.v ?? null);
  const through = qs.findIndex((x) => !x); const n = through < 0 ? 4 : through;
  if (!n) return null;
  const s = (k) => { const v = qs.slice(0, n).map((x) => x[k]); return v.every(fin) ? v.reduce((a, b) => a + b, 0) : null; };
  return { through: n, npat: s("npat"), npatParent: s("npatParent"), pbt: s("pbt") };
}

export function createAgmPlansService({ dir, callModel, readStatements, universe, fetchImpl = globalThis.fetch, now = Date.now, log = console, dailyTokenCap = Number(process.env.AGM_DAILY_TOKENS) || 5_000_000 } = {}) {
  const file = path.join(dir, "agm-plans.json");
  let state = null, running = false;
  const load = () => { if (state) return state; try { state = JSON.parse(fs.readFileSync(file, "utf8")); } catch { state = { version: AGM_VERSION, plans: {}, tried: {}, tokens: {} }; } return state; };
  const save = () => { const tmp = `${file}.tmp-${process.pid}`; fs.writeFileSync(tmp, JSON.stringify(state)); fs.renameSync(tmp, file); };
  const spend = (u) => { const d = vnDay(now()); state.tokens[d] = (state.tokens[d] ?? 0) + (u?.totalTokenCount ?? 0); };
  const overCap = () => (state.tokens[vnDay(now())] ?? 0) >= dailyTokenCap;

  async function getJson(url) {
    const r = await fetchImpl(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(40_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }
  async function fetchPdf(url) {
    const u = new URL(url);
    if (u.protocol !== "https:" || !ALLOWED.test(u.hostname)) throw new Error(`host ngoài danh sách: ${u.hostname}`);
    const r = await fetchImpl(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(90_000), redirect: "follow" });
    if (!r.ok) throw new Error(`PDF HTTP ${r.status}`);
    if (r.url && !ALLOWED.test(new URL(r.url).hostname)) throw new Error("chuyển hướng ra ngoài danh sách");
    const len = Number(r.headers.get("content-length") ?? 0);
    if (len > AGM.maxPdfBytes) throw new Error(`PDF quá lớn (${(len / 1048576).toFixed(1)} MB)`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > AGM.maxPdfBytes) throw new Error(`PDF quá lớn (${(buf.length / 1048576).toFixed(1)} MB)`);
    if (buf.subarray(0, 5).toString() !== "%PDF-") throw new Error("không phải PDF");
    return buf;
  }

  /** Đọc một mã: văn bản -> 2 bản chép độc lập -> trích -> kiểm. */
  async function readOne(t, year) {
    // Lọc thẳng theo loại tin: mã nhiều tin (VCB > 100 tin/năm) thì nghị quyết tháng 4 nằm ngoài trang đầu nếu lấy chung.
    const q = (type) => getJson(`https://api-finfo.vndirect.com.vn/v4/news?q=tagCodes:${t}~newsType:${type}~newsDate:gte:${year}-01-01~newsDate:lte:${year}-12-31~locale:VN&size=50&sort=newsDate:desc`).then((j) => j.data ?? []);
    const news = [...(await q("resolutions")), ...(await q("meeting"))];
    const doc = pickDocument(news, year);
    if (!doc) return { status: "NO_DOCUMENT" };
    let pdf = await fetchPdf(doc.url);
    const part = { inlineData: { mimeType: "application/pdf", data: pdf.toString("base64") } };
    pdf = null;
    const tr = async (models) => { const r = await callModel({ models, systemPrompt: transcribePrompt(year), parts: [part, { text: `Mã ${t}. Năm kế hoạch ${year}.` }], generationConfig: { temperature: 0, responseSchema: TRANSCRIBE_SCHEMA }, timeoutMs: 240_000 }); spend(r.usage); return { json: r.json, model: r.modelUsed ?? models[0] }; };
    const r1 = await tr(AGM.readers[0]);
    const r2 = await tr(AGM.readers[1].filter((m) => m !== r1.model)); // người đọc thứ hai luôn là mô hình khác
    const t1 = r1.json, t2 = r2.json, m1 = r1.model, m2 = r2.model;
    part.inlineData.data = "";
    if (!String(t1?.text ?? "").trim() && !String(t2?.text ?? "").trim()) return { status: "NO_PLAN", doc };
    const ex = await callModel({ models: [m1], systemPrompt: extractPrompt(year), parts: [{ text: `Dòng đơn vị: ${t1?.unitLine ?? ""}\n${t1?.text ?? ""}` }], generationConfig: { temperature: 0, responseSchema: EXTRACT_SCHEMA }, timeoutMs: 90_000 });
    spend(ex.usage);
    ex.json = unflatten(ex.json);
    const rec = readStatements(t);
    const plan = verifyPlan(ex.json, t1, t2, { year, draft: doc.draft, docTitle: doc.title, priorOf: priorFromStatements(rec, year - 1) });
    return { status: "READ", doc: { url: doc.url, title: doc.title, date: doc.date, kind: doc.kind }, plan, transcripts: { [m1]: t1, [m2]: t2 }, models: [m1, m2] };
  }

  /** Một lượt: tối đa `limit` mã chưa có kế hoạch năm nay. */
  async function run({ limit = 30, year = Number(vnDay(now()).slice(0, 4)), tickers = null, force = false } = {}) {
    if (running) return { running: true };
    running = true; load();
    const done = [], failed = [];
    try {
      const list = (tickers ?? (await universe())).filter((t) => /^[A-Z0-9]{3,10}$/.test(t));
      state.plans[year] ??= {};
      const todo = list.filter((t) => {
        if (force) return true;
        if (state.plans[year][t]?.status === "READ") return false;
        const tr = state.tried[`${year}|${t}`];
        return !tr || (tr.n < 3 && now() - Date.parse(tr.at) > 20 * 3600e3);
      }).slice(0, limit);
      for (const t of todo) {
        if (overCap()) { log.warn?.("[agm] chạm trần token hôm nay — dừng lượt."); break; }
        const key = `${year}|${t}`;
        try {
          const r = await readOne(t, year);
          state.plans[year][t] = { ...r, at: new Date(now()).toISOString(), version: AGM_VERSION };
          if (r.status !== "READ") state.tried[key] = { n: (state.tried[key]?.n ?? 0) + 1, at: new Date(now()).toISOString(), error: r.status };
          done.push(t);
        } catch (e) {
          if (isTransient(e)) { log.warn?.(`[agm] ${t}: lỗi tạm thời (${String(e.message ?? e).slice(0, 80)}) — dừng lượt, thử lại lượt sau`); break; }
          state.tried[key] ={ n: (state.tried[key]?.n ?? 0) + 1, at: new Date(now()).toISOString(), error: String(e.message ?? e).slice(0, 200) };
          failed.push(t);
        }
        save();
      }
      return { year, processed: done.length, failed, remaining: list.filter((t) => state.plans[year][t]?.status !== "READ").length, tokensToday: state.tokens[vnDay(now())] ?? 0 };
    } finally { running = false; }
  }

  function planOf(t, year) { load(); const p = state.plans[year]?.[t]; return p?.status === "READ" ? p : null; }
  function status() {
    load(); const years = Object.fromEntries(Object.entries(state.plans).map(([y, m]) => {
      const v = Object.values(m); const read = v.filter((x) => x.status === "READ");
      const ok = (k) => read.filter((x) => x.plan?.items?.[k]?.status === "VERIFIED").length;
      return [y, { tickers: v.length, read: read.length, noDocument: v.filter((x) => x.status === "NO_DOCUMENT").length, noPlan: v.filter((x) => x.status === "NO_PLAN").length, verified: { revenue: ok("revenue"), pbt: ok("pbt"), npat: ok("npat") } }];
    }));
    return { version: AGM_VERSION, readers: AGM.readers, running, years, tokensToday: state.tokens[vnDay(now())] ?? 0, dailyTokenCap, failures: Object.keys(state.tried).length };
  }
  return { run, readOne, planOf, status };
}

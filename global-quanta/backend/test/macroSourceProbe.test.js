// MV-C0 (27/11/2026): kiểm truy cập trang TCTK / NHNN từ Gateway — danh sách URL cố định, 1 lần / 24 giờ, chỉ lưu tóm tắt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { probeSources, summarize, PROBE_TARGETS, PROBE_KV_KEY } from "../src/market/macro/sourceProbe.js";
import { createMacroService } from "../src/market/macro/macroService.js";

const memKv = () => {
  const m = new Map();
  return { m, getKv: async (k) => (m.has(k) ? { value: structuredClone(m.get(k)), updatedAt: "t" } : null), setKv: async (k, v) => void m.set(k, structuredClone(v)) };
};

test("summarize: tiêu đề, từ khoá CPI/lãi suất, đường dẫn mẫu; trang chỉ có script -> jsOnly", () => {
  const html = `<html><head><title> Tổng cục Thống kê </title></head><body><a href="/chi-so-gia/cpi-thang-10">Chỉ số giá tiêu dùng</a><a href="/x.pdf">Thông cáo báo chí</a><a href="/khac">khác</a></body></html>`;
  const s = summarize(html);
  assert.equal(s.title, "Tổng cục Thống kê");
  assert.equal(s.hits.cpi, true); assert.equal(s.hits.pressRelease, true); assert.equal(s.hits.interbank, false);
  assert.deepEqual(s.sampleLinks, ["/chi-so-gia/cpi-thang-10", "/x.pdf"]);
  assert.equal(summarize("<html><script src=a.js></script></html>").jsOnly, true);
});

test("probeSources: lỗi một URL không chặn URL khác; tổng hợp theo cơ quan; chỉ dùng danh sách cố định", async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url);
    if (url.includes("gso.gov.vn")) throw Object.assign(new Error("fetch failed"), { cause: { code: "ETIMEDOUT" } });
    return { ok: true, status: 200, url, headers: { get: () => "text/html" }, arrayBuffer: async () => new TextEncoder().encode("<title>NHNN</title> Lãi suất liên ngân hàng").buffer };
  };
  const doc = await probeSources({ fetchImpl });
  assert.deepEqual(seen.sort(), PROBE_TARGETS.map((t) => t.url).sort());
  assert.deepEqual(doc.byOrg.TCTK, { reachable: 0, total: 4 });
  assert.deepEqual(doc.byOrg.NHNN, { reachable: 2, total: 2 });
  const gso = doc.results.find((r) => r.id === "gso-home");
  assert.equal(gso.ok, false); assert.match(gso.error, /ETIMEDOUT/);
  assert.equal(doc.results.find((r) => r.id === "sbv-home").hits.interbank, true);
});

test("macroService: kiểm tối đa 1 lần / 24 giờ (bền qua kho), kết quả có ở source().externalProbe; mặc định TẮT", async () => {
  let t = Date.parse("2026-11-27T05:00:00Z"), calls = 0;
  const kv = memKv();
  const sourceProbe = async ({ now }) => { calls++; return { at: new Date(now()).toISOString(), byOrg: { TCTK: { reachable: 1, total: 4 } }, results: [] }; };
  const svc = createMacroService({ globalFeeds: null, store: kv, inline: true, now: () => t, sourceProbe, log: { warn() {}, info() {} } });
  await svc.probeIfDue();
  await svc.probeIfDue();
  assert.equal(calls, 1);
  assert.equal(kv.m.get(PROBE_KV_KEY).byOrg.TCTK.reachable, 1);
  assert.equal((await svc.source()).externalProbe.byOrg.TCTK.total, 4);
  const restarted = createMacroService({ globalFeeds: null, store: kv, inline: true, now: () => t + 3600_000, sourceProbe, log: { warn() {}, info() {} } });
  await restarted.probeIfDue();
  assert.equal(calls, 1, "khởi động lại trong 24 giờ không kiểm lại");
  t += 25 * 3600_000;
  const later = createMacroService({ globalFeeds: null, store: kv, inline: true, now: () => t, sourceProbe, log: { warn() {}, info() {} } });
  await later.probeIfDue();
  assert.equal(calls, 2);
  const off = createMacroService({ globalFeeds: null, store: memKv(), inline: true, now: () => t });
  assert.equal(await off.probeIfDue(), null, "không truyền sourceProbe -> không gọi mạng (bài kiểm khác an toàn)");
});

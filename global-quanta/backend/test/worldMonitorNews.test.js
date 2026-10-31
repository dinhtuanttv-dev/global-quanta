import { test } from "node:test";
import assert from "node:assert/strict";
import { ABNORMAL_Z, barsFromChart, createWorldMonitor, monitorCatalog, monitorStats, monitorSummary } from "../src/market/world/worldMonitor.js";
import { cleanText, createWorldNews, hostAllowed, jaccard, mergeNews, parseFeed, tokensOf, topicsOf, WORLD_FEEDS } from "../src/market/world/worldNews.js";

const NOW = Date.parse("2026-10-31T03:00:00Z");
const barsOf = (closes, end = "2026-10-30") => {
  const e = Date.parse(`${end}T00:00:00Z`);
  return closes.map((close, i) => ({ date: new Date(e - (closes.length - 1 - i) * 86_400_000).toISOString().slice(0, 10), close, time: "t" }));
};

test("danh mục monitor không trùng mã", () => {
  const syms = monitorCatalog().map((c) => c.symbol);
  assert.equal(new Set(syms).size, syms.length);
  assert.ok(syms.includes("^GSPC") && syms.includes("BZ=F") && syms.includes("^TNX"));
});

test("z dùng log-return, cửa sổ không gồm phiên đang xét; khớp phép tính tay", () => {
  // 41 phiên đan xen ±1%, rồi một phiên +5%.
  const c = [100];
  for (let i = 0; i < 40; i++) c.push(c.at(-1) * (i % 2 ? 1.01 : 0.99));
  c.push(c.at(-1) * 1.05);
  const s = monitorStats(barsOf(c), { now: NOW });
  const moves = c.slice(1).map((v, i) => Math.log(v / c[i]));
  const prior = moves.slice(0, -1);
  const m = prior.reduce((a, b) => a + b, 0) / prior.length;
  const sd = Math.sqrt(prior.reduce((a, b) => a + (b - m) ** 2, 0) / (prior.length - 1));
  assert.ok(Math.abs(s.z - (moves.at(-1) - m) / sd) < 1e-12);
  assert.ok(Math.abs(s.change - 5) < 1e-9);
  assert.equal(s.unusual, s.z >= ABNORMAL_Z);
  assert.equal(s.unusual, true);
  assert.equal(s.rangePct, 100);
  assert.equal(s.moveRank, 100);
});

test("lợi suất: biến động tính bằng điểm cơ bản theo chênh lệch, không dùng phần trăm", () => {
  const c = Array.from({ length: 40 }, (_, i) => 4 + (i % 2 ? 0.01 : -0.01));
  c.push(c.at(-1) + 0.1);
  const s = monitorStats(barsOf(c), { changeIn: "bps", now: NOW });
  assert.ok(Math.abs(s.change - 10) < 1e-9);
  assert.equal(s.changeIn, "bps");
});

test("thiếu lịch sử: z null, không đặt số thay thế; dữ liệu cũ bị gắn cờ", () => {
  const s = monitorStats(barsOf([100, 101, 102]), { now: NOW });
  assert.equal(s.z, null);
  assert.equal(s.rangePct, null);
  assert.equal(s.unusual, false);
  const old = monitorStats(barsOf([100, 101], "2026-10-20"), { now: NOW });
  assert.equal(old.stale, true);
  assert.equal(monitorStats([], { now: NOW }), null);
});

test("barsFromChart bỏ giá thiếu, mỗi ngày một giá", () => {
  const t = (d, h) => Date.parse(`2026-10-${d}T${h}:00:00Z`) / 1000;
  const b = barsFromChart({ chart: { result: [{ timestamp: [t(28, 10), t(29, 10), t(29, 20), t(30, 10)], indicators: { quote: [{ close: [1, 2, 3, null] }] } }] } });
  assert.deepEqual(b.map((x) => [x.date, x.close]), [["2026-10-28", 1], ["2026-10-29", 3]]);
});

test("summary loại dòng cũ khỏi bất thường và độ rộng", () => {
  const s = monitorSummary([
    { id: "a", nameVi: "A", group: "index", available: true, stale: false, change: 1, z: 3, unusual: true },
    { id: "b", nameVi: "B", group: "index", available: true, stale: true, change: 1, z: 9, unusual: true },
    { id: "c", nameVi: "C", group: "index", available: true, stale: false, change: -1, z: 0, unusual: false },
    { id: "d", nameVi: "D", group: "macro", available: false },
  ]);
  assert.deepEqual(s.abnormal.map((x) => x.id), ["a"]);
  assert.deepEqual([s.indexUp, s.indexTotal, s.stale, s.available], [1, 2, 1, 3]);
});

test("monitor: nguồn lỗi thì dòng đó báo không có, dòng khác vẫn chạy; có cache", async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    calls++;
    if (url.includes("BAD")) return { ok: false, status: 500 };
    const base = Date.parse("2026-10-20T10:00:00Z") / 1000;
    return { ok: true, json: async () => ({ chart: { result: [{ timestamp: [base, base + 86400], indicators: { quote: [{ close: [100, 110] }] } }] } }) };
  };
  const m = createWorldMonitor({ fetchImpl, now: () => NOW, log: {}, catalog: [{ id: "ok", symbol: "OK", nameVi: "OK", group: "index" }, { id: "bad", symbol: "BAD", nameVi: "Bad", group: "index" }] });
  const d = await m.get();
  assert.equal(d.items[0].available, true);
  assert.equal(d.items[1].available, false);
  assert.equal(d.items[1].value, undefined);
  await m.get();
  assert.equal(calls, 2);
});

const FEED = { id: "CNBC", label: "CNBC", hosts: ["cnbc.com"], authority: "press" };
const item = (title, link, date) => `<item><title><![CDATA[${title}]]></title><link>${link}</link><pubDate><![CDATA[${date}]]></pubDate></item>`;

test("parseFeed: chỉ giữ tin đúng miền, có ngày thật, không ở tương lai, có chủ đề", () => {
  const xml = [
    item("Oil jumps as OPEC cuts output", "https://www.cnbc.com/a", "Fri, 30 Oct 2026 10:00:00 GMT"),
    item("Oil spoof", "https://evil.example/cnbc.com", "Fri, 30 Oct 2026 10:00:00 GMT"),
    item("Fed holds rates", "https://www.cnbc.com/b", "không phải ngày"),
    item("Fed from the future", "https://www.cnbc.com/c", "Sat, 31 Oct 2026 09:00:00 GMT"),
    item("Local team wins the cup", "https://www.cnbc.com/d", "Fri, 30 Oct 2026 10:00:00 GMT"),
  ].join("");
  const out = parseFeed(xml, FEED, NOW);
  assert.deepEqual(out.map((x) => x.url), ["https://www.cnbc.com/a"]);
  assert.deepEqual(out[0].topics, ["energy"]);
  assert.equal(out[0].publishedAt, "2026-10-30T10:00:00.000Z");
});

test("Tên miền giả và thực thể HTML", () => {
  assert.equal(hostAllowed("https://cnbc.com.evil.io/x", ["cnbc.com"]), false);
  assert.equal(hostAllowed("javascript:alert(1)", ["cnbc.com"]), false);
  assert.equal(hostAllowed("https://www.cnbc.com/x", ["cnbc.com"]), true);
  assert.equal(cleanText("Nasdaq&#x2019;s <b>rough</b> day &amp; more"), "Nasdaq’s rough day & more");
  assert.deepEqual(topicsOf("Weekly note", { topic: "rates" }), ["rates"]);
});

test("xác nhận: nguồn chính thức; 2 nhà xuất bản độc lập; cùng chủ sở hữu không tính", () => {
  const n = (source, title, url, authority = "press") => ({ url, title, source, sourceLabel: source, authority, publishedAt: "2026-10-30T10:00:00.000Z", topics: ["energy"] });
  const a = mergeNews([], [
    n("CNBC", "OPEC agrees surprise oil output cut for December", "https://c/1"),
    n("BBC", "OPEC agrees surprise oil output cut in December", "https://b/1"),
    n("WSJ", "Copper demand outlook weakens sharply this winter", "https://w/1"),
    n("MW", "Copper demand outlook weakens sharply this winter", "https://m/1"),
    n("FED", "Federal Reserve issues FOMC statement", "https://f/1", "official"),
  ], NOW);
  const v = Object.fromEntries(a.map((x) => [x.url, x.verification]));
  assert.equal(v["https://c/1"], "corroborated");
  assert.equal(v["https://b/1"], "corroborated");
  assert.equal(v["https://w/1"], "single");
  assert.equal(v["https://m/1"], "single");
  assert.equal(v["https://f/1"], "official");
  assert.ok(jaccard(tokensOf("Oil rises"), tokensOf("Stocks fall")) === 0);
});

test("firstSeenAt giữ nguyên khi làm mới; tin quá hạn bị bỏ", () => {
  const f = { url: "u", title: "Oil", source: "CNBC", sourceLabel: "CNBC", authority: "press", publishedAt: "2026-10-30T10:00:00.000Z", topics: ["energy"] };
  const a = mergeNews([], [f], NOW);
  const b = mergeNews(a, [f], NOW + 3_600_000);
  assert.equal(b[0].firstSeenAt, a[0].firstSeenAt);
  assert.equal(mergeNews([{ ...f, publishedAt: "2026-10-01T00:00:00.000Z" }], [], NOW).length, 0);
});

test("dịch vụ tin: nguồn lỗi được báo, tin cũ vẫn giữ; đọc lại từ kho", async () => {
  const kv = new Map();
  const store = { getKv: async (k) => (kv.has(k) ? { value: kv.get(k) } : null), setKv: async (k, v) => { kv.set(k, v); } };
  let fail = false;
  const fetchImpl = async () => (fail ? { ok: false, status: 503 } : { ok: true, text: async () => item("Oil jumps on OPEC", "https://www.cnbc.com/a", "Fri, 30 Oct 2026 10:00:00 GMT") });
  let t = NOW;
  const svc = createWorldNews({ store, fetchImpl, feeds: [FEED], now: () => t, log: {} });
  const d = await svc.get();
  assert.equal(d.items.length, 1);
  assert.equal(d.sources[0].ok, true);
  fail = true;
  t += 6 * 60_000;
  await svc.refreshOnce();
  const e = await svc.get();
  assert.equal(e.items.length, 1);
  assert.equal(e.sources[0].ok, false);
  const again = createWorldNews({ store, fetchImpl, feeds: [FEED], now: () => t, log: {} });
  assert.equal((await again.get()).items.length, 1);
});

test("mọi nguồn cấu hình đều có tên miền và mức uy tín", () => {
  for (const f of WORLD_FEEDS) {
    assert.ok(f.hosts.length && ["official", "press"].includes(f.authority), f.label);
    if (f.authority === "official") assert.ok(f.topic, f.label);
  }
});

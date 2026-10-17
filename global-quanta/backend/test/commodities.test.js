import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { colIndex, readXlsx } from "../src/market/commodities/xlsxLite.js";
import { parsePinkSheetRows, parseUpdatedOn } from "../src/market/commodities/pinkSheet.js";
import { COMMODITIES } from "../src/market/commodities/catalog.js";
import { createCommodityService, monthlySnapshot, PINK_KV_KEY } from "../src/market/commodities/commodityService.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";

/** Dựng file zip tối thiểu (deflate) từ { tên: chuỗi } — đủ để thử bộ đọc xlsx. */
function zip(files) {
  const locals = [], centrals = [];
  let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, "utf8"), data = deflateRawSync(raw), nb = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nb.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, nb, data); centrals.push(ch, nb); off += 30 + nb.length + data.length;
  }
  const cd = Buffer.concat(centrals), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(Object.keys(files).length, 8); e.writeUInt16LE(Object.keys(files).length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, e]);
}

const sheetXml = (rows) => `<worksheet><sheetData>${rows.map((r, i) => `<row r="${i + 1}">${r.map(([ref, cell]) => cell).join("")}</row>`).join("")}</sheetData></worksheet>`;
const s = (ref, idx) => [ref, `<c r="${ref}" t="s"><v>${idx}</v></c>`];
const n = (ref, v) => [ref, `<c r="${ref}"><v>${v}</v></c>`];

function pinkXlsx() {
  const shared = ["Updated on October 02, 2026", "Crude oil, Brent", "Rice, Viet Namese 5%", "($/bbl)", "($/mt)", "2026M08", "2026M09", "…", "Rubber, RSS3 **"];
  return zip({
    "xl/workbook.xml": `<workbook><sheets><sheet name="Mismatch" sheetId="1" r:id="rId1"/><sheet name="Monthly Prices" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>`,
    "xl/sharedStrings.xml": `<sst>${shared.map((x) => `<si><t>${x.replace(/&/g, "&amp;")}</t></si>`).join("")}</sst>`,
    "xl/worksheets/sheet1.xml": sheetXml([[n("A1", 1)]]),
    "xl/worksheets/sheet2.xml": sheetXml([
      [s("A1", 0)], [], [s("B3", 1), s("C3", 2), s("D3", 8)], [s("B4", 3), s("C4", 4)],
      [s("A5", 5), n("B5", 110.5), n("C5", 410.9), s("D5", 7)],
      [s("A6", 6), n("B6", 116.8), n("C6", 418.5), n("D6", 2.75)],
    ]),
  });
}

test("xlsxLite: zip deflate + sharedStrings + số; cột Excel -> chỉ số", () => {
  assert.equal(colIndex("A"), 0);
  assert.equal(colIndex("AB"), 27);
  const out = readXlsx(pinkXlsx(), ["Monthly Prices"]);
  assert.deepEqual(Object.keys(out), ["Monthly Prices"]);
  const rows = out["Monthly Prices"];
  assert.equal(rows[0][0], "Updated on October 02, 2026");
  assert.equal(rows[5][2], 418.5);
  assert.equal(rows[4][3], "…");
});

test("Pink Sheet: ngày công bố, khớp cột bỏ '**' và khoảng trắng, bỏ ô '…', kỳ cuối", () => {
  assert.equal(parseUpdatedOn("Updated on October 02, 2026"), "2026-10-02");
  assert.equal(parseUpdatedOn("x"), null);
  const rows = readXlsx(pinkXlsx(), ["Monthly Prices"])["Monthly Prices"];
  const p = parsePinkSheetRows(rows, ["Rice, Viet Namese 5%", "Rubber, RSS3", "Không có"]);
  assert.equal(p.updatedOn, "2026-10-02");
  assert.equal(p.lastPeriod, "2026-09");
  assert.deepEqual(p.series["Rice, Viet Namese 5%"].points, [["2026-08", 410.9], ["2026-09", 418.5]]);
  assert.equal(p.series["Rice, Viet Namese 5%"].unit, "($/mt)");
  assert.deepEqual(p.series["Rubber, RSS3"].points, [["2026-09", 2.75]]); // '…' bị bỏ
  assert.equal(p.series["Không có"].missing, true);
});

test("monthlySnapshot: % so với tháng trước + YoY, nhãn cơ sở rõ ràng", () => {
  const pts = Array.from({ length: 14 }, (_, i) => [`${i < 12 ? 2025 : 2026}-${String((i % 12) + 1).padStart(2, "0")}`, 100 + i]);
  const m = monthlySnapshot(pts);
  assert.equal(m.period, "2026-02");
  assert.ok(Math.abs(m.change.pct - (113 / 112 - 1) * 100) < 1e-9);
  assert.equal(m.change.basisVi, "so với tháng trước");
  assert.ok(Math.abs(m.yoyPct - (113 / 101 - 1) * 100) < 1e-9);
  assert.equal(monthlySnapshot([]), null);
});

test("catalog: mỗi mặt hàng đúng một nguồn; BDI không bịa số", () => {
  for (const c of COMMODITIES) assert.ok(["yahoo", "wb", "none"].includes(c.source.kind), c.id);
  assert.equal(COMMODITIES.find((c) => c.id === "IRON_ORE").source.symbol, "TIO=F");
  assert.equal(COMMODITIES.find((c) => c.id === "BDI").source.kind, "none");
  assert.ok(COMMODITIES.find((c) => c.id === "RICE_VN").vnPrice);
});

test("commodityService.snapshot: Pink Sheet lưu KV, Yahoo theo phiên, nguồn hỏng -> không bịa, ghi lý do", async () => {
  const xlsx = pinkXlsx();
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes("worldbank.org/en/research")) return { ok: true, text: async () => `<a href="https://thedocs.worldbank.org/en/doc/abc/related/CMO-Historical-Data-Monthly.xlsx">x</a>` };
    if (url.includes("CMO-Historical")) return { ok: true, arrayBuffer: async () => xlsx.buffer.slice(xlsx.byteOffset, xlsx.byteOffset + xlsx.length) };
    if (url.includes("BZ%3DF")) return { ok: false, status: 500 };
    const ts = [Date.UTC(2026, 9, 14, 20) / 1000, Date.UTC(2026, 9, 15, 20) / 1000];
    return { ok: true, json: async () => ({ chart: { result: [{ meta: {}, timestamp: ts, indicators: { quote: [{ close: [100, 102] }] } }] } }) };
  };
  const store = createMemoryStore();
  const svc = createCommodityService({ store, fetchImpl, now: () => Date.UTC(2026, 9, 16), log: { warn() {} } });
  const d = await svc.snapshot();
  const by = Object.fromEntries(d.items.map((i) => [i.id, i]));
  assert.equal(d.pinkSheet.updatedOn, "2026-10-02");
  assert.equal(by.RICE_VN.value, 418.5);
  assert.equal(by.RICE_VN.freq, "month");
  assert.equal(by.GOLD.value, 102);
  assert.equal(by.GOLD.period, "2026-10-15");
  assert.ok(Math.abs(by.GOLD.change.pct - 2) < 1e-9);
  assert.equal(by.BRENT.available, false);
  assert.match(by.BRENT.reasonVi, /Không lấy được giá/);
  assert.equal(by.BDI.available, false);
  assert.equal(by.ROBUSTA.available, false); // cột không có trong file thử
  assert.equal((await store.getKv(PINK_KV_KEY)).value.lastPeriod, "2026-09");
  const n1 = calls.length;
  await svc.snapshot(); // Pink Sheet còn mới + Yahoo trong TTL -> chỉ gọi lại mã lỗi
  assert.ok(calls.length - n1 <= 1);
});

test("barsFromYahoo: close null ở phiên cuối nhưng meta có giá mới hơn -> thêm nến; meta cũ hơn -> bỏ qua", async () => {
  const { barsFromYahoo } = await import("../src/market/commodities/commodityService.js");
  const ts = [Date.UTC(2026, 9, 14, 13, 30) / 1000, Date.UTC(2026, 9, 15, 13, 30) / 1000, Date.UTC(2026, 9, 16, 13, 30) / 1000];
  const b = barsFromYahoo({ regularMarketPrice: 68.24, regularMarketTime: Date.UTC(2026, 9, 16, 20) / 1000 }, ts, [67.63, 66.56, null]);
  assert.deepEqual(b.at(-1), ["2026-10-16", 68.24]);
  assert.equal(b.length, 3);
  const stale = barsFromYahoo({ regularMarketPrice: 161.9, regularMarketTime: Date.UTC(2021, 7, 11) / 1000 }, ts, [90, 91, 92]);
  assert.deepEqual(stale.at(-1), ["2026-10-16", 92]);
});

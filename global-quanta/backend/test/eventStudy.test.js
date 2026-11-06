import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { aggregate, bootCi, eventReaction, series } from "../src/market/fundamentals/eventStudy.js";
import { createEventStudyService } from "../src/market/fundamentals/eventStudyService.js";

const days = (n, from = "2024-01-01") => { const out = []; let t = Date.parse(`${from}T00:00:00Z`); while (out.length < n) { const d = new Date(t); if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10)); t += 864e5; } return out; };
/** Thị trường dao động xác định; mã = β·thị trường + nhiễu nhỏ; tuỳ chọn cú sốc tại phiên `shockAt`. */
function make(n = 260, { beta = 1.2, shockAt = 200, jump = 0.05, volMult = 1 } = {}) {
  const ds = days(n); let m = 1000, p = 50; const mkt = new Map(), rows = [];
  ds.forEach((d, i) => {
    const rm = 0.01 * Math.sin(i * 0.7) + 0.004 * Math.cos(i * 1.9);
    m *= Math.exp(rm);
    const eps = 0.002 * Math.sin(i * 3.1);
    p *= Math.exp(beta * rm + eps + (i === shockAt ? jump : 0));
    const mv = 1e13 * (1 + 0.2 * Math.sin(i * 0.3)), v = 1e10 * (1 + 0.2 * Math.sin(i * 0.3)) * (1 + 0.05 * Math.cos(i)) * (i >= shockAt && i <= shockAt + 2 ? volMult : 1);
    mkt.set(d, { close: m, val: mv }); rows.push([d, p, v]);
  });
  return { ds, mkt, rows };
}

test("LC3 mô hình thị trường: β ước lượng đúng; cú sốc +5% tại phiên công bố -> CAR[0,+2] ≈ 5%, SCAR lớn; KL x4 -> z ≫ 2", () => {
  const { ds, mkt, rows } = make(280, { jump: 0.05, volMult: 4 }); // đủ +60 phiên sau sự kiện
  const r = eventReaction(series(rows), mkt, ds[200]);
  assert.ok(Math.abs(r.beta - 1.2) < 0.05);
  assert.ok(Math.abs(r.carAnn - 0.05) < 0.01);
  assert.ok(r.scarAnn > 5);
  assert.ok(r.avAnn > 5);
  assert.ok(Math.abs(r.carPre) < 0.02);
  assert.equal(r.path.length, 71); // −10 … +60
  // Không đủ lịch sử ước lượng -> không tính.
  assert.equal(eventReaction(series(rows.slice(120)), mkt, ds[200]).insufficient, true);
});

test("LC3 tổng hợp: ngũ phân vị SUE trong từng quý, chênh Q5−Q1 dương khi phản ứng tăng theo SUE; chỉ dùng ngày chính xác cho thống kê chính", () => {
  const ev = [];
  for (let q = 0; q < 2; q++) for (let i = 0; i < 50; i++) {
    const sue = i - 25, car = sue / 1000;
    ev.push({ t: `T${i}`, fiscal: `2025-0${q * 3 + 3}-30`, date: "2025-07-20", source: i % 5 === 0 ? "DATA" : "DISCLOSURE", sue, r: { carPre: 0, carAnn: car, carPost: 0, scarPre: 0, scarAnn: car * 100, avPre: 0, avAnn: 0, path: Array(71).fill(car) } });
  }
  const a = aggregate(ev);
  assert.equal(a.events, 100);
  assert.equal(a.precise, 80);
  assert.ok(a.quintiles[5].ann.mean > a.quintiles[3].ann.mean && a.quintiles[3].ann.mean > a.quintiles[1].ann.mean);
  assert.ok(a.spread.ann > 0);
  assert.equal(a.quintiles[1].path.length, 71);
  const ci = bootCi(Array.from({ length: 100 }, (_, i) => i / 100));
  assert.ok(ci.lo < 0.495 && ci.hi > 0.495);
});

test("LC3 dịch vụ: tải giá nối tiếp, dựng sự kiện từ ngày công bố, ghi tệp; KL/giá 10 phiên gần nhất cho mã chưa công bố", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "es-"));
  const { ds, mkt, rows } = make(300, { shockAt: 220, jump: 0.04 });
  const rec = { ticker: "AAA", tpl: "corp", quarters: [{ fiscal: "2024-09-30", created: ds[220], v: { npatParent: 1 } }] };
  // ngày công bố thật trong cửa sổ: dùng fiscal giả có created = ds[220] (lag ≤ 120 ngày)
  rec.quarters[0].fiscal = new Date(Date.parse(`${ds[220]}T00:00:00Z`) - 30 * 864e5).toISOString().slice(0, 10).replace(/-\d\d$/, (x) => x);
  const fiscal = (() => { const d = new Date(Date.parse(`${ds[220]}T00:00:00Z`) - 40 * 864e5); const y = d.getUTCFullYear(), q = Math.floor(d.getUTCMonth() / 3) + 1; const m = q * 3; return `${y}-${String(m).padStart(2, "0")}-${m === 3 || m === 12 ? 31 : 30}`; })();
  rec.quarters[0].fiscal = fiscal;
  fs.writeFileSync(path.join(dir, "AAA.json.gz"), zlib.gzipSync(JSON.stringify(rec)));
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    const data = String(url).includes("vnmarket_prices") ? [...mkt].map(([d, v]) => ({ date: d, close: v.close, nmValue: v.val })) : rows.map(([d, c, v]) => ({ date: d, adClose: c, nmValue: v }));
    return { ok: true, json: async () => ({ data }) };
  };
  const svc = createEventStudyService({ dir, fetchImpl, now: () => Date.parse("2025-03-01T05:00:00Z"), log: { log() {}, warn() {} } });
  const r = await svc.run();
  assert.equal(r.events >= 1, true);
  const doc = svc.doc();
  assert.equal(doc.byTicker.AAA.filter((e) => !e.insufficient).length, 1);
  assert.ok(Math.abs(doc.byTicker.AAA[0].carAnn - 0.04) < 0.01);
  assert.ok(doc.live.AAA && Number.isFinite(doc.live.AAA.av10));
  assert.equal(calls, 2);
  await svc.run(); // lần 2: tải nối tiếp (vẫn 1 lần mỗi chuỗi, không tải lại toàn bộ khi không có điều chỉnh)
  assert.equal(calls, 4);
  fs.rmSync(dir, { recursive: true, force: true });
});

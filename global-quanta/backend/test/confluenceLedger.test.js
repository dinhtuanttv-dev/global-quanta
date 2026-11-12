// HL-v1 — quy tắc hợp lưu đa yếu tố (bản máy chủ) + sổ theo dõi tiến HL-L1 với dữ liệu giả.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHlLedger, hlGroups, hlScores, nonOverlapT, scoreEntry, summarizeHl, HL_LEDGER } from "../src/market/elite/confluence.js";

const TA2 = { sepa_state: 1, base_breakout: 2 };
const panelRows = () => [
  { ticker: "LEAD", values: { ls_v1: 3, ...TA2, rrg_quadrant: 2, stealth20: 2, catalyst_impact: 1 } },
  { ticker: "IMPR", values: { ls_v1: 2.9, ...TA2, rrg_quadrant: 1 } },
  { ticker: "AGST", values: { ls_v1: 2.8, ...TA2, structure_score: 7, rrg_quadrant: -2 } },
  { ticker: "NOTA", values: { ls_v1: 2.7, sepa_state: 1, rrg_quadrant: 2 } },
  ...Array.from({ length: 16 }, (_, i) => ({ ticker: `X${String(i).padStart(2, "0")}`, values: { ls_v1: -i, ...TA2, rrg_quadrant: 2 } })),
];

test("hlScores / hlGroups: tầng 1 trước, Cải thiện + Dẫn dắt ủng hộ, Suy yếu + Tụt hậu phản đối", () => {
  const s = hlScores(panelRows()), by = Object.fromEntries(s.map((x) => [x.ticker, x]));
  assert.equal(by.LEAD.cls, "STRONG"); assert.equal(by.IMPR.cls, "CONFLUENCE"); assert.equal(by.AGST.cls, "T1_SECTOR_AGAINST");
  assert.equal(by.NOTA.pass1, false); // LS top 20% nhưng chỉ 1 mô hình TA
  assert.equal(by.X00.pass1, false);  // đủ TA nhưng LS ngoài top 20%
  assert.deepEqual(s.slice(0, 3).map((x) => x.ticker), ["AGST", "LEAD", "IMPR"]); // AGST 3 mô hình TA -> điểm tầng 1 cao nhất, dù ngành phản đối
  assert.deepEqual(hlGroups(s), { sel: ["LEAD", "IMPR"], strong: ["LEAD"], pass1: ["AGST", "LEAD", "IMPR"], lead: ["LEAD"], impr: ["IMPR"], against: ["AGST"] });
});

test("scoreEntry: vượt trội so với bình quân đều cả bảng, bỏ mã không có lợi suất", () => {
  const sc = scoreEntry({ sel: ["A", "B"], against: ["C"], strong: [] }, ["A", "B", "C", "D"], { A: 0.1, B: 0.02, C: -0.04 });
  assert.equal(sc.uniN, 3); assert.equal(sc.uni, 0.026667);
  assert.deepEqual(sc.g.sel, { n: 2, mean: 0.06, ex: 0.033333 }); assert.equal(sc.g.against.ex, -0.066667); assert.deepEqual(sc.g.strong, { n: 0, mean: null, ex: null });
  assert.equal(scoreEntry({ sel: ["A"] }, ["A"], {}), null);
});

test("nonOverlapT + summarizeHl: t trên chuỗi không chồng lấn; chưa đủ phiên -> CHƯA ĐỦ MẪU", () => {
  assert.equal(nonOverlapT([0.01, 0.02], 20), null);
  const xs = Array.from({ length: 200 }, (_, i) => 0.01 + ((i * 7) % 5 - 2) * 0.002);
  assert.ok(nonOverlapT(xs, 20) > 2);
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ d: `d${String(i).padStart(3, "0")}`, groups: { sel: ["A"], strong: [], pass1: ["A"], lead: [], impr: [], against: [] }, score: { g: { sel: { ex: xs[i] }, strong: { ex: null }, pass1: { ex: xs[i] }, lead: { ex: null }, impr: { ex: null }, against: { ex: null } } } }));
  assert.equal(summarizeHl(mk(30)).groups.sel.verdict, "CHƯA ĐỦ MẪU");
  const full = summarizeHl(mk(200));
  assert.equal(full.groups.sel.verdict, "DƯƠNG, CÓ Ý NGHĨA"); assert.equal(full.groups.sel.posShare, 1); assert.equal(full.groups.strong.days, 0); assert.equal(full.label, "THĂM DÒ");
});

test("dịch vụ: ghi theo bảng đúng phiên, bỏ phiên trước ngày bắt đầu / thiếu LS-v1, chấm khi đủ 21 phiên, bỏ mã tăng sát trần", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hl-"));
  const dates = Array.from({ length: 30 }, (_, i) => `2026-12-${String(i + 1).padStart(2, "0")}`);
  const rows = panelRows();
  const kv = { idx: { dates: ["2026-11-01", dates[0], dates[1], dates[20]] }, [`p:${dates[0]}`]: { rows }, [`p:${dates[1]}`]: { rows: rows.map((r) => ({ ticker: r.ticker, values: { ...r.values, ls_v1: null } })) }, [`p:${dates[20]}`]: { rows }, "p:2026-11-01": { rows } };
  // Giá: mọi mã đi ngang 100; LEAD +10% sau phiên vào; IMPR tăng 7% ngay phiên vào (sát trần -> không mua được).
  const px = (t) => dates.map((d, i) => [d, t === "LEAD" ? (i >= 2 ? 110 : 100) : t === "IMPR" ? (i >= 1 ? 107 : 100) : 100]);
  const L = createHlLedger({ dir, getKv: async (k) => kv[k] ?? null, panelIndexKey: "idx", panelKey: (d) => `p:${d}`, pricesOf: px, cfg: { ...HL_LEDGER, start: "2026-12-01", minLs: 10 } });
  assert.deepEqual(await L.tick(), { added: 2, skipped: 1, scored: 1, days: 2 });
  const s = L.summary();
  assert.equal(s.days, 2); assert.equal(s.scoredDays, 1); assert.deepEqual(s.latest.groups.sel, ["LEAD", "IMPR"]);
  const first = s.recent.at(-1);
  assert.equal(first.d, dates[0]); assert.equal(first.score.exit, dates[21]);
  assert.equal(first.score.ex.lead, 0.094737); // LEAD +10%, bình quân 19 mã mua được = 10% / 19
  assert.equal(first.score.ex.impr, null);     // IMPR bị loại vì tăng sát trần ở phiên vào
  assert.equal(s.groups.sel.verdict, "CHƯA ĐỦ MẪU");
  assert.deepEqual(await L.tick(), { added: 0, skipped: 1, scored: 0, days: 2 }); // chạy lại không ghi trùng
});

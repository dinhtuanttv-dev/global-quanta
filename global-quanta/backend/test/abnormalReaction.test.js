import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { abnormalReaction, ols, reactionIndex } from "../src/market/news/abnormalReaction.js";

const fx = JSON.parse(fs.readFileSync(new URL("./fixtures/abnormal-reaction-oracle.json", import.meta.url), "utf8"));
const market = new Map(fx.market.map((m) => [m.date, { close: m.close, value: m.value }]));
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test("N0: khớp oracle numpy (Campbell–Wasley log giá trị GD + mô hình thị trường cho lợi suất)", () => {
  const r = abnormalReaction({ publishedAt: fx.publishedAt }, fx.rows, market);
  const e = fx.expected;
  assert.equal(r.sessions, 3);
  assert.equal(r.estimation.n, 110);
  near(r.estimation.volumeBeta, e.volumeBeta, 5e-4, "beta KL");
  near(r.estimation.beta, e.beta, 5e-4, "beta lợi suất");
  near(r.estimation.sigmaVolume, e.sigmaVolume, 5e-5, "σ KL (1,4826·MAD)");
  near(r.estimation.sigmaReturn, e.sigmaReturn, 5e-6, "σ lợi suất");
  near(r.sav0, e.sav0, 5e-3, "SAV phiên 0");
  near(r.volumeMultiple0, e.volumeMultiple0, 5e-3, "bội số giá trị GD");
  near(r.cav, e.cav, 5e-5, "CAV");
  near(r.zVolume, e.zVolume, 5e-3, "z KL");
  near(r.car, e.car, 5e-5, "CAR");
  near(r.zReturn, e.zReturn, 5e-3, "z lợi suất");
  // KL đột biến (z 5,4) nhưng giá chỉ z 0,84 -> hấp thụ
  assert.equal(r.classification, "absorption");
});

test("N0: phiên phản ứng — tin trước 15:00 = chính phiên; sau 15:00 hoặc ngày nghỉ = phiên kế tiếp; chưa có phiên = chờ", () => {
  const rows = [{ date: "2026-10-27" }, { date: "2026-10-28" }, { date: "2026-10-29" }];
  assert.equal(reactionIndex(rows, "2026-10-28T03:00:00Z"), 1); // 10:00
  assert.equal(reactionIndex(rows, "2026-10-28T09:30:00Z"), 2); // 16:30
  assert.equal(reactionIndex(rows, "2026-10-25T03:00:00Z"), 0); // Chủ nhật
  assert.equal(reactionIndex(rows, "2026-10-29T10:00:00Z"), 3); // sau phiên cuối
  const r = abnormalReaction({ publishedAt: fx.rows.at(-1).date + "T10:00:00Z" }, fx.rows, market);
  assert.equal(r.classification, "pending");
  assert.equal(r.sessions, 0);
});

test("N0: thiếu cửa sổ ước lượng / thiếu giá trị toàn sàn -> insufficient, không đoán", () => {
  const r = abnormalReaction({ publishedAt: fx.rows[40].date + "T03:00:00Z" }, fx.rows, market);
  assert.equal(r.classification, "insufficient");
  const r2 = abnormalReaction({ publishedAt: fx.publishedAt }, fx.rows, new Map());
  assert.equal(r2.classification, "insufficient");
});

test("N0: không nhìn trước — thay đổi dữ liệu SAU cửa sổ [0, +2] không đổi kết quả", () => {
  const a = abnormalReaction({ publishedAt: fx.publishedAt }, fx.rows, market);
  const rows2 = fx.rows.map((x, i) => (i > 142 ? { ...x, value: x.value * 50, close: x.close * 3 } : x));
  assert.deepEqual(abnormalReaction({ publishedAt: fx.publishedAt }, rows2, market), a);
});

test("N0: OLS cơ bản", () => {
  const { a, b } = ols([1, 2, 3, 4], [3, 5, 7, 9]);
  near(a, 1, 1e-12, "a"); near(b, 2, 1e-12, "b");
});

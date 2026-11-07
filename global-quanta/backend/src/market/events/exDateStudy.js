// LSK5 (07/11/2026) — XD-v1: hành vi giá quanh ngày GDKHQ cổ tức tiền (MÔ TẢ, chưa kiểm định dự báo).
// Mỗi lần trả tiền mặt (VNDirect, cùng kho Lịch sự kiện):
//   • Tỷ lệ giảm giá / cổ tức (Elton–Gruber 1970): (giá đóng cửa CHƯA điều chỉnh phiên trước GDKHQ − phiên GDKHQ) / cổ tức.
//     1 = giá giảm đúng bằng cổ tức; < 1 = giảm ít hơn (thuế 5%, nhu cầu mua sau chốt quyền); > 1 = giảm nhiều hơn.
//   • Số phiên lấp khoảng cổ tức: số phiên sau GDKHQ tới khi giá đóng cửa chưa điều chỉnh ≥ giá phiên trước GDKHQ (tối đa 60).
//   • CAR theo mô hình thị trường ES-v1 trên giá ĐIỀU CHỈNH (đã loại phần giảm cơ học do cổ tức): trước −10…−1, quanh 0…+2, sau +3…+60.
// Bỏ đợt trùng ngày (±1 ngày) với cổ tức cổ phiếu / thưởng (giá còn giảm do pha loãng). Giá VNDirect theo nghìn đồng; cổ tức theo đồng.
import { bootCi, eventReaction, series } from "../fundamentals/eventStudy.js";

export const XD_VERSION = "XD-v1 (2026-11-07)";
export const XD = Object.freeze({ fillMax: 60, fillWin: 20 });
const fin = (x) => typeof x === "number" && Number.isFinite(x);
const r4 = (x) => (fin(x) ? Math.round(x * 1e4) / 1e4 : null);
const median = (a) => { const s = a.filter(fin).sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const dayDiff = (a, b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 864e5;

/**
 * Một lần GDKHQ. rows: [[ngày, giáĐiềuChỉnh, giáTrị, giáChưaĐiềuChỉnh]] (nghìn đồng); mkt: Map ngày -> { close, val }; cash: đồng/cp.
 * Trả null khi thiếu giá chưa điều chỉnh / không có phiên trước GDKHQ.
 */
export function exEventMetrics(rows, mkt, ex, cash) {
  const s = [...(rows ?? [])].filter((r) => r[1] > 0).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const dates = s.map((r) => r[0]);
  let i0 = 0; while (i0 < dates.length && dates[i0] < ex) i0 += 1;
  if (i0 < 1 || i0 >= dates.length || !(cash > 0)) return null;
  const raw = (i) => (fin(s[i]?.[3]) && s[i][3] > 0 ? s[i][3] : null);
  const cum = raw(i0 - 1), exP = raw(i0);
  if (!cum || !exP) return null;
  const D = cash / 1000;
  let fillDays = null, pending = false;
  for (let k = 0; k <= XD.fillMax; k++) {
    if (i0 + k >= s.length) { pending = true; break; }
    const p = raw(i0 + k); if (p && p >= cum) { fillDays = k; break; }
  }
  const car = eventReaction(series(s.map((r) => [r[0], r[1], r[2]])), mkt, ex);
  const ok = car && !car.insufficient;
  return { ex: dates[i0], cash, yieldCum: r4(D / cum), dropRatio: r4((cum - exP) / D), fillDays, pending: fillDays == null && pending,
    carPre: ok ? car.carPre : null, carAnn: ok ? car.carAnn : null, carPost: ok ? car.carPost : null };
}

/** Các đợt tiền mặt của một mã đủ điều kiện (bỏ đợt trùng ngày cổ tức cổ phiếu / thưởng; gộp các đợt cùng ngày). */
export function cashExEvents(events) {
  const other = events.filter((e) => (e.cat === "STOCK" || e.cat === "BONUS") && e.ex).map((e) => e.ex);
  const by = new Map();
  for (const e of events) if (e.cat === "CASH" && e.ex && e.cash > 0 && !other.some((o) => dayDiff(o, e.ex) <= 1)) by.set(e.ex, (by.get(e.ex) ?? 0) + e.cash);
  return [...by].map(([ex, cash]) => ({ ex, cash })).sort((a, b) => a.ex.localeCompare(b.ex));
}

const yieldBucket = (y) => (y < 0.03 ? "<3%" : y < 0.06 ? "3–6%" : "≥6%");
/** Tổng hợp toàn thị trường (đợt đã đủ dữ liệu): trung vị / trung bình (CI 95% bootstrap), theo nhóm lợi suất. */
export function exAggregate(list) {
  const done = list.filter((x) => fin(x.dropRatio));
  const block = (xs) => {
    const settled = xs.filter((x) => !x.pending);
    return { n: xs.length, dropRatioMedian: r4(median(xs.map((x) => x.dropRatio))), dropRatio: bootCi(xs.map((x) => x.dropRatio)),
      fillWithin20: settled.length ? r4(settled.filter((x) => x.fillDays != null && x.fillDays <= XD.fillWin).length / settled.length) : null,
      fillDaysMedian: median(settled.map((x) => x.fillDays).filter((x) => x != null)), neverFilled60: settled.length ? r4(settled.filter((x) => x.fillDays == null).length / settled.length) : null,
      carPre: bootCi(xs.map((x) => x.carPre)), carAnn: bootCi(xs.map((x) => x.carAnn)), carPost: bootCi(xs.map((x) => x.carPost)) };
  };
  const byYield = {}; for (const b of ["<3%", "3–6%", "≥6%"]) byYield[b] = block(done.filter((x) => yieldBucket(x.yieldCum) === b));
  return { all: block(done), byYield };
}

/** Tóm tắt một mã (cho ngăn chi tiết). */
export function tickerSummary(list) {
  const done = list.filter((x) => fin(x.dropRatio)), settled = done.filter((x) => !x.pending);
  return { n: done.length, dropRatioMedian: r4(median(done.map((x) => x.dropRatio))), fillDaysMedian: median(settled.map((x) => x.fillDays).filter((x) => x != null)),
    fillWithin20: settled.length ? r4(settled.filter((x) => x.fillDays != null && x.fillDays <= XD.fillWin).length / settled.length) : null, events: done.slice(-12) };
}

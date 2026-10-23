// EP2 (24/10/2026) — KỊCH BẢN CÓ VÒNG ĐỜI từ cây sóng v3 (theo phương pháp bộ phác đồ `song+ fibo`):
//   Chờ kích hoạt → Đã kích hoạt → Đạt mục tiêu 1 → Đạt mục tiêu 2   |   Vô hiệu   |   Hết hạn.
// Sáu mẫu (giá = mốc Fibonacci "quy ước nhà" của phác đồ; kích hoạt = ĐÓNG CỬA vượt mốc / đường):
//   wave3            sau 1-2 xác nhận   kích hoạt > đỉnh 1;  MT 161,8% / 261,8% sóng 1 từ 2;   vô hiệu < đáy 2
//   wave5            sau 1-4 xác nhận   kích hoạt > đỉnh 3;  MT 61,8% / 100% của 0→3 từ 4;      vô hiệu < đáy 4
//   waveC            sau A-B xác nhận   kích hoạt > cuối A;  MT C = 100% / 161,8% A từ B;        vô hiệu > cuối B
//   triangleThrust   tam giác A-B-C-D   kích hoạt vượt đường B–D; MT = độ rộng chặng A từ điểm cuối; vô hiệu ngoài C/E
//   afterImpulse     5 sóng xong        kích hoạt < cuối 4;  MT hồi 38,2% / 61,8% của 0→5;      vô hiệu > đỉnh 5
//   afterCorrection  điều chỉnh xong    kích hoạt > cuối B;  MT 100% cấu trúc đẩy trước (hoặc A) từ C; vô hiệu < cuối C
// KHÔNG NHÌN TRƯỚC: kịch bản chỉ "tồn tại" từ nến XÁC NHẬN pivot cuối cùng của nó (TreePivot.ci); vòng đời chỉ dùng nến sau đó.
// Cùng nến chạm cả mục tiêu và vô hiệu -> tính VÔ HIỆU (thận trọng). EXPERIMENTAL — chưa có lợi thế ngoài mẫu.
import type { ElliottCandle } from "../elliottGet.js";
import type { TreePivot, WaveNode, WaveTree } from "./waveTree";

export type ScenarioTemplate = "wave3" | "wave5" | "waveC" | "triangleThrust" | "afterImpulse" | "afterCorrection";
export type ScenarioState = "waiting" | "triggered" | "target1" | "target2" | "invalidated" | "expired";
export interface PriceLine { a: { time: string; price: number }; b: { time: string; price: number } }
export interface EwScenario {
  id: string;
  template: ScenarioTemplate;
  role: "primary" | "secondary" | "alternate";
  level: number;
  /** Hướng giá kỳ vọng sau khi kích hoạt. */
  dir: 1 | -1;
  title: string;
  anchors: { time: string; price: number; label: string }[];
  /** Kích hoạt: đóng cửa vượt mức giá cố định, hoặc vượt đường (tam giác B–D) nội suy theo chỉ số nến. */
  trigger: { price: number; line: PriceLine | null; text: string };
  targets: { price: number; label: string }[];
  invalidation: { price: number; text: string };
  /** Thời điểm kịch bản bắt đầu tồn tại (nến xác nhận pivot cuối) — null nếu pivot cuối chưa xác nhận (tạm). */
  createdAt: string | null;
  provisional: boolean;
  /** Hết hạn nếu chờ quá N nến chưa kích hoạt / đã kích hoạt quá M nến chưa kết thúc. */
  expiry: { waitBars: number; runBars: number };
}
export interface LifecycleEvent { type: "triggered" | "target1" | "target2" | "invalidated" | "expired"; time: string; price: number }
export interface ScenarioLifecycle { state: ScenarioState; events: LifecycleEvent[]; triggerPrice: number | null; barsEvaluated: number }

export const SCENARIO_ENGINE_VERSION = "ew-scn-1.0";
export const STATE_LABEL: Record<ScenarioState, string> = {
  waiting: "Chờ kích hoạt", triggered: "Đã kích hoạt", target1: "Đạt mục tiêu 1", target2: "Đạt mục tiêu 2", invalidated: "Vô hiệu", expired: "Hết hạn",
};
export const TEMPLATE_TITLE: Record<ScenarioTemplate, string> = {
  wave3: "Sóng 3", wave5: "Sóng 5", waveC: "Sóng C", triangleThrust: "Bật khỏi tam giác", afterImpulse: "Điều chỉnh sau 5 sóng", afterCorrection: "Xu hướng mới sau điều chỉnh",
};

const EXPIRY = { waitBars: 60, runBars: 120 };
const pts = (n: WaveNode): TreePivot[] => [n.children[0].start, ...n.children.map((c) => c.end)];
const fmt = (v: number) => Math.round(v).toLocaleString("vi-VN");

/**
 * Hoàn thiện kịch bản + kiểm hình học: mục tiêu phải nằm PHÍA TRƯỚC mốc kích hoạt (theo hướng kỳ vọng) — nếu không (VD flat mở rộng:
 * B vượt xa điểm đầu A), đo lại cùng khoảng cách TỪ MỐC KÍCH HOẠT; mốc vô hiệu phải ở phía ngược lại, nếu không -> bỏ kịch bản.
 */
function finish(base: Omit<EwScenario, "id" | "createdAt" | "provisional" | "expiry">, used: TreePivot[], symbol: string): EwScenario | null {
  const trig = base.trigger.price, d = base.dir;
  if (d * (base.invalidation.price - trig) >= 0) return null;
  const from = base.anchors[base.anchors.length - 1].price;
  if (d * (base.targets[0].price - trig) <= 0)
    base = { ...base, targets: base.targets.map((t) => ({ price: trig + d * Math.abs(t.price - from), label: `${t.label} (đo từ kích hoạt)` })) };
  const ci = used.map((p) => p.ci);
  const provisional = ci.some((x) => x == null);
  const anchorKey = base.anchors.map((a) => a.time).join(",");
  return { ...base, id: `${symbol}|${base.template}|${base.level}|${anchorKey}`, createdAt: null, provisional, expiry: EXPIRY };
}

/** Kịch bản từ cấu trúc cuối `n` của một bậc (null nếu vị trí không khớp mẫu nào). `prev` = cấu trúc liền trước cùng bậc. */
export function scenarioFromNode(n: WaveNode, prev: WaveNode | null, role: EwScenario["role"], symbol = ""): EwScenario | null {
  if (n.kind !== "motive" && n.kind !== "corrective") return null;
  const p = pts(n);
  // Mẫu chọn theo CẤU TRÚC (số sóng con hiện có, đủ / chưa đủ sóng); pivot chưa xác nhận chỉ làm kịch bản thành "tạm".
  const k = n.children.length;
  const s: 1 | -1 = p[1].price >= p[0].price ? 1 : -1;
  const L = (a: TreePivot, b: TreePivot) => Math.abs(b.price - a.price);
  const lab = n.childLabels;
  const anchors = (k: number) => p.slice(0, k + 1).map((x, j) => ({ time: x.time, price: x.price, label: j === 0 ? "0" : lab[j - 1] ?? String(j) }));
  const tri = n.pattern === "TR" || n.pattern === "RTR" || n.pattern === "ETR";
  if (n.kind === "motive") {
    if ((k === 2 || k === 3) && !n.complete) {
      const w1 = L(p[0], p[1]);
      return finish({ template: "wave3", role, level: n.level, dir: s, title: TEMPLATE_TITLE.wave3, anchors: anchors(2),
        trigger: { price: p[1].price, line: null, text: `Đóng cửa ${s > 0 ? "vượt" : "thủng"} ${lab[0]} ${fmt(p[1].price)}` },
        targets: [{ price: p[2].price + s * 1.618 * w1, label: "161,8% sóng 1" }, { price: p[2].price + s * 2.618 * w1, label: "261,8% sóng 1" }],
        invalidation: { price: p[2].price, text: `${s > 0 ? "Thủng" : "Vượt"} cuối sóng 2 ${fmt(p[2].price)}` } }, p.slice(0, 3), symbol);
    }
    if ((k === 4 || k === 5) && !n.complete) {
      const len03 = L(p[0], p[3]);
      let t = [0.618, 1], t1 = p[4].price + s * t[0] * len03;
      if (s * (t1 - p[3].price) <= 0) { t = [1, 1.618]; t1 = p[4].price + s * t[0] * len03; }
      return finish({ template: "wave5", role, level: n.level, dir: s, title: TEMPLATE_TITLE.wave5, anchors: anchors(4),
        trigger: { price: p[3].price, line: null, text: `Đóng cửa ${s > 0 ? "vượt" : "thủng"} cuối sóng 3 ${fmt(p[3].price)}` },
        targets: t.map((r) => ({ price: p[4].price + s * r * len03, label: `${String(r * 100).replace(".", ",")}% của 0→3` })),
        invalidation: { price: p[4].price, text: `${s > 0 ? "Thủng" : "Vượt"} cuối sóng 4 ${fmt(p[4].price)}` } }, p.slice(0, 5), symbol);
    }
    if (n.complete && k === 5) {
      const len = L(p[0], p[5]);
      return finish({ template: "afterImpulse", role, level: n.level, dir: (-s) as 1 | -1, title: TEMPLATE_TITLE.afterImpulse, anchors: anchors(5),
        trigger: { price: p[4].price, line: null, text: `Đóng cửa ${s > 0 ? "thủng" : "vượt"} cuối sóng 4 ${fmt(p[4].price)}` },
        targets: [{ price: p[5].price - s * 0.382 * len, label: "hồi 38,2% của 0→5" }, { price: p[5].price - s * 0.618 * len, label: "hồi 61,8% của 0→5" }],
        invalidation: { price: p[5].price, text: `${s > 0 ? "Vượt" : "Thủng"} đỉnh sóng 5 ${fmt(p[5].price)}` } }, p, symbol);
    }
    return null;
  }
  // điều chỉnh
  if (tri && k >= 4) {
    const A = L(p[0], p[1]), thrust = (-s) as 1 | -1;          // tam giác ở sóng 4 / B: cú bật đi NGƯỢC chặng A (tiếp xu hướng lớn)
    const B = p[2], D = p[4], last = p[Math.min(k, 5)];
    const opp = [p[3], p[5]].filter(Boolean).map((x) => x.price);
    const inv = thrust > 0 ? Math.min(...opp) : Math.max(...opp);
    return finish({ template: "triangleThrust", role, level: n.level, dir: thrust, title: TEMPLATE_TITLE.triangleThrust, anchors: anchors(Math.min(k, 5)),
      trigger: { price: D.price, line: { a: { time: B.time, price: B.price }, b: { time: D.time, price: D.price } }, text: "Đóng cửa vượt đường B–D của tam giác" },
      targets: [{ price: last.price + thrust * A, label: "100% độ rộng chặng A" }, { price: last.price + thrust * 1.618 * A, label: "161,8% chặng A" }],
      invalidation: { price: inv, text: `${thrust > 0 ? "Thủng" : "Vượt"} ${fmt(inv)} (cực trị C/E)` } }, p.slice(0, Math.min(k, 5) + 1), symbol);
  }
  if (!tri && (k === 2 || k === 3) && !n.complete) {
    const lenA = L(p[0], p[1]);
    return finish({ template: "waveC", role, level: n.level, dir: s, title: TEMPLATE_TITLE.waveC, anchors: anchors(2),
      trigger: { price: p[1].price, line: null, text: `Đóng cửa ${s > 0 ? "vượt" : "thủng"} cuối ${lab[0]} ${fmt(p[1].price)}` },
      targets: [{ price: p[2].price + s * lenA, label: "C = 100% A" }, { price: p[2].price + s * 1.618 * lenA, label: "C = 161,8% A" }],
      invalidation: { price: p[2].price, text: `${s > 0 ? "Thủng" : "Vượt"} cuối ${lab[1]} ${fmt(p[2].price)}` } }, p.slice(0, 3), symbol);
  }
  if (!tri && n.complete && k === 3) {
    const nd = (-s) as 1 | -1;
    const base = prev && prev.kind === "motive" ? L(prev.start, prev.end) : L(p[0], p[1]);
    return finish({ template: "afterCorrection", role, level: n.level, dir: nd, title: TEMPLATE_TITLE.afterCorrection, anchors: anchors(3),
      trigger: { price: p[2].price, line: null, text: `Đóng cửa ${nd > 0 ? "vượt" : "thủng"} cuối ${lab[1]} ${fmt(p[2].price)}` },
      targets: [{ price: p[3].price + nd * base, label: prev?.kind === "motive" ? "100% cấu trúc đẩy trước" : "100% chặng A" }, { price: p[3].price + nd * 1.618 * base, label: "161,8%" }],
      invalidation: { price: p[3].price, text: `${nd > 0 ? "Thủng" : "Vượt"} cuối ${lab[2]} ${fmt(p[3].price)}` } }, p, symbol);
  }
  return null;
}

/**
 * Kịch bản của cây: chính = bậc cao nhất có kịch bản; phụ = bậc kế tiếp; thay thế = lời giải thứ 2 của quy hoạch động.
 * `createdAt` = thời điểm nến xác nhận pivot cuối (lấy từ `candles` của CÙNG cửa sổ cây).
 */
export function scenariosFromTree(tree: WaveTree | null, candles: ElliottCandle[], symbol = ""): EwScenario[] {
  if (!tree) return [];
  const w = candles.slice(candles.length - tree.barCount);
  const out: EwScenario[] = [];
  for (let lv = tree.levels.length - 1; lv >= 1 && out.length < 2; lv--) {
    const lvl = tree.levels[lv];
    const sc = scenarioFromNode(lvl[lvl.length - 1], lvl[lvl.length - 2] ?? null, out.length ? "secondary" : "primary", symbol);
    if (sc) out.push(sc);
  }
  for (const a of tree.alternates) {
    const lvl = tree.levels[a.level];
    const sc = scenarioFromNode(a.node, lvl[lvl.length - 2] ?? null, "alternate", symbol);
    if (sc && !out.some((x) => x.id === sc.id)) { out.push(sc); break; }
  }
  for (const sc of out) {
    if (sc.provisional) continue;
    // nến xác nhận pivot cuối của kịch bản
    const piv = tree.pivots.filter((p) => sc.anchors.some((a) => a.time === p.time));
    const ci = Math.max(...piv.map((p) => p.ci ?? -1));
    sc.createdAt = ci >= 0 && w[ci] ? String(w[ci].time) : null;
    if (!sc.createdAt) sc.provisional = true;
  }
  return out;
}

/** Giá trị mốc kích hoạt tại nến `i` (đường B–D nội suy theo chỉ số nến của chuỗi `candles`). */
export function triggerAt(sc: EwScenario, candles: ElliottCandle[], i: number): number {
  if (!sc.trigger.line) return sc.trigger.price;
  const ia = candles.findIndex((c) => String(c.time) === sc.trigger.line!.a.time), ib = candles.findIndex((c) => String(c.time) === sc.trigger.line!.b.time);
  if (ia < 0 || ib <= ia) return sc.trigger.price;
  const slope = (sc.trigger.line.b.price - sc.trigger.line.a.price) / (ib - ia);
  return sc.trigger.line.a.price + slope * (i - ia);
}

/**
 * Vòng đời trên các nến SAU `fromTime` (mặc định createdAt). Kích hoạt theo GIÁ ĐÓNG CỬA; mục tiêu / vô hiệu theo high-low.
 * Cùng nến chạm mục tiêu và vô hiệu -> vô hiệu. Không nhìn trước: chỉ duyệt nến có time > fromTime.
 */
export function evaluateLifecycle(sc: EwScenario, candles: ElliottCandle[], fromTime: string | null = sc.createdAt): ScenarioLifecycle {
  const ev: LifecycleEvent[] = [];
  if (!fromTime) return { state: "waiting", events: ev, triggerPrice: null, barsEvaluated: 0 };
  let state: ScenarioState = "waiting", trigIdx = -1, waited = 0, n = 0;
  let triggerPrice: number | null = null;
  const d = sc.dir, inv = sc.invalidation.price, [t1, t2] = sc.targets.map((t) => t.price);
  const touchedInv = (adverse: number) => d * (inv - adverse) >= 0;      // giá bất lợi chạm / vượt mốc vô hiệu
  const reached = (favorable: number, t: number) => d * (favorable - t) >= 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const time = String(c.time);
    if (time <= fromTime) continue;
    n++;
    const fav = d > 0 ? c.high : c.low, adv = d > 0 ? c.low : c.high;
    if (touchedInv(adv)) { state = "invalidated"; ev.push({ type: "invalidated", time, price: inv }); break; }
    if (state === "waiting") {
      if (d * (c.close - triggerAt(sc, candles, i)) > 0) { state = "triggered"; trigIdx = i; triggerPrice = c.close; ev.push({ type: "triggered", time, price: c.close }); continue; }
      if (++waited > sc.expiry.waitBars) { state = "expired"; ev.push({ type: "expired", time, price: c.close }); break; }
      continue;
    }
    if (state === "triggered" && reached(fav, t1)) { state = "target1"; ev.push({ type: "target1", time, price: t1 }); }
    if (state === "target1" && t2 != null && reached(fav, t2)) { state = "target2"; ev.push({ type: "target2", time, price: t2 }); break; }
    if (state === "triggered" && i - trigIdx > sc.expiry.runBars) { state = "expired"; ev.push({ type: "expired", time, price: c.close }); break; }
  }
  return { state, events: ev, triggerPrice, barsEvaluated: n };
}

/**
 * Chuẩn so sánh NGẪU NHIÊN (bài toán "người đánh bạc phá sản", chuyển động ngẫu nhiên không xu hướng): từ giá kích hoạt x,
 * xác suất chạm mục tiêu T trước mốc vô hiệu S là p = |x − S| / (|x − T| + |x − S|).
 */
export function randomWalkHitProb(x: number, target: number, invalid: number): number {
  const a = Math.abs(target - x), b = Math.abs(x - invalid);
  return a + b > 0 ? b / (a + b) : 0.5;
}

/**
 * Chấm điểm sổ kịch bản: trong các kịch bản ĐÃ KÍCH HOẠT và ĐÃ KẾT THÚC (đạt MT1 hoặc vô hiệu), so số lần đạt MT1 trước vô hiệu
 * với kỳ vọng ngẫu nhiên Σp: z = (đạt − Σp) / √Σp(1−p). Đăng ký trước (EP2): ĐẠT khi n ≥ 100 và z ≥ 1,96.
 */
export function scoreLedger(rows: { triggerPrice: number | null; target1: number; invalidation: number; outcome: "hit" | "miss" | null }[]) {
  let hits = 0, exp = 0, varSum = 0, n = 0;
  for (const r of rows) {
    if (r.triggerPrice == null || !r.outcome) continue;
    const p = randomWalkHitProb(r.triggerPrice, r.target1, r.invalidation);
    n++; exp += p; varSum += p * (1 - p);
    if (r.outcome === "hit") hits++;
  }
  const z = varSum > 0 ? (hits - exp) / Math.sqrt(varSum) : null;
  return { n, hits, expected: exp, hitRate: n ? hits / n : null, expectedRate: n ? exp / n : null, z, pass: n >= EP2_PREREG.minN && z != null && z >= EP2_PREREG.zPass };
}

/** Đăng ký trước (24/10/2026, trước khi có dữ liệu sổ): kịch bản chính + phụ của engine v3, chỉ tính sự kiện SAU ngày ghi sổ. */
export const EP2_PREREG = {
  registeredAt: "2026-10-24",
  hypothesis: "Kịch bản đã kích hoạt đạt mục tiêu 1 trước mốc vô hiệu NHIỀU HƠN chuẩn ngẫu nhiên (người đánh bạc phá sản).",
  minN: 100,
  zPass: 1.96,
  note: "Chưa đủ 100 kịch bản kết thúc thì ghi 'chưa đủ mẫu'; không đổi tiêu chí sau khi xem dữ liệu.",
} as const;

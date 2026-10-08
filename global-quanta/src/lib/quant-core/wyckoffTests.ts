// @gq/quant-core · Wyckoff W2 — 9 phép thử mua / bán, đường cung–cầu (kênh xu hướng), sức mạnh tương đối so với VN-Index,
// mục tiêu ước lượng theo nguyên nhân–kết quả, vùng hồi 50%.
// Nguồn: tài liệu "VSA theo Wyckoff" (Mr Vị) nhắc tới 9 phép thử (tr.36) nhưng không liệt kê -> dùng danh sách chuẩn của khoá
// Wyckoff (Pruden, "The Three Skills of Top Trading"), mỗi phép thử được chuyển thành phép đo cụ thể, ghi rõ cách đo trên thẻ.
// Kênh xu hướng / cao trào ngoài kênh: tr.77–83, 134–141. So sóng với chỉ số: tr.21–27. Vùng hồi 50%: tr.83.
// Đây là DANH SÁCH ĐẠT / CHƯA ĐẠT, không phải xác suất; chỉ hiển thị cho tới khi qua kiểm định đặt trước.
import { atrSeries, type Bar } from "./math";
import { pivots, type EvPoint } from "./wyckoffEvidence";
import type { WyckoffResult } from "../ta-command-center/detectors/wyckoffDetector";

export const WYCKOFF_TESTS = {
  /** Số nến trước range để tìm xu hướng trước đó (mục tiêu, đường cung/cầu). */
  priorBars: 60,
  /** Sức mạnh tương đối: số phiên so lợi suất với chỉ số. */
  rsBars: 20,
  /** Phép thử 9: lợi nhuận ước lượng ≥ x lần rủi ro. */
  minRewardRisk: 3,
  /** Mục tiêu ước lượng = biên range ± k × độ rộng range. */
  causeK: [1, 1.5, 2] as number[],
  /** Cao trào ngoài kênh: vượt đường song song ≥ x ATR. */
  outsideATR: 0.25,
};

export interface NineTestItem { n: number; key: string; label: string; ok: boolean | null; value: string }
export interface TrendLine { a: EvPoint; b: EvPoint }
export interface ChannelEvidence {
  /** down: đường cung (nối 2 đỉnh hạ dần) của xu hướng giảm trước range; up: đường cầu (2 đáy nâng dần) của xu hướng tăng. */
  kind: "down" | "up";
  line: TrendLine;
  /** Đường song song qua cực trị đối diện (đường quá bán / quá mua). */
  parallel: TrendLine;
  /** Nến đầu tiên đóng cửa vượt đường cung (xuống dưới đường cầu) — "đã phá xu hướng". */
  broken: EvPoint | null;
  /** Cao trào (SC / BC) vượt ra ngoài đường song song — quá bán / quá mua (throw-under / throwover). */
  climaxOutside: EvPoint | null;
}
export interface RelativeStrength { bars: number; stockPct: number; indexPct: number; diffPct: number; stockHigherLow: boolean | null; indexLowerLow: boolean | null }
export interface WyckoffTests {
  side: "buy" | "sell";
  items: NineTestItem[];
  passed: number;
  avail: number;
  channel: ChannelEvidence | null;
  rs: RelativeStrength | null;
  targets: { k: number; price: number }[];
  retrace50: number | null;
  rewardRisk: { entry: number; stop: number; target: number; ratio: number } | null;
  note: string;
}

/** Kết quả kiểm định đặt trước (2026-10-09, 225 mã, khung D, 10/2024–10/2026, ngoài mẫu từ 03/2026, vượt trội 20 phiên). */
export const WYCKOFF_TESTS_NOTE =
  "Danh sách đạt / chưa đạt (không phải xác suất), chỉ hiển thị — chưa tính vào pha. Kiểm định 225 mã (10/2024–10/2026): chưa phép đo nào đạt tiêu chí; " +
  "NGƯỢC sách: phía bán càng nhiều phép thử đạt thì 20 phiên sau giá càng tốt hơn, 'đã phá đường cung' và 'lợi nhuận ≥ 3× rủi ro' kém hơn — không dùng để ra quyết định. " +
  "Mạnh hơn VN-Index đúng chiều trên toàn kỳ nhưng chưa đủ ý nghĩa ngoài mẫu. Mục tiêu là ước lượng nguyên nhân–kết quả, chưa kiểm định.";

const fmt = (v: number) => Math.round(v).toLocaleString("vi-VN");
const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
const idxOf = (bars: Bar[], date: string | null | undefined) => (date ? bars.findIndex((b) => b.date === date) : -1);

/** Giá trị đường thẳng qua a, b tại chỉ số x. */
const lineAt = (l: { ai: number; ap: number; bi: number; bp: number }, x: number) => l.ap + ((l.bp - l.ap) * (x - l.ai)) / (l.bi - l.ai);

/** Đường cung (down) / đường cầu (up) của xu hướng trước range + kênh song song. Chỉ dùng đỉnh/đáy đã xác nhận ≤ nến cuối. */
export function trendChannel(bars: Bar[], start: number, kind: "down" | "up", atr?: number[]): ChannelEvidence | null {
  const A = atr ?? atrSeries(bars, 14);
  const n = bars.length, last = n - 1;
  const from = Math.max(3, start - WYCKOFF_TESTS.priorBars);
  const side = kind === "down" ? "high" : "low";
  const ps = pivots(bars, from, last, side).filter((p) => p.ci <= last);
  const before = ps.filter((p) => p.index <= start);
  if (!before.length) return null;
  // Điểm 1 = đỉnh cao nhất (đáy thấp nhất) trước range; điểm 2 = đỉnh hạ dần (đáy nâng dần) kế tiếp trước khi giá phá đường.
  const p1 = before.reduce((m, p) => (kind === "down" ? (p.price > m.price ? p : m) : p.price < m.price ? p : m));
  const after = ps.filter((p) => p.index > p1.index + 2 && (kind === "down" ? p.price < p1.price : p.price > p1.price));
  if (!after.length) return null;
  // Chọn điểm 2 sao cho mọi đỉnh (đáy) giữa hai điểm nằm dưới (trên) đường — đường cung tiếp xúc, không cắt qua thân xu hướng.
  let p2 = after[0];
  for (const c of after) {
    if (c.index > start + 10) break;
    const L = { ai: p1.index, ap: p1.price, bi: c.index, bp: c.price };
    let ok = true;
    for (let j = p1.index + 1; j < c.index && ok; j++) ok = kind === "down" ? bars[j].high <= lineAt(L, j) + 1e-9 : bars[j].low >= lineAt(L, j) - 1e-9;
    if (ok) { p2 = c; break; }
  }
  const L = { ai: p1.index, ap: p1.price, bi: p2.index, bp: p2.price };
  // Đường song song qua cực trị đối diện giữa hai điểm.
  let best = kind === "down" ? Infinity : -Infinity;
  for (let j = p1.index; j <= p2.index; j++) {
    const off = kind === "down" ? bars[j].low - lineAt(L, j) : bars[j].high - lineAt(L, j);
    best = kind === "down" ? Math.min(best, off) : Math.max(best, off);
  }
  const par = (x: number) => lineAt(L, x) + best;
  let broken: EvPoint | null = null;
  for (let j = p2.index + 1; j <= last; j++) {
    if (kind === "down" ? bars[j].close > lineAt(L, j) : bars[j].close < lineAt(L, j)) { broken = { index: j, date: bars[j].date, price: bars[j].close }; break; }
  }
  // Cao trào ngoài kênh: trong khoảng [điểm 2, đầu range + 10] có nến thủng (vượt) đường song song ≥ 0,25 ATR.
  let climaxOutside: EvPoint | null = null;
  for (let j = p2.index; j <= Math.min(last, start + 10); j++) {
    const a = A[j] || 1;
    if (kind === "down" ? bars[j].low < par(j) - WYCKOFF_TESTS.outsideATR * a : bars[j].high > par(j) + WYCKOFF_TESTS.outsideATR * a) {
      climaxOutside = { index: j, date: bars[j].date, price: kind === "down" ? bars[j].low : bars[j].high };
      break;
    }
  }
  const end = broken ? broken.index : last;
  const pt = (i: number, p: number): EvPoint => ({ index: i, date: bars[i].date, price: p });
  return {
    kind, broken, climaxOutside,
    line: { a: pt(p1.index, p1.price), b: pt(end, lineAt(L, end)) },
    parallel: { a: pt(p1.index, par(p1.index)), b: pt(end, par(end)) },
  };
}

/** Sức mạnh tương đối theo ngày khớp với chỉ số: lợi suất N phiên + đáy gần nhất so với đáy trước đó. */
export function relativeStrength(bars: Bar[], benchmark: Bar[] | null | undefined, N = WYCKOFF_TESTS.rsBars): RelativeStrength | null {
  if (!benchmark?.length || bars.length < 2 * N + 1) return null;
  const bm = new Map(benchmark.map((b) => [b.date, b]));
  const rows: { s: Bar; i: Bar }[] = [];
  for (const b of bars) { const i = bm.get(b.date); if (i) rows.push({ s: b, i }); }
  if (rows.length < 2 * N + 1) return null;
  const t = rows.length - 1;
  const r = (k: "s" | "i") => (rows[t][k].close / rows[t - N][k].close - 1) * 100;
  const minLow = (k: "s" | "i", a: number, b: number) => { let m = Infinity; for (let j = a; j <= b; j++) m = Math.min(m, rows[j][k].low); return m; };
  const sNow = minLow("s", t - N + 1, t), sPrev = minLow("s", t - 2 * N + 1, t - N);
  const iNow = minLow("i", t - N + 1, t), iPrev = minLow("i", t - 2 * N + 1, t - N);
  const stockPct = r("s"), indexPct = r("i");
  return { bars: N, stockPct, indexPct, diffPct: stockPct - indexPct, stockHigherLow: sNow > sPrev, indexLowerLow: iNow < iPrev };
}

/**
 * 9 phép thử cho cấu trúc ĐANG HOẠT ĐỘNG: phía mua với tích luỹ / Spring / Test / Markup, phía bán với phân phối / Markdown.
 * null khi không có range hoặc pha chưa xác định.
 */
export function wyckoffNineTests(bars: Bar[], w: WyckoffResult, benchmark?: Bar[] | null): WyckoffTests | null {
  if (w.rangeHigh == null || w.rangeLow == null || (w.status ?? "active") !== "active" || w.phase === "undetermined") return null;
  const start = idxOf(bars, w.rangeStartDate), endR = w.rangeEndDate ? idxOf(bars, w.rangeEndDate) : bars.length - 1;
  if (start < 0 || endR < 0) return null;
  const buy = w.phase === "accumulation" || w.phase === "spring" || w.phase === "test" || w.phase === "markup";
  const side: "buy" | "sell" = buy ? "buy" : "sell";
  const n = bars.length, last = n - 1;
  const atr = atrSeries(bars, 14);
  const H = w.rangeHigh, Lo = w.rangeLow, height = Math.max(1e-9, H - Lo);
  const close = bars[last].close;
  const ev = new Set(w.events.map((e) => e.event));
  const items: NineTestItem[] = [];
  const add = (key: string, label: string, ok: boolean | null, value: string) => items.push({ n: items.length + 1, key, label, ok, value });

  // 1. Mục tiêu của xu hướng trước đã hoàn thành (ước lượng: biên độ xu hướng trước range ≥ 1× độ rộng range).
  const from = Math.max(0, start - WYCKOFF_TESTS.priorBars);
  let ext = buy ? -Infinity : Infinity;
  for (let j = from; j <= start; j++) ext = buy ? Math.max(ext, bars[j].high) : Math.min(ext, bars[j].low);
  const move = buy ? ext - Lo : H - ext;
  add("objective", buy ? "Mục tiêu giảm trước đó đã hoàn thành (ước lượng)" : "Mục tiêu tăng trước đó đã hoàn thành (ước lượng)",
    start - from >= 20 ? move >= height : null, start - from >= 20 ? `xu hướng trước ${(move / height).toFixed(1)}× độ rộng range` : "thiếu dữ liệu trước range");

  // 2. Hoạt động: KL tăng khi giá tăng, giảm khi giá giảm (nửa sau range tới nay).
  let uv = 0, un = 0, dv = 0, dn = 0;
  for (let j = start + Math.floor((endR - start) / 2); j <= last; j++) {
    if (bars[j].close > bars[j].open) { uv += bars[j].volume; un++; } else if (bars[j].close < bars[j].open) { dv += bars[j].volume; dn++; }
  }
  const act = un && dn && dv > 0 ? uv / un / (dv / dn) : null;
  add("activity", buy ? "KL nến tăng lớn hơn KL nến giảm" : "KL nến giảm lớn hơn KL nến tăng", act == null ? null : buy ? act > 1 : act < 1,
    act == null ? "—" : `KL TB nến tăng ÷ nến giảm = ${act.toFixed(2)}×`);

  // 3. Có PS & SC (mua) / PSY & BC (bán).
  const climax = buy ? ev.has("PS") || ev.has("SC") : ev.has("PSY") || ev.has("BC");
  add("climax", buy ? "Có hỗ trợ sơ bộ (PS) / bán tháo cao trào (SC)" : "Có cung sơ bộ (PSY) / mua cao trào (BC)", climax,
    [...ev].filter((e) => (buy ? ["PS", "SC"] : ["PSY", "BC"]).includes(e)).join(", ") || "không có");

  // 4. Sức mạnh tương đối so với VN-Index.
  const rs = relativeStrength(bars, benchmark);
  add("rs", buy ? "Mạnh hơn VN-Index" : "Yếu hơn VN-Index", rs ? (buy ? rs.diffPct > 0 : rs.diffPct < 0) : null,
    rs ? `${rs.bars} phiên: mã ${pct(rs.stockPct)} · VN-Index ${pct(rs.indexPct)}${rs.stockHigherLow && rs.indexLowerLow ? " · mã giữ đáy cao hơn khi chỉ số tạo đáy thấp hơn" : ""}` : "chưa có dữ liệu chỉ số (chỉ khung D, mã cổ phiếu)");

  // 5. Đã phá đường cung (mua) / đường cầu (bán) của xu hướng trước.
  const channel = trendChannel(bars, start, buy ? "down" : "up", atr);
  add("trendline", buy ? "Đã phá đường cung của xu hướng giảm" : "Đã phá đường cầu của xu hướng tăng", channel ? channel.broken != null : null,
    channel ? (channel.broken ? `đóng cửa ${buy ? "trên" : "dưới"} đường ngày ${channel.broken.date}` : "chưa phá") : "không vẽ được đường xu hướng trước range");

  // 6–7. Đáy / đỉnh dao động gần nhất (fractal 3 nến, đã xác nhận) trong range tới nay.
  const lows = pivots(bars, start, last, "low").filter((p) => p.ci <= last);
  const highs = pivots(bars, start, last, "high").filter((p) => p.ci <= last);
  const cmp = (ps: { price: number }[]) => (ps.length >= 2 ? Math.sign(ps[ps.length - 1].price - ps[ps.length - 2].price) : null);
  const cl = cmp(lows), ch = cmp(highs);
  add("lows", buy ? "Đáy sau cao hơn đáy trước" : "Đáy sau thấp hơn đáy trước", cl == null ? null : buy ? cl > 0 : cl < 0,
    lows.length >= 2 ? `${fmt(lows[lows.length - 2].price)} → ${fmt(lows[lows.length - 1].price)}` : "chưa đủ đáy");
  add("highs", buy ? "Đỉnh sau cao hơn đỉnh trước" : "Đỉnh sau thấp hơn đỉnh trước", ch == null ? null : buy ? ch > 0 : ch < 0,
    highs.length >= 2 ? `${fmt(highs[highs.length - 2].price)} → ${fmt(highs[highs.length - 1].price)}` : "chưa đủ đỉnh");

  // 8. Đã hình thành nền (mua) / đỉnh (bán) đi ngang ≥ 20 nến.
  const len = endR - start + 1;
  add("base", buy ? "Đã hình thành nền đi ngang (≥ 20 nến)" : "Đã hình thành vùng đỉnh đi ngang (≥ 20 nến)", len >= 20, `${len} nến`);

  // 9. Lợi nhuận ước lượng ≥ 3× rủi ro (mục tiêu = biên range ± 1× độ rộng; cắt lỗ = biên đối diện ∓ 0,5 ATR).
  const a = atr[last] || 1;
  const spring = w.events.filter((e) => e.event === (buy ? "Spring" : "UT")).pop();
  const stop = buy ? Math.min(Lo, spring?.price ?? Lo) - 0.5 * a : Math.max(H, spring?.price ?? H) + 0.5 * a;
  const target = buy ? H + height : Lo - height;
  const risk = buy ? close - stop : stop - close, reward = buy ? target - close : close - target;
  const ratio = risk > 0 ? reward / risk : null;
  add("reward", `Lợi nhuận ước lượng ≥ ${WYCKOFF_TESTS.minRewardRisk}× rủi ro`, ratio == null ? false : ratio >= WYCKOFF_TESTS.minRewardRisk,
    ratio == null ? "giá đã qua mức cắt lỗ" : `mục tiêu ${fmt(target)} · cắt lỗ ${fmt(stop)} · ${ratio.toFixed(1)}×`);

  const passed = items.filter((x) => x.ok === true).length, avail = items.filter((x) => x.ok !== null).length;
  // Vùng hồi 50% của nhịp từ biên range tới cực trị sau đó (tr.83).
  let extreme = buy ? -Infinity : Infinity;
  for (let j = start; j <= last; j++) extreme = buy ? Math.max(extreme, bars[j].high) : Math.min(extreme, bars[j].low);
  const leg = buy ? extreme - Lo : H - extreme;
  return {
    side, items, passed, avail, channel, rs,
    targets: WYCKOFF_TESTS.causeK.map((k) => ({ k, price: buy ? H + k * height : Lo - k * height })),
    retrace50: leg > height ? (buy ? Lo + leg / 2 : H - leg / 2) : null,
    rewardRisk: ratio == null ? null : { entry: close, stop, target, ratio },
    note: WYCKOFF_TESTS_NOTE,
  };
}

// Bộ nhận diện mô hình giá (Pring ch6–ch12) trên pivot ĐÃ XÁC NHẬN tới t. Mỗi detector trả về "hình học" g cho lifecycle():
//   { type, family, dir (+1 lên / −1 xuống), role ("reversal" | "continuation"), startIdx, endIdx, level(i), opposite(i),
//     height (log), invalidation, touches, priorOk, priorMove, points[], lines[], apexIdx?, sameSideExtremeIdx, checks[] }
// Mô hình hai chiều (chữ nhật, tam giác đối xứng, kim cương) sinh cả hai hướng; index.js giữ hướng phá vỡ trước (hoặc hướng
// xu hướng hiện hành khi chưa phá vỡ — ch6: "giả định xu hướng hiện tại còn hiệu lực").

import { PRING } from "./config.js";
import { atrPctAt, closesInside, fitBoundary, lineThrough, priorTrend, touchTol, volumeSlope } from "./core.js";

const P = (S, p, name) => ({ name, i: p.i, date: S.date[p.i], price: p.price });
const lineOut = (name, L, a, b) => ({ name, i0: a, p0: L.value(a), i1: b, p1: L.value(b) });
const horiz = (v) => ({ slope: 0, value: () => v });
const meanVol = (S, a, b) => { let s = 0, n = 0; for (let i = Math.max(0, a); i <= b; i++) { s += S.V[i]; n++; } return n ? s / n : 0; };

export const TYPE_VI = Object.freeze({
  DOUBLE_TOP: "Đỉnh đôi", DOUBLE_BOTTOM: "Đáy đôi", TRIPLE_TOP: "Đỉnh ba", TRIPLE_BOTTOM: "Đáy ba",
  HS_TOP: "Vai-đầu-vai (đỉnh)", HS_BOTTOM: "Vai-đầu-vai ngược (đáy)", HS_CONT_UP: "Vai-đầu-vai ngược tiếp diễn", HS_CONT_DOWN: "Vai-đầu-vai tiếp diễn giảm",
  RECTANGLE: "Hình chữ nhật", SYM_TRIANGLE: "Tam giác đối xứng", ASC_TRIANGLE: "Tam giác tăng (góc vuông)", DESC_TRIANGLE: "Tam giác giảm (góc vuông)",
  RISING_WEDGE: "Nêm tăng", FALLING_WEDGE: "Nêm giảm", BROADENING: "Mở rộng chính thống", BROAD_FLAT_TOP: "Mở rộng góc vuông (đỉnh phẳng)",
  BROAD_FLAT_BOTTOM: "Mở rộng góc vuông (đáy phẳng)", BROAD_WEDGE_UP: "Nêm mở rộng (lên)", BROAD_WEDGE_DOWN: "Nêm mở rộng (xuống)",
  FLAG: "Cờ", PENNANT: "Cờ đuôi nheo", ROUNDING_BOTTOM: "Đáy tròn", ROUNDING_TOP: "Đỉnh tròn", CUP_HANDLE: "Cốc tay cầm",
  ISLAND_TOP: "Đảo chiều dạng đảo (đỉnh)", ISLAND_BOTTOM: "Đảo chiều dạng đảo (đáy)",
});
export const FAMILY_VI = Object.freeze({ double: "Đỉnh/đáy đôi – ba", hs: "Vai-đầu-vai", rect: "Hình chữ nhật", triangle: "Tam giác", wedge: "Nêm", broadening: "Mở rộng", flag: "Cờ / cờ đuôi nheo", rounding: "Đáy/đỉnh tròn – cốc", island: "Đảo chiều dạng đảo" });

function prior(S, start, dir, height) {
  const pt = priorTrend(S, start);
  const need = Math.max(PRING.priorMinMove, Math.expm1(height) * PRING.priorHeightMult);
  // đảo chiều lên cần xu hướng giảm trước; đảo chiều xuống cần xu hướng tăng trước
  const move = dir > 0 ? pt.fall : pt.rise;
  return { priorOk: move >= need, priorMove: move, trendUp: pt.rise >= pt.fall };
}

// ------------------------------------------------------------------ đỉnh/đáy đôi & ba (ch8)

function doubles(S, t, piv) {
  const out = [], D = PRING.double;
  for (let k = 0; k + 2 < piv.length; k++) {
    const [a, m, b] = [piv[k], piv[k + 1], piv[k + 2]];
    if (a.type !== b.type || m.type === a.type) continue;
    const top = a.type === "H", sep = b.i - a.i;
    if (sep < D.minSep || Math.abs(b.price / a.price - 1) > D.peakTol) continue;
    const ext = top ? Math.max(a.price, b.price) : Math.min(a.price, b.price);
    const depth = top ? 1 - m.price / Math.min(a.price, b.price) : m.price / Math.max(a.price, b.price) - 1;
    if (depth < (sep >= D.longSep ? D.depthLong : D.depthShort)) continue;
    const dir = top ? -1 : 1, height = Math.abs(Math.log(ext / m.price));
    const pr = prior(S, a.i, dir, height);
    const v1 = meanVol(S, a.i - 3, a.i + 3), v2 = meanVol(S, b.i - 3, b.i + 3);
    out.push({
      type: top ? "DOUBLE_TOP" : "DOUBLE_BOTTOM", family: "double", dir, role: "reversal", startIdx: a.i, endIdx: b.i,
      level: () => m.price, opposite: () => ext, height, invalidation: ext, touches: 4, ...pr,
      points: [P(S, a, top ? "Đỉnh 1" : "Đáy 1"), P(S, m, top ? "Rãnh" : "Đỉnh hồi"), P(S, b, top ? "Đỉnh 2" : "Đáy 2")],
      lines: [{ name: top ? "Đáy rãnh (điểm phá vỡ)" : "Đỉnh hồi (điểm phá vỡ)", i0: a.i, p0: m.price, i1: b.i, p1: m.price }],
      sameSideExtremeIdx: m.i,
      checks: [
        { key: "sep", label: `Hai ${top ? "đỉnh" : "đáy"} cách nhau ≥ 20 thanh (ch8)`, ok: true, value: sep },
        { key: "vol12", label: `KL ở ${top ? "đỉnh" : "đáy"} 2 thấp hơn ${top ? "đỉnh" : "đáy"} 1 (ch8)`, ok: v2 < v1, value: v1 ? v2 / v1 : null },
      ],
    });
  }
  for (let k = 0; k + 4 < piv.length; k++) {
    const w = piv.slice(k, k + 5);
    if (w[0].type !== w[2].type || w[0].type !== w[4].type || w[1].type === w[0].type) continue;
    const top = w[0].type === "H", ex = [w[0], w[2], w[4]].map((x) => x.price), mean = (ex[0] + ex[1] + ex[2]) / 3;
    if (ex.some((x) => Math.abs(x / mean - 1) > PRING.triple.peakTol)) continue;
    if (top ? ex[1] > Math.max(ex[0], ex[2]) * (1 + PRING.hs.headOver) : ex[1] < Math.min(ex[0], ex[2]) * (1 - PRING.hs.headOver)) continue; // giữa nổi bật = vai-đầu-vai
    const neck = lineThrough(w[1], w[3]), extv = top ? Math.max(...ex) : Math.min(...ex), dir = top ? -1 : 1;
    const h = top ? Math.log(extv / Math.min(w[1].price, w[3].price)) : Math.log(Math.max(w[1].price, w[3].price) / extv);
    if (h < 0.04 || w[4].i - w[0].i < PRING.minBars) continue;
    out.push({
      type: top ? "TRIPLE_TOP" : "TRIPLE_BOTTOM", family: "double", dir, role: "reversal", startIdx: w[0].i, endIdx: w[4].i,
      level: neck.value, opposite: () => extv, height: h, invalidation: extv, touches: 5, ...prior(S, w[0].i, dir, h),
      points: [P(S, w[0], "1"), P(S, w[1], "a"), P(S, w[2], "2"), P(S, w[3], "b"), P(S, w[4], "3")],
      lines: [lineOut("Đường nối hai " + (top ? "đáy" : "đỉnh") + " (điểm phá vỡ)", neck, w[0].i, w[4].i)],
      sameSideExtremeIdx: top ? (w[1].price < w[3].price ? w[1].i : w[3].i) : (w[1].price > w[3].price ? w[1].i : w[3].i),
      checks: [{ key: "vol3", label: `KL ở ${top ? "đỉnh" : "đáy"} thứ 3 thấp nhất (ch8)`, ok: meanVol(S, w[4].i - 3, w[4].i + 3) < Math.min(meanVol(S, w[0].i - 3, w[0].i + 3), meanVol(S, w[2].i - 3, w[2].i + 3)), value: null }],
    });
  }
  return out;
}

// ------------------------------------------------------------------ vai-đầu-vai (ch7)

function headShoulders(S, t, piv) {
  const out = [], C = PRING.hs;
  for (let k = 0; k + 4 < piv.length; k++) {
    const [ls, t1, hd, t2, rs] = piv.slice(k, k + 5);
    if (ls.type !== hd.type || hd.type !== rs.type || t1.type === ls.type) continue;
    const top = hd.type === "H", s = top ? 1 : -1;
    if (top ? !(hd.price > Math.max(ls.price, rs.price) * (1 + C.headOver)) : !(hd.price < Math.min(ls.price, rs.price) * (1 - C.headOver))) continue;
    const neck = lineThrough(t1, t2);
    const hh = s * (hd.price - neck.value(hd.i));
    if (hh <= 0) continue;
    const lsH = s * (ls.price - neck.value(ls.i)), rsH = s * (rs.price - neck.value(rs.i));
    if (lsH < C.shoulderMinFrac * hh || rsH < C.shoulderMinFrac * hh) continue;
    const tl = hd.i - ls.i, tr = rs.i - hd.i;
    if (tl / tr > C.timeRatio || tr / tl > C.timeRatio || rs.i - ls.i < PRING.minBars) continue;
    if (Math.abs(neck.slope * (rs.i - ls.i)) > hh) continue; // viền cổ quá dốc dễ phá vỡ giả (ch7)
    const dir = -s, height = Math.abs(Math.log(hd.price / neck.value(hd.i)));
    const pr = prior(S, ls.i, dir, height);
    // vai-đầu-vai ngược trong xu hướng tăng = mô hình tiếp diễn (ch7)
    const cont = top ? !pr.trendUp && !pr.priorOk : pr.trendUp && !pr.priorOk;
    const pre = piv[k - 1]?.i ?? Math.max(0, ls.i - 15);
    const vLs = meanVol(S, pre, ls.i), vHd = meanVol(S, t1.i, hd.i), vRs = meanVol(S, t2.i, rs.i);
    out.push({
      type: cont ? (top ? "HS_CONT_DOWN" : "HS_CONT_UP") : top ? "HS_TOP" : "HS_BOTTOM", family: "hs", dir, role: cont ? "continuation" : "reversal",
      startIdx: ls.i, endIdx: rs.i, level: neck.value, opposite: () => hd.price, height, invalidation: hd.price, touches: 5,
      ...pr, priorOk: cont ? true : pr.priorOk,
      points: [P(S, ls, "Vai trái"), P(S, t1, "Viền cổ 1"), P(S, hd, "Đầu"), P(S, t2, "Viền cổ 2"), P(S, rs, "Vai phải")],
      lines: [lineOut("Viền cổ", neck, ls.i, Math.min(t, rs.i + 20))],
      sameSideExtremeIdx: top ? (t1.price < t2.price ? t1.i : t2.i) : (t1.price > t2.price ? t1.i : t2.i),
      checks: [
        { key: "rsVol", label: "KL vai phải thấp hơn rõ so với vai trái và đầu (ch7)", ok: vRs < Math.min(vLs, vHd), value: Math.min(vLs, vHd) ? vRs / Math.min(vLs, vHd) : null },
        { key: "neckSlope", label: neck.slope === 0 ? "Viền cổ ngang" : `Viền cổ dốc ${neck.slope * s > 0 ? "lên" : "xuống"}${(top ? neck.slope < 0 : neck.slope > 0) ? " — phá vỡ ở điểm thấp nhất, mạnh hơn (ch7)" : ""}`, ok: true, value: neck.slope },
      ],
    });
  }
  return out;
}

// ------------------------------------------------------------------ chữ nhật, tam giác, nêm, mở rộng (ch6, ch9–ch12)

function boundaries(S, t, piv, degree = "intermediate") {
  const out = [];
  for (let len = 4; len <= 8; len++) for (let k = Math.max(0, piv.length - 10); k + len <= piv.length; k++) {
    const w = piv.slice(k, k + len), highs = w.filter((p) => p.type === "H"), lows = w.filter((p) => p.type === "L");
    if (highs.length < 2 || lows.length < 2) continue;
    const a = w[0].i, b = w[w.length - 1].i, W = b - a;
    if (W < PRING.minBars) continue;
    const up = fitBoundary(S, highs, "upper"), lo = fitBoundary(S, lows, "lower");
    if (!up || !lo || up.touches < 2 || lo.touches < 2) continue;
    if (!closesInside(S, up.line, a, b, "upper") || !closesInside(S, lo.line, a, b, "lower")) continue;
    const h0 = up.line.value(a) - lo.line.value(a), h1 = up.line.value(b) - lo.line.value(b);
    if (h0 <= 0 || h1 <= 0) continue;
    const hRef = Math.max(h0, h1), su = (up.line.slope * W) / hRef, sl = (lo.line.slope * W) / hRef, flat = PRING.flatFrac;
    const fu = Math.abs(su) <= flat, fl = Math.abs(sl) <= flat, conv = h1 < h0 * 0.85, div = h1 > h0 * 1.15;
    let type = null, dir = 0;
    if (fu && fl && !conv && !div) {
      // chữ nhật: dải đỉnh/đáy hẹp so với chiều cao
      const top = highs.reduce((s, p) => s + p.price, 0) / highs.length, bot = lows.reduce((s, p) => s + p.price, 0) / lows.length;
      const band = Math.max(...highs.map((p) => p.price)) - Math.min(...highs.map((p) => p.price)), bandL = Math.max(...lows.map((p) => p.price)) - Math.min(...lows.map((p) => p.price));
      const hgt = Math.log(top / bot);
      if (band > PRING.rect.bandFrac * (top - bot) * 2 || bandL > PRING.rect.bandFrac * (top - bot) * 2 || hgt < PRING.rect.minHeight || hgt > PRING.rect.maxHeight) continue;
      if (degree === "minor" && W > PRING.wedge.smallMax) continue;
      for (const d of [1, -1]) out.push(mk(S, "RECTANGLE", "rect", d, a, b, horiz(top), horiz(bot), hgt, up.touches + lo.touches, w, true));
      continue;
    }
    if (conv) {
      if (fu && sl > flat) { type = "ASC_TRIANGLE"; dir = 1; }
      else if (fl && su < -flat) { type = "DESC_TRIANGLE"; dir = -1; }
      else if (su < -flat && sl > flat) type = "SYM_TRIANGLE";
      else if (su > flat && sl > flat) { type = "RISING_WEDGE"; dir = -1; }
      else if (su < -flat && sl < -flat) { type = "FALLING_WEDGE"; dir = 1; }
    } else if (div) {
      if (su > flat && sl < -flat) { type = "BROADENING"; dir = -1; }
      else if (fu && sl < -flat) { type = "BROAD_FLAT_TOP"; dir = 1; }
      else if (fl && su > flat) { type = "BROAD_FLAT_BOTTOM"; dir = -1; }
      else if (su > flat && sl > flat) { type = "BROAD_WEDGE_UP"; dir = -1; }
      else if (su < -flat && sl < -flat) { type = "BROAD_WEDGE_DOWN"; dir = 1; }
    }
    if (!type) continue;
    // Pring: mô hình mở rộng rất hiếm (ch10) -> cần ≥ 5 pivot, chỉ bậc trung; nêm lớn 4–6 tháng, nêm nhỏ 2–8 tuần (ch11–12);
    // mô hình bậc nhỏ chỉ nhận tam giác / nêm nhỏ / chữ nhật ngắn (≤ 40 thanh). Biên có ≥ 3 lần chạm đáng tin hơn (ch9).
    const isBroad = type.startsWith("BROAD"), isWedge = type.endsWith("WEDGE") && !isBroad;
    if (isBroad && (degree !== "intermediate" || w.length < 5)) continue;
    if (degree === "minor" && W > PRING.wedge.smallMax) continue;
    if (isWedge && degree === "intermediate" && W < PRING.wedge.largeMin) continue;
    if (up.touches + lo.touches < (isBroad || isWedge || degree === "minor" ? 5 : 4)) continue;
    const family = type.includes("TRIANGLE") ? "triangle" : type.includes("WEDGE") && !type.startsWith("BROAD") ? "wedge" : "broadening";
    const height = Math.log(Math.max(up.line.value(conv ? a : b), up.line.value(a)) / Math.min(lo.line.value(conv ? a : b), lo.line.value(a)));
    const apex = conv && up.line.slope !== lo.line.slope ? Math.round(a + (h0 / (lo.line.slope - up.line.slope))) : null;
    if (conv && apex != null && apex <= b) continue; // đã quá đỉnh tam giác
    const dirs = type === "SYM_TRIANGLE" ? [1, -1] : [dir];
    for (const d of dirs) {
      const g = mk(S, type, family, d, a, b, up.line, lo.line, height, up.touches + lo.touches, w, dirs.length > 1);
      g.apexIdx = apex;
      if (family === "wedge") g.label2 = W <= PRING.wedge.smallMax ? "nêm nhỏ (2–8 tuần)" : W >= PRING.wedge.largeMin ? "nêm lớn (≥ 4 tháng)" : "nêm trung";
      out.push(g);
    }
  }
  return out;
}

function mk(S, type, family, dir, a, b, up, lo, height, touches, w, bidirectional) {
  const level = dir > 0 ? up.value : lo.value, opposite = dir > 0 ? lo.value : up.value;
  const pr = prior(S, a, dir, height);
  // phá vỡ cùng chiều xu hướng trước = tiếp diễn; ngược chiều = đảo chiều (ch6)
  const role = pr.trendUp === dir > 0 ? "continuation" : "reversal";
  const highs = w.filter((p) => p.type === "H"), lows = w.filter((p) => p.type === "L");
  return {
    type, family, dir, role, startIdx: a, endIdx: b, level, opposite, height, invalidation: null, touches, bidirectional,
    ...pr, priorOk: role === "continuation" ? true : pr.priorOk,
    points: w.map((p) => P(S, p, p.type === "H" ? `Đỉnh ${highs.indexOf(p) + 1}` : `Đáy ${lows.indexOf(p) + 1}`)),
    lines: [lineOut("Biên trên", up, a, b), lineOut("Biên dưới", lo, a, b)],
    sameSideExtremeIdx: (dir > 0 ? highs.reduce((m, p) => (p.price > m.price ? p : m)) : lows.reduce((m, p) => (p.price < m.price ? p : m))).i,
    checks: [{ key: "vol", label: "KL co lại trong mô hình (ch6, ch9)", ok: volumeSlope(S, a, b) < 0, value: volumeSlope(S, a, b) }],
  };
}

// ------------------------------------------------------------------ cờ & cờ đuôi nheo (ch12)

function flags(S, t) {
  const out = [], F = PRING.flag, H = S.H, L = S.L, C = S.C;
  for (const dir of [1, -1]) {
    // đỉnh (đáy) cột cờ trong 30 thanh gần nhất: cực trị cục bộ (không bị vượt trong minBars thanh sau — thân cờ),
    // xét từ gần nhất về trước; giá vượt đỉnh cột SAU thân cờ là phá vỡ nên không được chọn làm đỉnh cột
    for (let p = t - F.minBars; p >= Math.max(1, t - 30); p--) {
    let ext = true;
    for (let i = Math.max(0, p - 3); i <= Math.min(t, p + F.minBars); i++) if (i !== p && (dir > 0 ? H[i] > H[p] : L[i] < L[p])) { ext = false; break; }
    if (!ext) continue;
    let s0 = p; for (let i = Math.max(0, p - F.poleMaxBars); i < p; i++) if (dir > 0 ? L[i] < L[s0] : H[i] > H[s0]) s0 = i;
    const pole = dir > 0 ? H[p] / L[s0] - 1 : 1 - L[p] / H[s0];
    if (s0 === p || pole < Math.max(F.poleMinPct, F.poleAtr * atrPctAt(S, s0))) continue;
    let found = false;
    // thân cờ: hồi quy đỉnh/đáy các thanh p+1..k, tới khi có phá vỡ hoặc hết maxBars
    for (let k = p + F.minBars; k <= Math.min(t, p + F.maxBars); k++) {
      const n = k - p;
      let sx = 0, sxx = 0, sh = 0, sl = 0, sxh = 0, sxl = 0;
      for (let i = p + 1; i <= k; i++) { const x = i - p; sx += x; sxx += x * x; sh += H[i]; sl += L[i]; sxh += x * H[i]; sxl += x * L[i]; }
      const den = n * sxx - sx * sx, bh = (n * sxh - sx * sh) / den, bl = (n * sxl - sx * sl) / den;
      const ah = (sh - bh * sx) / n, al = (sl - bl * sx) / n;
      let maxH = -Infinity, minL = Infinity; for (let i = p + 1; i <= k; i++) { if (H[i] > maxH) maxH = H[i]; if (L[i] < minL) minL = L[i]; }
      // dịch biên ra ngoài để bao toàn thân cờ
      let du = 0, dl = 0; for (let i = p + 1; i <= k; i++) { du = Math.max(du, H[i] - (ah + bh * (i - p))); dl = Math.max(dl, (al + bl * (i - p)) - L[i]); }
      const U = { slope: bh, value: (i) => ah + du + bh * (i - p) }, Lw = { slope: bl, value: (i) => al - dl + bl * (i - p) };
      const retr = dir > 0 ? (H[p] - minL) / (H[p] - L[s0]) : (maxH - L[p]) / (H[s0] - L[p]);
      if (retr > F.maxRetrace) break;
      const counter = dir > 0 ? bh <= 0 && bl <= 0.0005 * C[p] : bh >= 0 && bl >= -0.0005 * C[p];
      const conv = U.value(k) - Lw.value(k) < 0.7 * (U.value(p + 1) - Lw.value(p + 1));
      if (!counter && !conv) continue;
      const nextBo = k + 1 <= t && (dir > 0 ? C[k + 1] > U.value(k + 1) : C[k + 1] < Lw.value(k + 1));
      if (!nextBo && k < Math.min(t, p + F.maxBars)) continue;
      const height = Math.log(dir > 0 ? H[p] / L[s0] : H[s0] / L[p]);
      out.push({
        type: conv ? "PENNANT" : "FLAG", family: "flag", dir, role: "continuation", startIdx: p, endIdx: k,
        level: dir > 0 ? U.value : Lw.value, opposite: dir > 0 ? Lw.value : U.value, height, invalidation: dir > 0 ? L[s0] : H[s0], touches: 4,
        priorOk: true, priorMove: pole,
        points: [{ name: "Chân cột cờ", i: s0, date: S.date[s0], price: dir > 0 ? L[s0] : H[s0] }, { name: "Đỉnh cột cờ", i: p, date: S.date[p], price: dir > 0 ? H[p] : L[p] }],
        lines: [{ name: "Cột cờ", i0: s0, p0: dir > 0 ? L[s0] : H[s0], i1: p, p1: dir > 0 ? H[p] : L[p] }, lineOut("Biên trên", U, p + 1, k), lineOut("Biên dưới", Lw, p + 1, k)],
        sameSideExtremeIdx: p,
        checks: [
          { key: "pole", label: "Cột cờ gần thẳng đứng (≥ 15% hoặc ≥ 6×ATR trong ≤ 15 thanh)", ok: true, value: pole },
          { key: "body", label: "Thân cờ ≤ 4 tuần, hồi ≤ 50% cột (ch12)", ok: n <= F.maxBars, value: n },
          { key: "vol", label: "KL thân cờ thấp hơn KL cột cờ (ch12)", ok: meanVol(S, p + 1, k) < meanVol(S, s0, p), value: meanVol(S, s0, p) ? meanVol(S, p + 1, k) / meanVol(S, s0, p) : null },
        ],
      });
      found = true;
      break;
    }
    if (found) break;
    }
  }
  return out;
}

// ------------------------------------------------------------------ đáy/đỉnh tròn & cốc tay cầm (ch11)

function rounding(S, t) {
  const out = [], R = PRING.rounding, C = S.C;
  for (const N of [40, 60, 90, 120, 150]) {
    if (N > R.maxBars || t - N < 1) continue;
    for (let e = t; e >= Math.max(N, t - 60); e -= 5) {
      const a = e - N;
      let sx = 0, sx2 = 0, sx3 = 0, sx4 = 0, sy = 0, sxy = 0, sx2y = 0;
      for (let i = a; i <= e; i++) { const x = (i - a) / N, y = Math.log(C[i]); sx += x; sx2 += x * x; sx3 += x ** 3; sx4 += x ** 4; sy += y; sxy += x * y; sx2y += x * x * y; }
      const n = N + 1;
      // giải hệ chuẩn cho y = c + b x + q x²
      const M = [[n, sx, sx2], [sx, sx2, sx3], [sx2, sx3, sx4]], v = [sy, sxy, sx2y];
      const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
      const D = det(M); if (!D) continue;
      const rep = (col) => M.map((row, r) => row.map((x, c) => (c === col ? v[r] : x)));
      const c0 = det(rep(0)) / D, b1 = det(rep(1)) / D, q = det(rep(2)) / D;
      let ss = 0, st = 0; const mean = sy / n;
      for (let i = a; i <= e; i++) { const x = (i - a) / N, y = Math.log(C[i]), f = c0 + b1 * x + q * x * x; ss += (y - f) ** 2; st += (y - mean) ** 2; }
      const r2 = st ? 1 - ss / st : 0, vx = -b1 / (2 * q);
      if (r2 < R.minR2 || vx < 1 / 3 || vx > 2 / 3) continue;
      const bottom = q > 0, dir = bottom ? 1 : -1;
      const rimLeft = bottom ? Math.max(...S.H.subarray(a, a + Math.ceil(N * 0.1) + 1)) : Math.min(...S.L.subarray(a, a + Math.ceil(N * 0.1) + 1));
      const ext = bottom ? Math.min(...S.L.subarray(a, e + 1)) : Math.max(...S.H.subarray(a, e + 1));
      const depth = Math.abs(Math.log(rimLeft / ext));
      if (depth < Math.log(1 + R.minDepth)) continue;
      const extI = a + (bottom ? Array.from(S.L.subarray(a, e + 1)).indexOf(ext) : Array.from(S.H.subarray(a, e + 1)).indexOf(ext));
      out.push({
        type: bottom ? "ROUNDING_BOTTOM" : "ROUNDING_TOP", family: "rounding", dir, role: "reversal", startIdx: a, endIdx: e,
        level: () => rimLeft, opposite: () => ext, height: depth, invalidation: ext, touches: 3, ...prior(S, a, dir, depth),
        points: [{ name: "Miệng trái", i: a, date: S.date[a], price: rimLeft }, { name: bottom ? "Đáy" : "Đỉnh", i: extI, date: S.date[extI], price: ext }],
        lines: [{ name: "Miệng (điểm phá vỡ)", i0: a, p0: rimLeft, i1: e, p1: rimLeft }],
        curve: { a, N, c0, b1, q },
        sameSideExtremeIdx: a,
        checks: [{ key: "r2", label: "Đường cong tròn đều (R² parabol ≥ 0,7)", ok: true, value: r2 }],
      });
      break;
    }
  }
  return out;
}

function cupHandle(S, t, piv) {
  const out = [], K = PRING.cup, H = S.H, L = S.L;
  for (let k = 0; k + 2 < piv.length; k++) {
    const [l, m, r] = piv.slice(k, k + 3);
    if (l.type !== "H" || m.type !== "L" || r.type !== "H") continue;
    const W = r.i - l.i, depth = 1 - m.price / l.price;
    if (W < K.minBars || W > K.maxBars || depth < K.minDepth || depth > K.maxDepth) continue;
    if (r.price < K.rimLo * l.price || r.price > K.rimHi * l.price) continue;
    const uPos = (m.i - l.i) / W;
    if (uPos < 0.2 || uPos > 0.8) continue;
    // tay cầm: sau miệng phải, sâu ≤ 15%, ở nửa trên cốc, ≥ 5 thanh
    const hEnd = Math.min(t, r.i + K.handleMax);
    if (hEnd - r.i < 1) continue;
    let hl = Infinity, hli = -1; for (let i = r.i + 1; i <= hEnd; i++) { if (H[i] > r.price * 1.0001) break; if (L[i] < hl) { hl = L[i]; hli = i; } }
    if (hli < 0 || 1 - hl / r.price > K.handleDepth || hl < m.price + 0.5 * (l.price - m.price)) continue;
    const endIdx = Math.max(r.i + K.handleMin, hli);
    out.push({
      type: "CUP_HANDLE", family: "rounding", dir: 1, role: "continuation", startIdx: l.i, endIdx,
      level: () => r.price, opposite: () => hl, height: Math.log(l.price / m.price), invalidation: hl * 0.999, touches: 3, priorOk: true, priorMove: priorTrend(S, l.i).rise,
      points: [P(S, l, "Miệng trái"), P(S, m, "Đáy cốc"), P(S, r, "Miệng phải"), { name: "Đáy tay cầm", i: hli, date: S.date[hli], price: hl }],
      lines: [{ name: "Miệng phải (điểm phá vỡ)", i0: r.i, p0: r.price, i1: Math.min(t, endIdx + 10), p1: r.price }],
      sameSideExtremeIdx: r.i,
      checks: [
        { key: "u", label: "Cốc tròn chữ U (đáy ở 20–80% bề rộng) — O'Neil", ok: true, value: uPos },
        { key: "hvol", label: "KL tay cầm thấp (ch11)", ok: meanVol(S, r.i + 1, endIdx) < meanVol(S, l.i, r.i), value: null },
      ],
    });
  }
  return out;
}

// ------------------------------------------------------------------ đảo chiều dạng đảo (ch12)

function islands(S, t) {
  const out = [], H = S.H, L = S.L;
  for (let i2 = Math.max(2, t - 30); i2 <= t; i2++) {
    for (const top of [true, false]) {
      // khoảng trống vào đảo tại i1, khoảng trống ra tại i2
      const gapOut = top ? H[i2] < L[i2 - 1] : L[i2] > H[i2 - 1];
      if (!gapOut) continue;
      for (let i1 = i2 - 1; i1 >= Math.max(1, i2 - PRING.gap.islandMaxBars); i1--) {
        const gapIn = top ? L[i1] > H[i1 - 1] : H[i1] < L[i1 - 1];
        if (!gapIn) continue;
        let ok = true, hi = -Infinity, lo = Infinity;
        for (let i = i1; i < i2; i++) { if (top ? L[i] <= H[i1 - 1] || L[i] <= H[i2] : H[i] >= L[i1 - 1] || H[i] >= L[i2]) { ok = false; break; } hi = Math.max(hi, H[i]); lo = Math.min(lo, L[i]); }
        if (!ok) break;
        const dir = top ? -1 : 1, edge = top ? lo : hi;
        out.push({
          type: top ? "ISLAND_TOP" : "ISLAND_BOTTOM", family: "island", dir, role: "reversal", startIdx: i1, endIdx: i2 - 1,
          level: () => edge, opposite: () => (top ? hi : lo), height: Math.log(hi / lo), invalidation: top ? hi : lo, touches: 2, ...prior(S, i1, dir, Math.log(hi / lo)),
          points: [{ name: "Khoảng trống vào", i: i1, date: S.date[i1], price: top ? L[i1] : H[i1] }, { name: "Khoảng trống ra", i: i2, date: S.date[i2], price: top ? H[i2] : L[i2] }],
          lines: [{ name: "Cạnh đảo", i0: i1, p0: edge, i1: i2, p1: edge }],
          sameSideExtremeIdx: i1, checks: [{ key: "isl", label: "Tách khỏi giá trước/sau bởi hai khoảng trống (ch12)", ok: true, value: i2 - i1 }],
        });
        break;
      }
    }
  }
  return out;
}

/** Mọi ứng viên tại t (chưa chạy vòng đời). */
export function detectAll(S, t, { inter, minor }) {
  const recent = (arr) => arr.slice(-14);
  return [
    ...doubles(S, t, recent(inter)), ...headShoulders(S, t, recent(inter)), ...boundaries(S, t, recent(inter)), ...boundaries(S, t, recent(minor), "minor").map((g) => ({ ...g, degree: "minor" })),
    ...cupHandle(S, t, recent(inter)), ...flags(S, t), ...rounding(S, t), ...islands(S, t),
  ];
}

export { touchTol };

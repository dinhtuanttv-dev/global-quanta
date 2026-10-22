// Trading Matrix M3 — engine kịch bản (M3-prereg.md, RULE_VERSION M3-r1). Hàm thuần, chỉ dùng dữ liệu ≤ t.
//   buildStateSeries  -> vector trạng thái ngày (regime, độ rộng, trung vị lợi suất, biến động)
//   evaluate          -> điều kiện từng kịch bản theo NHÓM BẰNG CHỨNG ĐỘC LẬP (giá chỉ số / độ rộng / biến động) + mâu thuẫn
//   runLifecycle      -> INACTIVE → WATCH → CONFIRMED → INVALIDATED → COOLDOWN (5 phiên); đợt = phiên vào CONFIRMED
import { classifyRegime } from "../research/regime.js";

export const RULE_VERSION = "M3-r1";
export const RULES = Object.freeze({
  sc1: { breadthMin: 50, invalidBreadth: 40, rvPctMax: 80 },
  sc2: { idx5Min: 0.5 },
  sc3: { rvPctShock: 90, idxMoveSd: 2.5, breadthDrop: -15, calmRvPct: 70, calmDrop: -5 },
  cooldown: 5,
});
export const SCENARIOS = {
  SC1: { title: "Xu hướng có độ rộng hỗ trợ", meaning: "Chỉ số và phần lớn cổ phiếu cùng tăng", expect: 1 },
  SC2: { title: "Chỉ số dẫn dắt, thị trường phân hoá", meaning: "Chỉ số được giữ trong khi phần lớn cổ phiếu yếu", expect: -1 },
  SC3: { title: "Cú sốc biến động", meaning: "Biến động tăng vọt và độ rộng rơi nhanh — theo dõi bán tháo / hồi phục", expect: 0 },
};

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const px = (r) => r.closeAdj ?? r.close;
const f = (x, d = 1) => (x == null ? "—" : x.toFixed(d).replace(".", ","));

/**
 * @param bySymbol Map(mã -> nến ngày cũ -> mới) của phạm vi · @param indexBars nến VN-Index (cũ -> mới)
 * @returns [{ date, regime, b, db5, ddb, med5, idx5, idx1, rv, rvPct, coverage, n }]
 */
export function buildStateSeries({ bySymbol, indexBars }) {
  // Mỗi mã: theo ngày -> { above: đóng cửa > MA20, ret5 }
  const perDate = new Map();
  let scopeSize = 0;
  for (const rows of bySymbol.values()) {
    scopeSize++;
    let s = 0;
    for (let i = 0; i < rows.length; i++) {
      s += px(rows[i]); if (i >= 20) s -= px(rows[i - 20]);
      const d = rows[i].date;
      if (!perDate.has(d)) perDate.set(d, { up: 0, n: 0, r5: [] });
      const a = perDate.get(d);
      if (i >= 19) { a.n++; if (px(rows[i]) > s / 20) a.up++; }
      if (i >= 5 && px(rows[i - 5]) > 0) a.r5.push((px(rows[i]) / px(rows[i - 5]) - 1) * 100);
    }
  }
  const c = indexBars.map((b) => b.close);
  const ret = c.map((v, i) => (i ? v / c[i - 1] - 1 : null));
  const rvs = [];
  const out = [];
  for (let i = 0; i < indexBars.length; i++) {
    const date = indexBars[i].date;
    const a = perDate.get(date);
    const b = a && a.n ? (a.up / a.n) * 100 : null;
    let rv = null;
    if (i >= 20) { const w = ret.slice(i - 19, i + 1); const m = mean(w); rv = Math.sqrt(mean(w.map((x) => (x - m) ** 2))); }
    rvs.push(rv);
    const hist = rvs.slice(Math.max(0, i - 249), i + 1).filter((x) => x != null);
    const rvPct = rv != null && hist.length >= 60 ? (hist.filter((x) => x <= rv).length / hist.length) * 100 : null;
    let regime = null;
    if (i >= 59) {
      const sma = (n, end) => mean(c.slice(end - n + 1, end + 1));
      regime = classifyRegime(c[i], sma(20, i), sma(50, i), sma(50, i - 10));
    }
    out.push({
      date, regime, b: r2(b), med5: a?.r5.length ? r2(median(a.r5)) : null,
      idx5: i >= 5 ? r2((c[i] / c[i - 5] - 1) * 100) : null, idx1: i >= 1 ? r2(ret[i] * 100) : null,
      rv: rv == null ? null : r2(rv * 100), rvPct: r2(rvPct), coverage: a && scopeSize ? r2(a.n / scopeSize) : 0, n: a?.n ?? 0,
    });
  }
  for (let i = 0; i < out.length; i++) {
    const s = out[i];
    s.db5 = i >= 5 && s.b != null && out[i - 5].b != null ? r2(s.b - out[i - 5].b) : null;
    const w = out.slice(Math.max(0, i - 5), i + 1).map((x) => x.b).filter((x) => x != null);
    s.ddb = s.b != null && w.length >= 6 ? r2(s.b - Math.max(...w)) : null;
  }
  return out;
}

const ok = (v) => v != null && Number.isFinite(v);

/** Điều kiện + bằng chứng / mâu thuẫn (tiếng Việt) của từng kịch bản tại một trạng thái. */
export function evaluate(s, R = RULES) {
  const e = {};
  {
    const A = s.regime === "UPTREND", Bb = ok(s.b) && s.b >= R.sc1.breadthMin, Bd = ok(s.db5) && s.db5 >= 0, filt = ok(s.rvPct) && s.rvPct < R.sc1.rvPctMax;
    e.SC1 = {
      groups: { price: A, breadth: Bb && Bd }, watch: A && (Bb || Bd), confirm: A && Bb && Bd && filt,
      invalid: (s.regime != null && s.regime !== "UPTREND") || (ok(s.b) && s.b < R.sc1.invalidBreadth),
      evidence: [A && "VN-Index xu hướng tăng (giá > MA50, MA20 > MA50, MA50 dốc lên)", Bb && `${f(s.b)}% mã trên MA20`, Bd && `độ rộng tăng ${f(s.db5)} điểm/5 phiên`].filter(Boolean),
      contradictions: [!filt && ok(s.rvPct) && `biến động cao (phân vị ${f(s.rvPct, 0)})`, ok(s.db5) && s.db5 < 0 && `độ rộng giảm ${f(-s.db5)} điểm/5 phiên`, ok(s.b) && s.b < R.sc1.breadthMin && `chỉ ${f(s.b)}% mã trên MA20`].filter(Boolean),
    };
  }
  {
    const A = ok(s.idx5) && s.idx5 > R.sc2.idx5Min, Bm = ok(s.med5) && s.med5 <= 0, Bd = ok(s.db5) && s.db5 < 0;
    e.SC2 = {
      groups: { price: A, breadth: Bm && Bd }, watch: A && (Bm || Bd), confirm: A && Bm && Bd,
      invalid: (ok(s.idx5) && s.idx5 <= 0) || (ok(s.med5) && s.med5 > 0 && ok(s.db5) && s.db5 >= 0),
      evidence: [A && `VN-Index +${f(s.idx5, 2)}%/5 phiên`, Bm && `trung vị cổ phiếu ${f(s.med5, 2)}%/5 phiên`, Bd && `độ rộng giảm ${f(-s.db5)} điểm`].filter(Boolean),
      contradictions: [ok(s.med5) && s.med5 > 0 && `trung vị cổ phiếu vẫn tăng ${f(s.med5, 2)}%`, ok(s.db5) && s.db5 >= 0 && "độ rộng không giảm"].filter(Boolean),
    };
  }
  {
    const A = (ok(s.rvPct) && s.rvPct >= R.sc3.rvPctShock) || (ok(s.idx1) && ok(s.rv) && s.rv > 0 && Math.abs(s.idx1) >= R.sc3.idxMoveSd * s.rv);
    const B = ok(s.ddb) && s.ddb <= R.sc3.breadthDrop;
    e.SC3 = {
      groups: { volatility: A, breadth: B }, watch: A || B, confirm: A && B,
      invalid: ok(s.rvPct) && s.rvPct < R.sc3.calmRvPct && ok(s.ddb) && s.ddb > R.sc3.calmDrop,
      evidence: [A && `biến động phân vị ${f(s.rvPct, 0)} / phiên ${f(s.idx1, 2)}%`, B && `độ rộng rơi ${f(-s.ddb)} điểm so đỉnh 5 phiên`].filter(Boolean),
      contradictions: [!A && "biến động chưa bất thường", !B && "độ rộng chưa rơi mạnh"].filter(Boolean),
    };
  }
  return e;
}

/** Vòng đời từng kịch bản qua chuỗi trạng thái; trả trạng thái theo ngày + các đợt (episode). */
export function runLifecycle(states, R = RULES) {
  const ids = Object.keys(SCENARIOS);
  const cur = Object.fromEntries(ids.map((k) => [k, { state: "INACTIVE", cool: 0, since: null, episode: null }]));
  const timeline = [];
  const episodes = [];
  const transitions = [];
  states.forEach((s, i) => {
    const ev = evaluate(s, R);
    const day = { date: s.date, i };
    for (const k of ids) {
      const c = cur[k], e = ev[k], prev = c.state;
      if (c.state === "COOLDOWN") { c.cool--; if (c.cool <= 0) c.state = "INACTIVE"; }
      else if (c.state === "INVALIDATED") { c.state = "COOLDOWN"; c.cool = R.cooldown; }
      else if (c.state === "CONFIRMED") { if (e.invalid) { c.state = "INVALIDATED"; if (c.episode) c.episode.end = s.date; c.episode = null; } }
      else if (e.confirm) { c.state = "CONFIRMED"; c.episode = { scenario: k, start: s.date, i, end: null }; episodes.push(c.episode); }
      else if (e.watch) c.state = "WATCH";
      else c.state = "INACTIVE";
      if (c.state !== prev) { c.since = s.date; transitions.push({ scenario: k, date: s.date, from: prev, to: c.state }); }
      day[k] = { state: c.state, since: c.since, evidence: e.evidence, contradictions: e.contradictions, groups: e.groups };
    }
    timeline.push(day);
  });
  return { timeline, episodes, transitions };
}

/** SC0 — chuyển pha / chưa xác định (spec §6.5). */
export function neutralState(day, { coverage, regimeLabel }) {
  const active = Object.keys(SCENARIOS).some((k) => day[k]?.state === "WATCH" || day[k]?.state === "CONFIRMED");
  const reasons = [];
  if (!active) reasons.push("không kịch bản nào đang theo dõi / đủ điều kiện");
  if (coverage != null && coverage < 0.8) reasons.push(`độ phủ dữ liệu ${Math.round(coverage * 100)}% < 80%`);
  if (regimeLabel === "TRANSITION") reasons.push("xác suất trạng thái HMM sát nhau");
  return { active: reasons.length > 0, reasons };
}

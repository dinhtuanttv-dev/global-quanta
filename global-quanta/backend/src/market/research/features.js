// Đặc trưng dòng tiền theo ngày cho một mã — tính TẠI cuối phiên t chỉ từ dữ liệu ≤ t.
// Cùng các lớp với IFE: z trượt của nỗ lực / kết quả / tay to, HMM 5 trạng thái (nguyên mẫu cố định),
// Stealth 5/20 phiên; thêm Volume Profile 20 phiên, RVOL, động lượng và Market Impulse.

import { trailingZ, forwardFilter, stealthScores, INTENT_STATES } from "../scanner/ife.js";
import { rollingProfile } from "./flowHistory.js";

export const FEATURE_NAMES = [
  "zEffort", "zResult", "zLarge", "stealth5", "stealth20", "netIntent",
  "pocDistAtr", "valueAreaPos", "logRvol", "mom5Atr", "impulse",
];

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const r4 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 1e4) / 1e4);
const clip = (v, lim = 4) => (v === null || !Number.isFinite(v) ? 0 : Math.max(-lim, Math.min(lim, v)));

function atrAbs(daily, i, n = 14) {
  if (i < n) return null;
  let s = 0;
  for (let k = i - n + 1; k <= i; k++) {
    const prev = daily[k - 1].close;
    s += Math.max(daily[k].high - daily[k].low, Math.abs(daily[k].high - prev), Math.abs(daily[k].low - prev));
  }
  return s / n;
}

/**
 * @param {{ flow: any[], daily: any[], profiles: any[], regimeByDate: Map<string, any> }} p
 *   flow: dòng market_flow_daily (camelCase) cũ -> mới; daily: market_daily; profiles: Volume Profile phiên.
 * @returns {Map<string, { features, posterior, intent, stealth5, stealth20 }>} theo ngày
 */
export function computeDailyFeatures({ flow, daily, profiles, regimeByDate = new Map() }) {
  const out = new Map();
  if (flow.length < 25) return out;
  const dailyIdx = new Map(daily.map((r, i) => [r.date, i]));
  const profByDate = new Map(profiles.map((p) => [p.date, p]));

  // ADV trượt (20 phiên TRƯỚC) và chuỗi chuẩn hoá theo ADV đó.
  const adv = flow.map((_, i) => (i >= 10 ? mean(flow.slice(Math.max(0, i - 20), i).map((f) => f.continuousVolume || 0)) : null));
  const effort = flow.map((f, i) => (adv[i] ? f.delta / adv[i] : 0));
  const large = flow.map((f, i) => (adv[i] ? f.largeDelta / adv[i] : 0));
  const rets = flow.map((f) => f.ret || 0);
  const zE = trailingZ(effort), zR = trailingZ(rets), zL = trailingZ(large);
  const path = forwardFilter(flow.map((_, i) => (zE[i] === null ? null : [zE[i], zR[i], zL[i]])), { stay: 0.8 });

  for (let i = 0; i < flow.length; i++) {
    if (zE[i] === null || !adv[i]) continue;
    const f = flow[i];
    // λ ngày (hồi quy qua gốc lợi suất theo delta/ADV) trên tối đa 119 phiên trước.
    let sxy = 0, sxx = 0;
    for (let k = Math.max(0, i - 119); k < i; k++) { const x = flow[k].delta / adv[i]; sxy += x * flow[k].ret; sxx += x * x; }
    const lambda = sxx ? sxy / sxx : null;
    const st = stealthScores(flow.slice(Math.max(0, i - 79), i + 1), adv[i], lambda);
    const post = path[i];
    const pr = Object.fromEntries(INTENT_STATES.map((s, k) => [s.id, post[k]]));
    const topIdx = post.indexOf(Math.max(...post));

    const di = dailyIdx.get(f.date);
    const d = di === undefined ? null : daily[di];
    const atr = di === undefined ? null : atrAbs(daily, di);
    const close = d?.close ?? f.close;
    const window = flow.slice(Math.max(0, i - 19), i + 1).map((x) => profByDate.get(x.date)).filter(Boolean);
    const vp = window.length >= 5 ? rollingProfile(window, close) : null;
    const vol20 = di !== undefined && di >= 20 ? mean(daily.slice(di - 20, di).map((r) => r.volume || 0)) : null;
    const mom5 = di !== undefined && di >= 5 && daily[di - 5].closeAdj ? d.closeAdj / daily[di - 5].closeAdj - 1 : null;
    const atrPct = atr && close ? atr / close : null;
    const regime = regimeByDate.get(f.date);

    const features = {
      zEffort: r4(clip(zE[i])),
      zResult: r4(clip(zR[i])),
      zLarge: r4(clip(zL[i])),
      stealth5: r4(clip(st.s5?.z ?? 0)),
      stealth20: r4(clip(st.s20?.z ?? 0)),
      netIntent: r4(pr.ACC_ACTIVE + pr.ACC_PASSIVE - pr.DIST_ACTIVE - pr.DIST_PASSIVE),
      pocDistAtr: r4(vp && atr ? clip((close - vp.poc) / atr) : 0),
      valueAreaPos: vp ? (vp.position === "above" ? 1 : vp.position === "below" ? -1 : 0) : 0,
      logRvol: r4(vol20 && d?.volume ? clip(Math.log(d.volume / vol20)) : 0),
      mom5Atr: r4(mom5 !== null && atrPct ? clip(mom5 / atrPct) : 0),
      impulse: r4(regime?.impulseScore !== null && regime?.impulseScore !== undefined ? (regime.impulseScore - 50) / 25 : 0),
    };
    out.set(f.date, {
      features,
      regime: regime?.regime ?? null,
      intent: { id: INTENT_STATES[topIdx].id, p: r4(post[topIdx]) },
      stealth5: st.s5?.z ?? null,
      stealth20: st.s20?.z ?? null,
      profile20: vp,
    });
  }
  return out;
}

export const featureVector = (features) => FEATURE_NAMES.map((n) => Number(features?.[n] ?? 0) || 0);

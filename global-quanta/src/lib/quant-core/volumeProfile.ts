// @gq/quant-core · Volume Profile Engine (TA_VNINDEX_UPGRADE_SPEC §2.2.2).
//   Bin theo bước giá thật (gộp bội số khi > maxBins) · POC · Value Area 70% chuẩn CME (so 2 bin trên / 2 bin dưới)
//   HVN/LVN trên profile làm mượt Gaussian σ = 2 bin · Session profile + naked POC.
// Nguồn: nến 1 phút (T2 — phân phối đều KL nến theo các mức giá [low, high]) hoặc nến ngày (T3 — phân phối tam giác
// đỉnh tại giá điển hình (H+L+C)/3, chỉ là XẤP XỈ). Nến khớp định kỳ (auction) bị loại khỏi profile khớp liên tục.

import { tickSize as tickOf, type Bar } from "./math";

export type ProfileMethod = "uniform" | "triangular";
export interface ProfileBin { low: number; high: number; volume: number }
export interface VolumeProfile {
  bins: ProfileBin[]; binSize: number; totalVolume: number; maxVolume: number;
  poc: number; pocIndex: number; vah: number; val: number;
  hvn: number[]; lvn: number[];
  method: ProfileMethod; fromDate: string; toDate: string;
}
export interface ProfileOptions { method?: ProfileMethod; isIndex?: boolean; maxBins?: number; valueAreaPct?: number }

type PBar = Bar & { auction?: string };

/** Kích thước bin: bước giá thật, gộp thành bội số khi số bin vượt maxBins. */
export function profileBinSize(low: number, high: number, isIndex: boolean, maxBins: number): number {
  const tick = tickOf((low + high) / 2, isIndex);
  const n = Math.max(1, (high - low) / tick);
  return n <= maxBins ? tick : Math.ceil(n / maxBins) * tick;
}

/** Dựng profile (hàm thuần). Trả null nếu không có khối lượng. */
export function buildVolumeProfile(bars: PBar[], opts: ProfileOptions = {}): VolumeProfile | null {
  const method = opts.method ?? "uniform";
  const src = bars.filter((b) => !b.auction && b.volume > 0 && b.high >= b.low);
  if (!src.length) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const b of src) { lo = Math.min(lo, b.low); hi = Math.max(hi, b.high); }
  const binSize = profileBinSize(lo, hi, Boolean(opts.isIndex), opts.maxBins ?? 120);
  const start = Math.floor(lo / binSize) * binSize;
  const count = Math.max(1, Math.floor((hi - start) / binSize) + 1);
  const vol = new Array<number>(count).fill(0);
  const binOf = (p: number) => Math.min(count - 1, Math.max(0, Math.floor((p - start) / binSize + 1e-9)));

  for (const b of src) {
    const i0 = binOf(b.low);
    const i1 = binOf(b.high);
    if (i0 === i1) { vol[i0] += b.volume; continue; }
    if (method === "uniform") {
      // Chia theo độ dài phần giao của [low, high] với từng bin.
      const span = b.high - b.low;
      for (let i = i0; i <= i1; i++) {
        const a = Math.max(b.low, start + i * binSize);
        const z = Math.min(b.high, start + (i + 1) * binSize);
        if (z > a) vol[i] += (b.volume * (z - a)) / span;
      }
    } else {
      // Tam giác: trọng số giảm tuyến tính từ giá điển hình về hai đầu nến.
      const tp = (b.high + b.low + b.close) / 3;
      const half = Math.max(tp - b.low, b.high - tp, binSize / 2);
      let wsum = 0;
      const w: number[] = [];
      for (let i = i0; i <= i1; i++) {
        const mid = start + (i + 0.5) * binSize;
        const x = Math.max(0, 1 - Math.abs(mid - tp) / half);
        w.push(x);
        wsum += x;
      }
      w.forEach((x, k) => { vol[i0 + k] += wsum > 0 ? (b.volume * x) / wsum : b.volume / w.length; });
    }
  }

  const total = vol.reduce((s, v) => s + v, 0);
  if (!(total > 0)) return null;
  // POC: bin lớn nhất; hoà -> gần VWAP nhất.
  let pv = 0;
  for (const b of src) pv += ((b.high + b.low + b.close) / 3) * b.volume;
  const vwap = pv / src.reduce((s, b) => s + b.volume, 0);
  let poc = 0;
  for (let i = 1; i < count; i++) {
    const better = vol[i] > vol[poc] + 1e-9;
    const tie = Math.abs(vol[i] - vol[poc]) <= 1e-9 && Math.abs(start + (i + 0.5) * binSize - vwap) < Math.abs(start + (poc + 0.5) * binSize - vwap);
    if (better || tie) poc = i;
  }
  const [vaLo, vaHi] = valueArea(vol, poc, opts.valueAreaPct ?? 0.7);
  const { hvn, lvn } = nodes(vol, poc);
  const mid = (i: number) => start + (i + 0.5) * binSize;
  return {
    bins: vol.map((v, i) => ({ low: start + i * binSize, high: start + (i + 1) * binSize, volume: v })),
    binSize, totalVolume: total, maxVolume: vol[poc],
    poc: mid(poc), pocIndex: poc, vah: start + (vaHi + 1) * binSize, val: start + vaLo * binSize,
    hvn: hvn.map(mid), lvn: lvn.map(mid), method,
    fromDate: src[0].date, toDate: src[src.length - 1].date,
  };
}

/**
 * Value Area chuẩn CME/Market Profile: xuất phát từ POC, mỗi bước so TỔNG 2 bin phía trên với 2 bin phía dưới,
 * nhận cặp lớn hơn (bằng nhau -> nhận cả hai), tới khi ≥ pct tổng khối lượng. Trả [chỉ số bin thấp, cao].
 */
export function valueArea(vol: number[], poc: number, pct = 0.7): [number, number] {
  const total = vol.reduce((s, v) => s + v, 0);
  let lo = poc;
  let hi = poc;
  let acc = vol[poc];
  while (acc < pct * total && (lo > 0 || hi < vol.length - 1)) {
    const up = (hi + 1 < vol.length ? vol[hi + 1] : 0) + (hi + 2 < vol.length ? vol[hi + 2] : 0);
    const dn = (lo - 1 >= 0 ? vol[lo - 1] : 0) + (lo - 2 >= 0 ? vol[lo - 2] : 0);
    const canUp = hi < vol.length - 1;
    const canDn = lo > 0;
    const takeUp = canUp && (!canDn || up >= dn);
    const takeDn = canDn && (!canUp || dn >= up);
    if (takeUp) { const n = Math.min(2, vol.length - 1 - hi); for (let k = 1; k <= n; k++) acc += vol[hi + k]; hi += n; }
    if (takeDn) { const n = Math.min(2, lo); for (let k = 1; k <= n; k++) acc += vol[lo - k]; lo -= n; }
  }
  return [lo, hi];
}

/** HVN/LVN trên profile làm mượt Gaussian σ = 2 bin: HVN = đỉnh ≥ 15% POC, LVN = đáy ≤ 35% POC (bỏ hai đầu). */
export function nodes(vol: number[], poc: number, sigma = 2): { hvn: number[]; lvn: number[] } {
  const r = Math.ceil(sigma * 3);
  const kernel = Array.from({ length: 2 * r + 1 }, (_, k) => Math.exp(-((k - r) ** 2) / (2 * sigma * sigma)));
  const sm = vol.map((_, i) => {
    let s = 0;
    let w = 0;
    for (let k = -r; k <= r; k++) {
      const j = i + k;
      if (j < 0 || j >= vol.length) continue;
      s += vol[j] * kernel[k + r];
      w += kernel[k + r];
    }
    return w ? s / w : 0;
  });
  const ref = sm[poc] || Math.max(...sm);
  const hvn: number[] = [];
  const lvn: number[] = [];
  for (let i = 1; i < sm.length - 1; i++) {
    if (sm[i] >= sm[i - 1] && sm[i] > sm[i + 1] && sm[i] >= 0.15 * ref) hvn.push(i);
    if (sm[i] <= sm[i - 1] && sm[i] < sm[i + 1] && sm[i] <= 0.35 * ref) lvn.push(i);
  }
  return { hvn, lvn };
}

export interface SessionProfile { session: string; profile: VolumeProfile; nakedUntil: string | null; naked: boolean; auctionVolume: number }

/**
 * Session Volume Profile theo từng phiên (nến 1 phút). POC "naked" = chưa có nến nào ở các phiên SAU chạm qua giá POC;
 * nakedUntil = thời điểm bị chạm lại đầu tiên.
 */
export function buildSessionProfiles(bars1m: PBar[], opts: ProfileOptions = {}): SessionProfile[] {
  const bySession = new Map<string, PBar[]>();
  for (const b of bars1m) {
    const s = b.date.slice(0, 10);
    if (!bySession.has(s)) bySession.set(s, []);
    bySession.get(s)!.push(b);
  }
  const sessions = [...bySession.keys()].sort();
  const out: SessionProfile[] = [];
  for (const s of sessions) {
    const list = bySession.get(s)!;
    const profile = buildVolumeProfile(list, { ...opts, method: "uniform" });
    if (!profile) continue;
    let nakedUntil: string | null = null;
    for (const later of sessions.filter((x) => x > s)) {
      const hit = bySession.get(later)!.find((b) => b.low <= profile.poc && b.high >= profile.poc);
      if (hit) { nakedUntil = hit.date; break; }
    }
    out.push({ session: s, profile, nakedUntil, naked: nakedUntil === null, auctionVolume: list.filter((b) => b.auction).reduce((x, b) => x + b.volume, 0) });
  }
  return out;
}

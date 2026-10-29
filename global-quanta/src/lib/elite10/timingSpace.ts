// CH3D (29/10/2026) — "Không gian thời điểm 4D" cho Hồ sơ 360°: dữ liệu thuần cho chart 3D (cùng cách chiếu của RRG 4D Lọc ngành).
//   X = phiên so với sự kiện · Y = lợi suất vượt VN-Index tích luỹ (engine v3) · Z = từng đợt sự kiện (cũ -> mới, kỳ hiện tại ở trước)
//   W = "ESA ngày": độ bất thường giá trị giao dịch phiên so với 20 phiên liền trước — cùng chuẩn hoá của ESA R0 intraday
//       (trung vị + 1,4826 × MAD; bất thường khi z ≥ 3 VÀ gấp ≥ 2 lần trung vị; z ≥ 5 = mức cao). Dùng GIÁ TRỊ (VND) thay khối lượng để
//       chia tách cổ phiếu / cổ tức bằng cổ phiếu quanh GDKHQ không tạo bất thường giả. Mô tả, KHÔNG phải tín hiệu đã kiểm định.
// Timeline điểm mua (Gateway, cùng engine v3) gắn vào bằng windowId -> vùng mua theo NGÀY THẬT của kỳ hiện tại.
import type { TimelineRow } from "../cotuc/buy-timeline";
import type { EventStudy } from "./timingSim";

export interface DailyBar { date: string; volume: number; value?: number | null; close?: number }
export interface EsaDaily { date: string; z: number | null; rv: number | null; level: "none" | "unusual" | "high" }

export const ESA_DAILY = { lookback: 20, minObs: 15, z: 3, rv: 2, zHigh: 5 } as const;
/** N0 (29/10/2026): bản ĐÃ TRỪ YẾU TỐ THỊ TRƯỜNG — x = ln(giá trị GD mã) − ln(giá trị GD toàn sàn), so 60 phiên trước (trung vị + 1,4826·MAD);
 *  bội số = exp(x − trung vị). Phiên cả sàn cùng bùng khối lượng không còn hiện "bất thường" ở mọi mã. Cùng chuẩn ESA tin tức (N0). */
export const ESA_DAILY_MKT = { lookback: 60, minObs: 40, z: 3, rv: 2, zHigh: 5 } as const;
/** Giá trị GD toàn sàn theo ngày (từ nến VN-Index). */
export type MarketValue = Map<string, number>;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null;
};
const amount = (b: DailyBar) => (b.value != null && b.value > 0 ? b.value : b.volume > 0 ? b.volume * (b.close ?? 1) : 0);

/** ESA ngày tại phiên `i` (chỉ dùng phiên TRƯỚC i — không nhìn trước). */
export function esaDailyAt(bars: DailyBar[], i: number, p = ESA_DAILY, market: MarketValue | null = null): EsaDaily | null {
  const bar = bars[i];
  if (!bar) return null;
  if (market) {
    const q = ESA_DAILY_MKT;
    const xOf = (b: DailyBar) => { const v = amount(b), m = market.get(b.date); return v > 0 && m != null && m > 0 ? Math.log(v) - Math.log(m) : null; };
    const prior = bars.slice(Math.max(0, i - q.lookback), i).map(xOf).filter((x): x is number => x != null);
    const cur = xOf(bar);
    if (prior.length < q.minObs || cur == null) return { date: bar.date, z: null, rv: null, level: "none" };
    const med = median(prior)!, mad = median(prior.map((v) => Math.abs(v - med)))!;
    const z = mad > 0 ? (cur - med) / (1.4826 * mad) : null, rv = Math.exp(cur - med);
    const hit = z != null && z >= q.z && rv >= q.rv;
    return { date: bar.date, z, rv, level: !hit ? "none" : z! >= q.zHigh ? "high" : "unusual" };
  }
  const prior = bars.slice(Math.max(0, i - p.lookback), i).map(amount).filter((v) => v > 0);
  const cur = amount(bar);
  if (prior.length < p.minObs || !(cur > 0)) return { date: bar.date, z: null, rv: null, level: "none" };
  const med = median(prior)!, mad = median(prior.map((v) => Math.abs(v - med)))!;
  const scale = 1.4826 * mad;
  const z = scale > 0 ? (cur - med) / scale : null, rv = med > 0 ? cur / med : null;
  const hit = z != null && rv != null && z >= p.z && rv >= p.rv;
  return { date: bar.date, z, rv, level: !hit ? "none" : z! >= p.zHigh ? "high" : "unusual" };
}

/** Chỉ số phiên của ngày sự kiện: phiên đầu tiên có ngày ≥ sự kiện (sự kiện rơi vào ngày nghỉ -> phiên kế tiếp). */
export function eventIndex(bars: DailyBar[], eventDate: string): number {
  let lo = 0, hi = bars.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (bars[mid].date < eventDate) lo = mid + 1; else hi = mid; }
  return lo < bars.length ? lo : -1;
}

export interface SpaceCell { offset: number; date: string; esa: EsaDaily }
export interface SpaceRibbon {
  key: string; label: string; kind: "event" | "median" | "current";
  eventDate: string | null;
  /** Điểm CAR (exp(CAR) − 1) tại các mốc v3. */
  points: { offset: number; ret: number }[];
  /** Thảm W: mỗi phiên từ mốc đầu tới mốc cuối (kỳ hiện tại: tới hôm nay). */
  cells: SpaceCell[];
  /** Lãi ròng của cửa sổ đang xem cho đợt này (tô đường thắng / thua). */
  windowNet: number | null;
  /** Kỳ tới: đường lợi suất tự tính từ giá đóng cửa (engine v3 chưa có đường kỳ hiện tại). */
  derived?: boolean;
}
export interface TimingSpace {
  ribbons: SpaceRibbon[]; x0: number; x1: number; yMin: number; yMax: number;
  anomalies: number; cellsWithEsa: number;
  /** ESA ngày đã trừ yếu tố thị trường (đủ giá trị GD toàn sàn) hay chưa. */
  marketAdjusted: boolean;
}

const netOf = (car: (number | null)[], offsets: number[], a: number, b: number, cost: number) => {
  const x = car[offsets.indexOf(a)], y = car[offsets.indexOf(b)];
  return x == null || y == null ? null : Math.expm1(y - x) - cost;
};

/**
 * Dựng các dải 3D. `bars` = nến ngày tăng dần (Gateway). `todayOff` = phiên hôm nay so với sự kiện sắp tới (null = không rõ).
 * `entry`/`exit` = cửa sổ đang xem (tô thắng / thua).
 */
/** Phiên (so với sự kiện) của nến ngày cuối: chưa có nến hôm nay (trước giờ mở cửa) -> hôm qua = todayOff − 1. */
export function lastBarOffset(bars: DailyBar[], todayOff: number | null, today: string | null): number | null {
  if (todayOff == null || !bars.length) return null;
  return today && bars[bars.length - 1].date < today ? todayOff - 1 : todayOff;
}

/**
 * Đường lợi suất vượt VN-Index của KỲ TỚI từ giá đóng cửa: CAR(k) = ln(P_k/P_đầu) − ln(I_k/I_đầu), mốc đầu = offsets[0] (cùng neo 0 với v3).
 * Chỉ tính TRƯỚC sự kiện (chưa qua GDKHQ nên giá đóng cửa = giá tổng lợi suất); thiếu VN-Index cùng ngày -> bỏ mốc đó.
 */
export function currentPathFromBars(offs: number[], bars: DailyBar[], indexBars: DailyBar[], lastOff: number): { offset: number; ret: number }[] {
  if (lastOff > 0 || !bars.length || !indexBars.length) return [];
  const idx = new Map(indexBars.map((b) => [b.date, b.close ?? 0]));
  const last = bars.length - 1, at = (k: number) => bars[last - (lastOff - k)];
  const a = at(offs[0]), ia = a ? idx.get(a.date) : undefined;
  if (!a?.close || !ia) return [];
  const ks = [...offs.filter((o) => o < lastOff), lastOff];
  return ks.flatMap((k) => {
    const b = at(k), ib = b ? idx.get(b.date) : undefined;
    return b?.close && ib ? [{ offset: k, ret: Math.expm1(Math.log(b.close / a.close!) - Math.log(ib / ia)) }] : [];
  });
}

export function buildTimingSpace(es: EventStudy, bars: DailyBar[], todayOff: number | null, win: { entryTo: number; exitOffset: number } | null, today: string | null = null, indexBars: DailyBar[] = [], extraRets: number[] = []): TimingSpace {
  const offs = es.offsets, x0 = Math.min(offs[0], todayOff ?? offs[0]), x1 = Math.max(offs[offs.length - 1], todayOff ?? offs[0]);
  const mkt = marketValueMap(bars, indexBars);
  const carPts = (car: (number | null)[]) => car.flatMap((v, i) => (v == null ? [] : [{ offset: offs[i], ret: Math.expm1(v) }]));
  const cellsAround = (center: number, from: number, to: number): SpaceCell[] => {
    if (center < 0) return [];
    const out: SpaceCell[] = [];
    for (let k = from; k <= to; k++) { const i = center + k; const esa = esaDailyAt(bars, i, ESA_DAILY, mkt); if (esa) out.push({ offset: k, date: bars[i].date, esa }); }
    return out;
  };
  const ribbons: SpaceRibbon[] = [...es.events].sort((a, b) => a.eventDate.localeCompare(b.eventDate)).map((e) => {
    const idx = eventIndex(bars, e.eventDate);
    // nến ngày phải phủ đúng ngày sự kiện (không lệch quá 5 ngày lịch) mới gắn thảm W
    const okIdx = idx >= 0 && (Date.parse(bars[idx].date) - Date.parse(e.eventDate)) <= 5 * 86_400_000 ? idx : -1;
    return {
      key: e.eventDate, label: `${e.eventDate.slice(8, 10)}/${e.eventDate.slice(5, 7)}/${e.eventDate.slice(2, 4)}`, kind: "event" as const,
      eventDate: e.eventDate, points: carPts(e.car), cells: cellsAround(okIdx, offs[0], offs[offs.length - 1]),
      windowNet: win ? netOf(e.car, offs, win.entryTo, win.exitOffset, es.costPerRoundTrip) : null,
    };
  });
  // Trung vị (giữa lịch sử và kỳ hiện tại) — không có thảm W.
  const med = offs.map((o, i) => {
    const vs = es.events.map((e) => e.car[i]).filter((v): v is number => v != null);
    return vs.length ? { offset: o, ret: Math.expm1(median(vs)!) } : null;
  }).filter((p): p is { offset: number; ret: number } => p != null);
  ribbons.push({ key: "median", label: "Trung vị", kind: "median", eventDate: null, points: med, cells: [], windowNet: null });
  // Kỳ hiện tại: đường CAR tới hôm nay + thảm W từ mốc đầu tới phiên cuối có nến (chưa có nến hôm nay -> phiên cuối = hôm qua).
  if (es.upcoming) {
    const last = bars.length - 1;
    const lastOff = lastBarOffset(bars, todayOff, today);
    const cells: SpaceCell[] = [];
    if (lastOff != null) {
      for (let k = Math.max(offs[0], lastOff - last); k <= Math.min(lastOff, x1); k++) {
        const i = last - (lastOff - k); const esa = esaDailyAt(bars, i, ESA_DAILY, mkt);
        if (esa) cells.push({ offset: k, date: bars[i].date, esa });
      }
    }
    const d = es.upcoming.date ?? "";
    const own = es.currentPath ? carPts(es.currentPath) : [];
    const derived = !own.length && lastOff != null && lastOff - (bars.length - 1) <= offs[0] ? currentPathFromBars(offs, bars, indexBars, lastOff) : [];
    ribbons.push({ key: "current", label: d ? `Kỳ tới ${d.slice(8, 10)}/${d.slice(5, 7)}` : "Kỳ tới", kind: "current", eventDate: d || null, points: own.length ? own : derived, cells, windowNet: null, derived: !own.length && derived.length > 0 });
  }
  const rets = [...ribbons.flatMap((r) => r.points.map((p) => p.ret)), ...extraRets];
  const lo = Math.min(0, ...rets), hi = Math.max(0, ...rets), pad = (hi - lo) * 0.06 || 0.02;
  const all = ribbons.flatMap((r) => r.cells);
  return { ribbons, x0, x1, yMin: lo - pad, yMax: hi + pad, anomalies: all.filter((c) => c.esa.level !== "none").length, cellsWithEsa: all.filter((c) => c.esa.z != null).length, marketAdjusted: mkt != null };
}

/** Dòng Timeline điểm mua của mã + loại sự kiện: ưu tiên ĐANG TRONG VÙNG, rồi SẮP TỚI gần nhất, rồi đã qua gần nhất. */
export function timelineRowFor(rows: TimelineRow[], ticker: string, kind: "DIVIDEND" | "EARNINGS"): TimelineRow | null {
  const mine = rows.filter((r) => r.ticker === ticker && r.kind === kind);
  const rank = (r: TimelineRow) => (r.status === "IN_WINDOW" ? 0 : r.status === "UPCOMING" ? 1 : 2);
  return mine.sort((a, b) => rank(a) - rank(b) || (rank(a) === 2 ? b.sessionsToEntry - a.sessionsToEntry : a.sessionsToEntry - b.sessionsToEntry))[0] ?? null;
}

/** Giá trị GD toàn sàn theo ngày nếu phủ ≥ 90% số phiên của mã (không trộn hai cách chấm trong một thảm), ngược lại null. */
export function marketValueMap(bars: DailyBar[], indexBars: DailyBar[]): MarketValue | null {
  if (!bars.length || !indexBars.length) return null;
  const m: MarketValue = new Map(indexBars.filter((b) => (b.value ?? 0) > 0).map((b) => [b.date, b.value!]));
  const covered = bars.filter((b) => m.has(b.date)).length;
  return covered / bars.length >= 0.9 ? m : null;
}

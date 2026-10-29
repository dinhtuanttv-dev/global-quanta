// CH1 (29/10/2026) — bộ MÔ PHỎNG thời điểm vào / thoát cho chart Hồ sơ 360° (hàm thuần, không I/O).
// Đầu vào: nghiên cứu sự kiện của Project A (/api/cotuc/event-study) — đường CAR từng đợt tại các mốc offset của engine v3.
// Lợi suất ròng một đợt = exp(CAR_thoát − CAR_vào) − 1 − phí khứ hồi (đúng netReturnOfEvent của v3: có test đối soát với số v3).
// Xác suất = hậu nghiệm Beta(α₀+thắng, β₀+thua): ô trùng một cửa sổ v3 dùng prior của cửa sổ đó (mã khác); ô khác dùng Beta(1,1).
// Ô người dùng tự chọn KHÔNG phải cửa sổ đã kiểm định — chỉ cửa sổ v3 `selected` mang nhãn ĐẠT KIỂM ĐỊNH (chọn ô đẹp nhất = quá khớp).
import { betaBinomialPosterior } from "../cotuc/beta-binomial";

export interface EventStudyWindow {
  id: string; label: string; entryFrom: number; entryTo: number; exitOffset: number; holdsThroughEx: boolean;
  nEvents: number; nEff: number; meanCarRaw: number; netExpectancy: number; netExpectancyLcb: number; winRate: number;
  wins?: number; losses?: number; oosHitRate: number | null; oosMeanNet: number | null; fdrQValue: number; selected: boolean;
}
export interface EventStudy {
  ticker: string; kind: "DIVIDEND" | "EARNINGS"; quarter: number | null; version: string; asOf: string;
  offsets: number[]; events: { eventDate: string; year: number; car: (number | null)[] }[]; currentPath: (number | null)[] | null;
  windows: EventStudyWindow[]; selectedWindowId: string | null; costPerRoundTrip: number;
  priors: Record<string, { alpha0: number; beta0: number; peers: number; scope: string }>;
  upcoming: { date: string | null; status: string; label: string | null; source: string } | null;
  notes: string[];
}

export type CellTier = "VALIDATED" | "V3_WINDOW" | "EXPLORATORY";
export interface SimResult {
  entry: number; exit: number; n: number; wins: number; losses: number;
  meanNet: number | null; medianNet: number | null; outcomes: { eventDate: string; year: number; net: number }[];
  prob: { mean: number; ci: [number, number]; priorScope: string } | null;
  window: EventStudyWindow | null; tier: CellTier;
}

/** Lợi suất ròng một đợt (null khi thiếu CAR ở một trong hai mốc). */
export function netOf(car: (number | null)[], offsets: number[], entry: number, exit: number, cost: number): number | null {
  const a = car[offsets.indexOf(entry)], b = car[offsets.indexOf(exit)];
  if (a == null || b == null) return null;
  return Math.exp(b - a) - 1 - cost;
}

const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

/** Cửa sổ v3 có cùng (ngày vào = entryTo, ngày thoát) — v3 lấy mẫu tại entryTo (cuối vùng mua). */
export function windowAt(es: EventStudy, entry: number, exit: number): EventStudyWindow | null {
  return es.windows.find((w) => w.entryTo === entry && w.exitOffset === exit) ?? null;
}

/** Mô phỏng một cặp (vào, thoát) trên mọi đợt lịch sử. */
export function simulate(es: EventStudy, entry: number, exit: number, level = 0.9): SimResult {
  const outcomes: SimResult["outcomes"] = [];
  if (exit > entry) for (const e of es.events) {
    const net = netOf(e.car, es.offsets, entry, exit, es.costPerRoundTrip);
    if (net != null) outcomes.push({ eventDate: e.eventDate, year: e.year, net });
  }
  const nets = outcomes.map((o) => o.net);
  const wins = nets.filter((x) => x > 0).length, losses = nets.length - wins;
  const w = windowAt(es, entry, exit);
  const pr = w ? es.priors[w.id] : null;
  const post = nets.length ? betaBinomialPosterior(wins, losses, pr?.alpha0 ?? 1, pr?.beta0 ?? 1, level) : null;
  return {
    entry, exit, n: nets.length, wins, losses,
    meanNet: nets.length ? nets.reduce((a, b) => a + b, 0) / nets.length : null, medianNet: median(nets), outcomes,
    prob: post ? { mean: post.mean, ci: post.ci, priorScope: pr?.scope ?? "UNIFORM" } : null,
    window: w, tier: w?.selected ? "VALIDATED" : w ? "V3_WINDOW" : "EXPLORATORY",
  };
}

/** Bản đồ nhiệt vào × thoát: mọi cặp offset hợp lệ (vào < thoát). */
export function heatmap(es: EventStudy): SimResult[] {
  const out: SimResult[] = [];
  for (const a of es.offsets) for (const b of es.offsets) if (b > a) out.push(simulate(es, a, b));
  return out;
}

/** Thống kê đường CAR theo offset: trung vị + tứ phân vị (cho khung nghiên cứu sự kiện). */
export function pathBands(es: EventStudy): { offset: number; n: number; median: number | null; q25: number | null; q75: number | null }[] {
  return es.offsets.map((o, i) => {
    const xs = es.events.map((e) => e.car[i]).filter((v): v is number => v != null).sort((a, b) => a - b);
    const q = (p: number) => (xs.length ? xs[Math.min(xs.length - 1, Math.max(0, Math.round(p * (xs.length - 1))))] : null);
    return { offset: o, n: xs.length, median: median(xs), q25: q(0.25), q75: q(0.75) };
  });
}

/**
 * Hôm nay đang ở phiên tương đối nào so với sự kiện sắp tới (âm = trước sự kiện). `sessions` = danh sách phiên giao dịch (tăng dần,
 * đủ phủ từ hôm nay tới ngày sự kiện) — dùng lịch phiên của Gateway (có ngày nghỉ). null nếu chưa có ngày sự kiện.
 */
export function todayOffset(eventDate: string | null, today: string, sessions: string[]): number | null {
  if (!eventDate) return null;
  if (eventDate === today) return 0;
  const lo = eventDate < today ? eventDate : today, hi = eventDate < today ? today : eventDate;
  const n = sessions.filter((d) => d > lo && d <= hi).length;
  return eventDate > today ? -n : n;
}

/** Danh sách phiên giao dịch trong [from, to] theo lịch (isTradingDay nhận số ngày kể từ 1970-01-01, như HolidayCalendar của tab Cổ tức). */
export function tradingSessions(from: string, to: string, isTradingDay: (dayNumber: number) => boolean): string[] {
  const out: string[] = [];
  const a = Date.parse(`${from}T00:00:00Z`) / 86_400_000, b = Date.parse(`${to}T00:00:00Z`) / 86_400_000;
  for (let d = a; d <= b && out.length < 2000; d++) if (isTradingDay(d)) out.push(new Date(d * 86_400_000).toISOString().slice(0, 10));
  return out;
}

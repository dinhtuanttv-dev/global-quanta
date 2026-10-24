// R5 — tham số chỉ báo do người dùng chỉnh (lưu theo tài khoản cùng bố cục). Mặc định = công thức chuẩn đang dùng
// (RSI 14 Wilder 70/30 · MACD 12/26/9 · ADX 14 ngưỡng 25 · Volume Profile 60 nến tam giác · AVWAP tự neo).
// Không tin dữ liệu vào: mọi số bị kẹp trong miền hợp lệ; ngày neo AVWAP lưu THEO MÃ (neo của FPT không áp cho HPG).

export type RsiMethod = "wilder" | "cutler";
export type ProfileMethodSetting = "triangular" | "uniform";
export interface IndicatorSettings {
  rsi: { period: number; upper: number; lower: number; method: RsiMethod };
  macd: { fast: number; slow: number; signal: number };
  adx: { period: number; threshold: number };
  vprofile: { bars: number; method: ProfileMethodSetting };
  /** Ngày neo AVWAP theo mã; mã không có -> tự động (đầu dải giao dịch). */
  avwap: { anchors: Record<string, string> };
}

export const DEFAULT_INDICATORS: IndicatorSettings = {
  rsi: { period: 14, upper: 70, lower: 30, method: "wilder" },
  macd: { fast: 12, slow: 26, signal: 9 },
  adx: { period: 14, threshold: 25 },
  vprofile: { bars: 60, method: "triangular" },
  avwap: { anchors: {} },
};

/** Miền hợp lệ [min, max] — giống hệt phía Gateway (backend/src/market/watchlists/userWorkspace.js). */
export const INDICATOR_LIMITS = {
  rsi: { period: [2, 100], upper: [51, 95], lower: [5, 49] },
  macd: { fast: [2, 50], slow: [3, 200], signal: [2, 50] },
  adx: { period: [2, 100], threshold: [10, 60] },
  vprofile: { bars: [20, 500] },
} as const;
const MAX_ANCHORS = 30;
const DATE_RE = /^\d{4}-\d{2}-\d{2}(T[0-9:.+Z-]{4,20})?$/;
const TICKER_RE = /^[A-Z0-9]{2,12}$/;

const int = (v: unknown, [lo, hi]: readonly [number, number], d: number) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d);

export function sanitizeIndicators(raw: unknown): IndicatorSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown> | undefined>;
  const D = DEFAULT_INDICATORS, L = INDICATOR_LIMITS;
  const rsi = r.rsi ?? {}, macd = r.macd ?? {}, adx = r.adx ?? {}, vp = r.vprofile ?? {}, av = r.avwap ?? {};
  const out: IndicatorSettings = {
    rsi: {
      period: int(rsi.period, L.rsi.period, D.rsi.period), upper: int(rsi.upper, L.rsi.upper, D.rsi.upper), lower: int(rsi.lower, L.rsi.lower, D.rsi.lower),
      method: rsi.method === "cutler" ? "cutler" : "wilder",
    },
    macd: { fast: int(macd.fast, L.macd.fast, D.macd.fast), slow: int(macd.slow, L.macd.slow, D.macd.slow), signal: int(macd.signal, L.macd.signal, D.macd.signal) },
    adx: { period: int(adx.period, L.adx.period, D.adx.period), threshold: int(adx.threshold, L.adx.threshold, D.adx.threshold) },
    vprofile: { bars: int(vp.bars, L.vprofile.bars, D.vprofile.bars), method: vp.method === "uniform" ? "uniform" : "triangular" },
    avwap: { anchors: {} },
  };
  // MACD: đường nhanh phải ngắn hơn đường chậm — sai thì về mặc định cả cặp.
  if (out.macd.fast >= out.macd.slow) { out.macd.fast = D.macd.fast; out.macd.slow = D.macd.slow; }
  const anchors = av.anchors && typeof av.anchors === "object" ? Object.entries(av.anchors as Record<string, unknown>) : [];
  for (const [t, d] of anchors.slice(-MAX_ANCHORS)) if (TICKER_RE.test(t) && typeof d === "string" && DATE_RE.test(d)) out.avwap.anchors[t] = d;
  return out;
}

export const isDefaultSection = <K extends keyof IndicatorSettings>(s: IndicatorSettings, k: K) => JSON.stringify(s[k]) === JSON.stringify(DEFAULT_INDICATORS[k]);

/** Tiêu đề pane theo tham số đang dùng. */
export function paneTitles(s: IndicatorSettings): { rsi: string; macd: string; adx: string } {
  return {
    rsi: `RSI ${s.rsi.period}${s.rsi.method === "cutler" ? " (Cutler)" : ""} · ${s.rsi.upper} / ${s.rsi.lower}`,
    macd: `MACD ${s.macd.fast}/${s.macd.slow}/${s.macd.signal}`,
    adx: `ADX ${s.adx.period} · +DI / −DI · ngưỡng ${s.adx.threshold}`,
  };
}

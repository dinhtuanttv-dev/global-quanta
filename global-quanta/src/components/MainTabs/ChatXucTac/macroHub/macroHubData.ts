// Dữ liệu thuần cho Trung tâm vĩ mô (31/10/2026): thẻ "Nhịp vĩ mô" từ /api/macro/series?tail=25, lịch từ /api/macro/catalyst-events.

export interface MacroSeriesPoint { period: string; value: number }
export interface MacroSeriesRow {
  id: string; nameVi: string; role: "factor" | "target"; kind?: string; unit?: string; n: number; last: string | null; points?: MacroSeriesPoint[];
}
export interface MacroSeriesResponse { asOf: string; series: MacroSeriesRow[] }

export interface MacroCalendarItem {
  id: string; kind: string; title: string; date: string; daysRemaining: number; country?: string; estimated?: boolean; evidence?: string;
}
export interface MacroCalendarResponse { mode: string; asOf: string; caveat?: string; events: MacroCalendarItem[] }

/** Thẻ hiển thị, theo thứ tự cố định. `change`: "pp" = chênh điểm phần trăm (chuỗi lãi suất/tỷ lệ), "pct" = % so tháng trước (chuỗi mức). */
export const PULSE_TILES = [
  { id: "CPI", label: "CPI Việt Nam", sub: "so cùng kỳ", unit: "%", change: "pp", digits: 2 },
  { id: "EX", label: "USD/VND", sub: "thị trường", unit: "", change: "pct", digits: 0 },
  { id: "VNINDEX", label: "VN-Index", sub: "cuối tháng", unit: "", change: "pct", digits: 1 },
  { id: "DXY", label: "Chỉ số USD", sub: "DXY", unit: "", change: "pct", digits: 2 },
  { id: "FED", label: "Lãi suất Fed", sub: "Fed funds", unit: "%", change: "pp", digits: 2 },
  { id: "OIL", label: "Dầu Brent", sub: "USD/thùng", unit: "", change: "pct", digits: 1 },
] as const;

export interface PulseTile {
  id: string; label: string; sub: string; period: string; value: number; unit: string; digits: number;
  delta: number | null; deltaUnit: "pp" | "%"; stale: boolean; points: MacroSeriesPoint[];
}

const monthsBetween = (from: string, to: string) => {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
};

/** Số liệu tháng cũ hơn 3 tháng so với thời điểm xem -> gắn nhãn "cũ" (không giấu, không coi là hiện hành). */
export const STALE_AFTER_MONTHS = 3;

export function buildPulseTiles(res: MacroSeriesResponse | null | undefined): PulseTile[] {
  if (!res) return [];
  const out: PulseTile[] = [];
  for (const t of PULSE_TILES) {
    const row = res.series.find((s) => s.id === t.id);
    const pts = row?.points ?? [];
    const last = pts[pts.length - 1];
    if (!last) continue;
    const prev = pts[pts.length - 2];
    const delta = !prev ? null : t.change === "pp" ? last.value - prev.value : prev.value > 0 ? (last.value / prev.value - 1) * 100 : null;
    out.push({
      id: t.id, label: t.label, sub: t.sub, period: last.period, value: last.value, unit: t.unit, digits: t.digits, delta,
      deltaUnit: t.change === "pp" ? "pp" : "%", stale: monthsBetween(last.period, res.asOf.slice(0, 7)) > STALE_AFTER_MONTHS, points: pts,
    });
  }
  return out;
}

/** Độ phủ dữ liệu: các biến vĩ mô có / chưa có số liệu thật — nói rõ phần còn thiếu. */
export function factorCoverage(res: MacroSeriesResponse | null | undefined) {
  const factors = res?.series.filter((s) => s.role === "factor") ?? [];
  return { total: factors.length, have: factors.filter((s) => s.n > 0).length, missing: factors.filter((s) => s.n === 0).map((s) => s.nameVi) };
}

/** Sparkline: chuỗi toạ độ SVG trong khung w×h (đệm 2px); dưới 2 điểm -> "". */
export function sparkPath(points: MacroSeriesPoint[], w = 120, h = 32): string {
  if (points.length < 2) return "";
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  return points.map((p, i) => `${((i / (points.length - 1)) * w).toFixed(1)},${(h - 2 - ((p.value - lo) / span) * (h - 4)).toFixed(1)}`).join(" ");
}

/** Lịch sắp tới: sớm nhất trước, bỏ sự kiện đã qua. */
export function upcomingEvents(res: MacroCalendarResponse | null | undefined, limit = 12): MacroCalendarItem[] {
  return (res?.events ?? []).filter((e) => e.daysRemaining >= 0).sort((a, b) => a.daysRemaining - b.daysRemaining).slice(0, limit);
}

const VI = new Intl.NumberFormat("vi-VN");
export const fmtValue = (v: number, digits: number) => VI.format(Number(v.toFixed(digits)));
export const fmtPeriod = (p: string) => `${p.slice(5, 7)}/${p.slice(0, 4)}`;
export const fmtDelta = (d: number | null, unit: string) => d === null ? "—" : `${d > 0 ? "+" : d < 0 ? "−" : ""}${VI.format(Number(Math.abs(d).toFixed(2)))}${unit === "pp" ? " đ%" : "%"}`;

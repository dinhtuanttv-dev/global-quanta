// PR-D (MARKET_CENTER_UPGRADE_PLAN.md §4.1): đường đi VN-Index trong phiên (nến 5 phút gộp từ nến 1 phút của Gateway)
// chồng lên dải cả phiên của kịch bản khớp, đường đóng cửa phiên trước và mốc vô hiệu.
// Trong phiên: phiên hôm nay. Ngoài phiên: phiên gần nhất đã chấm trong sổ tiến (xem lại dải có giữ không).
// Chỉ mô tả: % thời gian trong dải, lần đầu ra khỏi dải — không phải tín hiệu.
import { useEffect, useRef } from "react";
import useSWR from "swr";
import { fetchMarketJson } from "../../../services/marketDataClient";

interface Bar { date: string; open: number; high: number; low: number; close: number }
export interface Bucket { t: number; label: string; open: number; high: number; low: number; close: number }

/** Phút giao dịch tính từ 09:00, bỏ nghỉ trưa 11:30–13:00 (HOSE). Trả null nếu ngoài giờ. */
export function tradingMinute(hhmm: string): number | null {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const x = h * 60 + m;
  if (x < 9 * 60 || x > 15 * 60) return null;
  if (x <= 11 * 60 + 30) return x - 9 * 60;
  if (x < 13 * 60) return 150;
  return 150 + (x - 13 * 60);
}
export const TRADING_MINUTES = 270;

/** Gộp nến 1 phút thành nến 5 phút theo thời gian giao dịch. Bỏ nến không hợp lệ (giá ≤ 0). */
export function toBuckets(bars: Bar[], size = 5): Bucket[] {
  const out = new Map<number, Bucket>();
  for (const b of bars) {
    if (!(b.close > 0 && b.high > 0 && b.low > 0)) continue;
    const hhmm = String(b.date).slice(11, 16), t = tradingMinute(hhmm);
    if (t == null) continue;
    const k = Math.floor(t / size) * size, cur = out.get(k);
    if (!cur) out.set(k, { t: k, label: hhmm, open: b.open > 0 ? b.open : b.close, high: b.high, low: b.low, close: b.close });
    else { cur.high = Math.max(cur.high, b.high); cur.low = Math.min(cur.low, b.low); cur.close = b.close; }
  }
  return [...out.values()].sort((a, b) => a.t - b.t);
}

/** Mô tả: tỷ lệ nến 5 phút có giá đóng trong dải, lần đầu đóng ngoài dải. */
export function bandStats(bk: Bucket[], lo: number, hi: number) {
  if (!bk.length) return null;
  const inside = bk.filter((b) => b.close >= lo && b.close <= hi).length;
  const firstOut = bk.find((b) => b.close < lo || b.close > hi) ?? null;
  return { pctInside: (inside / bk.length) * 100, firstOut: firstOut ? { label: firstOut.label, side: firstOut.close < lo ? "dưới" : "trên" } : null, n: bk.length };
}

const nf = (v: number | null | undefined, d = 0) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }));
const ddmm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const hm = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" }) : null);

/** Nến 1 phút VN-Index của một ngày (endpoint sẵn có /api/market/ohlcv). Trong phiên làm mới 60 giây. */
export function useVnIntraday(date: string | null, live: boolean) {
  const { data, error, isLoading } = useSWR<{ bars: Bar[] }>(date ? ["vn-1m", date] : null, () => fetchMarketJson<{ bars: Bar[] }>("/api/market/ohlcv", { ticker: "VNINDEX", resolution: "1m", to: date }), {
    refreshInterval: live ? 60_000 : 0, revalidateOnFocus: false, dedupingInterval: 30_000, shouldRetryOnError: false,
  });
  const bars = (data?.bars ?? []).filter((b) => String(b.date).slice(0, 10) === date);
  return { bars, error: error as Error | undefined, isLoading };
}

export default function IntradayPath({ date, live, band, prevClose, color, title, invalidatedAt, note }: {
  date: string; live: boolean; band: { lo: number; hi: number }; prevClose: number | null; color: string; title: string; invalidatedAt?: string | null; note?: string;
}) {
  const { bars, error, isLoading } = useVnIntraday(date, live);
  const bk = toBuckets(bars);
  // Màn hẹp: biểu đồ cuộn ngang; đưa khung nhìn về cuối phiên (giá mới nhất) thay vì đầu phiên.
  const scroller = useRef<HTMLDivElement>(null);
  const lastT = bk.length ? bk[bk.length - 1].t : -1;
  useEffect(() => { const el = scroller.current; if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = el.scrollWidth; }, [lastT]);
  if (error && !bk.length) return <p className="text-[11px] text-slate-500" data-testid="mc-path-empty">Chưa tải được giá trong phiên {ddmm(date)}: {error.message}</p>;
  if (!bk.length) return <p className="text-[11px] text-slate-500" data-testid="mc-path-empty">{isLoading ? "Đang tải giá trong phiên…" : `Chưa có giá trong phiên ${ddmm(date)}.`}</p>;
  const st = bandStats(bk, band.lo, band.hi)!;
  const vals = [band.lo, band.hi, ...(prevClose ? [prevClose] : []), ...bk.flatMap((b) => [b.high, b.low])];
  const lo = Math.min(...vals), hi = Math.max(...vals), pad = Math.max(2, (hi - lo) * 0.08);
  const W = 640, H = 190, L = 44, R = 12, T = 12, B = 26;
  const X = (t: number) => L + (t / TRADING_MINUTES) * (W - L - R), Y = (v: number) => T + (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * (H - T - B);
  const line = bk.map((b, i) => `${i ? "L" : "M"}${X(b.t + 2.5).toFixed(1)},${Y(b.close).toFixed(1)}`).join(" ");
  const last = bk[bk.length - 1], first = bk[0];
  const inv = invalidatedAt ? hm(invalidatedAt) : null, invT = inv ? tradingMinute(inv) : null;
  const ticks: [string, number][] = [["09:00", 0], ["10:00", 60], ["11:00", 120], ["13:00", 150], ["14:00", 210], ["15:00", 270]];
  const yTicks = Array.from({ length: 4 }, (_, i) => lo - pad + ((hi - lo + 2 * pad) * (i + 0.5)) / 4);
  const summary = `${title}: từ ${first.label} đến ${last.label}, VN-Index từ ${nf(first.open, 1)} đến ${nf(last.close, 1)}; ${nf(st.pctInside, 0)}% số nến 5 phút đóng trong dải ${nf(band.lo)}–${nf(band.hi)}${st.firstOut ? `, lần đầu ra ${st.firstOut.side} dải lúc ${st.firstOut.label}` : ", chưa lần nào ra khỏi dải"}.`;
  return (
    <div className="min-w-0" data-testid="mc-path">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[12px] font-semibold text-slate-200">{title}</h3>
        <span className="text-[11px] text-slate-400" data-testid="mc-path-stats">
          <b className="font-mono text-slate-100">{nf(st.pctInside, 0)}%</b> thời gian trong dải{st.firstOut ? <> · lần đầu ra {st.firstOut.side} dải lúc <b className="font-mono text-amber-300">{st.firstOut.label}</b></> : " · chưa ra khỏi dải"}{live ? ` · cập nhật ${last.label}` : ""}
        </span>
      </div>
      <div ref={scroller} className="overflow-x-auto" data-testid="mc-path-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 block w-full" style={{ minWidth: 520, maxWidth: 820 }} role="img" aria-label={summary}>
          <rect x={L} y={Y(band.hi)} width={W - L - R} height={Math.max(1, Y(band.lo) - Y(band.hi))} fill={color} opacity={0.12} />
          <line x1={L} x2={W - R} y1={Y(band.hi)} y2={Y(band.hi)} stroke={color} strokeOpacity={0.5} strokeDasharray="4 3" />
          <line x1={L} x2={W - R} y1={Y(band.lo)} y2={Y(band.lo)} stroke={color} strokeOpacity={0.5} strokeDasharray="4 3" />
          <text x={L + 4} y={Y(band.lo) - 4} fontSize={10} fill="#94a3b8">Dải cả phiên {nf(band.lo)}–{nf(band.hi)}</text>
          {prevClose != null && <><line x1={L} x2={W - R} y1={Y(prevClose)} y2={Y(prevClose)} stroke="#e2e8f0" strokeOpacity={0.5} /><text x={L + 3} y={Y(prevClose) - 3} fontSize={10} fill="#cbd5e1">Đóng phiên trước {nf(prevClose, 1)}</text></>}
          <rect x={X(150) - 0.5} y={T} width={1} height={H - T - B} fill="rgba(148,163,184,0.25)" />
          {ticks.map(([l, t]) => <text key={l} x={X(t)} y={H - 8} fontSize={10} fill="#64748b" textAnchor="middle">{l}</text>)}
          {yTicks.map((v) => <text key={v} x={L - 4} y={Y(v) + 3} fontSize={10} fill="#64748b" textAnchor="end">{nf(v)}</text>)}
          {bk.map((b) => <line key={b.t} x1={X(b.t + 2.5)} x2={X(b.t + 2.5)} y1={Y(b.high)} y2={Y(b.low)} stroke="rgba(226,232,240,0.25)" />)}
          <path d={line} fill="none" stroke="#f5b942" strokeWidth={1.8} strokeLinejoin="round" data-testid="mc-path-line" />
          {invT != null && <><line x1={X(invT)} x2={X(invT)} y1={T} y2={H - B} stroke="#fbbf24" strokeDasharray="2 3" /><text x={X(invT) + 3} y={T + 9} fontSize={10} fill="#fbbf24">⚑ vô hiệu {inv}</text></>}
          <circle cx={X(last.t + 2.5)} cy={Y(last.close)} r={4} fill="#f5b942" stroke="#070b14" strokeWidth={1.5} />
          <text x={X(last.t + 2.5) - 6} y={Y(last.close) - 7} fontSize={10} fill="#f5b942" textAnchor="end">{nf(last.close, 1)}</text>
        </svg>
      </div>
      <p className="text-[11px] text-slate-500">{note ?? "Nến 5 phút gộp từ nến 1 phút SSI qua Gateway; vạch dọc mờ là nghỉ trưa 11:30–13:00. Mô tả, không phải tín hiệu."}</p>
    </div>
  );
}

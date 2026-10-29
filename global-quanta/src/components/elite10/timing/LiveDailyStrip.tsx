// N3 + N2 (29/10/2026) — dải NẾN NGÀY thời gian thực của kỳ hiện tại, cùng trục phiên với chart 2D phía trên:
//   nến ngày (VND, nghìn đồng) từ phiên đầu cửa sổ tới HÔM NAY — nến hôm nay dựng từ luồng giá SSI ("đang hình thành"),
//   cột giá trị GD tô theo ESA ngày (đã trừ yếu tố thị trường), cờ tin tại phiên phản ứng (màu = cảm xúc, ◉ = phản ứng đáng chú ý),
//   VÒNG SÁNG quanh nến hôm nay khi có tin trong phiên: sáng nhấp nháy nếu khối lượng từ lúc ra tin bất thường — bấm để xem chi tiết.
import { useMemo } from "react";
import type { SmartNewsItem } from "../../../hooks/useSmartNews";
import type { EsaSince } from "../../../hooks/elite10/useEsaSnapshot";
import type { EventStudy } from "../../../lib/elite10/timingSim";
import { ESA_DAILY, esaDailyAt, marketValueMap, type DailyBar } from "../../../lib/elite10/timingSpace";
import type { LiveBar } from "../../../lib/elite10/liveDaily";
import type { CorporateMark } from "../../../hooks/elite10/useAdjustedDaily";
import { REACTION_VI, sentGlyph } from "../../news/SmartNewsBody";

const W = 720, M = { l: 44, r: 14, t: 16 }, PH = 118, VH = 34, GAP = 6, H = M.t + PH + GAP + VH + 16;
const k1 = (v: number) => (v / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const UP = "#22c55e", DOWN = "#f43f5e";

/** Phiên phản ứng của tin trên chuỗi nến (cùng quy tắc Gateway): trước 15:00 ngày giao dịch -> chính phiên; sau đó -> phiên kế. */
export function newsBarIndex(bars: { date: string }[], publishedAt: string | null): number {
  if (!publishedAt) return -1;
  const vn = new Date(Date.parse(publishedAt) + 7 * 3_600_000), day = vn.toISOString().slice(0, 10);
  const after = vn.getUTCHours() * 60 + vn.getUTCMinutes() >= 15 * 60;
  for (let i = 0; i < bars.length; i++) if (bars[i].date > day || (!after && bars[i].date === day)) return i;
  return -1;
}

export default function LiveDailyStrip({ es, bars, indexBars, corporateActions = [], lastOff, todayOff, news, since, sinceItem, sessionLive, onRing }: {
  es: EventStudy; bars: LiveBar[]; indexBars: DailyBar[]; corporateActions?: CorporateMark[]; lastOff: number; todayOff: number | null;
  news: SmartNewsItem[]; since: EsaSince | null; sinceItem: SmartNewsItem | null; sessionLive: boolean; onRing: () => void;
}) {
  const offs = es.offsets;
  const a = Math.min(offs[0], todayOff ?? offs[0]), b = Math.max(offs[offs.length - 1], todayOff ?? offs[offs.length - 1]);
  const x = (o: number) => M.l + ((o - a) / (b - a || 1)) * (W - M.l - M.r);
  const cw = Math.max(1.5, ((W - M.l - M.r) / (b - a || 1)) * 0.68);
  const last = bars.length - 1;
  const mkt = useMemo(() => marketValueMap(bars, indexBars), [bars, indexBars]);
  const cells = useMemo(() => {
    const out: { k: number; bar: LiveBar; level: string; z: number | null; rv: number | null }[] = [];
    for (let k = Math.max(offs[0], lastOff - last); k <= lastOff; k++) {
      const i = last - (lastOff - k), bar = bars[i];
      if (!bar) continue;
      const e = esaDailyAt(bars, i, ESA_DAILY, mkt);
      out.push({ k, bar, level: e?.level ?? "none", z: e?.z ?? null, rv: e?.rv ?? null });
    }
    return out;
  }, [bars, lastOff, last, offs, mkt]);
  const flags = useMemo(() => news.flatMap((n) => {
    const i = newsBarIndex(bars, n.publishedAt);
    if (i < 0) return [];
    const k = lastOff - (last - i);
    return k >= offs[0] && k <= lastOff ? [{ k, n }] : [];
  }), [news, bars, lastOff, last, offs]);
  if (!cells.length) return null;
  const hi = Math.max(...cells.map((c) => c.bar.high ?? c.bar.close ?? 0)), lo = Math.min(...cells.map((c) => c.bar.low ?? c.bar.close ?? Infinity));
  const pad = (hi - lo) * 0.08 || hi * 0.01;
  const y = (p: number) => M.t + (1 - (p - (lo - pad)) / (hi + pad - (lo - pad) || 1)) * PH;
  const vmax = Math.max(...cells.map((c) => c.bar.value ?? 0), 1), vy0 = M.t + PH + GAP + VH;
  const today = cells[cells.length - 1];
  const ringOn = since?.status === "research_only";
  const alert = since?.alert ?? null;
  const ringColor = alert?.severity === "high_anomaly" ? "#f43f5e" : alert ? "#f97316" : "#94a3b8";

  return (
    <figure className="m-0 mt-2" data-testid="live-daily-strip">
      <div className="mb-0.5 flex flex-wrap items-baseline justify-between gap-2 text-[10px]">
        <b className="text-slate-300">🕯 Nến ngày kỳ hiện tại (nghìn đồng, giá điều chỉnh cổ tức / thưởng CP) · cùng trục phiên{sessionLive && today.bar.partial ? <span className="ml-1 text-emerald-300">· ● TRỰC TIẾP</span> : null}</b>
        <span className="text-slate-500">cột = giá trị GD, tô theo ESA ngày{mkt ? " (đã trừ yếu tố thị trường)" : ""} · cờ = tin</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Nến ngày ${es.ticker} từ phiên ${cells[0].k} tới hôm nay (phiên ${lastOff}), ${flags.length} tin`}>
        {[lo, (lo + hi) / 2, hi].map((p) => <g key={p}><line x1={M.l} x2={W - M.r} y1={y(p)} y2={y(p)} stroke="currentColor" className="text-white/5" /><text x={M.l - 5} y={y(p) + 3} textAnchor="end" fontSize={8.5} className="fill-slate-500">{k1(p)}</text></g>)}
        {cells.map((c) => {
          const o = c.bar.open ?? c.bar.close!, cl = c.bar.close!, up = cl >= o, col = up ? UP : DOWN;
          const top = y(Math.max(o, cl)), h = Math.max(1, Math.abs(y(o) - y(cl)));
          const vh = ((c.bar.value ?? 0) / vmax) * VH;
          const vcol = c.level === "high" ? "#f43f5e" : c.level === "unusual" ? "#f97316" : "rgba(148,163,184,.35)";
          return (
            <g key={c.k} data-testid={c.bar.partial ? "live-candle-today" : "live-candle"}>
              <title>{`${c.bar.date}${c.bar.partial ? " (đang hình thành)" : ""} · phiên ${c.k}: mở ${k1(o)} · cao ${k1(c.bar.high ?? cl)} · thấp ${k1(c.bar.low ?? cl)} · đóng ${k1(cl)} · GT ${((c.bar.value ?? 0) / 1e9).toFixed(1)} tỷ${c.z != null ? ` · ESA ngày z ${c.z.toFixed(1)} (×${c.rv?.toFixed(2)})` : ""}`}</title>
              <line x1={x(c.k)} x2={x(c.k)} y1={y(c.bar.high ?? cl)} y2={y(c.bar.low ?? cl)} stroke={col} strokeWidth={1} />
              <rect x={x(c.k) - cw / 2} y={top} width={cw} height={h} fill={up ? col : "none"} stroke={col} strokeWidth={1.1} strokeDasharray={c.bar.partial ? "2 1.5" : undefined} />
              <rect x={x(c.k) - cw / 2} y={vy0 - vh} width={cw} height={Math.max(0.5, vh)} fill={vcol} />
            </g>
          );
        })}
        {corporateActions.flatMap((ca) => {
          const c = cells.find((cc) => cc.bar.date === ca.date);
          return c ? [<g key={ca.date} data-testid="live-corp-action"><title>{`${ca.date}: ${ca.label} (hệ số điều chỉnh ${ca.factor})`}</title>
            <line x1={x(c.k)} x2={x(c.k)} y1={M.t} y2={M.t + PH} stroke="#a78bfa" strokeDasharray="2 3" strokeWidth={1} />
            <text x={x(c.k) + 3} y={M.t + 8} fontSize={8} className="fill-violet-300">{ca.label}</text></g>] : [];
        })}
        {flags.map(({ k, n }, i) => {
          const c = cells.find((cc) => cc.k === k);
          const fy = c ? y(c.bar.high ?? c.bar.close!) - 6 - (i % 2) * 7 : M.t;
          const s = sentGlyph(n.sentiment), ab = n.reaction?.abnormal;
          const notable = ab && ["repricing", "absorption", "price_only"].includes(ab.classification);
          return (
            <a key={n.id} href={n.url ?? undefined} target="_blank" rel="noopener noreferrer" data-testid="live-news-flag">
              <title>{`${n.title} · ${n.sourceLabel}${ab ? ` · ESA tin: ${REACTION_VI[ab.classification].text}${ab.zVolume != null ? ` (z KL ${ab.zVolume.toFixed(1)})` : ""}` : ""}`}</title>
              <line x1={x(k)} x2={x(k)} y1={fy} y2={fy + 5} stroke={s.c} strokeWidth={1} />
              <path d={`M${x(k)},${fy - 6}L${x(k) + 6},${fy - 3}L${x(k)},${fy}Z`} fill={s.c} stroke={notable ? "#fde68a" : "none"} strokeWidth={notable ? 1 : 0} />
            </a>
          );
        })}
        {ringOn && (
          <g role="button" tabIndex={0} aria-label={`ESA từ lúc ra tin ${since?.sinceMinute ?? ""}: ${alert ? "khối lượng đột biến" : "chưa bất thường"} — bấm để xem chi tiết`}
            onClick={onRing} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRing(); } }} className="cursor-pointer focus:outline-none" data-testid="esa-news-ring">
            <circle cx={x(today.k)} cy={(y(today.bar.high ?? today.bar.close!) + y(today.bar.low ?? today.bar.close!)) / 2} r={13} fill="transparent" stroke={ringColor} strokeWidth={alert ? 2.2 : 1.2}
              style={alert ? { filter: `drop-shadow(0 0 5px ${ringColor})` } : undefined} className={alert ? "esa-ring-glow" : undefined} />
            {alert && <circle cx={x(today.k)} cy={(y(today.bar.high ?? today.bar.close!) + y(today.bar.low ?? today.bar.close!)) / 2} r={18} fill="none" stroke={ringColor} strokeOpacity={0.45} className="esa-ring-pulse" />}
          </g>
        )}
        <text x={x(today.k)} y={H - 3} textAnchor="middle" fontSize={8.5} className="fill-amber-300">{today.bar.partial && sessionLive ? "HÔM NAY · đang hình thành" : `phiên ${today.k}`}</text>
        <text x={M.l} y={H - 3} fontSize={8.5} className="fill-slate-500">{cells[0].k}</text>
      </svg>
      {sinceItem && !ringOn && since && <p className="text-[9.5px] text-slate-500">ESA từ lúc ra tin: {since.reason ?? since.status}</p>}
      <style>{`.esa-ring-glow{animation:esaGlow 1.4s ease-in-out infinite}.esa-ring-pulse{animation:esaPulse 1.4s ease-out infinite;transform-box:fill-box;transform-origin:center}
@keyframes esaGlow{50%{stroke-opacity:.45}}@keyframes esaPulse{from{transform:scale(.7);opacity:.9}to{transform:scale(1.35);opacity:0}}
@media (prefers-reduced-motion: reduce){.esa-ring-glow,.esa-ring-pulse{animation:none}}`}</style>
    </figure>
  );
}

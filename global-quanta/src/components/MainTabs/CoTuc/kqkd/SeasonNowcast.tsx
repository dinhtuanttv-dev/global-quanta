// K4 (06/11/2026) — mùa vụ KQKD: tỷ trọng từng quý trong năm (trung vị, dải P10–P90), QoQ khử mùa vụ của quý mới nhất,
// ước tính cả năm từ lũy kế (dải theo lịch sử) và lợi nhuận bất ngờ chuẩn hoá (SUE / SUR).
import { bn, fin, num, pct, pctPlain } from "../../../../lib/kqkd/format";
import type { KqkdDetail, Season } from "../../../../lib/kqkd/types";

function Shares({ s, title }: { s: Season; title: string }) {
  if (!s.available || !s.share) return <p className="text-[11px] text-slate-500">{title}: cần ≥ {s.need ?? 5} năm đủ 4 quý dương (hiện có {s.years}).</p>;
  return (
    <figure className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <figcaption className="mb-2 text-[11px] font-bold text-slate-300">{title} <span className="font-normal text-slate-500">· trung vị {s.years} năm ({s.from}–{s.to})</span></figcaption>
      <div className="grid grid-cols-4 gap-2">
        {s.share.map((v, i) => {
          const [lo, hi] = s.shareBand?.[i] ?? [null, null];
          return (
            <div key={i} className="text-center">
              <div className="relative mx-auto h-24 w-8 rounded-sm bg-white/[0.04]" title={`Q${i + 1}: trung vị ${pctPlain(v)} (P10–P90 ${pctPlain(lo)}–${pctPlain(hi)})`}>
                {fin(lo) && fin(hi) && <span className="absolute left-0 w-full rounded-sm bg-[#E8B84B]/20" style={{ bottom: `${Math.min(100, (lo / 0.5) * 100)}%`, height: `${Math.max(0, Math.min(100, (hi / 0.5) * 100) - Math.min(100, (lo / 0.5) * 100))}%` }} />}
                {fin(v) && <span className="absolute left-1 right-1 rounded-sm bg-[#E8B84B]" style={{ bottom: 0, height: `${Math.min(100, (v / 0.5) * 100)}%` }} />}
              </div>
              <p className="mt-1 text-[11px] font-bold text-slate-300">Q{i + 1}</p>
              <p className="font-mono text-[11px] tabular-nums text-slate-100">{pctPlain(v)}</p>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

export default function SeasonNowcast({ d }: { d: KqkdDetail }) {
  const { top, npatParent } = d.seasonality;
  const nc = npatParent.nowcast;
  return (
    <div className="space-y-3" data-testid="kq-season">
      <div className="grid gap-3 md:grid-cols-2">
        <Shares s={top} title="Tỷ trọng doanh thu từng quý" />
        <Shares s={npatParent} title="Tỷ trọng LNST mẹ từng quý" />
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {[["Doanh thu", top], ["LNST mẹ", npatParent]].map(([label, s]) => {
          const x = (s as Season).qoq;
          return (
            <div key={label as string} className="rounded-lg border border-white/10 bg-white/[0.02] p-3" data-testid="kq-season-qoq">
              <p className="text-[10px] font-bold uppercase text-slate-500">{label as string} QoQ khử mùa vụ · {d.latest.quarter}</p>
              {x ? <>
                <p className={`font-mono text-[20px] font-bold tabular-nums ${x.deviation >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{pct(x.deviation, 1)}</p>
                <p className="text-[10.5px] text-slate-400">thực tế {pct(x.actual, 1)} so quý trước · mùa vụ thường {pct(x.expected, 1)} ({x.pairs} năm)</p>
              </> : <p className="text-[11px] text-slate-500">Chưa đủ lịch sử hoặc quý âm.</p>}
            </div>
          );
        })}
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3" data-testid="kq-surprise">
          <p className="text-[10px] font-bold uppercase text-slate-500">Bất ngờ chuẩn hoá · {d.latest.quarter}</p>
          <div className="mt-1 grid grid-cols-3 gap-1 text-center">
            {([["SUE LNST", d.surprise.sueNpat], ["SUE cốt lõi", d.surprise.sueCore], ["SUR doanh thu", d.surprise.sur]] as [string, number | null][]).map(([t, v]) => (
              <div key={t}><p className={`font-mono text-[18px] font-bold tabular-nums ${!fin(v) ? "text-slate-500" : v >= 2 ? "text-emerald-300" : v <= -2 ? "text-rose-300" : "text-slate-100"}`}>{num(v)}</p><p className="text-[10px] text-slate-400">{t}</p></div>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-slate-500">(quý − cùng kỳ) ÷ độ lệch chuẩn 8 quý trước; |SUE| ≥ 2 là bất ngờ lớn.</p>
        </div>
      </div>
      {nc ? (
        <div className="rounded-lg border border-[#E8B84B]/25 bg-[#E8B84B]/[0.05] p-3" data-testid="kq-nowcast">
          <p className="text-[11px] font-bold text-[#F5CE72]">Ước tính LNST mẹ cả năm {d.latest.quarter.slice(3)} từ lũy kế {nc.through * 3} tháng</p>
          <div className="mt-2 flex flex-wrap items-end gap-6">
            <div><p className="text-[10px] uppercase text-slate-500">Ước tính</p><p className="font-mono text-[20px] font-bold tabular-nums text-slate-100">{bn(nc.est)}</p></div>
            <div><p className="text-[10px] uppercase text-slate-500">Dải P10–P90</p><p className="font-mono text-[14px] tabular-nums text-slate-200">{bn(nc.lo, false)} – {bn(nc.hi)}</p></div>
            <div><p className="text-[10px] uppercase text-slate-500">Năm trước</p><p className="font-mono text-[14px] tabular-nums text-slate-200">{bn(nc.lastFy)}</p></div>
            <div><p className="text-[10px] uppercase text-slate-500">So năm trước</p><p className={`font-mono text-[20px] font-bold tabular-nums ${fin(nc.growth) && nc.growth >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{pct(nc.growth, 1)}</p></div>
          </div>
          {fin(nc.lastFy) && nc.hi > 0 && (() => {
            const max = Math.max(nc.hi, nc.lastFy as number) * 1.05, w = (v: number) => `${(v / max) * 100}%`;
            return (
              <div className="relative mt-3 h-5 rounded-sm bg-white/[0.04]" role="img" aria-label={`Dải ước tính ${bn(nc.lo)} đến ${bn(nc.hi)}, năm trước ${bn(nc.lastFy)}`}>
                <span className="absolute top-0 h-full rounded-sm bg-[#E8B84B]/30" style={{ left: w(nc.lo), width: `calc(${w(nc.hi)} - ${w(nc.lo)})` }} />
                <span className="absolute top-0 h-full w-[3px] bg-[#F5CE72]" style={{ left: w(nc.est) }} />
                <span className="absolute -top-1 h-7 w-[2px] bg-slate-300" style={{ left: w(nc.lastFy as number) }} title="năm trước" />
              </div>
            );
          })()}
          <p className="mt-2 text-[10px] text-slate-400">{nc.method}. Đây là phép ngoại suy mùa vụ, không phải dự báo của công ty hay đồng thuận CTCK; năm có biến cố bất thường sẽ lệch xa.</p>
        </div>
      ) : <p className="text-[11px] text-slate-500">Không ước tính cả năm (đã đủ 4 quý, hoặc chưa đủ ≥ 5 năm lịch sử dương).</p>}
      <p className="text-[10px] text-slate-500">MÔ TẢ — mùa vụ đo trên tối đa 10 năm đủ 4 quý dương gần nhất (không gồm năm hiện tại).</p>
    </div>
  );
}

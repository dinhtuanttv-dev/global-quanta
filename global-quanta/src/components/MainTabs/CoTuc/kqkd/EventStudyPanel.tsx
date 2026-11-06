// LC3 (06/11/2026) — phản ứng giá quanh ngày công bố KQKD (nghiên cứu sự kiện, mô hình thị trường + khối lượng bất thường Campbell–Wasley).
//   EventStudyPanel: đường CAR trung bình −10…+60 phiên theo ngũ phân vị SUE LN cốt lõi + bảng cửa sổ có khoảng tin cậy + tỷ lệ rò rỉ.
//   TickerReactions: ≤ 8 lần công bố gần nhất của một mã (ngăn chi tiết). Nhãn MÔ TẢ.
import { useState } from "react";
import { dmy, fin, num, pct, pctPlain } from "../../../../lib/kqkd/format";
import type { EsAggregate, EsCi, EsEvent } from "../../../../lib/kqkd/types";

/** Bảng màu phân kỳ cho 5 nhóm thứ bậc: hồng (bất ngờ xấu) -> xám (giữa) -> xanh lá (bất ngờ tốt). */
export const QUINT_COLOR = ["#F43F5E", "#FDA4AF", "#94A3B8", "#6EE7B7", "#10B981"];
const ciText = (c: EsCi) => (fin(c.mean) ? `${pct(c.mean, 2)}${fin(c.lo) && fin(c.hi) ? ` [${pct(c.lo, 1)}; ${pct(c.hi, 1)}]` : ""}` : "—");
const sig = (c: EsCi) => fin(c.lo) && fin(c.hi) && (c.lo > 0 || c.hi < 0);

function PathChart({ series, from, label }: { series: { name: string; color: string; path: (number | null)[]; dash?: string; w?: number }[]; from: number; label: string }) {
  const [hk, setHk] = useState<number | null>(null);
  const len = Math.max(0, ...series.map((s) => s.path.length));
  if (len < 2) return null;
  const vals = series.flatMap((s) => s.path).filter(fin) as number[];
  const lo = Math.min(-0.01, ...vals), hi = Math.max(0.01, ...vals);
  const Wd = 1000, Hd = 240, L = 54, R = 12, T = 12, B = 26;
  const x = (k: number) => L + (k / (len - 1)) * (Wd - L - R), y = (v: number) => T + ((hi - v) / (hi - lo)) * (Hd - T - B);
  const ticks = [-10, 0, 10, 20, 30, 40, 50, 60].filter((d) => d - from < len);
  const step = (hi - lo) / 4;
  return (
    <figure className="space-y-1">
      <figcaption className="flex flex-wrap items-center gap-3 text-[11px] text-slate-300">
        {series.map((s) => <span key={s.name} className="flex items-center gap-1"><i className="inline-block h-[3px] w-5 rounded" style={{ background: s.color }} />{s.name}</span>)}
        {hk != null && <span className="ml-auto font-mono text-slate-200">phiên {hk + from >= 0 ? "+" : ""}{hk + from}: {series.map((s) => `${s.name} ${pct(s.path[hk] ?? null, 2)}`).join(" · ")}</span>}
      </figcaption>
      <svg viewBox={`0 0 ${Wd} ${Hd}`} className="w-full" role="img" aria-label={label}
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const k = Math.round((((e.clientX - r.left) / r.width) * Wd - L) / ((Wd - L - R) / (len - 1))); setHk(k >= 0 && k < len ? k : null); }} onPointerLeave={() => setHk(null)}>
        {[0, 1, 2, 3, 4].map((i) => { const v = lo + i * step; return <g key={i}><line x1={L} x2={Wd - R} y1={y(v)} y2={y(v)} stroke="rgba(148,163,184,0.12)" /><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="rgba(148,163,184,0.85)">{(v * 100).toFixed(1)}%</text></g>; })}
        <line x1={L} x2={Wd - R} y1={y(0)} y2={y(0)} stroke="rgba(148,163,184,0.45)" />
        <line x1={x(-from)} x2={x(-from)} y1={T} y2={Hd - B} stroke="rgba(245,206,114,0.6)" strokeDasharray="3 3" />
        <text x={x(-from) + 4} y={T + 10} fontSize={10.5} fill="rgba(245,206,114,0.85)">công bố</text>
        {ticks.map((d) => <text key={d} x={x(d - from)} y={Hd - 8} textAnchor="middle" fontSize={11} fill="rgba(148,163,184,0.85)">{d > 0 ? `+${d}` : d}</text>)}
        {series.map((s) => <path key={s.name} d={s.path.map((v, k) => (fin(v) ? `${k ? "L" : "M"}${x(k).toFixed(1)},${y(v).toFixed(1)}` : "")).join("")} fill="none" stroke={s.color} strokeWidth={s.w ?? 2} strokeDasharray={s.dash} strokeLinejoin="round" />)}
        {hk != null && <line x1={x(hk)} x2={x(hk)} y1={T} y2={Hd - B} stroke="rgba(226,232,240,0.35)" />}
      </svg>
    </figure>
  );
}

export default function EventStudyPanel({ a }: { a: EsAggregate }) {
  const q = [1, 2, 3, 4, 5].map((k) => a.quintiles[String(k)]).filter(Boolean);
  const w = a.windows;
  const series = q.map((g, i) => ({ name: `SUE nhóm ${i + 1}${i === 0 ? " (xấu nhất)" : i === 4 ? " (tốt nhất)" : ""}`, color: QUINT_COLOR[i], path: g.path ?? [], w: i === 0 || i === 4 ? 2.5 : 1.5 }));
  return (
    <section className="space-y-3 rounded-lg border border-white/10 bg-white/[0.02] p-3" data-testid="lc-es">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[12px] font-bold text-slate-100">📈 Phản ứng giá quanh ngày công bố KQKD</p>
          <p className="text-[10.5px] text-slate-400">{a.precise.toLocaleString("vi-VN")} lần công bố có ngày chính xác (tin BCTC chính thức) trên tổng {a.events.toLocaleString("vi-VN")} · {a.quarters.length} quý ({a.quarters[0]?.slice(0, 7)} → {a.quarters[a.quarters.length - 1]?.slice(0, 7)}) · lợi suất vượt mô hình thị trường (VN-Index)</p>
        </div>
        <span className="rounded border border-slate-500/40 px-2 py-0.5 text-[10px] font-bold text-slate-300" title={a.method}>{a.version} · {a.label}</span>
      </div>
      <PathChart series={series} from={a.pathFrom} label={`Lợi suất vượt tích luỹ trung bình từ phiên ${a.pathFrom} tới +60 theo 5 nhóm SUE; chênh nhóm 5 − nhóm 1 tại phiên 0…+2: ${pct(a.spread.ann, 2)}`} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[11px]" data-testid="lc-es-table">
          <thead><tr className="text-right text-[10px] uppercase text-slate-500"><th className="px-1 py-1 text-left">Nhóm SUE LN cốt lõi</th><th className="px-1 py-1">Số lần</th><th className="px-1 py-1" title="Giá chạy trước tin">Trước tin [{w.pre[0]}; {w.pre[1]}]</th><th className="px-1 py-1">Phản ứng [{w.ann[0]}; +{w.ann[1]}]</th><th className="px-1 py-1" title="Trôi sau tin (PEAD)">Sau tin [+{w.post[0]}; +{w.post[1]}]</th><th className="px-1 py-1" title={`Tỷ lệ lần công bố có KL 10 phiên trước tin bất thường z ≥ 2 (ngẫu nhiên ≈ ${pctPlain(a.baseRate, 1)})`}>KL bất thường trước tin</th></tr></thead>
          <tbody>
            {q.map((g, i) => (
              <tr key={i} className="text-right font-mono tabular-nums">
                <td className="px-1 py-1 text-left font-sans text-slate-200"><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: QUINT_COLOR[i] }} />Nhóm {i + 1}{i === 0 ? " · bất ngờ xấu nhất" : i === 4 ? " · bất ngờ tốt nhất" : ""}</td>
                <td className="px-1 py-1 text-slate-400">{g.n}</td>
                {[g.pre, g.ann, g.post].map((c, j) => <td key={j} className={`px-1 py-1 ${sig(c) ? ((c.mean ?? 0) > 0 ? "text-emerald-300" : "text-rose-300") : "text-slate-300"}`} title={sig(c) ? "Khoảng tin cậy 95% không chứa 0" : "Khoảng tin cậy 95% chứa 0"}>{ciText(c)}</td>)}
                <td className="px-1 py-1 text-slate-300">{pctPlain(g.leakVolume, 0)}</td>
              </tr>
            ))}
            <tr className="border-t border-white/10 text-right font-mono font-bold tabular-nums"><td className="px-1 py-1 text-left font-sans text-[#F5CE72]">Chênh nhóm 5 − nhóm 1</td><td /><td className="px-1 py-1 text-slate-100">{pct(a.spread.pre, 2)}</td><td className="px-1 py-1 text-[#F5CE72]">{pct(a.spread.ann, 2)}</td><td className="px-1 py-1 text-slate-100">{pct(a.spread.post, 2)}</td><td /></tr>
          </tbody>
        </table>
      </div>
      <div className="grid gap-2 text-[10.5px] text-slate-400 md:grid-cols-3">
        <p><b className="text-slate-200">Thị trường phản ứng với bất ngờ:</b> phản ứng 3 phiên tăng theo nhóm SUE; chênh nhóm 5 − nhóm 1 là {pct(a.spread.ann, 2)}.</p>
        <p><b className="text-slate-200">Giá chạy trước tin:</b> 10 phiên trước công bố, chênh nhóm 5 − nhóm 1 đã là {pct(a.spread.pre, 2)}; {pctPlain(a.all.leakVolume, 0)} lần có KL bất thường (ngẫu nhiên ≈ {pctPlain(a.baseRate, 1)} — KL quanh mùa báo cáo vốn cao hơn, nên đọc là mức tương đối).</p>
        <p><b className="text-slate-200">Sau tin:</b> chênh nhóm 5 − nhóm 1 ở +3…+60 phiên là {pct(a.spread.post, 2)}; mọi nhóm âm so VN-Index một phần vì VN-Index nặng vốn hoá lớn. Ngày "dữ liệu" (trễ vài ngày) cho phản ứng ≈ {pct(a.dataDated.ann.mean, 2)} — vì vậy chỉ dùng ngày chính xác.</p>
      </div>
      <p className="text-[10px] text-slate-500">{a.method}</p>
    </section>
  );
}

export function TickerReactions({ events }: { events: EsEvent[] | null | undefined }) {
  if (!events?.length) return <p className="text-[11px] text-slate-500" data-testid="kq-react-none">Chưa đủ dữ liệu giá quanh các lần công bố (cần ≥ 60 phiên trước tin).</p>;
  const last = [...events].reverse();
  const series = last.slice(0, 4).map((e, i) => ({ name: `Q${Math.ceil(Number(e.fiscal.slice(5, 7)) / 3)}/${e.fiscal.slice(0, 4)}`, color: ["#F5CE72", "#38BDF8", "#A855F7", "#94A3B8"][i], path: e.path, w: i === 0 ? 2.5 : 1.5 }));
  return (
    <div className="space-y-2" data-testid="kq-react">
      <PathChart series={series} from={-10} label="Lợi suất vượt tích luỹ quanh 4 lần công bố gần nhất" />
      <table className="w-full text-[11px]">
        <thead><tr className="text-right text-[10px] uppercase text-slate-500"><th className="px-1 py-1 text-left">Quý</th><th className="px-1 py-1">Công bố</th><th className="px-1 py-1">SUE</th><th className="px-1 py-1">Trước tin</th><th className="px-1 py-1">Phản ứng 3 phiên</th><th className="px-1 py-1">Sau tin 60 phiên</th><th className="px-1 py-1">KL bất thường (z)</th></tr></thead>
        <tbody>
          {last.map((e) => (
            <tr key={e.fiscal} className="text-right font-mono tabular-nums" data-testid="kq-react-row">
              <td className="px-1 py-1 text-left text-slate-200">Q{Math.ceil(Number(e.fiscal.slice(5, 7)) / 3)}/{e.fiscal.slice(0, 4)}</td>
              <td className="px-1 py-1 text-slate-300">{dmy(e.date)}<span className="block text-[10px] text-slate-500">{e.source === "DISCLOSURE" ? "tin BCTC" : "ngày dữ liệu"}</span></td>
              <td className={`px-1 py-1 ${!fin(e.sue) ? "text-slate-500" : e.sue >= 2 ? "text-emerald-300" : e.sue <= -2 ? "text-rose-300" : "text-slate-200"}`}>{num(e.sue, 1)}</td>
              <td className="px-1 py-1 text-slate-300">{pct(e.carPre, 1)}</td>
              <td className={`px-1 py-1 ${fin(e.scarAnn) && Math.abs(e.scarAnn) >= 2 ? ((e.carAnn ?? 0) > 0 ? "text-emerald-300" : "text-rose-300") : "text-slate-200"}`}>{pct(e.carAnn, 1)}</td>
              <td className="px-1 py-1 text-slate-300">{e.sessionsAfter >= 63 ? pct(e.carPost, 1) : <span className="text-slate-500">chờ {63 - e.sessionsAfter} phiên</span>}</td>
              <td className={`px-1 py-1 ${fin(e.avAnn) && e.avAnn >= 2 ? "text-[#F5CE72]" : "text-slate-300"}`}>{num(e.avAnn, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-slate-500">Lợi suất vượt mô hình thị trường (VN-Index), ước lượng 130–11 phiên trước tin; z khối lượng Campbell–Wasley. "Ngày dữ liệu" có thể trễ vài ngày so ngày công bố thật — phản ứng có thể đã xảy ra trước phiên 0. MÔ TẢ.</p>
    </div>
  );
}

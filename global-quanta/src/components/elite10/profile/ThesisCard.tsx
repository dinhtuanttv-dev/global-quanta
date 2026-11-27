// HS360-v3 H4 (27/11/2026, docs/ho-so-360-v3/02 §3, 05 §2) — thẻ LUẬN ĐIỂM đầu góc Tổng quan: điểm mạnh có bằng chứng (chỉ lớp dấu
// ĐẠT / MỘT PHẦN và chiều ủng hộ), rủi ro (điều kiện bán sát ngưỡng, cảnh báo cơ bản, thanh khoản, tín hiệu ngược chiều), sự kiện kế
// tiếp, và biểu đồ giá 90 phiên (giá điều chỉnh) với pivot / vùng mua PZ / cắt lỗ của sổ. Câu chữ do Gateway dựng theo luật cố định —
// không AI, không lời khuyên. Vị thế Elite HL KHÔNG lặp ở đây (một nguồn: thanh đầu hồ sơ).
import { useMemo, useState, type PointerEvent, type ReactNode } from "react";
import type { ProfileSnapshot } from "../../../lib/elite10/profileTypes";
import { SealChip } from "./LayerMatrix";

const vnd = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { maximumFractionDigits: 0 }));
const dm = (d?: string | null) => (d ? d.split("-").reverse().join("/") : "—");
const RISK_VI: Record<string, string> = { EXIT_NEAR: "Quy tắc bán", FA_WARN: "Cơ bản", LIQUIDITY: "Thanh khoản", INVERTED_SIGNAL: "Tín hiệu ngược chiều" };

/** Biểu đồ giá 90 phiên: một chuỗi (không cần chú giải), đường tham chiếu có nhãn trực tiếp, rê chuột -> ngày + giá. */
export function PriceMini({ price }: { price: NonNullable<ProfileSnapshot["price"]> }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 360, H = 128, padL = 4, padR = 62, padT = 8, padB = 16;
  const bars = price.bars;
  const geo = useMemo(() => {
    const ys = bars.map((b) => b[1]);
    const refs = [price.pivot, price.stop, ...(price.zone ?? [])].filter((v): v is number => v != null && Number.isFinite(v));
    const lo = Math.min(...ys, ...refs), hi = Math.max(...ys, ...refs), span = hi - lo || 1;
    const x = (i: number) => padL + (i / Math.max(1, bars.length - 1)) * (W - padL - padR);
    const y = (v: number) => padT + (1 - (v - lo) / span) * (H - padT - padB);
    return { x, y, d: bars.map((b, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(b[1]).toFixed(1)}`).join(" ") };
  }, [bars, price.pivot, price.stop, price.zone]);
  if (bars.length < 2) return <p className="text-[11px] text-slate-500">Chưa đủ dữ liệu giá.</p>;
  const last = bars[bars.length - 1];
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - padL) / (W - padL - padR)) * (bars.length - 1));
    setHover(Math.max(0, Math.min(bars.length - 1, i)));
  };
  const refLine = (v: number | null, label: string, cls: string, testId: string): ReactNode => v == null ? null : (
    <g data-testid={testId}>
      <line x1={padL} x2={W - padR} y1={geo.y(v)} y2={geo.y(v)} className={cls} strokeWidth="1" strokeDasharray="4 3" />
      <text x={W - padR + 4} y={geo.y(v) + 3} fontSize="9" className="fill-slate-400">{label} {vnd(v)}</text>
    </g>
  );
  const hv = hover == null ? null : bars[hover];
  return (
    <figure className="m-0" data-testid="profile-price">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Giá điều chỉnh ${bars.length} phiên, đóng cửa gần nhất ${vnd(last[1])}`}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {price.zone && (
          <g data-testid="profile-price-zone">
            <rect x={padL} width={W - padL - padR} y={geo.y(price.zone[1])} height={Math.max(1, geo.y(price.zone[0]) - geo.y(price.zone[1]))} fill="var(--q-accent-soft, rgba(79,142,247,0.14))" />
            <text x={W - padR + 4} y={geo.y(price.zone[1]) + 9} fontSize="9" className="fill-slate-400">vùng mua ↓</text>
          </g>
        )}
        {refLine(price.pivot, "pivot", "stroke-slate-400", "profile-price-pivot")}
        {refLine(price.stop, "cắt lỗ", "stroke-rose-400", "profile-price-stop")}
        <path d={geo.d} fill="none" stroke="var(--q-accent, #4f8ef7)" strokeWidth="2" strokeLinejoin="round" />
        <circle cx={geo.x(bars.length - 1)} cy={geo.y(last[1])} r="3" fill="var(--q-accent-strong, #79a8ff)" />
        {hv && (
          <g pointerEvents="none">
            <line x1={geo.x(hover!)} x2={geo.x(hover!)} y1={padT} y2={H - padB} stroke="rgba(148,163,184,0.5)" strokeWidth="1" />
            <circle cx={geo.x(hover!)} cy={geo.y(hv[1])} r="4" fill="var(--q-accent-strong, #79a8ff)" stroke="#0E131F" strokeWidth="2" />
          </g>
        )}
        <text x={padL} y={H - 3} fontSize="9" className="fill-slate-500">{dm(bars[0][0])}</text>
        <text x={W - padR} y={H - 3} fontSize="9" textAnchor="end" className="fill-slate-500">{dm(last[0])}</text>
      </svg>
      <figcaption className="mt-0.5 text-[10.5px] text-slate-400" aria-live="polite">
        {hv ? <>Phiên {dm(hv[0])}: <b className="font-mono text-slate-100">{vnd(hv[1])}</b></> : <>Đóng cửa {dm(last[0])}: <b className="font-mono text-slate-100">{vnd(last[1])}</b> · giá điều chỉnh {bars.length} phiên</>}
      </figcaption>
    </figure>
  );
}

export default function ThesisCard({ snap, gap }: { snap: ProfileSnapshot; gap?: ReactNode }) {
  const t = snap.thesis;
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.02] p-3" data-testid="profile-thesis" aria-label="Luận điểm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[12px] font-semibold text-slate-100">Luận điểm {snap.ticker} <span className="font-normal text-slate-500">— phiên {dm(snap.session)}</span></h4>
        <span className="text-[10px] text-slate-500">mô tả theo quy tắc và sổ bằng chứng — không phải khuyến nghị</span>
      </div>
      <div className="mt-1.5 grid grid-cols-1 gap-3 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-2.5 text-[11px]">
          <div data-testid="profile-thesis-strengths">
            <p className="text-[10px] font-bold uppercase text-slate-500">Điểm mạnh có bằng chứng</p>
            {t.strengths.length ? (
              <ul className="mt-0.5 space-y-1">{t.strengths.map((s) => <li key={s.layer} className="flex items-start gap-1.5"><span aria-hidden className="text-emerald-300">✓</span><span className="flex-1 text-slate-200">{s.textVi}</span><SealChip seal={s.seal} /></li>)}</ul>
            ) : <p className="mt-0.5 text-slate-500">Không lớp nào vừa ủng hộ vừa có dấu ĐẠT / MỘT PHẦN phiên này.</p>}
          </div>
          <div data-testid="profile-thesis-risks">
            <p className="text-[10px] font-bold uppercase text-slate-500">Rủi ro</p>
            {t.risks.length ? (
              <ul className="mt-0.5 space-y-1">{t.risks.map((r, i) => <li key={i} className="flex items-start gap-1.5"><span aria-hidden className="text-amber-300">!</span><span className="flex-1 text-slate-200"><span className="text-slate-400">{RISK_VI[r.kind] ?? r.kind}: </span>{r.textVi}</span></li>)}</ul>
            ) : <p className="mt-0.5 text-slate-500">Không có điều kiện bán sát ngưỡng hay cảnh báo nặng.</p>}
          </div>
          <p data-testid="profile-thesis-next"><span className="text-[10px] font-bold uppercase text-slate-500">Sự kiện kế tiếp: </span>
            {t.nextEvent ? <span className="text-slate-200">{t.nextEvent.kindVi} — {dm(t.nextEvent.date)} <span className="text-slate-500">({t.nextEvent.source})</span></span> : <span className="text-slate-500">chưa có sự kiện đã công bố</span>}
          </p>
          {gap}
        </div>
        <div>{snap.price ? <PriceMini price={snap.price} /> : <p className="text-[11px] text-slate-500" data-testid="profile-price-missing">Chưa có chuỗi giá điều chỉnh cho mã này.</p>}</div>
      </div>
    </section>
  );
}

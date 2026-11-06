// K2 (06/11/2026) — phân rã lợi nhuận: thác nước theo mẫu BCTC (quý / lũy kế năm / 4 quý), cơ cấu LNTT cốt lõi vs ngoài cốt lõi
// 12 quý, biên lợi nhuận theo quý và đòn bẩy hoạt động (DOL).
import { useMemo, useState } from "react";
import { bn, fin, num, pctPlain } from "../../../../lib/kqkd/format";
import type { Bridge, KqkdDetail } from "../../../../lib/kqkd/types";

const GOLD = "#E8B84B", POS = "#10B981", NEG = "#F43F5E", NONCORE = "#38BDF8";

function Waterfall({ b }: { b: Bridge }) {
  const [hover, setHover] = useState<number | null>(null);
  const bars = useMemo(() => {
    let run = 0;
    return b.steps.map((s) => {
      if (s.kind === "start" || s.kind === "total") { run = s.value; return { ...s, from: 0, to: s.value }; }
      const from = run; run += s.value; return { ...s, from, to: run };
    });
  }, [b]);
  if (!bars.length) return <p className="text-[11px] text-slate-500">Không đủ chỉ tiêu để dựng thác nước.</p>;
  const lo = Math.min(0, ...bars.map((x) => Math.min(x.from, x.to))), hi = Math.max(0, ...bars.map((x) => Math.max(x.from, x.to)));
  const Wd = 1000, Hd = 300, top = 18, bottom = 74, left = 8, colW = (Wd - left * 2) / bars.length;
  const y = (v: number) => top + ((hi - v) / (hi - lo || 1)) * (Hd - top - bottom);
  return (
    <figure className="space-y-1">
      <div className="overflow-x-auto"><svg viewBox={`0 0 ${Wd} ${Hd}`} className="w-full min-w-[760px]" role="img" aria-label={`Thác nước lợi nhuận ${b.label}: ${b.steps.map((s) => `${s.label} ${bn(s.value)}`).join(", ")}`} data-testid="kq-waterfall">
        <line x1={0} x2={Wd} y1={y(0)} y2={y(0)} stroke="rgba(148,163,184,0.35)" />
        {bars.map((x, i) => {
          const isTotal = x.kind !== "delta", color = isTotal ? (x.value < 0 ? NEG : GOLD) : x.value >= 0 ? POS : NEG;
          const y0 = y(Math.max(x.from, x.to)), h = Math.max(1, Math.abs(y(x.from) - y(x.to))), cx = left + i * colW;
          return (
            <g key={x.key + i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
              <rect x={cx} y={top} width={colW} height={Hd - top - bottom} fill={hover === i ? "rgba(255,255,255,0.04)" : "transparent"} />
              <rect x={cx + colW * 0.16} y={y0} width={colW * 0.68} height={h} rx={3} fill={color} opacity={isTotal ? 1 : 0.85} />
              {i < bars.length - 1 && <line x1={cx + colW * 0.84} x2={cx + colW * 1.16} y1={y(x.to)} y2={y(x.to)} stroke="rgba(148,163,184,0.45)" strokeDasharray="2 2" />}
              <text x={cx + colW / 2} y={y0 - 4} textAnchor="middle" fontSize={11} fill="rgba(226,232,240,0.95)" fontFamily="ui-monospace, monospace">{bn(x.value, false)}</text>
              <foreignObject x={cx} y={Hd - bottom + 6} width={colW} height={bottom - 6}>
                <div style={{ fontSize: 10.5, lineHeight: "12px", color: isTotal ? "#F5CE72" : "rgba(148,163,184,0.95)", textAlign: "center", fontWeight: isTotal ? 700 : 500, padding: "0 2px" }}>{x.label}</div>
              </foreignObject>
            </g>
          );
        })}
      </svg></div>
      <figcaption className="flex flex-wrap gap-3 text-[10.5px] text-slate-400">
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: GOLD }} />mốc tổng</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: POS }} />cộng thêm</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: NEG }} />trừ đi</span>
        {hover != null && <span className="ml-auto font-mono text-slate-200">{bars[hover].label}: {bn(bars[hover].value)}</span>}
      </figcaption>
    </figure>
  );
}

/** LNTT 12 quý tách cốt lõi (vàng) / ngoài cốt lõi (xanh), chung trục 0. */
function CoreMix({ d }: { d: KqkdDetail }) {
  const qs = useMemo(() => {
    const out: { q: string; core: number | null; non: number | null }[] = [];
    const core = d.matrix.core ?? [], pbt = d.matrix.pbt ?? [];
    for (const r of [...pbt].reverse()) for (let i = 0; i < 4; i++) {
      const p = r.q[i], c = core.find((x) => x.year === r.year)?.q[i] ?? null;
      if (!fin(p)) continue;
      out.push({ q: `Q${i + 1}/${String(r.year).slice(2)}`, core: c, non: fin(c) ? p - c : null });
    }
    return out.slice(-12);
  }, [d]);
  if (qs.length < 2) return null;
  const vals = qs.flatMap((x) => [x.core ?? 0, x.non ?? 0, (x.core ?? 0) + Math.min(0, x.non ?? 0)]);
  const pos = qs.map((x) => Math.max(0, x.core ?? 0) + Math.max(0, x.non ?? 0)), neg = qs.map((x) => Math.min(0, x.core ?? 0) + Math.min(0, x.non ?? 0));
  const hi = Math.max(1, ...pos, ...vals), lo = Math.min(0, ...neg);
  const Wd = 1000, Hd = 200, top = 10, bottom = 22, cw = Wd / qs.length;
  const y = (v: number) => top + ((hi - v) / (hi - lo || 1)) * (Hd - top - bottom);
  return (
    <figure className="rounded-lg border border-white/10 bg-white/[0.02] p-3" data-testid="kq-core-mix">
      <figcaption className="mb-1 text-[11px] font-bold text-slate-300">LNTT 12 quý: <span style={{ color: GOLD }}>cốt lõi</span> và <span style={{ color: NONCORE }}>ngoài cốt lõi</span></figcaption>
      <div className="overflow-x-auto"><svg viewBox={`0 0 ${Wd} ${Hd}`} className="w-full min-w-[620px]" role="img" aria-label={`LNTT tách cốt lõi: ${qs.map((x) => `${x.q} cốt lõi ${bn(x.core)} ngoài ${bn(x.non)}`).join("; ")}`}>
        <line x1={0} x2={Wd} y1={y(0)} y2={y(0)} stroke="rgba(148,163,184,0.35)" />
        {qs.map((x, i) => {
          const cx = i * cw + cw * 0.2, w = cw * 0.6;
          let up = 0, down = 0;
          const seg = (v: number | null, color: string, key: string) => {
            if (!fin(v) || v === 0) return null;
            const base = v >= 0 ? up : down; const end = base + v; if (v >= 0) up = end; else down = end;
            const y0 = y(Math.max(base, end)), h = Math.max(1, Math.abs(y(base) - y(end)));
            return <rect key={key} x={cx} y={y0} width={w} height={h} rx={2} fill={color} stroke="#0B0F19" strokeWidth={2}><title>{`${x.q} ${key === "c" ? "cốt lõi" : "ngoài cốt lõi"}: ${bn(v)}`}</title></rect>;
          };
          return <g key={x.q}>{seg(x.core, GOLD, "c")}{seg(x.non, NONCORE, "n")}<text x={i * cw + cw / 2} y={Hd - 6} textAnchor="middle" fontSize={10.5} fill="rgba(148,163,184,0.9)">{x.q}</text></g>;
        })}
      </svg></div>
    </figure>
  );
}

export default function ProfitBridge({ d }: { d: KqkdDetail }) {
  const opts = [["quarter", d.bridge.quarter], ["ytd", d.bridge.ytd], ["ttm", d.bridge.ttm]].filter(([, b]) => b) as [string, Bridge][];
  const [k, setK] = useState(opts[0]?.[0] ?? "quarter");
  const b = opts.find(([id]) => id === k)?.[1] ?? opts[0]?.[1];
  const marg = (key: "grossMargin" | "coreMargin" | "netMargin") => {
    const out: { q: string; v: number | null }[] = [];
    for (const r of [...d.ratios[key]].reverse()) r.q.forEach((v, i) => { if (fin(v)) out.push({ q: `Q${i + 1}/${String(r.year).slice(2)}`, v }); });
    return out.slice(-8);
  };
  const rows = ([["grossMargin", "Biên gộp"], ["coreMargin", "Biên LN cốt lõi"], ["netMargin", "Biên ròng"]] as const).map(([key, label]) => ({ label, s: marg(key) })).filter((r) => r.s.length);
  const qs = rows[0]?.s.map((x) => x.q) ?? [];
  return (
    <div className="space-y-3" data-testid="kq-bridge">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <div className="flex gap-1" role="tablist" aria-label="Kỳ">
          {opts.map(([id, x]) => (
            <button key={id} type="button" role="tab" aria-selected={k === id} onClick={() => setK(id)} data-testid={`kq-bridge-${id}`}
              className={`rounded-md border px-2 py-1 font-semibold ${k === id ? "border-[#E8B84B]/50 bg-[#E8B84B]/10 text-[#F5CE72]" : "border-white/10 text-slate-400 hover:text-slate-200"}`}>{x.label}</button>
          ))}
        </div>
        {d.dol != null && <span className="ml-auto text-slate-400" title="Đòn bẩy hoạt động = % thay đổi LN cốt lõi 4 quý ÷ % thay đổi doanh thu 4 quý">DOL <b className="font-mono text-slate-100">{num(d.dol)}</b> lần</span>}
      </div>
      {b && <Waterfall b={b} />}
      <p className="text-[10.5px] text-slate-400">{d.method.core}</p>
      <CoreMix d={d} />
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[11px]" data-testid="kq-margins">
            <thead><tr className="text-right text-[10px] uppercase text-slate-500"><th className="px-1.5 py-1 text-left">Tỷ suất</th>{qs.map((q) => <th key={q} className="px-1.5 py-1">{q}</th>)}</tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.label}><td className="px-1.5 py-1 text-slate-300">{r.label}</td>{r.s.map((x, i) => {
                const prev = r.s[i - 4]?.v;
                return <td key={x.q} className="px-1.5 py-1 text-right font-mono tabular-nums text-slate-100">{pctPlain(x.v)}{fin(prev) && fin(x.v) && <span className={`ml-0.5 text-[10px] ${x.v >= prev ? "text-emerald-300" : "text-rose-300"}`} title="so cùng kỳ">{x.v >= prev ? "▲" : "▼"}</span>}</td>;
              })}</tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
